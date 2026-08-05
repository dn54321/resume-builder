/**
 * Regression test: a ticket that is a child of MULTIPLE epics must share a
 * SINGLE TicketState object across all epic graphs.
 *
 * Regression (observed: 3 workers colliding on RES-91 in one worktree):
 * buildGraph() created a fresh TicketState per epic graph, so a spawn marked
 * ONE epic's node in_progress while the others stayed pending — and the next
 * launchReady() call (from addEpic, scheduler, or intercom) saw the same
 * ticket ready in a different epic and spawned ANOTHER worker.
 *
 * Fix: module-level sharedTicketStates registry in graph.ts — every epic
 * graph references the same TicketState instance, so transitions propagate.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../integrations/linear/client', () => ({
  fetchTicketByIdentifier: vi.fn(),
  fetchChildren: vi.fn(),
  transitionTicket: vi.fn(),
}));
vi.mock('../../git/operations', () => ({
  getDefaultBranch: vi.fn(() => 'master'),
  branchName: vi.fn((id: string) => `ticket/${id.toLowerCase()}`),
  isBranchMergedTo: vi.fn(() => false),
}));
vi.mock('../state', () => ({
  loadState: vi.fn(() => null),
  recoverFromWorktree: vi.fn(() => null),
  getStateDir: vi.fn(() => '/tmp/atlas-test-state'),
}));
vi.mock('../config', () => ({
  getConfig: vi.fn(() => ({
    agents: { worker: { retry_limit: 2 } },
    strategy: { branches: { worktree_base: 'master' } },
  })),
}));

import { buildGraph } from '../graph';
import type { TicketInfo } from '../types';
import { fetchTicketByIdentifier, fetchChildren } from '../../integrations/linear/client';

const mockedFetch = vi.mocked(fetchTicketByIdentifier);
const mockedChildren = vi.mocked(fetchChildren);

function makeTicket(identifier: string, parentId: string | null = null, refs: string[] = []): TicketInfo {
  return {
    identifier,
    id: `id-${identifier}`,
    title: `Ticket ${identifier}`,
    description: refs.length ? `ref: ${refs.join(' ')}` : '',
    parentId,
    refs,
    url: `https://linear.app/issue/${identifier}`,
  };
}

describe('Graph — shared ticket state across epics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // RES-99 and RES-98 both contain child RES-97 (a shared sub-ticket).
    mockedFetch.mockImplementation(async (identifier: string) => {
      if (identifier === 'RES-99') return makeTicket('RES-99');
      if (identifier === 'RES-98') return makeTicket('RES-98');
      if (identifier === 'RES-97') return makeTicket('RES-97', 'id-RES-99');
      return null;
    });
    mockedChildren.mockImplementation(async (parentId: string) => {
      if (parentId === 'id-RES-99') return [makeTicket('RES-97', 'id-RES-99')];
      if (parentId === 'id-RES-98') return [makeTicket('RES-97', 'id-RES-98')];
      return [];
    });
  });

  it('two epics containing the same child get the SAME TicketState object', async () => {
    const graphA = await buildGraph('RES-99');
    const graphB = await buildGraph('RES-98');

    const nodeA = graphA.nodes.get('RES-97')!;
    const nodeB = graphB.nodes.get('RES-97')!;
    expect(nodeA).toBeDefined();
    expect(nodeB).toBeDefined();
    // The core regression fix: same state object, not a per-epic copy.
    expect(nodeA.state).toBe(nodeB.state);
  });

  it('a transition on one epic graph is visible in every other epic graph', async () => {
    const graphA = await buildGraph('RES-99');
    const graphB = await buildGraph('RES-98');

    // Simulate launchReady spawning a worker — marks state in_progress.
    graphA.nodes.get('RES-97')!.state.status = 'in_progress';
    graphA.nodes.get('RES-97')!.state.workerName = 'worker-7';

    // The OTHER epic's node must see the same transition — otherwise a
    // subsequent launchReady() call would spawn a duplicate worker.
    expect(graphB.nodes.get('RES-97')!.state.status).toBe('in_progress');
    expect(graphB.nodes.get('RES-97')!.state.workerName).toBe('worker-7');

    // And readyTickets() on the second epic must NOT return it as ready.
    const ready = graphB.nodes.size === 0 ? [] : [...graphB.nodes.values()]
      .filter((n) => n.state.status === 'pending');
    expect(ready.map((n) => n.ticket.identifier)).not.toContain('RES-97');
  });
});
