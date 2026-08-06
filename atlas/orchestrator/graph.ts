/**
 * Dependency graph builder.
 * Fetches tickets from Linear, resolves dependencies, builds DAG.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import type { GraphNode, OrchestratorState, TicketInfo, TicketState } from './types';
import {
  fetchTicketByIdentifier,
  fetchChildren,
  transitionTicket,
} from '../integrations/linear/client';
import { getDefaultBranch, branchName, isBranchMergedTo, getRepoRoot } from '../git/operations';
import { loadState, recoverFromWorktree, getStateDir } from './state';
import { getConfig } from './config';

// ─── Shared Ticket State ────────────────────────────────────────────

/**
 * ⚠️ WARNING — a ticket can be a child of SEVERAL epics (e.g. RES-85 sits
 * in RES-77, RES-92, RES-91, RES-85, RES-83, RES-76), so it appears in
 * multiple epic graphs. Each epic graph used to build its OWN TicketState
 * object from loadState(), so a spawn marked ONE epic's node in_progress
 * while the others stayed pending — and the next launchReady() call
 * (triggered by addEpic, the scheduler, or intercom) saw the same ticket
 * ready in a different epic and spawned ANOTHER worker. Observed: 3 workers
 * colliding on RES-91 in the same worktree (git races + DB locks).
 *
 * Fix: keep a module-level registry keyed by ticket identifier so every
 * epic graph references the SAME TicketState object. Any transition
 * (spawn → in_progress, re-queue → pending, complete → done) now propagates
 * to all epic graphs automatically, making the launchReady dedup global.
 *
 * The registry lives for the orchestrator process lifetime and is re-seeded
 * from loadState() on first build per identifier — restarting the
 * orchestrator resets it, which is fine (state is persisted via saveState).
 */
const sharedTicketStates = new Map<string, TicketState>();

// ─── Build Graph ────────────────────────────────────────────────────

export async function buildGraph(
  rootIdentifier: string,
  existingState?: OrchestratorState | null,
): Promise<{ nodes: Map<string, GraphNode>; root: GraphNode }> {
  const fetched = new Map<string, TicketInfo>();
  const existing = existingState ?? loadState();

  async function fetchRecursive(identifier: string): Promise<TicketInfo> {
    if (fetched.has(identifier)) return fetched.get(identifier)!;

    const ticket = await fetchTicketByIdentifier(identifier);
    if (!ticket) throw new Error(`Ticket not found: ${identifier}`);

    fetched.set(identifier, ticket);

    // Discover dependencies via ref: lines
    for (const ref of ticket.refs) {
      await fetchRecursive(ref);
    }

    // Discover children (issues parented under this one)
    try {
      const children = await fetchChildren(ticket.id);
      for (const child of children) {
        if (!fetched.has(child.identifier)) {
          fetched.set(child.identifier, child);
          for (const ref of child.refs) {
            await fetchRecursive(ref);
          }
        }
      }
    } catch { /* children fetch is best-effort */ }

    return ticket;
  }

  await fetchRecursive(rootIdentifier);

  // Build graph nodes
  const nodes = new Map<string, GraphNode>();
  const config = getConfig();
  const defaultBranch = getDefaultBranch();
  const worktreesDir = path.join(getStateDir(), 'worktrees');
  const logsDir = path.join(getStateDir(), 'logs');

  for (const [, ticket] of fetched) {
    // ⚠️ Use the SHARED state object for this ticket if another epic graph
    // already built it. Without this, each epic graph gets its own
    // TicketState and a spawn marks only ONE epic's node in_progress — the
    // others stay pending and the next launchReady() spawns duplicate
    // workers for the same ticket (observed: 3 workers on RES-91).
    // Reuse the registry object; the worktree-recovery/validation below
    // only runs on the FIRST build of an identifier.
    const existingShared = sharedTicketStates.get(ticket.identifier);
    if (existingShared) {
      nodes.set(ticket.identifier, { ticket, state: existingShared, dependencies: [], dependents: [] });
      continue;
    }

    let ticketState = existing?.tickets[ticket.identifier];

    // If no saved state, try worktree recovery
    if (!ticketState) {
      const candidateWorktree = path.join(worktreesDir, ticket.identifier);
      if (fs.existsSync(candidateWorktree)) {
        const recovered = recoverFromWorktree(
          ticket.identifier,
          candidateWorktree,
          config.strategy.branches.worktree_base,
          defaultBranch,
        );
        if (recovered) ticketState = recovered;
      }
    }

    // ⚠️ Validate existing 'done' state: a missing worktree does NOT mean
    // the ticket is unfinished. pruneWorktree() (server.ts) removes the
    // worktree AFTER a successful merge — done tickets routinely have NO
    // worktree on disk. Resetting here sent completed tickets back to
    // 'pending' on every restart, spawning a worker that re-verified the
    // already-merged branch and no-op completed (observed: RES-87/97/98
    // re-assigned after every orchestrator restart).
    // Only reset when the branch is genuinely NOT merged to the target.
    if (ticketState?.status === 'done') {
      const wt = ticketState.worktreePath;
      if (!wt || !fs.existsSync(wt)) {
        const target = config.strategy.branches.direct_push;
        let merged = false;
        try {
          merged = ticketState.branch
            ? isBranchMergedTo(getRepoRoot(), ticketState.branch, target)
            : false;
        } catch { /* best effort — keep 'done' if merge status is unverifiable */ }
        if (!merged) {
          ticketState = undefined;
        }
        // else: merged work exists on target — keep 'done', worktree
        // absence is expected post-merge.
      }
    }

    const state = ticketState ?? {
      identifier: ticket.identifier,
      status: 'pending' as const,
      branch: branchName(ticket.identifier),
      worktreePath: '',
      logPath: path.join(logsDir, `${ticket.identifier}.log`),
      pid: null,
      prUrl: null,
      startedAt: null,
      finishedAt: null,
      error: null,
      assignedPort: null,
      retryCount: 0,
      workerName: null,
      agentId: null,
      paneId: null,
    };

    nodes.set(ticket.identifier, { ticket, state, dependencies: [], dependents: [] });
    // Register so subsequent epic graphs share this exact state object.
    sharedTicketStates.set(ticket.identifier, state);
  }

  // Wire dependencies
  for (const [, node] of nodes) {
    for (const ref of node.ticket.refs) {
      const dep = nodes.get(ref);
      if (dep) {
        node.dependencies.push(dep);
        dep.dependents.push(node);
      }
    }
  }

  // Set initial statuses
  for (const [, node] of nodes) {
    // Recover in-progress tickets
    if (node.state.status === 'in_progress') {
      if (node.state.pid) {
        try {
          process.kill(node.state.pid, 0);
        } catch {
          // Process dead — check worktree
          if (
            node.state.worktreePath &&
            fs.existsSync(node.state.worktreePath) &&
            hasMeaningfulWorkCheck(node.state.worktreePath, defaultBranch)
          ) {
            node.state.status = 'done';
            node.state.pid = null;
            node.state.error = 'Worker died but work exists — marking done';
          } else {
            node.state.status = 'failed';
            node.state.pid = null;
            node.state.error = 'Worker died unexpectedly';
          }
        }
      } else if (node.state.paneId) {
        // One-shot workers run in tmux panes (no child pid). A surviving
        // pane means the worker is still alive across an orchestrator
        // restart — keep in_progress so adoptSurvivingWorkers() can
        // re-register it. Dead panes fall through to the orphan-requeue
        // path in healthCheck.
        // (paneId is persisted by spawn; pane liveness is checked at adopt)
      } else {
        node.state.status = 'pending';
        node.state.pid = null;
        node.state.workerName = null;
        node.state.startedAt = null;
      }
    }

    // Retry failed tickets with remaining retries
    const maxRetries = config.agents.worker.retry_limit ?? 2;
    if (node.state.status === 'failed' && node.state.retryCount <= maxRetries) {
      if (
        node.state.worktreePath &&
        fs.existsSync(node.state.worktreePath) &&
        hasMeaningfulWorkCheck(node.state.worktreePath, defaultBranch) &&
        // Committed work is NOT enough — the branch must actually be merged
        // into the target. A worker can commit without the merge ever
        // landing (merge race / strategy failure); marking those 'done'
        // silently drops the ticket from the queue (RES-85).
        isBranchMergedTo(
          node.state.worktreePath,
          node.state.branch,
          defaultBranch,
        )
      ) {
        node.state.status = 'done';
        node.state.error = 'Work exists despite failed status — marking done';
      } else {
        node.state.status = 'pending';
        node.state.error = null;
        node.state.pid = null;
        node.state.finishedAt = null;
      }
    }

    // Set blocked/pending based on dependencies
    if (node.state.status === 'pending' || node.state.status === 'blocked') {
      const allDepsDone = node.dependencies.every((d) => d.state.status === 'done');
      node.state.status = allDepsDone ? 'pending' : 'blocked';
    }
  }

  const root = nodes.get(rootIdentifier);
  if (!root) throw new Error(`Root ticket not found: ${rootIdentifier}`);

  return { nodes, root };
}

// ─── Ready Tickets ──────────────────────────────────────────────────

/**
 * Get all tickets that are ready to be worked on.
 * Excludes parent epics (they have children — no implementation work).
 */
export function readyTickets(nodes: Map<string, GraphNode>): GraphNode[] {
  const ready: GraphNode[] = [];
  const parentIds = new Set<string>();

  // Identify parent epics
  for (const [, node] of nodes) {
    if (node.ticket.parentId) {
      parentIds.add(node.ticket.parentId);
    }
  }

  for (const [, node] of nodes) {
    if (parentIds.has(node.ticket.id)) continue; // Skip parent epics

    if (node.state.status === 'pending' || node.state.status === 'blocked') {
      const allDepsDone = node.dependencies.every((d) => d.state.status === 'done');
      if (allDepsDone) {
        node.state.status = 'pending';
        ready.push(node);
      } else {
        node.state.status = 'blocked';
      }
    }
  }

  return ready;
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * True when every CHILD owned by an epic root is done/merged/failed — i.e.
 * the epic (a product-goal container, never assigned a worker) should be
 * auto-completed. Only nodes actually parented under the root count:
 * graphs can also REFERENCE tickets owned by other epics (ref: deps), and
 * the root node itself is the container, not a work item.
 */
export function isEpicComplete(
  nodes: Map<string, GraphNode>,
  rootId: string,
): boolean {
  let total = 0;
  let finished = 0;
  for (const [, node] of nodes) {
    if (node.ticket.id === rootId) continue;
    if (node.ticket.parentId !== rootId) continue; // referenced, not owned
    total++;
    if (
      node.state.status === 'done' ||
      node.state.status === 'merged' ||
      node.state.status === 'failed'
    ) {
      finished++;
    }
  }
  return total > 0 && finished === total;
}

function hasMeaningfulWorkCheck(worktreePath: string, baseBranch: string): boolean {
  try {
    const cp = require('node:child_process');
    const result = cp.spawnSync('git', ['diff', '--name-only', baseBranch, 'HEAD'], {
      cwd: worktreePath,
      encoding: 'utf-8',
      timeout: 5000,
    });
    const files = (result.stdout ?? '').trim().split('\n').filter(Boolean);
    const GENERATED = ['frontend/resume.pdf'];
    return files.some((f: string) => !GENERATED.includes(f));
  } catch {
    return false;
  }
}
