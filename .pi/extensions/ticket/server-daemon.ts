#!/usr/bin/env -S npx tsx
/**
 * server-daemon.ts — Infrastructure server for the ticket agent system.
 *
 * Runs as a background process. Handles:
 *   - Worktree creation and management
 *   - Ticket graph building
 *   - Assigning work to idle workers via intercom
 *   - GitHub webhooks (PR comments, merge conflicts)
 *   - Alerting the boss of events
 *
 * The boss (a pi session) sends commands via intercom:
 *   EPIC <TICKET_ID>     — Build full epic graph, assign all tickets
 *   TICKET <ID>          — Build graph for one ticket
 *   STOP                 — Halt all workers
 *   STATUS               — Report current state
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

const workers = new Map<string, cp.ChildProcess>(); // ticketId → process
const workerAssignment = new Map<string, string>();  // agentName → ticketId
const agentSessionMap = new Map<string, { id: string; name: string }>();  // agentName → sessionInfo
const idleAgents = new Set<string>();                // agent names waiting for work

let currentNodes: Map<string, GraphNode> | null = null;

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

// ─── Assign work to an idle worker ──────────────────────────────────

async function assignWork(node: GraphNode): Promise<boolean> {
  // Find an idle agent
  const agentName = [...idleAgents][0];
  if (!agentName) return false;

  // Verify agent is actually connected via session map
  if (!intercom) { log(`assignWork: intercom not initialized`); return false; }
  let sessions: any[] = [];
  try { sessions = await intercom.listSessions(); } catch (err: any) { log(`assignWork: listSessions failed: ${err.message}`); return false; }
  
  // Resolve the agent's intercom session from the registration map
  const sessionInfo = agentSessionMap.get(agentName);
  const agentSession = sessionInfo
    ? sessions.find((s: any) => s.id === sessionInfo.id || s.name === sessionInfo.name)
    : sessions.find((s: any) => s.name === agentName);
  if (!agentSession) {
    // Agent disconnected — remove from idle and try next
    idleAgents.delete(agentName);
    const sessionIds = [...sessions.map((s: any) => `${s.name}(${s.id.slice(0,8)})`)].join(', ');
    log(`Agent ${agentName} not connected — removed from idle. Known sessions: [${sessionIds}]`);
    return assignWork(node); // try next agent
  }

  idleAgents.delete(agentName);

  // Create worktree
  const repoRoot = getRepoRoot();
  const wtDir = path.join(repoRoot, '.pi', 'tickets', 'worktrees');
  const { worktreePath } = ensureWorktree(repoRoot, node.ticket.identifier, 'main', wtDir);
  node.state.worktreePath = worktreePath;
  node.state.workerName = agentName;
  workerAssignment.set(agentName, node.ticket.identifier);

  // Copy skills to the worktree so workers can find them
  const skillsSrc = path.join(repoRoot, '.agents', 'skills');
  const skillsDst = path.join(worktreePath, '.agents', 'skills');
  try {
    for (const skill of ['worker-intercom', 'create-pr']) {
      const src = path.join(skillsSrc, skill, 'SKILL.md');
      const dst = path.join(skillsDst, skill, 'SKILL.md');
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
      }
    }
  } catch { /* best effort */ }

  // Build the prompt
  const deps = node.ticket.refs.length > 0 ? node.ticket.refs.join(', ') : 'none';
  const prompt = [
    `## Ticket Assignment: ${node.ticket.identifier}`,
    '',
    `**Title:** ${node.ticket.title}`,
    `**Dependencies:** ${deps}`,
    '',
    `**Worktree:** ${worktreePath}`,
    '',
    '## Ticket Description',
    node.ticket.description || '(no description)',
    '',
    '## Instructions',
    '1. cd to the worktree and implement this ticket',
    '2. Register: intercom({ action: "send", to: "server", message: "REGISTER: agent-N" })',
    '3. Status: intercom({ action: "send", to: "boss", message: "STATUS: doing X" })',
    '4. Question: intercom({ action: "ask", to: "boss", message: "Question: ..." })',
    '5. Write PR to pr-body.md, use create-pr skill, save pr-url.txt',
    '6. Done: intercom({ action: "send", to: "boss", message: "DONE: <pr-url>" })',
    '7. Idle: intercom({ action: "send", to: "server", message: "IDLE" })',
    '',
    'See .agents/skills/worker-intercom/SKILL.md and .agents/skills/create-pr/SKILL.md for details.',
  ].join('\n');

  // Send task via intercom — use the resolved session ID for routing
  try {
    const target = agentSession.id || agentName;
    log(`assignWork: sending TASK for ${node.ticket.identifier} to ${agentName} via target "${target}"`);
    await intercom.send(target, { text: `TASK: ${node.ticket.identifier}\n${prompt}` });
    log(`Assigned ${node.ticket.identifier} → ${agentName}`);
    node.state.status = 'in_progress';
    node.state.startedAt = new Date().toISOString();
    // Transition Linear ticket
    transitionTicket(node.ticket.id, 'In Progress').catch(() => {});
    await tellBoss(`Assigned ${node.ticket.identifier} to ${agentName}`);
    return true;
  } catch {
    // Send failed — agent may be gone, put it back
    idleAgents.add(agentName);
    return false;
  }
}

// ─── Launch ready workers ───────────────────────────────────────────

function launchReady(): void {
  if (!currentNodes) return;
  const ready = readyTickets(currentNodes);
  log(`launchReady: ${ready.length} ready tickets, ${idleAgents.size} idle agents`);
  if (ready.length > 0 && idleAgents.size > 0) {
    log(`launchReady: ready=[${ready.map(n => n.ticket.identifier).join(',')}], idle=[${[...idleAgents].join(',')}]`);
  }
  for (const node of ready) {
    if (workers.has(node.ticket.identifier)) continue;
    const config = getAgentConfig();
    if (workers.size >= config.maxAgents) break;

    // Only use intercom assignment — only real registered agents
    assignWork(node).then((assigned) => {
      if (assigned) {
        workers.set(node.ticket.identifier, null as any);
        saveFullState(currentNodes!);
      }
      // If no idle agent available, the ticket stays pending until one frees up
    });
  }
}

// ─── Handle boss commands ───────────────────────────────────────────

async function handleCommand(from: string, text: string): Promise<void> {
  const trimmed = text.trim();

  if (trimmed.startsWith('EPIC ') || trimmed.startsWith('epic ')) {
    const ticketId = trimmed.split(/\s+/)[1]?.trim();
    if (!ticketId) return;
    log(`Boss: switch to epic ${ticketId}`);

    try {
      // Preserve existing ticket states from saved state
      const existingState = loadState();
      const { nodes } = await buildGraph(ticketId, existingState);
      currentNodes = nodes;
      workerAssignment.clear();
      saveFullState(nodes);
      
      const total = nodes.size;
      log(`Loaded ${total} tickets from ${ticketId}.`);
      await syncLinearStatus();
      launchReady();
    } catch (err: any) {
      log(`Error switching epic: ${err.message}`);
    }
  } else if (trimmed.startsWith('TICKET ') || trimmed.startsWith('ticket ')) {
    const ticketId = trimmed.split(/\s+/)[1]?.trim();
    if (!ticketId) return;
    log(`Boss: switch to ticket ${ticketId}`);

    try {
      const existingState = loadState();
      const { nodes } = await buildGraph(ticketId, existingState);
      currentNodes = nodes;
      workerAssignment.clear();
      saveFullState(nodes);
      log(`Loaded ${nodes.size} tickets from ${ticketId}.`);
      await syncLinearStatus();
      launchReady();
    } catch (err: any) {
      log(`Error: ${err.message}`);
    }
  } else if (trimmed === 'STOP' || trimmed === 'stop') {
    log('Boss requested stop');
    if (currentNodes) {
      killAllWorkers(currentNodes);
      saveFullState(currentNodes);
    }
    workers.clear();
  } else if (trimmed.startsWith('STOP ') || trimmed.startsWith('stop ')) {
    // STOP agent-N — stop a specific worker
    const agentName = trimmed.split(/\s+/)[1]?.trim();
    if (!agentName) return;
    log(`Boss: stopping ${agentName}`);
    // Tell the worker to stop
    try { await intercom.send(agentName, { text: 'STOP: Boss is reassigning you. Go idle.' }); } catch {}
    // Free the agent
    for (const [name, tid] of workerAssignment) {
      if (name === agentName) {
        const node = currentNodes?.get(tid);
        if (node && node.state.status === 'in_progress') {
          node.state.status = 'pending';
          node.state.error = `Stopped by boss for reassignment`;
        }
        workerAssignment.delete(name);
        break;
      }
    }
    idleAgents.add(agentName);
    if (currentNodes) { saveFullState(currentNodes); launchReady(); }
  } else if (trimmed.startsWith('CLOSE ') || trimmed.startsWith('close ')) {
    const closeId = trimmed.split(/\s+/)[1]?.trim();
    if (!closeId) return;
    log(`Boss: closing ${closeId}`);
    try {
      await closeLinearTicket(closeId);
      if (currentNodes) {
        const node = currentNodes.get(closeId);
        if (node) {
          node.state.status = 'done';
          node.state.finishedAt = new Date().toISOString();
          node.state.error = 'Closed by boss — no longer relevant';
          for (const [name, tid] of workerAssignment) {
            if (tid === closeId) { workerAssignment.delete(name); idleAgents.add(name); break; }
          }
          saveFullState(currentNodes);
        }
      }
      log(`Closed ${closeId} in Linear`);
    } catch (err: any) { log(`Failed to close ${closeId}: ${err.message}`); }
    // ASSIGN agent-N TICKET-ID — manually assign a ticket to a specific worker
    const parts = trimmed.split(/\s+/);
    const agentName = parts[1]?.trim();
    const ticketId = parts[2]?.trim();
    if (!agentName || !ticketId) return;
    log(`Boss: assigning ${ticketId} → ${agentName}`);
    if (!currentNodes) {
      // Auto-build a single-ticket graph
      try {
        const existingState = loadState();
        const { nodes } = await buildGraph(ticketId, existingState);
        currentNodes = nodes;
        saveFullState(nodes);
        await syncLinearStatus();
      } catch (err: any) { log(`Build error: ${err.message}`); return; }
    }
    const node = currentNodes!.get(ticketId);
    if (!node) return;
    // Take agent out of idle and assign directly
    idleAgents.delete(agentName);
    const wtDir = path.join(getRepoRoot(), '.pi', 'tickets', 'worktrees');
    const { worktreePath } = ensureWorktree(getRepoRoot(), ticketId, 'main', wtDir);
    node.state.worktreePath = worktreePath;
    node.state.workerName = agentName;
    workerAssignment.set(agentName, ticketId);
    node.state.status = 'in_progress';
    node.state.startedAt = new Date().toISOString();
    saveFullState(currentNodes!);
    try {
      await intercom.send(agentName, { text: `TASK: ${ticketId}\nWorktree: ${worktreePath}\nTicket: ${node.ticket.title}\n\n${node.ticket.description || '(no description)'}` });
      log(`Assigned ${ticketId} → ${agentName}`);
    } catch { idleAgents.add(agentName); }
    await tellBoss('All workers stopped.');
  } else if (trimmed === 'STATUS' || trimmed === 'status') {
    if (!currentNodes) {
      await tellBoss('No active tickets. Send EPIC <ID> or TICKET <ID> to start.');
      return;
    }
    const running = [...currentNodes.values()].filter(n => n.state.status === 'in_progress').length;
    const done = [...currentNodes.values()].filter(n => n.state.status === 'done' || n.state.status === 'merged').length;
    const failed = [...currentNodes.values()].filter(n => n.state.status === 'failed').length;
    const total = currentNodes.size;
    await tellBoss(`${total} tickets: ${running} running, ${done} done, ${failed} failed. ${idleAgents.size} agents idle.`);
  }
}

// ─── Handle webhook events ──────────────────────────────────────────

function handleWebhookEvent(event: WebhookEvent): void {
  switch (event.type) {
    case 'pr_opened':
    case 'pr_synchronize':
      tellBoss(`PR event: ${event.type} for ${event.ticketId || 'unknown ticket'}`);
      // Re-scan conflicts in background
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
        if (currentNodes) {
          saveFullState(currentNodes);
          launchReady();
        }
      }).catch(() => {});
      break;
    case 'pr_comment':
      if (event.ticketId) {
        tellBoss(`New PR comment on ${event.ticketId}`);
        if (currentNodes) {
          launchReady();
        }
      }
      break;
  }
}

// ─── Sync ticket status with Linear ─────────────────────────────────

async function syncLinearStatus(): Promise<void> {
  if (!currentNodes) return;
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) return;

  try {
    // Query each ticket individually by identifier
    for (const [identifier, node] of currentNodes) {
      // Skip already completed tickets
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
        // Free the assigned worker
        for (const [name, tid] of workerAssignment) {
          if (tid === identifier) {
            workerAssignment.delete(name);
            idleAgents.add(name);
            break;
          }
        }
      }
    }
    saveFullState(currentNodes);
  } catch (err) {
    log(`Linear sync error: ${err}`);
  }
}

// ─── Boss health monitoring ─────────────────────────────────────────

async function checkBossAlive(): Promise<void> {
  if (!intercom) return;
  try {
    const sessions = await intercom.listSessions();
    // Boss can register via BOSS: message (tracked by bossSessionId) or by /name boss
    const bossSession = sessions.find((s: any) => s.name === 'boss' || (bossSessionId && s.id === bossSessionId));
    if (!bossSession && !bossSessionId) {
      log('Boss not connected');
    } else if (bossSession && bossSessionId && bossSession.id !== bossSessionId) {
      // Boss reconnected with a different session — update tracking
      bossSessionId = bossSession.id;
    }
    // Clean up idleAgents: remove any that aren't actually connected
    const connectedIds = new Set(sessions.map((s: any) => s.id));
    for (const name of idleAgents) {
      const info = agentSessionMap.get(name);
      const hasSession = info
        ? (connectedIds.has(info.id) || connectedIds.has(info.name))
        : false;
      if (!hasSession) {
        idleAgents.delete(name);
        log(`Removed stale agent from idle: ${name}`);
      }
    }
  } catch { /* best effort */ }
}

function logStatus(): void {
  if (!currentNodes) {
    log('── Status: No active tickets ──');
    return;
  }

  const STATUS_ICON: Record<string, string> = {
    pending: '○', blocked: '◆', in_progress: '◉', done: '✓', failed: '✗', merged: '✔',
  };

  const lines: string[] = [];
  lines.push('── Ticket Status ──');
  lines.push('  ◉=running  ○=pending  ◆=blocked  ✓=done  ✗=failed  ✔=merged');
  lines.push('');

  // Sort: running first
  const sorted = [...currentNodes.values()].sort((a, b) => {
    const order: Record<string, number> = { in_progress: 0, pending: 1, blocked: 2, failed: 3, done: 4, merged: 5 };
    return (order[a.state.status] ?? 5) - (order[b.state.status] ?? 5);
  });

  for (const node of sorted) {
    const icon = STATUS_ICON[node.state.status] ?? '?';
    const id = node.ticket.identifier.padEnd(10);
    const title = node.ticket.title.slice(0, 40).padEnd(40);
    // Use real agent assignment, not saved state
    let agent = '—';
    for (const [name, tid] of workerAssignment) {
      if (tid === node.ticket.identifier) { agent = name; break; }
    }
    lines.push(`${icon} ${id} ${title} [${agent.padEnd(10)}]`);
  }

  // Worker status
  lines.push('── Worker Status ──');
  lines.push('  ◉=busy  ○=idle');
  lines.push('');
  const activeAgents = new Set([...idleAgents]);
  for (const [agentName] of workerAssignment) {
    activeAgents.add(agentName);
  }
  for (const agentName of activeAgents) {
    const ticketId = workerAssignment.get(agentName);
    if (ticketId) {
      const node = currentNodes.get(ticketId);
      const status = node?.state.status || 'working';
      lines.push(`  ◉ ${agentName.padEnd(12)} → ${ticketId.padEnd(10)} (${status})`);
    } else {
      lines.push(`  ○ ${agentName.padEnd(12)} idle`);
    }
  }

  lines.push('──');
  log(lines.join('\n'));
}

// ─── Close a Linear ticket ──────────────────────────────────────────

async function closeLinearTicket(identifier: string): Promise<void> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error('No LINEAR_API_KEY');

  // Get the issue ID and team
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

  // Find a canceled or done state
  const q2 = `{ team(id: "${teamId}") { states { id name type } } }`;
  const r2 = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q2 }),
  });
  const j2 = await r2.json() as any;
  const states: any[] = j2?.data?.team?.states ?? [];
  const target = states.find((s: any) => s.type === 'canceled') || states.find((s: any) => s.type === 'completed');
  if (!target) throw new Error('No canceled/done state found');

  // Transition
  const m = `mutation { issueUpdate(id: "${issueId}", input: { stateId: "${target.id}" }) { success } }`;
  await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: m }),
  });
}

async function findActiveEpic(): Promise<string | null> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) return null;

  try {
    // Query for in-progress or todo tickets, prefer those with children (epics)
    const query = `
      query {
        issues(
          filter: { state: { type: { in: ["started", "unstarted"] } } }
          first: 10
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

    // Prefer epics (issues with children)
    const epics = issues.filter((i: any) => i.children?.nodes?.length > 0);
    if (epics.length > 0) {
      log(`Found epic: ${epics[0].identifier} — ${epics[0].title}`);
      return epics[0].identifier;
    }
    // Fall back to any active ticket
    if (issues.length > 0) {
      log(`Found ticket: ${issues[0].identifier} — ${issues[0].title}`);
      return issues[0].identifier;
    }
  } catch (err) {
    log(`Failed to query Linear: ${err}`);
  }
  return null;
}

async function autoStart(): Promise<void> {
  log('Looking for work to start...');
  
  // Check if there's saved state first
  const existingState = loadState();
  if (existingState && Object.keys(existingState.tickets).length > 0) {
    const ticketIds = Object.keys(existingState.tickets);
    const firstId = ticketIds[0];
    log(`Resuming ${ticketIds.length} tickets from saved state`);
    try {
      const { nodes } = await buildGraph(firstId, existingState);
      currentNodes = nodes;
      saveFullState(nodes);
      const pending = [...nodes.values()].filter(n => n.state.status === 'pending' || n.state.status === 'blocked');
      log(`Resumed ${nodes.size} tickets. ${pending.length} pending.`);
      await syncLinearStatus();
      launchReady();
      return;
    } catch (err: any) {
      log(`Failed to resume: ${err.message}`);
    }
  }
  
  // No saved state — query Linear for active work
  const epicId = await findActiveEpic();
  if (epicId) {
    log(`Found active epic: ${epicId}. Building graph...`);
    try {
      const existingState = loadState();
      const { nodes } = await buildGraph(epicId, existingState);
      currentNodes = nodes;
      saveFullState(nodes);
      log(`Loaded ${nodes.size} tickets from ${epicId}.`);
      await syncLinearStatus();
      launchReady();
      return;
    } catch (err: any) {
      log(`Failed to build graph: ${err.message}`);
    }
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

  // Listen for boss commands and worker messages
  intercom.on('message', async (from: any, message: any) => {
    const text: string = (message.content?.text ?? '').trim();
    const senderName: string = from.name || from.id.slice(0, 8);

    // Boss registration — track their session ID so tellBoss() works
    if (text.startsWith('BOSS:') || text.startsWith('boss:')) {
      bossSessionId = from.id;
      log(`Boss registered: ${senderName} (session: ${from.id.slice(0, 8)})`);
      await tellBoss('BOSS registered. Server is ready.');
      return;
    }

    if (text.startsWith('EPIC ') || text.startsWith('TICKET ') || text === 'STOP' || text === 'STATUS' || text.startsWith('CLOSE ') || text.startsWith('STOP ')) {
      await handleCommand(senderName, text);
      return;
    }

    // Worker registration — map agent name to session info
    if (text.startsWith('REGISTER:')) {
      const agentName = text.slice('REGISTER:'.length).trim();
      log(`Worker registered: ${agentName} (session: ${senderName})`);
      // Track the mapping so IDLE messages from subagent-chat-* sessions work.
      // Store by agentName (not session id) so multiple workers can't overwrite each other.
      agentSessionMap.set(agentName, { id: from.id, name: senderName });
      idleAgents.add(agentName);
      if (currentNodes) launchReady();
    } else if (text === 'IDLE' || text === 'idle') {
      // Resolve agent name from session map (workers have subagent-chat-* intercom names)
      const resolvedName = [...agentSessionMap.entries()].find(
        ([, info]) => info.id === from.id || info.name === senderName
      )?.[0];
      const agentName = resolvedName || senderName;
      // Don't re-add agents that are already assigned to a ticket
      if (workerAssignment.has(agentName)) {
        log(`Agent ${agentName} is idle but already assigned — ignoring`);
      } else {
        log(`Agent ${agentName} is idle`);
        idleAgents.add(agentName);
      }
      if (currentNodes) launchReady();
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

  // Periodic: Linear sync + status display + PR scan
  setInterval(async () => {
    await checkBossAlive();
    await syncLinearStatus();
    logStatus();
    if (!currentNodes) return;
    try {
      const comments = await scanAllPRComments();
      for (const [tid] of comments) {
        const node = currentNodes.get(tid);
        if (node && node.state.status === 'done') {
          node.state.status = 'pending';
          node.state.error = 'New PR review comments';
        }
      }
      for (const [, node] of currentNodes) {
        if (node.state.status === 'done' && node.state.prUrl) {
          try {
            if (await isPRMerged(node.ticket.identifier)) {
              node.state.status = 'merged';
              // Clean up the worktree — ticket is fully done
              if (node.state.worktreePath && node.state.worktreePath.includes('worktrees')) {
                try {
                  const repoRoot = getRepoRoot();
                  removeWorktree(repoRoot, node.state.worktreePath, node.state.branch);
                  log(`Worktree removed: ${node.ticket.identifier}`);
                } catch (e) { log(`Failed to remove worktree for ${node.ticket.identifier}: ${e}`); }
              }
            } else if (await isPRClosed(node.ticket.identifier)) {
              // PR was closed without merging — work needs to be redone
              node.state.status = 'pending';
              node.state.error = 'PR closed without merge — needs remake';
              node.state.prUrl = null;
              log(`PR closed: ${node.ticket.identifier} → re-queued`);
            }
          } catch { /* skip */ }
        }
      }
      saveFullState(currentNodes);
      launchReady();
    } catch { /* best effort */ }
  }, 10_000);

  // Cleanup
  process.on('SIGINT', async () => {
    log('Shutting down...');
    if (currentNodes) { killAllWorkers(currentNodes); saveFullState(currentNodes); }
    stopWebhookServer();
    try { await unregisterWebhooks(); } catch { /* ignore */ }
    try { await intercom.disconnect(); } catch { /* ignore */ }
    process.exit(0);
  });

  // Auto-start: pick up saved state or wait for boss
  await autoStart();
}

main().catch((err) => {
  console.error('Server daemon fatal error:', err);
  process.exit(1);
});
