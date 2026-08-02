#!/usr/bin/env -S npx tsx
/**
 * server-daemon.ts — Infrastructure server for the ticket agent system.
 *
 * Runs as a background process. Handles:
 *   - Worktree creation and management
 *   - Ticket graph building
 *   - Spawning headless pi workers and attaching them to tmux panes
 *   - GitHub webhooks (PR comments, merge conflicts)
 *   - Alerting the boss of events
 *
 * The boss (a pi session) sends commands via intercom:
 *   EPIC <TICKET_ID>     — Build full epic graph, assign all tickets
 *   TICKET <ID>          — Build graph for one ticket
 *   STOP                 — Halt all workers
 *   STATUS               — Report current state
 *
 * Tmux pane management:
 *   When a headless worker is spawned, its log output is attached to the
 *   corresponding agent pane via `tmux send-keys`. When the worker finishes,
 *   the pane is reset to show "Waiting for tasks...".
 *
 * Usage:
 *   npx tsx .pi/extensions/ticket/server-daemon.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cp from 'node:child_process';
import {
  buildGraph,
  readyTickets,
  killAllWorkers,
  saveFullState,
  loadState,
  getAgentConfig,
  spawnWorker,
} from './orchestrator.js';
import type { GraphNode, TicketState } from './types.js';
import { getRepoRoot, ensureWorktree, branchName, removeWorktree } from './git.js';
import {
  scanAllPRComments,
  findMergeConflicts,
  findBaseConflictPRs,
  isPRClean,
  isPRMerged,
  isPRClosed,
  registerWebhook,
  unregisterWebhooks,
} from './github-pr.js';
import { startWebhookServer, stopWebhookServer, startNgrokTunnel } from './server.js';
import type { WebhookEvent } from './server.js';
import { transitionTicket } from './linear.js';
import { getPaneService, PaneService } from './pane-service.js';

// ─── Intercom ────────────────────────────────────────────────────────

let intercom: any = null;
let IntercomClient: any = null;

async function initIntercom(): Promise<void> {
  const repoRoot = getRepoRoot();
  const ipath = path.join(repoRoot, '.pi', 'npm', 'node_modules', 'pi-intercom');
  const mod = await import(path.join(ipath, 'broker', 'client.ts'));
  IntercomClient = mod.IntercomClient;
  const { spawnBrokerIfNeeded } = await import(path.join(ipath, 'broker', 'spawn.ts'));
  await spawnBrokerIfNeeded('npx', ['--no-install', 'tsx']);
  intercom = new IntercomClient();
  await intercom.connect({
    name: 'server',
    cwd: repoRoot,
    model: 'server',
    pid: process.pid,
    startedAt: Date.now(),
    lastActivity: Date.now(),
    status: 'running',
  });
  log('Intercom connected as "server"');
}

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
}

// ─── Worker tracking ────────────────────────────────────────────────

const spawnedProcesses = new Map<string, cp.ChildProcess>(); // ticketId → process

const epicGraphs = new Map<string, { nodes: Map<string, GraphNode>; rootId: string }>();

// ─── Boss tracking ─────────────────────────────────────────────────

let bossSessionId: string | null = null;

// ─── Send message to boss ───────────────────────────────────────────

async function tellBoss(msg: string): Promise<void> {
  if (!intercom) return;
  if (!bossSessionId) return; // boss hasn't registered yet
  try {
    await intercom.send(bossSessionId, { text: msg });
  } catch { /* boss may have disconnected */ }
}

// ─── Tmux pane management (delegated to PaneService) ──────────────

let paneService: PaneService | null = null;

/**
 * Get or initialize the PaneService.
 * Returns null if we're not running in a tmux environment.
 */
function getPaneSvc(): PaneService | null {
  if (paneService) return paneService;
  try {
    // Only initialize if the tmux session exists
    const sessionName = 'ticket-agents';
    const hasSession = cp.execSync(
      `tmux has-session -t "${sessionName}" 2>/dev/null && echo yes || echo no`,
      { timeout: 3000, encoding: 'utf-8' }
    ).trim();
    if (hasSession === 'yes') {
      const config = getAgentConfig();
      paneService = getPaneService({
        sessionName,
        repoRoot: getRepoRoot(),
        maxAgents: config.maxAgents,
      });
      return paneService;
    }
  } catch { /* tmux not available — run headless */ }
  return null;
}

function attachToPane(agentName: string, logPath: string, ticketId: string): void {
  const ps = getPaneSvc();
  if (!ps) {
    log(`No pane service — ${agentName} running headless`);
    return;
  }
  ps.attachWorker(agentName, logPath, ticketId);
}

function resetPane(agentName: string): void {
  const ps = getPaneSvc();
  if (!ps) return;
  ps.resetPane(agentName);
}

function resetAllPanes(): void {
  const ps = getPaneSvc();
  if (!ps) return;
  ps.resetAllPanes();
}

/** Backward-compat wrapper for dashboard code that still uses pane file reads. */
function getPaneIdForAgent(agentName: string): string | null {
  const ps = getPaneSvc();
  if (ps) return ps.getPaneId(agentName);
  // Fallback to file read for headless mode
  const paneFile = path.join(getRepoRoot(), '.pi', 'tickets', 'panes', `${agentName}.pane`);
  try {
    if (fs.existsSync(paneFile)) {
      return fs.readFileSync(paneFile, 'utf-8').trim();
    }
  } catch { /* ignore */ }
  return null;
}

// ─── Dashboard output ────────────────────────────────────────────────

const DASHBOARD_PATH = path.join(getRepoRoot(), '.pi', 'tickets', 'dashboard.txt');

function writeDashboard(): void {
  const STATUS_ICON: Record<string, string> = {
    pending: '○', blocked: '◆', in_progress: '◉', done: '✓', failed: '✗', merged: '✔',
  };

  const lines: string[] = [];
  const now = new Date().toLocaleTimeString();
  const totalEpics = epicGraphs.size;
  let totalTickets = 0, totalDone = 0, totalRunning = 0, totalFailed = 0;

  for (const [, epic] of epicGraphs) {
    totalTickets += epic.nodes.size;
    for (const [, n] of epic.nodes) {
      if (n.state.status === 'done' || n.state.status === 'merged') totalDone++;
      if (n.state.status === 'in_progress' || n.state.status === 'running') totalRunning++;
      if (n.state.status === 'failed') totalFailed++;
    }
  }

  lines.push(`══ Ticket Agents Dashboard ${now.padStart(30 - now.length + 21)} ══`);
  lines.push(`${totalEpics} epic(s) · ${totalTickets} tickets · ${totalRunning} running · ${totalDone} done · ${totalFailed} failed · ${spawnedProcesses.size} active`);
  lines.push('');

  // Per-epic breakdown
  for (const [, epic] of epicGraphs) {
    const rootNode = epic.nodes.get(epic.rootId);
    const label = rootNode?.ticket.title || epic.rootId;
    const sorted = [...epic.nodes.values()].sort((a, b) => {
      const order: Record<string, number> = { in_progress: 0, pending: 1, blocked: 2, failed: 3, done: 4, merged: 5 };
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

  // Worker status
  lines.push('── Workers ──');
  const activeWorkers: { name: string; ticketId: string }[] = [];
  for (const [ticketId] of spawnedProcesses) {
    const found = findNode(ticketId);
    if (found && found.node.state.workerName) {
      activeWorkers.push({ name: found.node.state.workerName, ticketId });
    }
  }
  if (activeWorkers.length === 0) {
    lines.push('  (no workers active)');
  } else {
    for (const w of activeWorkers.sort((a, b) => a.name.localeCompare(b.name))) {
      let epicId = '?';
      for (const [eid, epic] of epicGraphs) {
        if (epic.nodes.has(w.ticketId)) { epicId = eid; break; }
      }
      const hasPane = getPaneIdForAgent(w.name) !== null;
      const tag = hasPane ? '' : ' [headless]';
      lines.push(`  ◉ ${w.name.padEnd(12)} → ${w.ticketId.padEnd(10)} (${epicId})${tag}`);
    }
  }

  lines.push('');
  lines.push('◉=busy  ○=pending  ◆=blocked  ✓=done  ✗=failed  ✔=merged');

  try {
    fs.writeFileSync(DASHBOARD_PATH, lines.join('\n'), 'utf-8');
  } catch { /* best effort */ }
}

// ─── Check if all epics are complete ────────────────────────────────

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

// ─── Launch ready workers ───────────────────────────────────────────

function launchReady(): void {
  if (areAllEpicsDone()) {
    log('launchReady: all epics done — skipping');
    return;
  }
  const allReady: { node: GraphNode; epicId: string }[] = [];
  for (const [epicId, epic] of epicGraphs) {
    for (const node of readyTickets(epic.nodes)) {
      allReady.push({ node, epicId });
    }
  }

  const config = getAgentConfig();
  log(`launchReady: ${allReady.length} ready tickets across ${epicGraphs.size} epics, ${spawnedProcesses.size}/${config.maxAgents} spawnedProcesses active`);

  for (const { node } of allReady) {
    if (spawnedProcesses.has(node.ticket.identifier)) continue;
    if (spawnedProcesses.size >= config.maxAgents) break;

    let agentName = '';
    const usedNames = new Set<string>();
    for (const [tid] of spawnedProcesses) {
      const found = findNode(tid);
      if (found?.node.state.workerName) usedNames.add(found.node.state.workerName);
    }
    for (let i = 1; i <= config.maxAgents + 1; i++) {
      const candidate = `agent-${i}`;
      if (!usedNames.has(candidate)) {
        agentName = candidate;
        break;
      }
    }
    if (!agentName) {
      log(`launchReady: no available agent names for ${node.ticket.identifier}`);
      continue;
    }

    log(`launchReady: spawning worker for ${node.ticket.identifier} as ${agentName}`);
    try {
      const proc = spawnWorker(node, undefined, undefined, agentName, true);
      spawnedProcesses.set(node.ticket.identifier, proc);
      node.state.workerName = agentName;
      writePaneAssignments();

      // Attach worker output to its tmux pane so it's visible
      attachToPane(agentName, node.state.logPath, node.ticket.identifier);

      proc.on('close', (code) => {
        spawnedProcesses.delete(node.ticket.identifier);
        writePaneAssignments();
        log(`Worker for ${node.ticket.identifier} exited (code ${code})`);

        // Reset the pane to show "Waiting for tasks"
        resetPane(agentName);

        saveAllState();
        launchReady();
      });
    } catch (err: any) {
      log(`Failed to spawn worker for ${node.ticket.identifier}: ${err.message}`);
    }
  }
}

/** Write worker-to-pane assignments for tmux panes to reference. */
function writePaneAssignments(): void {
  const assignments: Record<string, { ticket: string; worktree: string; agent: string }> = {};
  let paneIdx = 1;
  for (const [ticketId] of spawnedProcesses) {
    const found = findNode(ticketId);
    if (found && found.node.state.workerName) {
      assignments[`pane_${paneIdx}`] = {
        ticket: ticketId,
        worktree: found.node.state.worktreePath || '',
        agent: found.node.state.workerName,
      };
      paneIdx++;
    }
  }
  try {
    fs.writeFileSync(
      path.join(getRepoRoot(), '.pi', 'tickets', 'pane-assignments.json'),
      JSON.stringify(assignments, null, 2),
      'utf-8',
    );
  } catch { /* best effort */ }
}

/** Save state for all epic graphs. */
function saveAllState(): void {
  const allNodes = new Map<string, GraphNode>();
  for (const [, epic] of epicGraphs) {
    for (const [id, node] of epic.nodes) {
      allNodes.set(id, node);
    }
  }
  // Merge with existing state so tickets from previously-loaded epics
  // are preserved when epics are loaded sequentially.
  saveFullState(allNodes, true);
  // Also persist the list of managed epic roots
  try {
    const existing = loadState();
    if (existing) {
      const st = { ...existing, epicRoots: [...epicGraphs.keys()] };
      fs.writeFileSync(
        path.join(getRepoRoot(), '.pi', 'tickets', 'state.json'),
        JSON.stringify(st, null, 2),
        'utf-8',
      );
    }
  } catch { /* ignore */ }
}

// ─── Handle boss commands ───────────────────────────────────────────

/** Find a node by ticket identifier across all epic graphs. */
function findNode(ticketId: string): { node: GraphNode; epicId: string } | null {
  for (const [epicId, epic] of epicGraphs) {
    const node = epic.nodes.get(ticketId);
    if (node) return { node, epicId };
  }
  return null;
}

/** Add an epic to the managed set. */
async function addEpic(ticketId: string): Promise<void> {
  if (epicGraphs.has(ticketId)) {
    log(`Epic ${ticketId} already managed — skipping`);
    return;
  }
  const existingState = loadState();
  const { nodes } = await buildGraph(ticketId, existingState);
  epicGraphs.set(ticketId, { nodes, rootId: ticketId });
  log(`Added epic ${ticketId} — ${nodes.size} tickets. Total epics: ${epicGraphs.size}`);
  await syncLinearStatus();
  saveAllState();
  writeDashboard();
  launchReady();
}

/** Remove an epic from the managed set, freeing any workers assigned to its tickets. */
function dropEpic(ticketId: string): void {
  const epic = epicGraphs.get(ticketId);
  if (!epic) return;
  epicGraphs.delete(ticketId);
  log(`Dropped epic ${ticketId}. Remaining epics: ${epicGraphs.size}`);
  saveAllState();
  writeDashboard();
}

async function handleCommand(from: string, text: string): Promise<void> {
  const trimmed = text.trim();

  if (trimmed.startsWith('EPIC ') || trimmed.startsWith('epic ')) {
    const ids = trimmed.split(/\s+/).slice(1);
    for (const ticketId of ids) {
      const id = ticketId.trim();
      if (!id) continue;
      log(`Boss: adding epic ${id}`);
      try {
        await addEpic(id);
      } catch (err: any) {
        log(`Error adding epic ${id}: ${err.message}`);
        await tellBoss(`Error adding epic ${id}: ${err.message}`);
      }
    }
    await tellBoss(`Managing ${epicGraphs.size} epic(s): ${[...epicGraphs.keys()].join(', ')}`);
  } else if (trimmed.startsWith('DROP ') || trimmed.startsWith('drop ')) {
    const ticketId = trimmed.split(/\s+/)[1]?.trim();
    if (!ticketId) return;
    dropEpic(ticketId);
    await tellBoss(`Dropped epic ${ticketId}. ${epicGraphs.size} epic(s) remaining.`);
  } else if (trimmed.startsWith('TICKET ') || trimmed.startsWith('ticket ')) {
    const ticketId = trimmed.split(/\s+/)[1]?.trim();
    if (!ticketId) return;
    log(`Boss: add ticket ${ticketId}`);
    try {
      await addEpic(ticketId);
      await tellBoss(`Added ${ticketId}.`);
    } catch (err: any) {
      log(`Error: ${err.message}`);
      await tellBoss(`Error: ${err.message}`);
    }
  } else if (trimmed === 'STOP' || trimmed === 'stop') {
    log('Boss requested stop');
    for (const [, epic] of epicGraphs) {
      killAllWorkers(epic.nodes);
      for (const [, node] of epic.nodes) {
        if (node.state.status === 'in_progress') {
          node.state.status = 'pending';
          node.state.error = 'Stopped by boss';
          node.state.pid = null;
          node.state.workerName = null;
          node.state.startedAt = null;
        }
      }
    }
    spawnedProcesses.clear();
    saveAllState();
    writeDashboard();
    // Reset all panes
    const config = getAgentConfig();
    for (let i = 1; i <= config.maxAgents; i++) {
      resetPane(`agent-${i}`);
    }
    await tellBoss('All workers stopped.');
  } else if (trimmed.startsWith('STOP ') || trimmed.startsWith('stop ')) {
    const agentName = trimmed.split(/\s+/)[1]?.trim();
    if (!agentName) return;
    log(`Boss: stopping ${agentName}`);
    // Find and kill the worker process for this agent
    for (const [ticketId, proc] of spawnedProcesses) {
      const found = findNode(ticketId);
      if (found && found.node.state.workerName === agentName) {
        try { proc.kill('SIGTERM'); } catch { /* ignore */ }
        spawnedProcesses.delete(ticketId);
        if (found.node.state.status === 'in_progress') {
          found.node.state.status = 'pending';
          found.node.state.error = `Stopped by boss for reassignment`;
        }
        resetPane(agentName);
        break;
      }
    }
    saveAllState();
    writeDashboard();
    launchReady();
  } else if (trimmed.startsWith('CLOSE ') || trimmed.startsWith('close ')) {
    const closeId = trimmed.split(/\s+/)[1]?.trim();
    if (!closeId) return;
    log(`Boss: closing ${closeId}`);
    try {
      await closeLinearTicket(closeId);
      // Mark ALL instances of this ticket across ALL epic graphs
      let closed = 0;
      for (const [, epic] of epicGraphs) {
        const node = epic.nodes.get(closeId);
        if (node) {
          node.state.status = 'done';
          node.state.finishedAt = new Date().toISOString();
          node.state.error = 'Closed by boss — no longer relevant';
          closed++;
        }
      }
      if (closed > 0) {
        saveAllState();
        writeDashboard();
      }
      log(`Closed ${closeId} in Linear (${closed} epic graph nodes updated)`);
      await tellBoss(`Closed ${closeId} in Linear.`);
    } catch (err: any) { log(`Failed to close ${closeId}: ${err.message}`); }
  } else if (trimmed === 'STATUS' || trimmed === 'status') {
    writeDashboard();
    if (epicGraphs.size === 0) {
      await tellBoss('No active epics. Send EPIC <ID> or TICKET <ID> to start.');
      return;
    }
    let totalTickets = 0, totalDone = 0, totalRunning = 0, totalFailed = 0;
    for (const [, epic] of epicGraphs) {
      totalTickets += epic.nodes.size;
      for (const [, n] of epic.nodes) {
        if (n.state.status === 'done' || n.state.status === 'merged') totalDone++;
        if (n.state.status === 'in_progress' || n.state.status === 'running') totalRunning++;
        if (n.state.status === 'failed') totalFailed++;
      }
    }
    await tellBoss(`${epicGraphs.size} epic(s) · ${totalTickets} tickets: ${totalRunning} running, ${totalDone} done, ${totalFailed} failed. ${spawnedProcesses.size} workers active.`);
  }
}

// ─── Handle webhook events ──────────────────────────────────────────

function handleWebhookEvent(event: WebhookEvent): void {
  switch (event.type) {
    case 'pr_opened':
    case 'pr_synchronize':
      tellBoss(`PR event: ${event.type} for ${event.ticketId || 'unknown ticket'}`);
      Promise.all([findMergeConflicts(), findBaseConflictPRs()]).then(([conflicts, baseConflicts]) => {
        if (conflicts.length > 0) {
          const ids = new Set<string>();
          for (const c of conflicts) {
            if (c.pr1.ticketIdentifier) ids.add(c.pr1.ticketIdentifier);
            if (c.pr2.ticketIdentifier) ids.add(c.pr2.ticketIdentifier);
          }
          tellBoss(`Merge conflicts detected: ${[...ids].join(', ')}`);
        }
        for (const [tid] of baseConflicts) {
          tellBoss(`Base conflict on ${tid}`);
        }
        saveAllState();
        writeDashboard();
        launchReady();
      }).catch(() => {});
      break;
    case 'pr_comment':
      if (event.ticketId) {
        tellBoss(`New PR comment on ${event.ticketId}`);
        launchReady();
      }
      break;
  }
}

// ─── Sync ticket status with Linear ─────────────────────────────────

async function syncLinearStatus(): Promise<void> {
  if (epicGraphs.size === 0) return;
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) return;

  try {
    for (const [, epic] of epicGraphs) {
      for (const [identifier, node] of epic.nodes) {
        if (node.state.status === 'done' || node.state.status === 'merged') continue;

        const query = `{ issue(id: "${identifier}") { state { name type } } }`;
        const resp = await fetch('https://api.linear.app/graphql', {
          method: 'POST',
          headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        const json = await resp.json() as any;
        const issue = json?.data?.issue;
        if (!issue) continue;

        const stateType = issue.state?.type;
        if (stateType === 'completed' || stateType === 'canceled') {
          node.state.status = 'done';
          node.state.finishedAt = new Date().toISOString();
          log(`Linear: ${identifier} → done (${issue.state?.name})`);
        }
      }
    }
    saveAllState();
  } catch (err) {
    log(`Linear sync error: ${err}`);
  }
}

// ─── Boss health monitoring ─────────────────────────────────────────

async function checkBossAlive(): Promise<void> {
  if (!intercom) return;
  try {
    const sessions = await intercom.listSessions();
    const bossSession = sessions.find((s: any) => s.name === 'boss' || (bossSessionId && s.id === bossSessionId));
    if (!bossSession && !bossSessionId) {
      log('Boss not connected');
    } else if (bossSession && bossSessionId && bossSession.id !== bossSessionId) {
      bossSessionId = bossSession.id;
    }
  } catch { /* best effort */ }
}

function logStatus(): void {
  writeDashboard();
  if (epicGraphs.size === 0) {
    log('── Status: No active epics ──');
    return;
  }
  let totalTickets = 0, totalDone = 0, totalRunning = 0;
  for (const [, epic] of epicGraphs) {
    totalTickets += epic.nodes.size;
    for (const [, n] of epic.nodes) {
      if (n.state.status === 'done' || n.state.status === 'merged') totalDone++;
      if (n.state.status === 'in_progress' || n.state.status === 'running') totalRunning++;
    }
  }
  log(`── ${epicGraphs.size} epics · ${totalTickets} tix · ${totalRunning} running · ${totalDone} done · ${spawnedProcesses.size} active ──`);
}

// ─── Close a Linear ticket ──────────────────────────────────────────

async function closeLinearTicket(identifier: string): Promise<void> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error('No LINEAR_API_KEY');

  const q1 = `{ issue(id: "${identifier}") { id team { id } } }`;
  const r1 = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q1 }),
  });
  const j1 = await r1.json() as any;
  const issueId = j1?.data?.issue?.id;
  const teamId = j1?.data?.issue?.team?.id;
  if (!issueId || !teamId) throw new Error('Issue not found');

  const q2 = `{ workflowStates(filter: { team: { id: { eq: "${teamId}" } } }) { nodes { id name type } } }`;
  const r2 = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q2 }),
  });
  const j2 = await r2.json() as any;
  const states: any[] = j2?.data?.workflowStates?.nodes ?? [];
  const target = states.find((s: any) => s.type === 'canceled') || states.find((s: any) => s.type === 'completed');
  if (!target) throw new Error('No canceled/done state found');

  const m = `mutation { issueUpdate(id: "${issueId}", input: { stateId: "${target.id}" }) { success } }`;
  await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: m }),
  });
}

/** Find all active epics (issues with children) or active tickets. */
async function findActiveEpics(): Promise<string[]> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) return [];

  try {
    const query = `
      query {
        issues(
          filter: { state: { type: { in: ["started", "unstarted"] } } }
          first: 25
        ) {
          nodes {
            id
            identifier
            title
            priority
            state { name type }
            children { nodes { id identifier title state { name } } }
          }
        }
      }
    `;
    const resp = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const json = await resp.json() as any;
    const issues: any[] = json?.data?.issues?.nodes ?? [];
    log(`Linear returned ${issues.length} active tickets`);

    const epics = issues.filter((i: any) => i.children?.nodes?.length > 0);
    if (epics.length > 0) {
      return epics.map((e: any) => e.identifier as string);
    }
    if (issues.length > 0) {
      return [issues[0].identifier as string];
    }
  } catch (err) {
    log(`Failed to query Linear: ${err}`);
  }
  return [];
}

async function autoStart(): Promise<void> {
  log('Looking for work to start...');
  
  const existingState = loadState();
  const epicRoots = existingState?.epicRoots ?? [];
  if (epicRoots.length > 0) {
    log(`Resuming ${epicRoots.length} epic(s): ${epicRoots.join(', ')}`);
    for (const rootId of epicRoots) {
      try {
        await addEpic(rootId);
      } catch (err: any) {
        log(`Failed to resume epic ${rootId}: ${err.message}`);
      }
    }
    if (epicGraphs.size > 0) return;
  }
  
  if (existingState && Object.keys(existingState.tickets).length > 0 && epicGraphs.size === 0) {
    const ticketIds = Object.keys(existingState.tickets);
    const firstId = ticketIds[0]!;
    log(`Resuming ${ticketIds.length} tickets from saved state (no epic roots recorded)`);
    try {
      await addEpic(firstId);
      if (epicGraphs.size > 0) return;
    } catch (err: any) {
      log(`Failed to resume: ${err.message}`);
    }
  }
  
  const epics = await findActiveEpics();
  if (epics.length > 0) {
    log(`Found ${epics.length} active epic(s): ${epics.join(', ')}`);
    for (const epicId of epics) {
      try {
        await addEpic(epicId);
      } catch (err: any) {
        log(`Failed to build epic ${epicId}: ${err.message}`);
      }
    }
    if (epicGraphs.size > 0) return;
  }
  
  log('No active tickets found in Linear. Send EPIC <ID> or TICKET <ID> to start manually.');
}

// ─── Main ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log('Server daemon starting...');

  try {
    getRepoRoot();
  } catch {
    console.error('Not in a git repository.');
    process.exit(1);
  }

  await initIntercom();

  // Reset all agent panes to "Waiting for tasks" on startup
  resetAllPanes();

  // Listen for boss commands
  intercom.on('message', async (from: any, message: any) => {
    const text: string = (message.content?.text ?? '').trim();
    const senderName: string = from.name || from.id.slice(0, 8);

    // Boss registration
    if (text.startsWith('BOSS:') || text.startsWith('boss:')) {
      bossSessionId = from.id;
      log(`Boss registered: ${senderName} (session: ${from.id.slice(0, 8)})`);
      await tellBoss('BOSS registered. Server is ready.');
      return;
    }

    // Boss commands
    if (text.startsWith('EPIC ') || text.startsWith('TICKET ') || text === 'STOP' || text === 'STATUS' || text.startsWith('CLOSE ') || text.startsWith('STOP ') || text.startsWith('DROP ')) {
      await handleCommand(senderName, text);
      return;
    }
  });

  // Watch for new sessions
  intercom.on('session_joined', (session: any) => {
    log(`Session joined: ${session.name} (${session.id?.slice(0, 8)})`);
  });

  // Start webhook server
  const config = getAgentConfig();
  let webhookPort = 0;
  for (let p = config.portMin; p <= config.portMax; p++) {
    try { webhookPort = p; break; } catch { continue; }
  }
  if (webhookPort > 0) {
    startWebhookServer(webhookPort, handleWebhookEvent);
    try {
      const ngrokUrl = await startNgrokTunnel(webhookPort);
      if (ngrokUrl) {
        await registerWebhook(ngrokUrl);
        log(`Webhook registered at ${ngrokUrl}`);
      }
    } catch { /* optional */ }
  }

  // Track previous "all done" state to avoid repeated boss notifications
  let wasAllDone = false;

  // Periodic: Linear sync + status display + PR scan
  setInterval(async () => {
    await checkBossAlive();
    await syncLinearStatus();
    logStatus();

    const allDone = areAllEpicsDone();

    if (allDone) {
      if (!wasAllDone) {
        wasAllDone = true;
        log('All epics complete — no work to assign.');
        await tellBoss('All epics complete. No more work to assign.');
      }
    } else {
      wasAllDone = false;
    }

    if (epicGraphs.size === 0) return;
    try {
      const comments = await scanAllPRComments();
      for (const [tid] of comments) {
        const found = findNode(tid);
        if (found && found.node.state.status === 'done') {
          found.node.state.status = 'pending';
          found.node.state.error = 'New PR review comments';
        }
      }
      for (const [, epic] of epicGraphs) {
        for (const [, node] of epic.nodes) {
          if (node.state.status === 'done' && node.state.prUrl) {
            try {
              if (await isPRMerged(node.ticket.identifier)) {
                node.state.status = 'merged';
                if (node.state.worktreePath && node.state.worktreePath.includes('worktrees')) {
                  try {
                    removeWorktree(getRepoRoot(), node.state.worktreePath, node.state.branch);
                    log(`Worktree removed: ${node.ticket.identifier}`);
                  } catch (e) { log(`Failed to remove worktree for ${node.ticket.identifier}: ${e}`); }
                }
              } else if (await isPRClosed(node.ticket.identifier)) {
                node.state.status = 'pending';
                node.state.error = 'PR closed without merge — needs remake';
                node.state.prUrl = null;
                log(`PR closed: ${node.ticket.identifier} → re-queued`);
              }
            } catch { /* skip */ }
          }
        }
      }
      saveAllState();
      writeDashboard();

      if (!allDone) {
        launchReady();
      }
    } catch { /* best effort */ }
  }, 10_000);

  // Cleanup
  const cleanup = async () => {
    if (paneService) { paneService.shutdown(); }
    for (const [, epic] of epicGraphs) { killAllWorkers(epic.nodes); }
    saveAllState();
    stopWebhookServer();
    try { await unregisterWebhooks(); } catch { /* ignore */ }
    try { await intercom.disconnect(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', () => { cleanup(); });
  process.on('SIGTERM', () => { cleanup(); });

  // Auto-start: pick up saved state or wait for boss
  await autoStart();
}

main().catch((err) => {
  console.error('Server daemon fatal error:', err);
  process.exit(1);
});
