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

interface WorkerRecord {
  uuid: string;
  displayName: string;
  sessionId: string;
  sessionName: string;
  status: 'idle' | 'busy';
  assignedTicket: string | null;
  registeredAt: string;
}

const spawnedProcesses = new Map<string, cp.ChildProcess>(); // ticketId → headless process
const workerRegistry = new Map<string, WorkerRecord>();      // uuid → WorkerRecord
const inFlightAssignments = new Set<string>();               // ticket identifiers currently being assigned

/** All idle workers (derived). */
function idleWorkerUUIDs(): string[] {
  return [...workerRegistry.values()].filter(w => w.status === 'idle').map(w => w.uuid);
}

/** All worker UUIDs currently assigned to a ticket. */
function busyWorkerUUIDs(): string[] {
  return [...workerRegistry.values()].filter(w => w.status === 'busy').map(w => w.uuid);
}

/** Find a worker by their intercom session ID. */
function findWorkerBySession(sessionId: string): WorkerRecord | undefined {
  return [...workerRegistry.values()].find(w => w.sessionId === sessionId);
}

/** Find the ticket a worker is assigned to, or null. */
function workerTicket(uuid: string): string | null {
  return workerRegistry.get(uuid)?.assignedTicket ?? null;
}

/** Generate a short UUID-like identifier for workers. */
function newWorkerUUID(): string {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

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

// ─── Assign work to an idle worker ──────────────────────────────────

async function assignWork(node: GraphNode): Promise<boolean> {
  // Find an idle worker
  const idleUUIDs = idleWorkerUUIDs();
  const workerUUID = idleUUIDs[0];
  if (!workerUUID) return false;
  const worker = workerRegistry.get(workerUUID)!;

  // Prevent double-assignment
  if (inFlightAssignments.has(node.ticket.identifier)) {
    log(`assignWork: ${node.ticket.identifier} already being assigned — skipping ${worker.displayName}`);
    return false;
  }
  const alreadyAssigned = busyWorkerUUIDs().some(uuid => workerTicket(uuid) === node.ticket.identifier);
  if (alreadyAssigned) {
    log(`assignWork: ${node.ticket.identifier} already has a worker — skipping ${worker.displayName}`);
    return false;
  }
  inFlightAssignments.add(node.ticket.identifier);
  worker.status = 'busy';
  worker.assignedTicket = node.ticket.identifier;

  // Verify worker is still connected
  if (!intercom) { worker.status = 'idle'; worker.assignedTicket = null; inFlightAssignments.delete(node.ticket.identifier); return false; }
  let sessions: any[] = [];
  try { sessions = await intercom.listSessions(); } catch (err: any) { worker.status = 'idle'; worker.assignedTicket = null; inFlightAssignments.delete(node.ticket.identifier); return false; }
  
  const agentSession = sessions.find((s: any) => s.id === worker.sessionId);
  if (!agentSession) {
    log(`Worker ${worker.displayName} (${workerUUID}) disconnected — removing from registry`);
    workerRegistry.delete(workerUUID);
    inFlightAssignments.delete(node.ticket.identifier);
    return assignWork(node);
  }

  // Create worktree
  const repoRoot = getRepoRoot();
  const wtDir = path.join(repoRoot, '.pi', 'tickets', 'worktrees');
  const { worktreePath } = ensureWorktree(repoRoot, node.ticket.identifier, 'main', wtDir);
  node.state.worktreePath = worktreePath;
  node.state.workerName = worker.displayName;

  // Copy skills
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
    `**Worker UUID:** ${workerUUID}`,
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
    '2. Status: intercom({ action: "send", to: "boss", message: "STATUS: doing X" })',
    '3. Question: intercom({ action: "ask", to: "boss", message: "Question: ..." })',
    '4. Write PR to pr-body.md, use create-pr skill, save pr-url.txt',
    '5. Done: intercom({ action: "send", to: "boss", message: "DONE: <pr-url>" })',
    `6. Idle: intercom({ action: "send", to: "server", message: "IDLE ${workerUUID}" })`,
    '',
    'See .agents/skills/worker-intercom/SKILL.md and .agents/skills/create-pr/SKILL.md for details.',
  ].join('\n');

  // Send task via intercom
  try {
    log(`assignWork: sending TASK for ${node.ticket.identifier} to ${worker.displayName} (${workerUUID})`);
    await intercom.send(agentSession.id, { text: `TASK: ${node.ticket.identifier}\n${prompt}` });
    log(`Assigned ${node.ticket.identifier} → ${worker.displayName} (${workerUUID})`);
    node.state.status = 'in_progress';
    node.state.startedAt = new Date().toISOString();
    transitionTicket(node.ticket.id, 'In Progress').catch(() => {});
    await tellBoss(`Assigned ${node.ticket.identifier} to ${worker.displayName}`);
    inFlightAssignments.delete(node.ticket.identifier);
    return true;
  } catch {
    worker.status = 'idle';
    worker.assignedTicket = null;
    inFlightAssignments.delete(node.ticket.identifier);
    return false;
  }
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
  lines.push(`${totalEpics} epic(s) · ${totalTickets} tickets · ${totalRunning} running · ${totalDone} done · ${totalFailed} failed · ${idleWorkerUUIDs().length} idle`);
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
      // Find worker display name for this ticket
      let agent = node.state.workerName || '—';
      for (const [, w] of workerRegistry) {
        if (w.assignedTicket === node.ticket.identifier) {
          agent = w.displayName;
          break;
        }
      }
      lines.push(`  ${icon} ${id} ${title} [${agent.padEnd(10)}]`);
    }
    lines.push('');
  }

  // Worker status
  lines.push('── Workers ──');
  if (workerRegistry.size === 0 && spawnedProcesses.size === 0) {
    lines.push('  (no workers connected)');
  } else {
    for (const [uuid, w] of workerRegistry) {
      if (w.status === 'busy' && w.assignedTicket) {
        let epicId = '?';
        for (const [eid, epic] of epicGraphs) {
          if (epic.nodes.has(w.assignedTicket)) { epicId = eid; break; }
        }
        lines.push(`  ◉ ${w.displayName.padEnd(12)} → ${w.assignedTicket.padEnd(10)} (${epicId}) [${uuid.slice(0,12)}]`);
      } else {
        lines.push(`  ○ ${w.displayName.padEnd(12)} idle [${uuid.slice(0,12)}]`);
      }
    }
    // Headless workers
    for (const [ticketId] of spawnedProcesses) {
      const found = findNode(ticketId);
      if (found && found.node.state.workerName) {
        let epicId = '?';
        for (const [eid, epic] of epicGraphs) {
          if (epic.nodes.has(ticketId)) { epicId = eid; break; }
        }
        lines.push(`  ◉ ${found.node.state.workerName.padEnd(12)} → ${ticketId.padEnd(10)} (${epicId}) [headless]`);
      }
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
  if (epicGraphs.size === 0) return true; // no epics = nothing to do
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
  // Don't ping agents if there's nothing to work on
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

  log(`launchReady: ${allReady.length} ready tickets across ${epicGraphs.size} epics, ${idleWorkerUUIDs().length} idle workers`);
  if (allReady.length > 0 && idleWorkerUUIDs().length > 0) {
    log(`launchReady: ready=[${allReady.map(r => r.node.ticket.identifier).join(',')}], idle=[${idleWorkerUUIDs().join(',')}]`);
  }

  for (const { node } of allReady) {
    if (spawnedProcesses.has(node.ticket.identifier)) continue;
    // Check if any worker (intercom) is already assigned to this ticket
    const alreadyTaken = busyWorkerUUIDs().some(uuid => workerTicket(uuid) === node.ticket.identifier);
    if (alreadyTaken) continue;
    const config = getAgentConfig();
    const totalWorkers = spawnedProcesses.size + busyWorkerUUIDs().length;
    if (totalWorkers >= config.maxAgents) break;

    if (idleWorkerUUIDs().length > 0) {
      assignWork(node).then((assigned) => {
        saveAllState();
      });
    } else {
      // Assign a unique agent name for the spawned worker.
      // Check worker registry AND currently-active headless workers.
      let agentName = '';
      const usedNames = new Set<string>();
      for (const [, w] of workerRegistry) usedNames.add(w.displayName);
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
      log(`launchReady: no intercom agents, spawning worker for ${node.ticket.identifier} as ${agentName}`);
      try {
        const proc = spawnWorker(node, undefined, undefined, agentName, true);
        spawnedProcesses.set(node.ticket.identifier, proc);
        node.state.workerName = agentName;
        // Headless workers are tracked via process exit code, not intercom.
        proc.on('close', (code) => {
          spawnedProcesses.delete(node.ticket.identifier);
          log(`Worker for ${node.ticket.identifier} exited (code ${code})`);
          saveAllState();
          launchReady();
        });
      } catch (err: any) {
        log(`Failed to spawn worker for ${node.ticket.identifier}: ${err.message}`);
      }
    }
  }
}

/** Save state for all epic graphs. */
function saveAllState(): void {
  const allNodes = new Map<string, GraphNode>();
  for (const [, epic] of epicGraphs) {
    for (const [id, node] of epic.nodes) {
      allNodes.set(id, node);
    }
  }
  saveFullState(allNodes);
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
  // Free any workers assigned to this epic's tickets
  for (const [uuid, w] of workerRegistry) {
    if (w.assignedTicket && epic.nodes.has(w.assignedTicket)) {
      w.status = 'idle';
      w.assignedTicket = null;
      log(`Freed ${w.displayName} (${uuid}) from ${w.assignedTicket} (epic ${ticketId} dropped)`);
    }
  }
  epicGraphs.delete(ticketId);
  log(`Dropped epic ${ticketId}. Remaining epics: ${epicGraphs.size}`);
  saveAllState();
  writeDashboard();
}

async function handleCommand(from: string, text: string): Promise<void> {
  const trimmed = text.trim();

  if (trimmed.startsWith('EPIC ') || trimmed.startsWith('epic ')) {
    // Support multiple: EPIC RES-10 RES-20 RES-30
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
    // Single ticket — build a mini "epic" around it
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
      // Reset all in_progress tickets back to pending
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
    // Free all workers
    for (const [, w] of workerRegistry) {
      if (w.status === 'busy') {
        w.status = 'idle';
        w.assignedTicket = null;
      }
    }
    saveAllState();
    writeDashboard();
    spawnedProcesses.clear();
    await tellBoss('All workers stopped.');
  } else if (trimmed.startsWith('STOP ') || trimmed.startsWith('stop ')) {
    // STOP agent-N — stop a specific worker by display name
    const agentName = trimmed.split(/\s+/)[1]?.trim();
    if (!agentName) return;
    log(`Boss: stopping ${agentName}`);
    const worker = [...workerRegistry.values()].find(w => w.displayName === agentName);
    if (worker) {
      try { await intercom!.send(worker.sessionId, { text: 'STOP: Boss is reassigning you. Go idle.' }); } catch {}
      if (worker.assignedTicket) {
        const found = findNode(worker.assignedTicket);
        if (found && found.node.state.status === 'in_progress') {
          found.node.state.status = 'pending';
          found.node.state.error = `Stopped by boss for reassignment`;
        }
      }
      worker.status = 'idle';
      worker.assignedTicket = null;
    }
    saveAllState();
    writeDashboard();
    launchReady();
  } else if (trimmed.startsWith('ASSIGN ') || trimmed.startsWith('assign ')) {
    // ASSIGN agent-N TICKET-ID
    const parts = trimmed.split(/\s+/);
    const agentName = parts[1]?.trim();
    const ticketId = parts[2]?.trim();
    if (!agentName || !ticketId) return;
    log(`Boss: assigning ${ticketId} → ${agentName}`);

    // Check if ticket is in any existing epic, if not add it
    let node = findNode(ticketId);
    if (!node) {
      try { await addEpic(ticketId); } catch (err: any) { log(`Build error: ${err.message}`); return; }
      node = findNode(ticketId);
    }
    if (!node) return;

    const worker = [...workerRegistry.values()].find(w => w.displayName === agentName);
    if (!worker) {
      log(`Worker ${agentName} not found in registry`);
      return;
    }
    const wtDir = path.join(getRepoRoot(), '.pi', 'tickets', 'worktrees');
    const { worktreePath } = ensureWorktree(getRepoRoot(), ticketId, 'main', wtDir);
    node.node.state.worktreePath = worktreePath;
    node.node.state.workerName = agentName;
    worker.status = 'busy';
    worker.assignedTicket = ticketId;
    node.node.state.status = 'in_progress';
    node.node.state.startedAt = new Date().toISOString();
    saveAllState();
    writeDashboard();
    try {
      await intercom!.send(worker.sessionId, { text: `TASK: ${ticketId}\nWorktree: ${worktreePath}\nTicket: ${node.node.ticket.title}\n\n${node.node.ticket.description || '(no description)'}` });
      log(`Assigned ${ticketId} → ${agentName} (${worker.uuid})`);
    } catch { worker.status = 'idle'; worker.assignedTicket = null; }
  } else if (trimmed.startsWith('CLOSE ') || trimmed.startsWith('close ')) {
    const closeId = trimmed.split(/\s+/)[1]?.trim();
    if (!closeId) return;
    log(`Boss: closing ${closeId}`);
    try {
      await closeLinearTicket(closeId);
      const found = findNode(closeId);
      if (found) {
        found.node.state.status = 'done';
        found.node.state.finishedAt = new Date().toISOString();
        found.node.state.error = 'Closed by boss — no longer relevant';
        // Free any worker assigned to this ticket
        for (const [uuid, w] of workerRegistry) {
          if (w.assignedTicket === closeId) { w.status = 'idle'; w.assignedTicket = null; break; }
        }
        saveAllState();
        writeDashboard();
      }
      log(`Closed ${closeId} in Linear`);
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
    await tellBoss(`${epicGraphs.size} epic(s) · ${totalTickets} tickets: ${totalRunning} running, ${totalDone} done, ${totalFailed} failed. ${idleWorkerUUIDs().length} workers idle.`);
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
          // Free any assigned worker
          for (const [uuid, w] of workerRegistry) {
            if (w.assignedTicket === identifier) {
              w.status = 'idle';
              w.assignedTicket = null;
              break;
            }
          }
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
    // Boss can register via BOSS: message (tracked by bossSessionId) or by /name boss
    const bossSession = sessions.find((s: any) => s.name === 'boss' || (bossSessionId && s.id === bossSessionId));
    if (!bossSession && !bossSessionId) {
      log('Boss not connected');
    } else if (bossSession && bossSessionId && bossSession.id !== bossSessionId) {
      // Boss reconnected with a different session — update tracking
      bossSessionId = bossSession.id;
    }
  } catch { /* best effort */ }
}

// ─── Auto-discover workers from intercom sessions ──────────────────

async function autoDiscoverWorkers(): Promise<void> {
  if (!intercom) return;
  try {
    const sessions = await intercom.listSessions();
    const repoRoot = getRepoRoot();
    const connectedIds = new Set(sessions.map((s: any) => s.id));

    for (const session of sessions) {
      // Skip: server, boss, already-registered workers
      if (session.id === 'server' || session.name === 'server') continue;
      if (bossSessionId && session.id === bossSessionId) continue;
      if (session.name === 'boss') continue;
      if (findWorkerBySession(session.id)) continue;

      // Only auto-register sessions in the project directory (or worktrees under it)
      const sessionCwd = session.cwd || '';
      if (!sessionCwd.startsWith(repoRoot)) continue;

      // Skip sessions that are actively processing (not idle)
      if (session.status === 'thinking' || session.status === 'running') continue;

      // Auto-register as a worker
      const uuid = newWorkerUUID();
      const displayName = session.name || `worker-${session.id.slice(0, 6)}`;
      workerRegistry.set(uuid, {
        uuid,
        displayName,
        sessionId: session.id,
        sessionName: session.name || session.id.slice(0, 8),
        status: 'idle',
        assignedTicket: null,
        registeredAt: new Date().toISOString(),
      });
      log(`Auto-discovered worker: ${displayName} (${uuid}, session: ${session.id.slice(0, 8)})`);
    }

    // Remove workers whose sessions disconnected
    for (const [uuid, w] of workerRegistry) {
      if (!connectedIds.has(w.sessionId)) {
        log(`Removing disconnected worker: ${w.displayName} (${uuid})`);
        workerRegistry.delete(uuid);
      }
    }
  } catch { /* best effort */ }
}

function logStatus(): void {
  writeDashboard();
  // Log a one-line summary
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
  log(`── ${epicGraphs.size} epics · ${totalTickets} tix · ${totalRunning} running · ${totalDone} done · ${idleWorkerUUIDs().length} idle ──`);
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

  // Transition
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

    // Return all epics (issues with children)
    const epics = issues.filter((i: any) => i.children?.nodes?.length > 0);
    if (epics.length > 0) {
      return epics.map((e: any) => e.identifier as string);
    }
    // Fall back to first active ticket
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
  
  // Check if there's saved state with epic roots first
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
  
  // Fall back to old-style state (single graph without epicRoots)
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
  
  // No saved state — query Linear for active epics
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

    if (text.startsWith('EPIC ') || text.startsWith('TICKET ') || text === 'STOP' || text === 'STATUS' || text.startsWith('CLOSE ') || text.startsWith('STOP ') || text.startsWith('ASSIGN ') || text.startsWith('DROP ')) {
      await handleCommand(senderName, text);
      return;
    }

    // Worker registration: REGISTER: [uuid] [display-name]
    // UUID is permanent worker identity. Server generates one if not provided.
    if (text.startsWith('REGISTER:')) {
      const parts = text.slice('REGISTER:'.length).trim().split(/\s+/);
      let uuid = parts[0] || '';
      const displayName = parts.slice(1).join(' ') || `worker-${from.id.slice(0, 6)}`;

      // Generate UUID if not provided or if it's a legacy agent-name format
      if (!uuid || uuid.startsWith('agent-')) {
        // Legacy: worker sent just a display name like "agent-1" — generate UUID
        if (uuid.startsWith('agent-')) {
          // Use the agent name as display name, generate UUID
          uuid = newWorkerUUID();
        } else {
          uuid = newWorkerUUID();
        }
      }

      // Dedup: if this session already has a worker, update it
      const existingBySession = findWorkerBySession(from.id);
      if (existingBySession) {
        log(`Worker ${existingBySession.displayName} (${existingBySession.uuid}) re-registering from same session`);
        // Reset the existing worker's assignment
        if (existingBySession.assignedTicket) {
          const found = findNode(existingBySession.assignedTicket);
          if (found && found.node.state.status === 'in_progress') {
            found.node.state.status = 'pending';
            found.node.state.error = `Worker re-registered`;
          }
        }
        existingBySession.displayName = displayName;
        existingBySession.status = 'idle';
        existingBySession.assignedTicket = null;
      } else if (workerRegistry.has(uuid)) {
        // Same UUID, different session — update session info
        const w = workerRegistry.get(uuid)!;
        log(`Worker ${displayName} (${uuid}) reconnected from new session (was ${w.sessionId.slice(0, 8)}, now ${from.id.slice(0, 8)})`);
        w.sessionId = from.id;
        w.sessionName = senderName;
        w.displayName = displayName;
        w.status = 'idle';
        w.assignedTicket = null;
      } else {
        // New worker
        workerRegistry.set(uuid, {
          uuid,
          displayName,
          sessionId: from.id,
          sessionName: senderName,
          status: 'idle',
          assignedTicket: null,
          registeredAt: new Date().toISOString(),
        });
      }

      log(`Worker registered: ${displayName} (${uuid}, session: ${from.id.slice(0, 8)})`);
      writeDashboard();
      launchReady();
    } else if (text.startsWith('IDLE')) {
      // IDLE [uuid] — worker reports completion and availability
      const parts = text.split(/\s+/);
      const uuid = parts[1] || '';

      let worker: WorkerRecord | undefined;
      if (uuid && workerRegistry.has(uuid)) {
        worker = workerRegistry.get(uuid)!;
      } else {
        // Fallback: find by session
        worker = findWorkerBySession(from.id);
      }

      if (!worker) {
        log(`IDLE from unknown session ${senderName} — ignored`);
        return;
      }

      log(`Worker ${worker.displayName} (${worker.uuid}) is idle`);
      worker.status = 'idle';
      worker.assignedTicket = null;
      writeDashboard();
      launchReady();
    }
  });

  // Watch for new sessions — auto-discover workers
  intercom.on('session_joined', (session: any) => {
    log(`Session joined: ${session.name} (${session.id?.slice(0, 8)})`);
    autoDiscoverWorkers().then(() => {
      writeDashboard();
      launchReady();
    });
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
    await autoDiscoverWorkers();
    writeDashboard();
    await syncLinearStatus();
    logStatus();

    const allDone = areAllEpicsDone();

    if (allDone) {
      if (!wasAllDone) {
        wasAllDone = true;
        log('All epics complete — agents idle, no work to assign.');
        await tellBoss('All epics complete. No more work to assign. Agents staying idle.');
      }
    } else {
      wasAllDone = false;
    }

    if (epicGraphs.size === 0) return;
    try {
      // Still scan PRs even when all done — review comments can re-open tickets
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

      // Only ping agents if there's actual work to do
      if (!allDone) {
        launchReady();
      }
    } catch { /* best effort */ }
  }, 10_000);

  // Cleanup
  process.on('SIGINT', async () => {
    log('Shutting down...');
    for (const [, epic] of epicGraphs) { killAllWorkers(epic.nodes); }
    saveAllState();
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
