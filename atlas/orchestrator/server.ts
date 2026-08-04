/**
 * Orchestrator server.
 * Boots intercom, starts the scheduler, handles boss commands and webhooks.
 */

import * as http from 'node:http';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IntercomClient } from '../integrations/intercom/client';
import { Scheduler } from './scheduler';
import { AgentPool } from './pool';
import { buildGraph, readyTickets } from './graph';
import { executeStrategy } from './strategist';
import {
  loadState,
  saveState,
  saveFullState,
  getStateDir,
} from './state';
import { transitionTicket, findActiveEpics, closeTicket } from '../integrations/linear/client';
import {
  scanAllPRComments,
  findMergeConflicts,
  isPRMerged,
  isPRClosed,
  registerWebhook,
  unregisterWebhooks,
} from '../integrations/github/client';
import { getConfig } from './config';
import { getRepoRoot, removeWorktree, hasMeaningfulWork } from '../git/operations';
import type { GraphNode } from './types';

// ─── Globals ────────────────────────────────────────────────────────

let intercom: IntercomClient;
let scheduler: Scheduler;
let pool: AgentPool;
let bossSessionId: string | null = null;
const epicGraphs = new Map<string, { nodes: Map<string, GraphNode>; rootId: string }>();
let webhookServer: http.Server | null = null;

// ─── Logging ────────────────────────────────────────────────────────

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
}

// ─── Boss Communication ─────────────────────────────────────────────

async function tellBoss(msg: string): Promise<void> {
  if (!intercom || !bossSessionId) return;
  try {
    await intercom.send(bossSessionId, msg);
  } catch { /* boss may have disconnected */ }
}

// ─── Dashboard ──────────────────────────────────────────────────────

function writeDashboard(): void {
  const STATUS_ICON: Record<string, string> = {
    pending: '○', blocked: '◆', in_progress: '◉', done: '✓', failed: '✗', merged: '✔',
  };

  const lines: string[] = [];
  const now = new Date().toLocaleTimeString();
  let totalTickets = 0, totalDone = 0, totalRunning = 0, totalFailed = 0;

  for (const [, epic] of epicGraphs) {
    totalTickets += epic.nodes.size;
    for (const [, n] of epic.nodes) {
      if (n.state.status === 'done' || n.state.status === 'merged') totalDone++;
      if (n.state.status === 'in_progress') totalRunning++;
      if (n.state.status === 'failed') totalFailed++;
    }
  }

  lines.push(`══ Atlas Dashboard ${now.padStart(30)} ══`);
  lines.push(`${epicGraphs.size} epics · ${totalTickets} tickets · ${totalRunning} running · ${totalDone} done · ${totalFailed} failed`);
  lines.push(`Pool: ${pool.count()} agents (${pool.getByType('worker').length} workers)`);
  lines.push('');

  for (const [, epic] of epicGraphs) {
    const rootNode = epic.nodes.get(epic.rootId);
    const label = rootNode?.ticket.title || epic.rootId;
    const sorted = [...epic.nodes.values()].sort((a, b) => {
      const order: Record<string, number> = {
        in_progress: 0, pending: 1, blocked: 2, failed: 3, done: 4, merged: 5,
      };
      return (order[a.state.status] ?? 5) - (order[b.state.status] ?? 5);
    });

    lines.push(`── ${epic.rootId}: ${label.slice(0, 50)} (${epic.nodes.size} tickets) ──`);
    for (const node of sorted) {
      const icon = STATUS_ICON[node.state.status] ?? '?';
      const id = node.ticket.identifier.padEnd(10);
      const title = node.ticket.title.slice(0, 40).padEnd(40);
      const agent = node.state.workerName || '—';
      lines.push(`  ${icon} ${id} ${title} [${agent.padEnd(10)}]`);
    }
    lines.push('');
  }

  lines.push('── Agents ──');
  for (const agent of pool.getActive()) {
    lines.push(`  ◉ ${agent.name.padEnd(12)} → ${agent.currentTask || '?'} [${agent.type}]`);
  }
  const idleWorkers = pool.getIdle('worker');
  for (const agent of idleWorkers) {
    lines.push(`  ○ ${agent.name.padEnd(12)} idle [${agent.type}]`);
  }
  if (pool.count() === 0) {
    lines.push('  (no agents)');
  }

  lines.push('');
  lines.push('◉=busy  ○=idle  ◆=blocked  ✓=done  ✗=failed  ✔=merged');

  try {
    fs.writeFileSync(
      path.join(getStateDir(), 'dashboard.txt'),
      lines.join('\n'),
      'utf-8',
    );
  } catch { /* best effort */ }
}

// ─── Epic Management ────────────────────────────────────────────────

function findNode(ticketId: string): { node: GraphNode; epicId: string } | null {
  for (const [epicId, epic] of epicGraphs) {
    const node = epic.nodes.get(ticketId);
    if (node) return { node, epicId };
  }
  return null;
}

async function addEpic(ticketId: string): Promise<void> {
  if (epicGraphs.has(ticketId)) {
    log(`Epic ${ticketId} already managed — skipping`);
    return;
  }
  const existingState = loadState();
  const { nodes } = await buildGraph(ticketId, existingState);
  epicGraphs.set(ticketId, { nodes, rootId: ticketId });
  log(`Added epic ${ticketId} — ${nodes.size} tickets. Total epics: ${epicGraphs.size}`);

  // Persist epic roots
  const ex = loadState();
  if (ex) {
    ex.epicRoots = [...epicGraphs.keys()];
    saveState(ex);
  }

  saveAllState();
  writeDashboard();
  launchReady();
}

function dropEpic(ticketId: string): void {
  const epic = epicGraphs.get(ticketId);
  if (!epic) return;
  epicGraphs.delete(ticketId);
  log(`Dropped epic ${ticketId}. Remaining: ${epicGraphs.size}`);
  saveAllState();
  writeDashboard();
}

function saveAllState(): void {
  const allNodes = new Map<string, GraphNode>();
  for (const [, epic] of epicGraphs) {
    for (const [id, node] of epic.nodes) {
      allNodes.set(id, node);
    }
  }
  const tickets: Record<string, any> = {};
  for (const [id, node] of allNodes) {
    tickets[id] = { ...node.state };
  }
  saveFullState(tickets, true);
}

function areAllEpicsDone(): boolean {
  if (epicGraphs.size === 0) return true;
  for (const [, epic] of epicGraphs) {
    for (const [, node] of epic.nodes) {
      if (node.state.status !== 'done' && node.state.status !== 'merged' && node.state.status !== 'failed') {
        return false;
      }
    }
  }
  return true;
}

// ─── Worker Launch ──────────────────────────────────────────────────

async function launchReady(): Promise<void> {
  if (areAllEpicsDone()) return;

  const allReady: GraphNode[] = [];
  for (const [, epic] of epicGraphs) {
    for (const node of readyTickets(epic.nodes)) {
      allReady.push(node);
    }
  }

  for (const node of allReady) {
    // Find an idle worker
    const idleWorkers = pool.getIdle('worker');
    if (idleWorkers.length === 0) {
      // Try spawning a new worker
      const config = getConfig();
      if (pool.getByType('worker').length < config.agents.worker.max_instances) {
        const newAgent = await pool.spawn('worker');
        if (newAgent) {
          // Give it a moment to register
          await new Promise((r) => setTimeout(r, 2000));
          await assignToIdleWorker(node);
        }
      }
    } else {
      await assignToIdleWorker(node);
    }
  }
}

async function assignToIdleWorker(node: GraphNode): Promise<void> {
  const idleWorkers = pool.getIdle('worker');
  if (idleWorkers.length === 0) return;

  const agent = idleWorkers[0]!;
  await pool.assignTask(agent, node);
  log(`Assigned ${node.ticket.identifier} to ${agent.name}`);
  writeDashboard();
}

// ─── Worker Completion ──────────────────────────────────────────────

async function onWorkerComplete(
  node: GraphNode,
  exitCode: number,
): Promise<void> {
  const identifier = node.ticket.identifier;

  if (exitCode === 0) {
    // Check meaningful work
    const config = getConfig();
    const baseBranch = config.strategy.branches.worktree_base;
    if (node.state.worktreePath && hasMeaningfulWork(node.state.worktreePath, baseBranch)) {
      // Execute strategy (PR, direct merge, or review)
      const result = await executeStrategy(node);
      if (result.success) {
        node.state.status = 'done';
        node.state.finishedAt = new Date().toISOString();
        node.state.pid = null;
        if (result.prUrl) node.state.prUrl = result.prUrl;

        // Transition Linear ticket
        await transitionTicket(node.ticket.id, config.linear.transitions.on_done);
        await tellBoss(`✅ ${identifier}: ${result.prUrl || 'merged to ' + config.strategy.branches.direct_push}`);

        // Prune worktree if branch is merged
        pruneWorktree(node);
      } else {
        node.state.status = 'failed';
        node.state.finishedAt = new Date().toISOString();
        node.state.error = result.error || 'Strategy execution failed';
        await tellBoss(`❌ ${identifier}: ${node.state.error}`);
      }
    } else {
      node.state.status = 'failed';
      node.state.finishedAt = new Date().toISOString();
      node.state.error = 'No meaningful changes — only generated files modified';
      await tellBoss(`❌ ${identifier}: No meaningful work detected`);
    }
  } else if (exitCode === 143 || exitCode === 137) {
    // Killed externally
    node.state.status = 'pending';
    node.state.pid = null;
    node.state.error = `Worker killed (signal ${exitCode - 128}) — will resume`;
  } else {
    // Non-zero exit
    const config = getConfig();
    const maxRetries = config.agents.worker.retry_limit ?? 2;
    if (node.state.retryCount <= maxRetries) {
      node.state.status = 'pending';
      node.state.pid = null;
      node.state.error = `Worker exited with code ${exitCode} (retry ${node.state.retryCount}/${maxRetries})`;
      node.state.retryCount += 1;
    } else {
      node.state.status = 'failed';
      node.state.finishedAt = new Date().toISOString();
      node.state.error = `Worker failed after ${maxRetries} retries (exit code ${exitCode})`;
      await tellBoss(`❌ ${identifier}: ${node.state.error}`);
    }
  }

  saveAllState();
  writeDashboard();
  launchReady();
}

function pruneWorktree(node: GraphNode): void {
  const wt = node.state.worktreePath;
  if (!wt || !fs.existsSync(wt)) return;
  try {
    removeWorktree(getRepoRoot(), wt);
  } catch { /* best effort */ }
}

// ─── Boss Command Handling ──────────────────────────────────────────

async function handleBossCommand(text: string): Promise<void> {
  const trimmed = text.trim();

  if (trimmed.startsWith('EPIC ') || trimmed.startsWith('epic ')) {
    const ids = trimmed.split(/\s+/).slice(1);
    for (const ticketId of ids) {
      const id = ticketId.trim();
      if (!id) continue;
      log(`Boss: adding epic ${id}`);
      try { await addEpic(id); } catch (err: any) { log(`Error: ${err.message}`); await tellBoss(`Error: ${err.message}`); }
    }
    await tellBoss(`Managing ${epicGraphs.size} epics: ${[...epicGraphs.keys()].join(', ')}`);

  } else if (trimmed.startsWith('TICKET ') || trimmed.startsWith('ticket ')) {
    const ids = trimmed.split(/\s+/).slice(1);
    for (const ticketId of ids) {
      await addEpic(ticketId.trim());
    }

  } else if (trimmed.startsWith('DROP ') || trimmed.startsWith('drop ')) {
    const ticketId = trimmed.split(/\s+/)[1]?.trim();
    if (ticketId) dropEpic(ticketId);
    await tellBoss(`Dropped ticket. ${epicGraphs.size} remaining.`);

  } else if (trimmed === 'STOP' || trimmed === 'stop') {
    log('Boss: stopping all agents');
    await pool.stopAll();
    writeDashboard();
    await tellBoss('All agents stopped.');

  } else if (trimmed.startsWith('STOP ')) {
    const agentName = trimmed.split(/\s+/)[1]?.trim();
    if (agentName) {
      const agent = [...pool['agents'].values()].find((a) => a.name === agentName);
      if (agent) {
        await pool.stop(agent);
        await tellBoss(`Stopped ${agentName}.`);
      }
    }

  } else if (trimmed.startsWith('CLOSE ') || trimmed.startsWith('close ')) {
    const closeId = trimmed.split(/\s+/)[1]?.trim();
    if (closeId) {
      await closeTicket(closeId);
      // Mark in all epics
      for (const [, epic] of epicGraphs) {
        const node = epic.nodes.get(closeId);
        if (node) {
          node.state.status = 'done';
          node.state.finishedAt = new Date().toISOString();
          node.state.error = 'Closed by boss';
        }
      }
      saveAllState();
      writeDashboard();
      await tellBoss(`Closed ${closeId}.`);
    }

  } else if (trimmed === 'STATUS' || trimmed === 'status') {
    writeDashboard();
    if (epicGraphs.size === 0) {
      await tellBoss('No active epics. Send EPIC <ID> or TICKET <ID>.');
      return;
    }
    let totalTickets = 0, totalDone = 0, totalRunning = 0;
    for (const [, epic] of epicGraphs) {
      totalTickets += epic.nodes.size;
      for (const [, n] of epic.nodes) {
        if (n.state.status === 'done' || n.state.status === 'merged') totalDone++;
        if (n.state.status === 'in_progress') totalRunning++;
      }
    }
    await tellBoss(`${epicGraphs.size} epics · ${totalTickets} tickets: ${totalRunning} running, ${totalDone} done. ${pool.count()} agents.`);

  } else if (trimmed.startsWith('SPAWN ') || trimmed.startsWith('spawn ')) {
    const agentType = trimmed.split(/\s+/)[1]?.trim() as any;
    if (agentType && ['worker', 'reviewer', 'pr_manager'].includes(agentType)) {
      const agent = await pool.spawn(agentType);
      await tellBoss(agent ? `Spawned ${agent.name}.` : `Failed to spawn ${agentType}.`);
    } else {
      await tellBoss('Usage: SPAWN <worker|reviewer|pr_manager>');
    }

  } else if (trimmed.startsWith('KILL ') || trimmed.startsWith('kill ')) {
    const agentType = trimmed.split(/\s+/)[1]?.trim() as any;
    if (agentType) {
      await pool.stopAll(agentType);
      await tellBoss(`Killed all ${agentType} agents.`);
    }

  } else if (trimmed.startsWith('SET_INTERVAL ') || trimmed.startsWith('set-interval ')) {
    const parts = trimmed.split(/\s+/);
    const key = parts[1];
    const seconds = parseInt(parts[2] ?? '', 10);
    if (key && !isNaN(seconds) && seconds > 0) {
      const ok = scheduler.setInterval(key, seconds);
      await tellBoss(ok ? `Interval ${key} → ${seconds}s` : `Unknown interval key: ${key}`);
    } else {
      await tellBoss('Usage: SET_INTERVAL <key> <seconds>');
    }

  } else if (trimmed === 'GET_CONFIG' || trimmed === 'get-config') {
    const intervals = scheduler.getIntervals();
    const config = getConfig();
    await tellBoss(`Strategy: ${config.strategy.default} (target: ${config.strategy.branches.pr_target})\nIntervals: ${JSON.stringify(intervals)}`);

  } else {
    log(`Unknown boss command: ${trimmed.slice(0, 50)}`);
  }
}

// ─── Main Loop Actions ──────────────────────────────────────────────

async function syncLinearStatus(): Promise<void> {
  // Check for tickets manually transitioned in Linear
  for (const [, epic] of epicGraphs) {
    for (const [, node] of epic.nodes) {
      if (node.state.status === 'done' || node.state.status === 'merged') continue;
      // Best-effort sync — actual implementation would query Linear
    }
  }
}

async function scanPRs(): Promise<void> {
  if (epicGraphs.size === 0) return;

  try {
    // Scan for unaddressed comments
    const comments = await scanAllPRComments();
    for (const [tid] of comments) {
      const found = findNode(tid);
      if (found && found.node.state.status === 'done') {
        found.node.state.status = 'pending';
        found.node.state.error = 'New PR review comments';
      }
    }

    // Check for merged/closed PRs
    for (const [, epic] of epicGraphs) {
      for (const [, node] of epic.nodes) {
        if (node.state.status === 'done' && node.state.prUrl) {
          try {
            if (await isPRMerged(node.ticket.identifier)) {
              node.state.status = 'merged';
              pruneWorktree(node);
            } else if (await isPRClosed(node.ticket.identifier)) {
              node.state.status = 'pending';
              node.state.error = 'PR closed without merge — needs remake';
              node.state.prUrl = null;
            }
          } catch { /* skip */ }
        }
      }
    }

    saveAllState();
    writeDashboard();
    launchReady();
  } catch { /* best effort */ }
}

async function checkAgentHealth(): Promise<void> {
  await pool.healthCheck();
}

async function processQueue(): Promise<void> {
  if (!areAllEpicsDone()) {
    await launchReady();
  }
}

async function runScheduledAgents(): Promise<void> {
  const config = getConfig();
  if (config.agents.pr_manager.enabled) {
    const existing = pool.getByType('pr_manager');
    if (existing.length < config.agents.pr_manager.max_instances) {
      await pool.spawn('pr_manager');
    }
  }
}

// ─── Webhook Server ─────────────────────────────────────────────────

function startWebhookServer(): void {
  const config = getConfig();
  if (!config.github.webhook_enabled) {
    log('Webhook server disabled');
    return;
  }

  let port = config.ports.min;
  for (; port <= config.ports.max; port++) {
    try {
      webhookServer = http.createServer(async (req, res) => {
        if (req.url !== '/github-webhook' || req.method !== 'POST') {
          res.writeHead(404);
          res.end('not found');
          return;
        }

        res.writeHead(200);
        res.end('ok');

        const eventType = req.headers['x-github-event'] as string;
        if (eventType === 'pull_request' || eventType === 'issue_comment' || eventType === 'pull_request_review_comment') {
          log(`Webhook: ${eventType}`);
          // Trigger fresh scans
          await scanPRs();
        }
      });

      webhookServer.listen(port, () => {
        log(`Webhook server listening on port ${port}`);
      });

      webhookServer.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          log(`Port ${port} in use — trying next`);
        } else {
          log(`Webhook server error: ${err.message}`);
        }
      });

      // Try ngrok
      try {
        startNgrokTunnel(port).then((url) => {
          if (url) {
            registerWebhook(url).then((msg) => log(msg)).catch(() => {});
          }
        });
      } catch { /* ngrok optional */ }

      return;
    } catch { /* try next port */ }
  }

  log('Could not start webhook server — no free ports');
}

function startNgrokTunnel(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const ngrokBin = 'ngrok';
    const authtoken = process.env.NGROK_AUTHTOKEN ?? process.env.NGROK_AUTH_TOKEN ?? '';
    const args = ['http', String(port), '--log=stdout', '--log-format=json'];
    if (authtoken) args.push('--authtoken', authtoken);

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) { resolved = true; resolve(null); }
    }, 15000);

    try {
      const proc = cp.spawn(ngrokBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';

      proc.stdout?.on('data', (data: Buffer) => {
        buf += data.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry.url?.startsWith('http')) {
              if (!resolved) { resolved = true; clearTimeout(timeout); resolve(entry.url); }
            }
          } catch { /* skip */ }
        }
      });

      proc.on('error', () => {
        if (!resolved) { resolved = true; clearTimeout(timeout); resolve(null); }
      });
    } catch {
      if (!resolved) { resolved = true; clearTimeout(timeout); resolve(null); }
    }
  });
}

// ─── Auto-Start ─────────────────────────────────────────────────────

async function autoStart(): Promise<void> {
  log('Looking for work...');

  const existingState = loadState();
  const epicRoots = existingState?.epicRoots ?? [];

  if (epicRoots.length > 0) {
    log(`Resuming ${epicRoots.length} epics: ${epicRoots.join(', ')}`);
    for (const rootId of epicRoots) {
      try { await addEpic(rootId); } catch (err: any) {
        log(`Failed to resume epic ${rootId}: ${err.message}`);
      }
    }
  }

  if (epicGraphs.size === 0) {
    const config = getConfig();
    if (config.linear.auto_discover_epics) {
      const epics = await findActiveEpics();
      if (epics.length > 0) {
        log(`Found ${epics.length} active epics: ${epics.join(', ')}`);
        for (const epicId of epics) {
          try { await addEpic(epicId); } catch { /* skip */ }
        }
        return;
      }
    }
    log('No active tickets. Send EPIC <ID> or TICKET <ID> to start.');
  }

  // Pre-spawn workers if there's work
  if (epicGraphs.size > 0) {
    const config = getConfig();
    const workerCount = config.agents.worker.max_instances;
    for (let i = 0; i < workerCount; i++) {
      await pool.spawn('worker');
    }
    await launchReady();
  }
}

// ─── Main ───────────────────────────────────────────────────────────

export async function startOrchestrator(): Promise<void> {
  log('Atlas orchestrator starting...');

  // State dir
  const stateDir = path.join(getRepoRoot(), 'atlas', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'worktrees'), { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'panes', 'fifos'), { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'prompts'), { recursive: true });

  // Intercom
  intercom = new IntercomClient('orchestrator');
  await intercom.connect();

  // Scheduler
  scheduler = new Scheduler();

  // Agent pool
  pool = new AgentPool(intercom);

  // Handle intercom messages
  intercom.onMessage(async (from, message) => {
    const text = message.content?.text ?? '';

    // Boss registration
    if (text.startsWith('BOSS:')) {
      bossSessionId = from.id;
      log(`Boss registered: ${from.name} (${from.id.slice(0, 8)})`);
      await intercom.send(from.id, 'BOSS registered. Atlas is ready.');
      return;
    }

    // Agent registration
    if (text.startsWith('REGISTER ')) {
      const parts = text.split(/\s+/);
      const uuid = parts[1];
      const agentType = parts[2];
      const agentName = parts[3];
      log(`Agent registered: ${agentName || uuid} (${agentType})`);
      // Find the agent instance and mark it as idle
      for (const [, agent] of (pool as any).agents) {
        if (agent.id === uuid || agent.name === agentName) {
          agent.status = 'idle';
          agent.lastHeartbeat = Date.now();
          break;
        }
      }
      writeDashboard();
      launchReady();
      return;
    }

    // Agent idle
    if (text.startsWith('IDLE ')) {
      const uuid = text.split(/\s+/)[1];
      for (const [, agent] of (pool as any).agents) {
        if (agent.id === uuid) {
          agent.status = 'idle';
          agent.lastHeartbeat = Date.now();

          // If agent was working on a ticket, handle completion
          if (agent.currentTask) {
            const found = findNode(agent.currentTask);
            if (found) {
              await onWorkerComplete(found.node, 0);
            }
            agent.currentTask = null;
          }
          break;
        }
      }
      writeDashboard();
      launchReady();
      return;
    }

    // Agent status update
    if (text.startsWith('STATUS ')) {
      // Forward to boss
      await tellBoss(`📋 ${from.name}: ${text.replace('STATUS ', '')}`);
      return;
    }

    // Agent asking boss
    if (text.startsWith('ASK ')) {
      await tellBoss(`❓ ${from.name}: ${text.replace('ASK ', '')}`);
      return;
    }

    // Boss commands
    if (
      text.startsWith('EPIC ') || text.startsWith('TICKET ') ||
      text === 'STOP' || text.startsWith('STOP ') ||
      text === 'STATUS' || text.startsWith('CLOSE ') ||
      text.startsWith('DROP ') || text.startsWith('SPAWN ') ||
      text.startsWith('KILL ') || text.startsWith('SET_INTERVAL ') ||
      text === 'GET_CONFIG'
    ) {
      await handleBossCommand(text);
      return;
    }
  });

  // Register scheduler actions
  scheduler.register('status_sync', syncLinearStatus);
  scheduler.register('pr_scan', scanPRs);
  scheduler.register('dashboard_refresh', async () => { writeDashboard(); });
  scheduler.register('agent_health', checkAgentHealth);
  scheduler.register('queue_process', processQueue);
  scheduler.register('scheduled_agents', runScheduledAgents);

  // Start scheduler
  scheduler.start();

  // Start webhook server
  startWebhookServer();

  // Cleanup
  const cleanup = async () => {
    scheduler.stop();
    await pool.stopAll();
    saveAllState();
    if (webhookServer) webhookServer.close();
    try { await unregisterWebhooks(); } catch { /* ignore */ }
    try { await intercom.disconnect(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Auto-start
  await autoStart();

  log('Orchestrator ready. Waiting for boss...');
}

// Allow running directly
if (require.main === module) {
  startOrchestrator().catch((err) => {
    console.error('Orchestrator fatal error:', err);
    process.exit(1);
  });
}
