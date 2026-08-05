/**
 * Dependency graph builder.
 * Fetches tickets from Linear, resolves dependencies, builds DAG.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import type { GraphNode, OrchestratorState, TicketInfo } from './types';
import {
  fetchTicketByIdentifier,
  fetchChildren,
  transitionTicket,
} from '../integrations/linear/client';
import { getDefaultBranch, branchName, isBranchMergedTo } from '../git/operations';
import { loadState, recoverFromWorktree, getStateDir } from './state';
import { getConfig } from './config';

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

    // Validate existing state: if marked done but worktree is gone, reset
    if (ticketState?.status === 'done') {
      if (!ticketState.worktreePath || !fs.existsSync(ticketState.worktreePath)) {
        ticketState = undefined;
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
    };

    nodes.set(ticket.identifier, { ticket, state, dependencies: [], dependents: [] });
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
