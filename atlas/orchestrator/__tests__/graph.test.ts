/**
 * Tests for the dependency graph builder.
 */
import { describe, it, expect } from 'vitest';
import { isEpicComplete } from '../graph';
import type { GraphNode, TicketInfo, TicketState } from '../types';

// We test the graph logic directly using prepared nodes,
// since the full buildGraph requires a live Linear API.

function makeNode(
  identifier: string,
  status: TicketState['status'],
  refs: string[] = [],
  parentId: string | null = null,
): GraphNode {
  const ticket: TicketInfo = {
    identifier,
    id: `id-${identifier}`,
    title: `Ticket ${identifier}`,
    description: refs.length > 0 ? `ref: ${refs.join(' ')}` : '',
    parentId,
    refs,
    url: `https://linear.app/issue/${identifier}`,
  };

  const state: TicketState = {
    identifier,
    status,
    branch: `ticket/${identifier.toLowerCase()}`,
    worktreePath: `/tmp/worktrees/${identifier}`,
    logPath: `/tmp/logs/${identifier}.log`,
    pid: null,
    prUrl: null,
    startedAt: null,
    finishedAt: status === 'done' ? new Date().toISOString() : null,
    error: null,
    assignedPort: null,
    retryCount: 0,
    workerName: null,
    agentId: null,
    paneId: null,
  };

  return { ticket, state, dependencies: [], dependents: [] };
}

describe('Graph — readyTickets', () => {

  function wireDependencies(nodes: Map<string, GraphNode>): void {
    for (const [, node] of nodes) {
      for (const ref of node.ticket.refs) {
        const dep = nodes.get(ref);
        if (dep) {
          node.dependencies.push(dep);
          dep.dependents.push(node);
        }
      }
    }
  }

  function readyTickets(nodes: Map<string, GraphNode>): GraphNode[] {
    const ready: GraphNode[] = [];
    const parentIds = new Set<string>();

    for (const [, node] of nodes) {
      if (node.ticket.parentId) {
        parentIds.add(node.ticket.parentId);
      }
    }

    for (const [, node] of nodes) {
      if (parentIds.has(node.ticket.id)) continue;

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

  it('no tickets → no ready', () => {
    const nodes = new Map<string, GraphNode>();
    expect(readyTickets(nodes)).toHaveLength(0);
  });

  it('single pending ticket with no deps → ready', () => {
    const nodes = new Map<string, GraphNode>();
    const node = makeNode('RES-1', 'pending');
    nodes.set('RES-1', node);

    const ready = readyTickets(nodes);
    expect(ready).toHaveLength(1);
    expect(ready[0]!.ticket.identifier).toBe('RES-1');
  });

  it('ticket with unsatisfied dependency → blocked', () => {
    const nodes = new Map<string, GraphNode>();
    const dep = makeNode('RES-1', 'pending');
    const child = makeNode('RES-2', 'pending', ['RES-1']);
    nodes.set('RES-1', dep);
    nodes.set('RES-2', child);
    wireDependencies(nodes);

    const ready = readyTickets(nodes);
    expect(ready).toHaveLength(1);
    expect(ready[0]!.ticket.identifier).toBe('RES-1');
    // RES-2 should still be blocked
    expect(nodes.get('RES-2')!.state.status).toBe('blocked');
  });

  it('ticket with satisfied dependency → both ready', () => {
    const nodes = new Map<string, GraphNode>();
    const dep = makeNode('RES-1', 'done');
    const child = makeNode('RES-2', 'pending', ['RES-1']);
    nodes.set('RES-1', dep);
    nodes.set('RES-2', child);
    wireDependencies(nodes);

    const ready = readyTickets(nodes);
    // RES-1 is done, RES-2 is now ready
    expect(ready).toHaveLength(1);
    expect(ready[0]!.ticket.identifier).toBe('RES-2');
  });

  it('multiple dependencies — all must be done', () => {
    const nodes = new Map<string, GraphNode>();
    const dep1 = makeNode('RES-1', 'done');
    const dep2 = makeNode('RES-2', 'pending');
    const child = makeNode('RES-3', 'pending', ['RES-1', 'RES-2']);
    nodes.set('RES-1', dep1);
    nodes.set('RES-2', dep2);
    nodes.set('RES-3', child);
    wireDependencies(nodes);

    const ready = readyTickets(nodes);
    // RES-2 is ready, RES-1 done, RES-3 blocked (RES-2 not done)
    expect(ready).toHaveLength(1);
    expect(ready[0]!.ticket.identifier).toBe('RES-2');
    expect(nodes.get('RES-3')!.state.status).toBe('blocked');
  });

  it('parent epics are excluded from ready', () => {
    const nodes = new Map<string, GraphNode>();
    const epic = makeNode('RES-EPIC', 'pending');
    const child = makeNode('RES-1', 'pending', [], 'id-RES-EPIC');
    nodes.set('RES-EPIC', epic);
    nodes.set('RES-1', child);

    const ready = readyTickets(nodes);
    // Only the child should be ready, not the epic parent
    expect(ready).toHaveLength(1);
    expect(ready[0]!.ticket.identifier).toBe('RES-1');
  });

  it('already done tickets are not returned as ready', () => {
    const nodes = new Map<string, GraphNode>();
    const done = makeNode('RES-1', 'done');
    const pending = makeNode('RES-2', 'pending', ['RES-1']);
    nodes.set('RES-1', done);
    nodes.set('RES-2', pending);
    wireDependencies(nodes);

    const ready = readyTickets(nodes);
    // RES-1 done, RES-2 ready (dep satisfied)
    expect(ready).toHaveLength(1);
    expect(ready[0]!.ticket.identifier).toBe('RES-2');
  });

  it('failed tickets are not ready', () => {
    const nodes = new Map<string, GraphNode>();
    const failed = makeNode('RES-1', 'failed');
    nodes.set('RES-1', failed);

    const ready = readyTickets(nodes);
    expect(ready).toHaveLength(0);
  });

  it('in_progress tickets are not ready', () => {
    const nodes = new Map<string, GraphNode>();
    const running = makeNode('RES-1', 'in_progress');
    nodes.set('RES-1', running);

    const ready = readyTickets(nodes);
    expect(ready).toHaveLength(0);
  });
});

describe('Graph — isEpicComplete (auto-complete epics when all children done)', () => {
  /**
   * An epic is a product-goal CONTAINER: readyTickets() never assigns it a
   * worker (parents excluded). It should be auto-completed once every child
   * it OWNS is done — referenced tickets (ref: deps owned by other epics)
   * and the root itself must not count.
   */
  function buildEpic(children: Array<{ id: string; status: TicketState['status'] }>): {
    nodes: Map<string, GraphNode>;
    rootId: string;
  } {
    const nodes = new Map<string, GraphNode>();
    const rootId = 'RES-EPIC';
    nodes.set(rootId, makeNode(rootId, 'pending'));
    for (const c of children) {
      nodes.set(c.id, makeNode(c.id, c.status, [], rootId));
    }
    return { nodes, rootId };
  }

  it('epic with no children is NOT complete (nothing to auto-close)', () => {
    const { nodes, rootId } = buildEpic([]);
    expect(isEpicComplete(nodes, rootId)).toBe(false);
  });

  it('epic with all children done → complete', () => {
    const { nodes, rootId } = buildEpic([
      { id: 'RES-1', status: 'done' },
      { id: 'RES-2', status: 'merged' },
      { id: 'RES-3', status: 'done' },
    ]);
    expect(isEpicComplete(nodes, rootId)).toBe(true);
  });

  it('epic with any child in progress → NOT complete', () => {
    const { nodes, rootId } = buildEpic([
      { id: 'RES-1', status: 'done' },
      { id: 'RES-2', status: 'in_progress' },
      { id: 'RES-3', status: 'done' },
    ]);
    expect(isEpicComplete(nodes, rootId)).toBe(false);
  });

  it('a failed child still counts as finished (epic closes, ticket is failed)', () => {
    const { nodes, rootId } = buildEpic([
      { id: 'RES-1', status: 'done' },
      { id: 'RES-2', status: 'failed' },
    ]);
    expect(isEpicComplete(nodes, rootId)).toBe(true);
  });

  it('referenced tickets (owned by another epic) do NOT block completion', () => {
    const { nodes, rootId } = buildEpic([
      { id: 'RES-1', status: 'done' },
    ]);
    // RES-2 is a ref: dependency owned by a DIFFERENT epic — its parentId
    // is not the root, so it must not count as a child of this epic.
    const ref = makeNode('RES-2', 'in_progress', [], 'RES-OTHER-EPIC');
    nodes.set('RES-2', ref);
    expect(isEpicComplete(nodes, rootId)).toBe(true);
  });
});
