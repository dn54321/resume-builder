/**
 * Orchestrator server.
 * Boots intercom, starts the scheduler, handles boss commands and webhooks.
 */

import * as http from 'node:http';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IntercomClient } from '../integrations/intercom/client';
import { BossRelay } from './boss-relay';
import { RequeueTracker } from './requeue-tracker';
import { Scheduler } from './scheduler';
import { AgentPool, recordCompletedWork } from './pool';
import { PaneManager } from '../tui/pane-manager';
import { buildGraph, readyTickets, isEpicComplete } from './graph';
import { executeStrategy } from './strategist';
import {
  loadState,
  saveState,
  saveFullState,
  getStateDir,
  setStateDir,
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
import { getRepoRoot, removeWorktree, hasMeaningfulWork, isBranchMergedTo, hasMergeInProgress, abortInProgressMerge } from '../git/operations';
import type { GraphNode } from './types';

// ─── Globals ────────────────────────────────────────────────────────

let intercom: IntercomClient;
let scheduler: Scheduler;
let pool: AgentPool;
let bossRelay: BossRelay | null = null;
// Tracks re-queue storms per ticket so worker crash-loops surface on the
// dashboard and to the boss within minutes instead of buried log lines.
let requeueTracker: RequeueTracker | null = null;
// Boss-controlled worker-spawn switch. When true, launchReady() refuses to
// spawn new workers — lets the boss freeze the board mid-diagnosis (e.g.
// duplicate workers) instead of burning tokens on more spawns. Set via
// PAUSE_SPAWNS / RESUME_SPAWNS boss commands; persisted in state so a
// restart doesn't silently resume spawning.
let spawnsPaused = false;
const epicGraphs = new Map<string, { nodes: Map<string, GraphNode>; rootId: string }>();
// Tickets currently being spawned across launchReady() calls. A ticket can
// be a child of SEVERAL epics, each holding its OWN GraphNode instance with
// independent state — marking one epic's node in_progress does NOT mark the
// others. launchReady() is invoked from many sites (addEpic, scheduler,
// intercom, reconcile), so without this global guard each call sees the same
// ticket still 'pending' in a different epic's node and spawns another
// worker (observed: 3 workers on RES-91, colliding in one worktree).
// Ticket id is added BEFORE the async spawn and removed after, closing the
// await-gap race between concurrent launchReady calls.
const spawningTickets = new Set<string>();
let webhookServer: http.Server | null = null;

// ─── Logging ────────────────────────────────────────────────────────

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
}

// ─── Boss Communication ─────────────────────────────────────────────

// Messages to the boss go through BossRelay: it validates delivery via
// intercom receipts and queues anything undeliverable (boss dead or not yet
// registered) in an IN-MEMORY queue that flushes when the next boss
// registers. In-memory by design — server death clears the queue.

async function tellBoss(msg: string): Promise<void> {
  if (!bossRelay) return;
  const status = await bossRelay.tell(msg);
  if (status === 'queued') {
    log(`Boss message queued (${bossRelay.queuedCount} in queue): ${msg.slice(0, 60)}`);
  }
}

// ─── Dashboard ──────────────────────────────────────────────────────

function writeDashboard(): void {
  const STATUS_ICON: Record<string, string> = {
    pending: '○', blocked: '◆', in_progress: '◉', done: '✓', failed: '✗', merged: '✔',
  };

  const lines: string[] = [];
  const now = new Date().toLocaleTimeString();

  // ⚠️ A ticket can appear in MULTIPLE epic graphs: buildGraph pulls in the
  // epic's children PLUS all ref: dependencies (which point at tickets owned
  // by other epics). Summing epic.nodes.size across epics overcounts badly —
  // 21 unique tickets rendered as "61 tickets" (RES-85 alone sits in ~6
  // epics). Dedup by ticket id for the header totals so the count reflects
  // real work items.
  const uniqueStates = new Map<string, string>(); // ticketId -> status
  for (const [, epic] of epicGraphs) {
    for (const [, n] of epic.nodes) {
      uniqueStates.set(n.ticket.identifier, n.state.status);
    }
  }
  const totalTickets = uniqueStates.size;
  let totalDone = 0, totalRunning = 0, totalFailed = 0;
  for (const status of uniqueStates.values()) {
    if (status === 'done' || status === 'merged') totalDone++;
    if (status === 'in_progress') totalRunning++;
    if (status === 'failed') totalFailed++;
  }

  lines.push(`══ Atlas Dashboard ${now.padStart(30)} ══`);
  const active = pool.getActive();
  const headlessCount = active.filter((a) => !a.paneId).length;
  lines.push(`${epicGraphs.size} epics · ${totalTickets} tickets · ${totalRunning} running · ${totalDone} done · ${totalFailed} failed`);
  lines.push(`Pool: ${pool.count()} agents (${pool.getByType('worker').length} workers${headlessCount > 0 ? `, ${headlessCount} headless` : ''})`);
  lines.push(`Spawns: ${spawnsPaused ? '⏸ PAUSED (boss)' : '▶ active'} · Boss: ${bossRelay ? bossRelay.getState() : 'unregistered'}${bossRelay && bossRelay.queuedCount > 0 ? ` (${bossRelay.queuedCount} queued)` : ''}`);

  // ⚠️ Worker pain-point detector: tickets with 2+ re-queues in the rolling
  // window are churning. This surfaces crash-loops (worker dies instantly),
  // already-merged tickets looping on re-push, and push-contention retries
  // — the exact failure classes that cost 20+ minutes tonight before anyone
  // noticed. 1 re-queue is normal; 2+ in the window is worth showing.
  const requeues = requeueTracker?.snapshot() ?? [];
  if (requeues.length > 0) {
    lines.push('');
    lines.push('── ⚠️ Worker pain (re-queues in window) ──');
    for (const rq of requeues) {
      lines.push(`  ⚠ ${rq.ticketId.padEnd(10)} ${rq.count}× in ${Math.round((Date.now() - rq.firstSeen) / 60000)}min${rq.lastReason ? ` — ${rq.lastReason.slice(0, 50)}` : ''}`);
    }
  }

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
      // Mark tickets that are only REFERENCED (belong to another epic) so
      // the board makes the sharing visible instead of implying ownership.
      const owned = node.ticket.id === epic.rootId || node.ticket.parentId === epic.rootId;
      const marker = owned ? '  ' : ' ↳';
      lines.push(`  ${icon} ${id} ${title} [${agent.padEnd(10)}]${marker}`);
    }
    lines.push('');
  }

  lines.push('── Agents ──');
  for (const agent of pool.getActive()) {
    // Mark headless agents (no tmux pane — spawned when the banner column
    // ran out of space). They work identically but have no live pane and
    // die with the orchestrator on restart.
    const mode = agent.paneId ? '' : ' ⚙headless';
    lines.push(`  ◉ ${agent.name.padEnd(12)} → ${(agent.currentTask || '?').padEnd(10)} [${agent.type}]${mode}`);
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

  // Persist epic roots — ⚠️ MERGE with existing, never replace. Replacing
  // with [...epicGraphs.keys()] after every addEpic meant a crash mid-load
  // (observed: CLOSE RES-99 crashed at epic #7 of 24) persisted a PARTIAL
  // list; the next restart resumed only those 7 epics and silently dropped
  // the other 17 from management.
  const ex = loadState();
  if (ex) {
    ex.epicRoots = [...new Set([...(ex.epicRoots ?? []), ...epicGraphs.keys()])];
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

/**
 * Auto-complete an epic once ALL its children are done/merged/failed.
 * Epics are product-goal CONTAINERS — readyTickets() never assigns them a
 * worker (parents are excluded), so nothing used to transition them: they
 * sat 'pending' forever, the board understated progress, and
 * areAllEpicsDone() never returned true even when every real ticket landed.
 * Called after each child completion; marks the root node done + transitions
 * Linear + notifies the boss. No-op for single-ticket epics (root == only
 * node; the root itself is the real ticket and is completed by its worker).
 */
async function maybeCompleteEpic(rootId: string): Promise<void> {
  const epic = epicGraphs.get(rootId);
  if (!epic) return;
  const rootNode = epic.nodes.get(rootId);
  if (!rootNode || rootNode.state.status === 'done' || rootNode.state.status === 'merged') return;

  // Real work items = all nodes except the epic root itself. A graph can
  // also REFERENCE tickets owned by other epics (ref: deps) — only children
  // actually parented under this epic count toward its completion.
  if (!isEpicComplete(epic.nodes, rootId)) return; // children still in flight

  const total = [...epic.nodes.values()].filter(
    (n) => n.ticket.id !== rootId && n.ticket.parentId === rootId,
  ).length;
  log(`Epic ${rootId} complete — all ${total} children done. Auto-completing.`);
  rootNode.state.status = 'done';
  rootNode.state.finishedAt = new Date().toISOString();
  try {
    await transitionTicket(rootId, getConfig().linear.transitions.on_done);
  } catch (err: any) {
    log(`Epic ${rootId}: Linear transition failed (${err?.message}) — epic marked done locally anyway`);
  }
  await tellBoss(`🎉 Epic ${rootId}: all ${total} tickets complete — auto-closed.`);
  saveAllState();
  writeDashboard();
}

// ─── Worker Launch ──────────────────────────────────────────────────

/**
 * True when ANY epic graph holds an in_progress node for this ticket.
 * A ticket is a child of several epics, so it has multiple GraphNode
 * instances — marking one in_progress leaves the others pending, which
 * lets launchReady spawn one worker per epic for the same ticket.
 */
function isTicketInProgress(ticketId: string): boolean {
  for (const [, epic] of epicGraphs) {
    const node = epic.nodes.get(ticketId);
    if (node && node.state.status === 'in_progress') return true;
  }
  return false;
}

async function launchReady(): Promise<void> {
  if (areAllEpicsDone()) return;
  // Boss paused worker spawning (PAUSE_SPAWNS) — e.g. while diagnosing
  // duplicate workers. Freeze the board: no new spawns until RESUME_SPAWNS.
  // Existing workers keep running; queued tickets simply wait.
  if (spawnsPaused) {
    log('launchReady: spawns PAUSED by boss — skipping');
    return;
  }

  const allReady: GraphNode[] = [];
  const seen = new Set<string>();
  for (const [, epic] of epicGraphs) {
    for (const node of readyTickets(epic.nodes)) {
      // A ticket can be a child of SEVERAL epics (e.g. RES-85 is in RES-77,
      // RES-92, RES-91, RES-85, RES-83, RES-76). Without dedup, launchReady
      // spawns ONE WORKER PER EPIC for the same ticket → 3-5 workers
      // colliding on the same worktree (git races: 'something committed my
      // staged changes') and test DB ('database is locked'). Spawn once.
      // isTicketInProgress() is the GLOBAL guard: the same ticket may still
      // be 'pending' in another epic's node after this epic's node was set
      // in_progress — a fresh launchReady call would otherwise spawn again.
      if (seen.has(node.ticket.id)) continue;
      if (isTicketInProgress(node.ticket.id)) continue;
      if (spawningTickets.has(node.ticket.id)) continue;
      seen.add(node.ticket.id);
      allReady.push(node);
    }
  }

  // One-shot workers: every ready ticket gets a fresh worker spawned
  // directly with the task embedded in its prompt (pi -p, non-interactive).
  // Workers exit when done; the pane dies with them and healthCheck frees
  // the slot. No idle-worker pool or intercom TASK handoff needed.
  const config = getConfig();
  const maxWorkers = config.agents.worker.max_instances;
  for (const node of allReady) {
    if (pool.getByType('worker').length >= maxWorkers) return;
    // Re-check under the global guard: a concurrent launchReady call may
    // have claimed this ticket while we awaited pool.spawn() of an earlier
    // node (spawn is async — the await gap is the race window).
    if (isTicketInProgress(node.ticket.id) || spawningTickets.has(node.ticket.id)) continue;
    spawningTickets.add(node.ticket.id);
    let agent;
    try {
      agent = await pool.spawn('worker', node);
    } finally {
      spawningTickets.delete(node.ticket.id);
    }
    if (!agent) continue;
    log(`Spawned one-shot worker for ${node.ticket.identifier}`);
    writeDashboard();
  }
}

async function assignToIdleWorker(node: GraphNode): Promise<void> {
  // LEGACY — kept for reviewer/pr_manager agents that may still use the
  // interactive TASK handoff. One-shot workers bypass this entirely.
  const idleWorkers = pool.getIdle('worker');
  const agent = idleWorkers[0];
  if (!agent) return;

  await pool.assignTask?.(agent, node);
  log(`Assigned ${node.ticket.identifier} to ${agent.name}`);
  writeDashboard();
}

// ─── Worker Completion ──────────────────────────────────────────────

/**
 * If the node's branch is already merged to the target AND the worktree
 * holds meaningful work beyond the base, complete the ticket as done
 * (no-op) instead of re-queueing. Mirrors the orphan sweep in
 * checkAgentHealth; used by onWorkerComplete's killed/exit paths to close
 * the race where a worker merges then dies before reporting IDLE — a
 * re-queue there spawns a redundant re-verification worker (observed:
 * RES-113 → worker-15 after the merge landed).
 * @param node - the ticket node
 * @returns true when the ticket was completed as already-merged
 */
async function tryCompleteIfMerged(node: GraphNode): Promise<{ completed: boolean }> {
  const config = getConfig();
  const target = config.strategy.branches.direct_push;
  const baseBranch = config.strategy.branches.worktree_base;
  const merged = node.state.worktreePath
    ? isBranchMergedTo(node.state.worktreePath, node.state.branch, target)
    : false;
  // ⚠️ isBranchMergedTo alone is NOT sufficient: an EMPTY worktree (the
  // ticket was never implemented — branch tip == base, nothing committed)
  // trivially satisfies 'branch is an ancestor of master', falsely
  // completing tickets whose work was never done (observed: RES-94
  // completed with the migration fix never implemented). Only complete
  // as merged when the worktree actually HAS meaningful work beyond the
  // base branch.
  const hasWork = node.state.worktreePath
    ? hasMeaningfulWork(node.state.worktreePath, baseBranch)
    : false;
  if (!merged || !hasWork) {
    return { completed: false };
  }
  log(`Completing ${node.ticket.identifier} (work already merged to ${target})`);
  node.state.status = 'done';
  node.state.finishedAt = new Date().toISOString();
  node.state.workerName = null;
  node.state.pid = null;
  node.state.paneId = null;
  node.state.agentId = null;
  recordCompletedWork('worker');
  await transitionTicket(node.ticket.id, config.linear.transitions.on_done);
  await tellBoss(`✅ ${node.ticket.identifier}: completed (work already merged to ${target})`);
  for (const rootId of epicGraphs.keys()) {
    await maybeCompleteEpic(rootId);
  }
  return { completed: true };
}

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
        // Clear the worker's pane/agent identity on completion so state
        // doesn't retain a dead paneId for re-adoption attempts.
        node.state.paneId = null;
        node.state.agentId = null;
        if (result.prUrl) node.state.prUrl = result.prUrl;

        // A completed ticket proves the worker pipeline is healthy — reset
        // the lifetime spawn cap so one-shot workers (1 spawn = 1 ticket)
        // don't strand the board after N tickets. The cap only trips on
        // death/re-queue loops, which have no completions.
        recordCompletedWork('worker');

        // Transition Linear ticket
        await transitionTicket(node.ticket.id, config.linear.transitions.on_done);
        await tellBoss(result.alreadyMerged
          ? `✅ ${identifier}: already merged (no-op completion)`
          : `✅ ${identifier}: ${result.prUrl || 'merged to ' + config.strategy.branches.direct_push}`);

        // Prune worktree if branch is merged
        pruneWorktree(node);

        // An epic is complete once ALL its children are done — auto-close it.
        for (const rootId of epicGraphs.keys()) {
          await maybeCompleteEpic(rootId);
        }
      } else {
        // Strategy failures (e.g. a transient merge race when another
        // worker/commit landed mid-merge) are RETRYABLE — re-queue the
        // ticket up to retry_limit instead of permanently failing it.
        const maxRetries = config.agents.worker.retry_limit ?? 2;
        // ⚠️ The dirty-tree guard's "defer" is NOT a real failure — it means
        // the main repo had uncommitted work (e.g. the boss's) and the merge
        // waited 45s without clearing. Re-queue WITHOUT consuming a retry so
        // a busy main repo can't fail tickets (observed: RES-93 failed after
        // the guard's defer burned all 3 retries).
        const isDefer = (result.error ?? '').includes('stayed dirty');
        if (isDefer) {
          node.state.status = 'pending';
          node.state.workerName = null;
          node.state.pid = null;
          node.state.error = `Deferred: main repo busy (${result.error})`;
          // A defer is NOT a crash loop — the worker finished successfully and
          // is waiting for the main repo to clear. Don't trip the anomaly alarm.
          requeueTracker?.recordBenign(identifier, 'deferred (main repo dirty)');
          await tellBoss(`🔄 ${identifier}: deferred (main repo had uncommitted work) — will retry without consuming a retry`);
        } else if (node.state.retryCount <= maxRetries) {
          node.state.status = 'pending';
          node.state.workerName = null;
          node.state.pid = null;
          node.state.error = `${result.error || 'Strategy execution failed'} (retry ${node.state.retryCount}/${maxRetries})`;
          node.state.retryCount += 1;
          requeueTracker?.record(identifier, result.error);
          await tellBoss(`🔄 ${identifier}: strategy retry ${node.state.retryCount}/${maxRetries} — ${result.error}`);
        } else {
          node.state.status = 'failed';
          node.state.finishedAt = new Date().toISOString();
          node.state.error = result.error || 'Strategy execution failed';
          await tellBoss(`❌ ${identifier}: ${node.state.error}`);
        }
      }
    } else {
      // No meaningful diff vs base — the worker found nothing to change.
      // This is a COMPLETION when the work is already on the target branch
      // (re-verified already-merged tickets), not a failure. Check if the
      // branch is already merged; if so, mark done (no-op). Otherwise it's
      // a genuine no-work failure (worker did nothing).
      const baseBranch = config.strategy.branches.worktree_base;
      const alreadyMerged =
        node.state.worktreePath &&
        isBranchMergedTo(node.state.worktreePath, node.state.branch, config.strategy.branches.direct_push);
      if (alreadyMerged) {
        node.state.status = 'done';
        node.state.finishedAt = new Date().toISOString();
        node.state.pid = null;
        recordCompletedWork('worker');
        await transitionTicket(node.ticket.id, config.linear.transitions.on_done);
        await tellBoss(`✅ ${identifier}: already merged (no-op completion — worker had no changes because work is in master)`);
        pruneWorktree(node);
        for (const rootId of epicGraphs.keys()) {
          await maybeCompleteEpic(rootId);
        }
      } else {
        node.state.status = 'failed';
        node.state.finishedAt = new Date().toISOString();
        node.state.error = 'No meaningful changes — only generated files modified';
        await tellBoss(`❌ ${identifier}: No meaningful work detected`);
      }
    }
  } else if (exitCode === 143 || exitCode === 137) {
    // Killed externally. ⚠️ Race guard (boss/fix-requeue-race): a worker that
    // merged its work then died (pane killed, exit 143/137) BEFORE reporting
    // IDLE must NOT be re-queued — otherwise a fresh worker spawns, re-verifies
    // the already-merged branch, and no-op completes, burning a full worker
    // cycle (observed: RES-113 spawned worker-15 after the merge landed). The
    // health sweep (checkAgentHealth) has this exact merged+hasWork check but
    // only runs every 15s — onWorkerComplete re-queues + spawns instantly,
    // racing it. Check merged state here so killed-after-merge workers complete
    // as done instead of re-queueing.
    const mergedResult = await tryCompleteIfMerged(node);
    if (mergedResult.completed) {
      return;
    }
    node.state.status = 'pending';
    node.state.pid = null;
    node.state.error = `Worker killed (signal ${exitCode - 128}) — will resume`;
    requeueTracker?.record(identifier, `worker killed (signal ${exitCode - 128})`);
  } else {
    // Non-zero exit
    const config = getConfig();
    const maxRetries = config.agents.worker.retry_limit ?? 2;
    if (node.state.retryCount <= maxRetries) {
      // Same race guard as the killed path: if the work is already merged and
      // meaningful, complete as done instead of re-queueing a redundant worker.
      const mergedResult = await tryCompleteIfMerged(node);
      if (mergedResult.completed) {
        return;
      }
      node.state.status = 'pending';
      node.state.pid = null;
      node.state.error = `Worker exited with code ${exitCode} (retry ${node.state.retryCount}/${maxRetries})`;
      node.state.retryCount += 1;
      requeueTracker?.record(identifier, `worker exited (code ${exitCode})`);
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
  try {
    await handleBossCommandInner(text);
  } catch (err: any) {
    // ⚠️ NEVER let a boss command crash the orchestrator. Any throw here
    // (Linear API errors, git faults, unexpected input) previously killed
    // the whole process — observed: CLOSE RES-99 → fetchWorkflowStates
    // GraphQL validation error → orchestrator died, board dead until
    // manual restart. Log + notify the boss instead.
    log(`boss command failed: ${text.slice(0, 60)} → ${err?.message ?? err}`);
    try { await tellBoss(`❌ command failed: ${err?.message ?? err}`); } catch { /* best effort */ }
  }
}

async function handleBossCommandInner(text: string): Promise<void> {
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
    await tellBoss('All agents stopped. Orchestrator still running.');

  } else if (trimmed.startsWith('STOP ')) {
    const agentName = trimmed.split(/\s+/)[1]?.trim();
    if (!agentName) {
      await tellBoss('Usage: STOP <agent-name>');
      return;
    }

    // ═══ GUARDRAIL: never stop the boss or orchestrator ═══
    const BLOCKED_NAMES = ['boss', 'orchestrator', 'banner'];
    if (BLOCKED_NAMES.includes(agentName.toLowerCase())) {
      await tellBoss(`⛔ Cannot stop "${agentName}" — it is a protected system component. Use STOP without a name to halt all worker agents, or STOP <worker-name> to stop a specific worker.`);
      return;
    }

    const agent = [...pool['agents'].values()].find((a) => a.name === agentName);
    if (agent) {
      await pool.stop(agent);
      await tellBoss(`Stopped ${agentName}.`);
    } else {
      await tellBoss(`No agent named "${agentName}" found. Active agents: ${[...pool['agents'].values()].map(a => a.name).join(', ') || 'none'}`);
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
    // Dedup by ticket id — same overcount issue as writeDashboard (a ticket
    // referenced by several epics was counted once per epic).
    const statuses = new Map<string, string>();
    for (const [, epic] of epicGraphs) {
      for (const [, n] of epic.nodes) {
        statuses.set(n.ticket.identifier, n.state.status);
      }
    }
    totalTickets = statuses.size;
    for (const st of statuses.values()) {
      if (st === 'done' || st === 'merged') totalDone++;
      if (st === 'in_progress') totalRunning++;
    }
    await tellBoss(`${epicGraphs.size} epics · ${totalTickets} tickets: ${totalRunning} running, ${totalDone} done. ${pool.count()} agents. Spawns: ${spawnsPaused ? '⏸ PAUSED' : '▶ active'}.`);

  } else if (trimmed === 'PAUSE_SPAWNS' || trimmed === 'pause-spawns' || trimmed === 'PAUSE') {
    spawnsPaused = true;
    // Persist so a restart keeps spawns frozen while the boss diagnoses.
    const ex = loadState();
    if (ex) { ex.spawnsPaused = true; saveState(ex); }
    writeDashboard();
    await tellBoss('⏸ Worker spawns PAUSED — launchReady will not spawn new workers. Existing workers keep running. Diagnose, then RESUME_SPAWNS.');

  } else if (trimmed === 'RESUME_SPAWNS' || trimmed === 'resume-spawns' || trimmed === 'RESUME') {
    spawnsPaused = false;
    const ex = loadState();
    if (ex) { ex.spawnsPaused = false; saveState(ex); }
    writeDashboard();
    await tellBoss('▶ Worker spawns RESUMED — launchReady is active again.');
    // Spawn for any tickets that became ready while paused.
    await launchReady();

  } else if (trimmed.startsWith('SPAWN ') || trimmed.startsWith('spawn ')) {
    const agentType = trimmed.split(/\s+/)[1]?.trim() as any;
    // ═══ GUARDRAIL: cannot spawn another boss ═══
    if (agentType === 'boss') {
      await tellBoss('⛔ Cannot SPAWN boss — there can only be one boss. The boss is created by atlas.sh.');
      return;
    }
    if (agentType && ['worker', 'reviewer', 'pr_manager'].includes(agentType)) {
      const agent = await pool.spawn(agentType);
      await tellBoss(agent ? `Spawned ${agent.name}.` : `Failed to spawn ${agentType}.`);
    } else {
      await tellBoss('Usage: SPAWN <worker|reviewer|pr_manager>');
    }

  } else if (trimmed.startsWith('KILL ') || trimmed.startsWith('kill ')) {
    const agentType = trimmed.split(/\s+/)[1]?.trim() as any;
    if (!agentType) {
      await tellBoss('Usage: KILL <worker|reviewer|pr_manager>');
      return;
    }

    // ═══ GUARDRAIL: never kill the boss type ═══
    const BLOCKED_TYPES = ['boss'];
    if (BLOCKED_TYPES.includes(agentType.toLowerCase())) {
      await tellBoss(`⛔ Cannot KILL "${agentType}" — the boss is a protected system component. Use KILL worker, KILL reviewer, or KILL pr_manager to stop specific agent types.`);
      return;
    }

    if (['worker', 'reviewer', 'pr_manager'].includes(agentType)) {
      await pool.stopAll(agentType);
      await tellBoss(`Killed all ${agentType} agents.`);
    } else {
      await tellBoss(`Unknown agent type: "${agentType}". Valid types: worker, reviewer, pr_manager`);
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
  // ⚠️ RES-110 — sweep the main repo for a stale in-progress merge BEFORE
  // anything else. A conflicted merge left by a crashed worker or a manual
  // boss git op blocks EVERY push (the pre-push hook lints the whole tree)
  // and stalls the board (observed: RES-103). Abort it here so a stale
  // MERGE_HEAD can never survive a full 15s health cycle. mergeToBranch also
  // aborts pre-flight + on conflict; this sweep is the last-resort net for
  // merges started outside the orchestrator.
  try {
    const repoRoot = getRepoRoot();
    if (hasMergeInProgress(repoRoot)) {
      const cleared = abortInProgressMerge(repoRoot);
      log(`Cleared stale in-progress merge in the main repo: ${cleared.note}`);
      await tellBoss(`🧹 Cleared stale in-progress merge in the main repo (${cleared.note}) — tree restored clean.`);
    }
  } catch {
    // Bare/broken repo — pool.healthCheck below reports it and mergeToBranch
    // returns a clean retryable error (RES-99). Don't crash the health tick.
  }

  await pool.healthCheck();

  // OS-level boss liveness: probe the boss process (pid + startTime) so a
  // busy-but-alive boss is NOT marked dead (receipts time out while the
  // boss's intercom loop is blocked on a long tool call, which previously
  // queued failure notifications until a re-registration). Only marks dead
  // when the process is actually gone and no send is awaiting a receipt.
  bossRelay?.checkLiveness();

  // Re-queue orphaned tickets: a ticket stuck in_progress whose worker is
  // no longer in the pool (pane died, restart, kill) would never be picked
  // up again — readyTickets() only returns pending/blocked. Reset it so a
  // fresh worker spawns.
  const liveWorkers = new Set(pool.getLiveWorkerNames());
  for (const [, epic] of epicGraphs) {
    for (const [, node] of epic.nodes) {
      if (
        node.state.status === 'in_progress' &&
        node.state.workerName &&
        !liveWorkers.has(node.state.workerName)
      ) {
        // If the worker's work is ALREADY on the target branch (it completed
        // and was merged before the completion registered — a common race on
        // re-verified already-merged tickets), re-queueing just spawns another
        // worker to re-verify the same merged work forever (observed: RES-85
        // spawned 3 workers in 5 min). Complete it as done instead.
        const config = getConfig();
        const target = config.strategy.branches.direct_push;
        const baseBranch = config.strategy.branches.worktree_base;
        const merged = node.state.worktreePath
          ? isBranchMergedTo(node.state.worktreePath, node.state.branch, target)
          : false;
        // ⚠️ isBranchMergedTo alone is NOT sufficient: an EMPTY worktree (the
        // ticket was never implemented — branch tip == base, nothing committed)
        // trivially satisfies 'branch is an ancestor of master', falsely
        // completing tickets whose work was never done (observed: RES-94
        // completed with the migration fix never implemented). Only complete
        // as merged when the worktree actually HAS meaningful work beyond the
        // base branch.
        const hasWork = node.state.worktreePath
          ? hasMeaningfulWork(node.state.worktreePath, baseBranch)
          : false;
        if (merged && hasWork) {
          log(`Completing ${node.ticket.identifier} (work already merged to ${target})`);
          node.state.status = 'done';
          node.state.finishedAt = new Date().toISOString();
          node.state.workerName = null;
          node.state.pid = null;
          recordCompletedWork('worker');
          await transitionTicket(node.ticket.id, config.linear.transitions.on_done);
          await tellBoss(`✅ ${node.ticket.identifier}: completed (work already merged to ${target})`);
          for (const rootId of epicGraphs.keys()) {
            await maybeCompleteEpic(rootId);
          }
          continue;
        }
        log(`Re-queuing ${node.ticket.identifier} (worker ${node.state.workerName} gone)`);
        requeueTracker?.record(node.ticket.identifier, `worker ${node.state.workerName} gone`);
        node.state.status = 'pending';
        node.state.workerName = null;
        node.state.pid = null;
        node.state.startedAt = null;
      }
    }
  }

  // Freeing a dead-pane slot may unblock waiting tickets — spawn
  // replacements promptly instead of waiting for the next queue_process tick.
  await launchReady();

  // Persist the orphan-completion / re-queue state changes made above —
  // without this, completed tickets (work already merged) never land in
  // state/atlas.json and the dashboard stays at the stale count forever.
  saveAllState();
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
  // Restore the boss's spawn-pause flag across restarts — if the boss
  // PAUSE_SPAWNS'd to diagnose duplicate workers and the orchestrator
  // restarts mid-diagnosis, spawns must stay frozen until RESUME_SPAWNS.
  spawnsPaused = existingState?.spawnsPaused ?? false;
  if (spawnsPaused) log('⚠️ spawnsPaused restored from state — worker spawning is FROZEN until RESUME_SPAWNS');
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

  // Adopt surviving workers BEFORE spawning new ones. Workers are one-shot
  // pi processes whose tmux panes keep running while the orchestrator is
  // down (restart preserves workers; only STOP kills them). For each
  // in_progress ticket with a persisted agentId+paneId, re-register the
  // agent if its pane is still alive — its eventual IDLE message then
  // completes the ticket instead of it being orphaned and re-queued.
  adoptSurvivingWorkers();

  // One-shot workers are spawned per-ticket by launchReady() — no bare
  // pre-spawn. Previously this loop called pool.spawn('worker') WITHOUT a
  // node, producing workers whose prompts had no TASK block; they sat idle
  // asking the orchestrator which ticket they were assigned (worker-4).
  if (epicGraphs.size > 0) {
    await launchReady();
  }
}

/**
 * Re-register workers whose tmux panes survived an orchestrator restart.
 * Iterates all graph nodes; for in_progress tickets with agentId/paneId,
 * tries pool.adoptWorker. Live panes keep their slot and ticket; dead
 * panes fall through to the normal orphan-requeue path in healthCheck.
 *
 * ⚠️ MUST respect the same caps as spawn(): adoption previously bypassed
 * max_concurrent/max_instances entirely, so after a chaotic restart with
 * stale persisted state it re-adopted EVERY in_progress ticket's worker on
 * top of freshly spawned ones — 8 workers against a cap of 5. It also
 * adopted the SAME pane for multiple tickets (stale state recorded one
 * paneId for several tickets, e.g. %20 as worker-1/RES-88 AND
 * worker-15/RES-98) creating phantom duplicate agents on one process.
 */
function adoptSurvivingWorkers(): void {
  const config = getConfig();
  const maxWorkers = config.agents.worker.max_instances;
  const maxConcurrent = config.agents.max_concurrent;
  // One pane hosts exactly one worker. Stale persisted state can carry the
  // same paneId for several tickets (duplicate-worker era) — adopt it for
  // the FIRST ticket only, or the same process becomes N phantom agents.
  const adoptedPanes = new Set<string>();
  for (const [, epic] of epicGraphs) {
    for (const [, node] of epic.nodes) {
      const st = node.state;
      if (
        st.status === 'in_progress' &&
        st.agentId &&
        st.paneId &&
        st.workerName
      ) {
        // Cap check — identical to spawn(): adoption must never push the
        // pool past max_concurrent or the worker max_instances.
        if (pool.count() >= maxConcurrent) return;
        if (pool.getByType('worker').length >= maxWorkers) return;
        // Dedup by pane: one pane = one worker process, regardless of how
        // many tickets' stale state references it.
        if (adoptedPanes.has(st.paneId)) continue;
        adoptedPanes.add(st.paneId);
        pool.adoptWorker(
          st.agentId,
          st.workerName,
          st.paneId,
          node.ticket.identifier,
          st.assignedPort ?? 0,
        );
      }
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────

/**
 * Kill any OTHER running orchestrator processes before this one starts.
 * Matches the tsx/node command line for orchestrator/index.ts and excludes
 * this process (by pid and by the full execArgv match). Stale instances are
 * killed with SIGKILL — a graceful SIGTERM cleanup can hang on
 * pool.stopAll() (5s × agents), which is exactly how zombies accumulated.
 */
function killStaleOrchestrators(): void {
  try {
    const selfPid = String(process.pid);
    const out = cp.execSync('ps -eo pid,args | grep "orchestrator/index" | grep -v grep', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    for (const line of out.split('\n').filter(Boolean)) {
      const pid = line.trim().split(/\s+/)[0];
      if (!pid || pid === selfPid) continue;
      // Skip our own bash wrapper / this script's shell
      if (line.includes('bash -c') || line.includes('grep ')) continue;
      try {
        process.kill(Number(pid), 'SIGKILL');
        log(`Killed stale orchestrator pid ${pid}`);
      } catch { /* already gone */ }
    }
  } catch { /* ps failed — best effort */ }
}

export async function startOrchestrator(): Promise<void> {
  log('Atlas orchestrator starting...');

  // Fresh re-queue tracking per process lifetime — counts don't survive
  // restarts (the worker states that caused them may have been resolved).
  requeueTracker?.reset();

  // Single-instance guard: kill any other orchestrator process before we
  // start. Restarts previously left zombie instances (SIGTERM cleanup waits
  // 5s×agents via pool.stopAll, and kill scripts sometimes matched the bash
  // wrapper instead of the node process), so multiple orchestrators ran
  // simultaneously — all connected to intercom, all spawning workers.
  // Only the newest instance should survive.
  killStaleOrchestrators();

  // State dir
  const repoRoot = getRepoRoot();
  const stateDir = path.join(repoRoot, 'atlas', 'state');
  setStateDir(stateDir);
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'worktrees'), { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'panes', 'fifos'), { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'prompts'), { recursive: true });

  // Write pane scripts FIRST (synchronous — must exist before atlas.sh checks)
  const config = getConfig();
  const paneManager = new PaneManager({
    sessionName: 'atlas',
    stateDir,
    maxWorkers: config.agents.worker.max_instances,
  });
  paneManager.init();
  log('Pane scripts written (banner.sh, worker-pane.sh, dashboard-watch.sh)');

  // ⚠️ RES-110 — clear any stale in-progress merge left by a previous run
  // BEFORE workers can merge. A conflicted merge that was never aborted
  // leaves .git/MERGE_HEAD + conflict markers in the main repo; every push
  // then fails at the pre-push hook and the whole board stalls (observed:
  // RES-103 — the boss had to abort ×3 by hand after a restart).
  try {
    if (hasMergeInProgress(repoRoot)) {
      const cleared = abortInProgressMerge(repoRoot);
      log(`Cleared stale in-progress merge from a previous run: ${cleared.note}`);
    }
  } catch (err) {
    log(`Could not clear stale merge state: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Signal that the orchestrator has written the required scripts.
  // atlas.sh waits for this file (with timeout) before creating tmux panes.
  fs.writeFileSync(path.join(stateDir, 'ready'), new Date().toISOString(), 'utf-8');

  // Intercom — use a unique name to avoid collisions with stale sessions.
  // Stable orchestrator intercom name — NOT pid-suffixed. Workers embed
  // {{ORCHESTRATOR_NAME}} in their prompt at spawn; if the name changed on
  // every restart, surviving workers' IDLE/STATUS/ASK messages would go to
  // a dead session after an orchestrator restart. A stable name lets
  // workers outlive the orchestrator process. Only one orchestrator runs
  // at a time (atlas.sh kills the old before starting the new).
  const orchName = 'orchestrator';
  fs.writeFileSync(path.join(stateDir, 'orchestrator-name'), orchName, 'utf-8');
  intercom = new IntercomClient(orchName);
  await intercom.connect();
  log(`Intercom connected as "${orchName}"`);

  // Boss messaging with offline queue (see boss-relay.ts).
  bossRelay = new BossRelay({
    send: (to, text) => intercom.send(to, text),
    log: (msg) => log(msg),
  });
  // Alert the boss the FIRST time a ticket crosses the re-queue anomaly
  // threshold — catch crash-loops in minutes, not after 20+ minutes of
  // churn (RES-88 re-queued 105× before anyone noticed).
  requeueTracker = new RequeueTracker({
    threshold: 5,
    onAnomaly: async (ticketId, count, reason) => {
      await tellBoss(`⚠️ ${ticketId} re-queued ${count}× — possible worker crash loop (${reason ?? 'unknown'}). Investigate now.`);
    },
    log: (msg) => log(msg),
  });
  intercom.onReceipt((_session, receipt) => {
    bossRelay!.onReceipt(receipt.messageId, receipt.status);
  });

  // Scheduler
  scheduler = new Scheduler();

  // Agent pool
  pool = new AgentPool(intercom, paneManager);

  // Handle intercom messages
  intercom.onMessage(async (from, message) => {
    const text = message.content?.text ?? '';

    // ANY message from the boss proves the boss session is alive. Receipts
    // are best-effort (broker races can drop them); a false "Boss dead"
    // previously swallowed failure notifications. Revive on activity.
    if (bossRelay && from.id === bossRelay.registeredSessionId) {
      bossRelay.onBossActivity();
    }

    // Boss registration
    if (text.startsWith('BOSS:')) {
      const flushed = await bossRelay!.registerBoss(from.id, {
        pid: from.pid,
        startedAt: from.startedAt,
      });
      log(`Boss registered: ${from.name} (${from.id.slice(0, 8)})${flushed > 0 ? ` — flushed ${flushed} queued message(s)` : ''}`);
      try {
        await intercom.send(from.id, 'BOSS registered. Atlas is ready.');
      } catch { /* boss may have disconnected immediately after registering */ }
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
          // One-shot workers: IDLE is the completion signal. The pane dies
          // with the process, but we free the pool slot NOW so launchReady
          // can spawn the next worker immediately — otherwise the slot stays
          // occupied until healthCheck (15s) notices the dead pane, wasting
          // a full worker slot per completed ticket.
          const completedTask = agent.currentTask;
          await pool.removeAgent(agent.id);

          // If agent was working on a ticket, handle completion
          if (completedTask) {
            const found = findNode(completedTask);
            if (found) {
              await onWorkerComplete(found.node, 0);
            }
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
      // Forward to boss, including the worker's session id so the boss can
      // reply to the worker directly.
      await tellBoss(`📋 ${from.name} (${from.id.slice(0, 8)}): ${text.replace('STATUS ', '')}`);
      return;
    }

    // Agent asking boss
    if (text.startsWith('ASK ')) {
      // Include the worker's session id so the boss can reply directly.
      await tellBoss(`❓ ${from.name} (${from.id.slice(0, 8)}): ${text.replace('ASK ', '')}`);
      return;
    }

    // Boss commands
    if (
      text.startsWith('EPIC ') || text.startsWith('TICKET ') ||
      text === 'STOP' || text.startsWith('STOP ') ||
      text === 'STATUS' || text.startsWith('CLOSE ') ||
      text.startsWith('DROP ') || text.startsWith('SPAWN ') ||
      text.startsWith('KILL ') || text.startsWith('SET_INTERVAL ') ||
      text === 'GET_CONFIG' || text === 'PAUSE_SPAWNS' || text === 'RESUME_SPAWNS' ||
      text === 'PAUSE' || text === 'RESUME'
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

  // Write initial dashboard immediately (before scheduler's first tick)
  writeDashboard();

  // Start scheduler
  scheduler.start();

  // Start webhook server
  startWebhookServer();

  // Cleanup — signal-triggered (restart): preserve workers.
  //
  // The user distinguishes two cases:
  //   - RESTART (SIGTERM/SIGINT on the orchestrator): workers are NOT
  //     killed — their tmux panes keep running pi. The next orchestrator
  //     adopts them on startup (see autoStart/adoptWorker) and their IDLE
  //     messages complete the tickets.
  //   - STOP (boss command, `STOP` / `STOP <name>`): kills workers via
  //     pool.stopAll(). This is the real "shut the app down" action.
  const cleanup = async () => {
    scheduler.stop();
    saveAllState();
    if (webhookServer) webhookServer.close();
    try { await unregisterWebhooks(); } catch { /* ignore */ }
    try { await intercom.disconnect(); } catch { /* ignore */ }
    // Exit immediately — do NOT wait for agents. Workers live in tmux panes
    // and survive the restart (adopted on next startup); waiting here was
    // why zombie orchestrators accumulated (pool.stopAll waits 5s×agents
    // and old instances never died before the new one started).
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
