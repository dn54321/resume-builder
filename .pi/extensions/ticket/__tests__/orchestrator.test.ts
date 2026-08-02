/**
 * Tests for orchestrator logic: readyTickets, status transitions, graph building.
 *
 * Run: node --test --import ./backend/node_modules/.pnpm/tsx@4.23.1/node_modules/tsx/dist/loader.mjs .pi/extensions/ticket/__tests__/orchestrator.test.ts
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import type { GraphNode, TicketInfo, TicketState } from '../types.js';

// Import the functions we want to test
import { readyTickets } from '../orchestrator.js';

/** Helper to create a minimal GraphNode for testing. */
function makeNode(
  identifier: string,
  overrides: Partial<TicketInfo> & Partial<TicketState> & { parentId?: string | null } = {},
): GraphNode {
  const ticket: TicketInfo = {
    identifier: overrides.identifier ?? identifier,
    id: overrides.id ?? `id-${identifier}`,
    title: overrides.title ?? `Test ${identifier}`,
    description: overrides.description ?? '',
    parentId: overrides.parentId ?? null,
    refs: overrides.refs ?? [],
    url: overrides.url ?? `https://linear.app/test/${identifier}`,
  };
  const state: TicketState = {
    identifier: ticket.identifier,
    status: (overrides.status as TicketState['status']) ?? 'pending',
    branch: overrides.branch ?? `ticket/${identifier.toLowerCase()}`,
    worktreePath: overrides.worktreePath ?? '',
    logPath: overrides.logPath ?? '',
    pid: overrides.pid ?? null,
    prUrl: overrides.prUrl ?? null,
    startedAt: overrides.startedAt ?? null,
    finishedAt: overrides.finishedAt ?? null,
    error: overrides.error ?? null,
    assignedPort: overrides.assignedPort ?? null,
    retryCount: overrides.retryCount ?? 0,
    workerName: overrides.workerName ?? null,
  };
  return { ticket, state, dependencies: [], dependents: [] };
}

describe('readyTickets', () => {
  it('returns empty array for empty graph', () => {
    const nodes = new Map<string, GraphNode>();
    const ready = readyTickets(nodes);
    assert.deepStrictEqual(ready, []);
  });

  it('returns pending tickets with no dependencies', () => {
    const a = makeNode('RES-1');
    const nodes = new Map([['RES-1', a]]);
    const ready = readyTickets(nodes);
    assert.strictEqual(ready.length, 1);
    assert.strictEqual(ready[0].ticket.identifier, 'RES-1');
  });

  it('skips parent epics (tickets that have children)', () => {
    const parent = makeNode('RES-1', { id: 'parent-1' });
    const child = makeNode('RES-2', { id: 'child-1', parentId: 'parent-1' });
    const nodes = new Map([
      ['RES-1', parent],
      ['RES-2', child],
    ]);
    const ready = readyTickets(nodes);
    assert.strictEqual(ready.length, 1);
    assert.strictEqual(ready[0].ticket.identifier, 'RES-2');
  });

  it('skips done tickets', () => {
    const a = makeNode('RES-1', { status: 'done' });
    const nodes = new Map([['RES-1', a]]);
    const ready = readyTickets(nodes);
    assert.strictEqual(ready.length, 0);
  });

  it('skips failed tickets', () => {
    const a = makeNode('RES-1', { status: 'failed' });
    const nodes = new Map([['RES-1', a]]);
    const ready = readyTickets(nodes);
    assert.strictEqual(ready.length, 0);
  });

  it('skips in_progress tickets', () => {
    const a = makeNode('RES-1', { status: 'in_progress' });
    const nodes = new Map([['RES-1', a]]);
    const ready = readyTickets(nodes);
    assert.strictEqual(ready.length, 0);
  });

  it('skips merged tickets', () => {
    const a = makeNode('RES-1', { status: 'merged' });
    const nodes = new Map([['RES-1', a]]);
    const ready = readyTickets(nodes);
    assert.strictEqual(ready.length, 0);
  });

  it('blocks tickets with unmet dependencies', () => {
    const dep = makeNode('RES-1', { status: 'pending' });
    const blocked = makeNode('RES-2', { status: 'pending' });
    blocked.dependencies.push(dep);
    dep.dependents.push(blocked);

    const nodes = new Map([
      ['RES-1', dep],
      ['RES-2', blocked],
    ]);
    const ready = readyTickets(nodes);
    // RES-1 is ready, RES-2 is blocked
    assert.strictEqual(ready.length, 1);
    assert.strictEqual(ready[0].ticket.identifier, 'RES-1');
    // RES-2 should be marked blocked
    assert.strictEqual(blocked.state.status, 'blocked');
  });

  it('unblocks tickets when all dependencies are done', () => {
    const dep = makeNode('RES-1', { status: 'done' });
    const unblocked = makeNode('RES-2', { status: 'pending' });
    unblocked.dependencies.push(dep);
    dep.dependents.push(unblocked);

    const nodes = new Map([
      ['RES-1', dep],
      ['RES-2', unblocked],
    ]);
    const ready = readyTickets(nodes);
    // RES-1 is done, RES-2 is ready
    assert.strictEqual(ready.length, 1);
    assert.strictEqual(ready[0].ticket.identifier, 'RES-2');
  });

  it('handles multiple dependencies correctly', () => {
    const dep1 = makeNode('RES-1', { status: 'done' });
    const dep2 = makeNode('RES-2', { status: 'done' });
    const dep3 = makeNode('RES-3', { status: 'pending' });
    const target = makeNode('RES-4', { status: 'pending' });
    target.dependencies.push(dep1, dep2, dep3);

    const nodes = new Map([
      ['RES-1', dep1],
      ['RES-2', dep2],
      ['RES-3', dep3],
      ['RES-4', target],
    ]);
    const ready = readyTickets(nodes);
    // RES-1/2 are done, RES-3 is pending, RES-4 blocked (dep3 not done)
    const ids = ready.map(n => n.ticket.identifier).sort();
    assert.deepStrictEqual(ids, ['RES-3']);
    assert.strictEqual(target.state.status, 'blocked');
  });

  it('handles diamond dependency pattern', () => {
    // A → B → D
    // A → C → D
    const a = makeNode('RES-1', { status: 'done' });
    const b = makeNode('RES-2', { status: 'done' });
    const c = makeNode('RES-3', { status: 'done' });
    const d = makeNode('RES-4', { status: 'pending' });

    b.dependencies.push(a);
    c.dependencies.push(a);
    d.dependencies.push(b, c);

    const nodes = new Map([
      ['RES-1', a],
      ['RES-2', b],
      ['RES-3', c],
      ['RES-4', d],
    ]);
    const ready = readyTickets(nodes);
    assert.strictEqual(ready.length, 1);
    assert.strictEqual(ready[0].ticket.identifier, 'RES-4');
  });
});
