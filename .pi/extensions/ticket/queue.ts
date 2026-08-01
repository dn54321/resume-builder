/**
 * Priority queue for ticket agents.
 *
 * Tickets are ordered by priority:
 *   review (PR comments to address) > conflict (merge conflicts) >
 *   pending (ready to run) > blocked (waiting on dependencies)
 *
 * When a running agent is blocked and a higher-priority ticket is available,
 * the agent is preempted (killed) and the higher-priority ticket is spawned.
 * The preempted ticket is re-queued as blocked.
 */

import type { GraphNode, QueuePriority } from './types.js';

export interface QueueEntry {
  node: GraphNode;
  priority: QueuePriority;
  context?: string;
}

const PRIORITY_ORDER: Record<QueuePriority, number> = {
  review: 0,
  conflict: 1,
  pending: 2,
  blocked: 3,
};

/** Compute priority for a node based on context and dependency state. */
function computePriority(
  node: GraphNode,
  reviewTicketIds: Set<string>,
  conflictTicketIds: Set<string>,
): QueuePriority {
  const id = node.ticket.identifier;

  if (reviewTicketIds.has(id)) return 'review';
  if (conflictTicketIds.has(id)) return 'conflict';

  const allDepsDone = node.dependencies.every(
    (d) => d.state.status === 'done',
  );
  if (!allDepsDone) return 'blocked';
  return 'pending';
}

/** Build a sorted queue from the graph nodes. */
export function buildQueue(
  nodes: Map<string, GraphNode>,
  reviewTicketIds: Set<string>,
  conflictTicketIds: Set<string>,
): QueueEntry[] {
  const entries: QueueEntry[] = [];

  for (const [, node] of nodes) {
    // Skip done/failed/running nodes
    if (node.state.status === 'done' || node.state.status === 'failed') continue;

    const priority = computePriority(node, reviewTicketIds, conflictTicketIds);
    node.priority = priority;

    if (node.state.status === 'running') continue; // already running, keep in separate tracking

    entries.push({
      node,
      priority,
      context: node.context,
    });
  }

  // Sort by priority (lower number = higher priority)
  entries.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority];
    const pb = PRIORITY_ORDER[b.priority];
    return pa - pb;
  });

  return entries;
}

/** Get the next batch of tickets to spawn, up to maxAgents. */
export function dequeueBatch(
  queue: QueueEntry[],
  maxCount: number,
): QueueEntry[] {
  const batch: QueueEntry[] = [];
  for (const entry of queue) {
    if (batch.length >= maxCount) break;
    if (entry.node.state.status === 'running') continue;
    batch.push(entry);
  }
  return batch;
}

/**
 * Check if any running agents should be preempted.
 * A running agent is preempted if it's blocked AND there are higher-priority
 * tickets waiting in the queue.
 */
export function findPreemptibleAgents(
  nodes: Map<string, GraphNode>,
  queue: QueueEntry[],
): GraphNode[] {
  const running = [...nodes.values()].filter(
    (n) => n.state.status === 'running',
  );

  const preempt: GraphNode[] = [];

  for (const node of running) {
    const currentPriority = node.priority ?? 'pending';
    const isBlocked = node.dependencies.some(
      (d) => d.state.status !== 'done',
    );

    if (isBlocked && currentPriority !== 'review' && currentPriority !== 'conflict') {
      // This agent is blocked and not working on something critical.
      // Check if there's a higher-priority ticket waiting.
      const hasHigherPriority = queue.some(
        (e) => PRIORITY_ORDER[e.priority] < PRIORITY_ORDER[currentPriority],
      );

      if (hasHigherPriority) {
        preempt.push(node);
      }
    }
  }

  return preempt;
}
