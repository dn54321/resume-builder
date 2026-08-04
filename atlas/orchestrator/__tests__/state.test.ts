/**
 * Tests for the State module.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  setStateDir,
  getStateDir,
  loadState,
  saveState,
  saveFullState,
  saveTicketState,
  allocatePort,
  releasePort,
} from '../state';
import type { OrchestratorState, TicketState } from '../types';

describe('State — persistence', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-state-test-'));
    setStateDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loadState returns null when no state file exists', () => {
    const state = loadState();
    expect(state).toBeNull();
  });

  it('saveState and loadState round-trip', () => {
    const state: OrchestratorState = {
      tickets: {
        'RES-42': {
          identifier: 'RES-42',
          status: 'pending',
          branch: 'ticket/res-42',
          worktreePath: '/tmp/worktrees/RES-42',
          logPath: '/tmp/logs/RES-42.log',
          pid: null,
          prUrl: null,
          startedAt: null,
          finishedAt: null,
          error: null,
          assignedPort: null,
          retryCount: 0,
          workerName: null,
        },
      },
      startedAt: new Date().toISOString(),
      teamId: 'team-123',
      teamKey: 'RES',
      usedPorts: [9001],
      epicRoots: ['RES-10'],
    };

    saveState(state);
    const loaded = loadState();

    expect(loaded).not.toBeNull();
    expect(loaded!.teamKey).toBe('RES');
    expect(loaded!.tickets['RES-42']).toBeDefined();
    expect(loaded!.tickets['RES-42']!.status).toBe('pending');
    expect(loaded!.usedPorts).toContain(9001);
    expect(loaded!.epicRoots).toContain('RES-10');
  });

  it('saveFullState merges with existing tickets', () => {
    // Save initial state with ticket A
    const initial: OrchestratorState = {
      tickets: {
        'RES-1': {
          identifier: 'RES-1',
          status: 'done',
          branch: 'ticket/res-1',
          worktreePath: '/tmp/wt/RES-1',
          logPath: '/tmp/logs/RES-1.log',
          pid: null,
          prUrl: null,
          startedAt: null,
          finishedAt: new Date().toISOString(),
          error: null,
          assignedPort: null,
          retryCount: 0,
          workerName: null,
        },
      },
      startedAt: new Date().toISOString(),
      teamId: '',
      teamKey: 'RES',
      usedPorts: [],
      epicRoots: ['RES-1'],
    };
    saveState(initial);

    // Now save ticket B with merge
    const ticketB: Record<string, TicketState> = {
      'RES-2': {
        identifier: 'RES-2',
        status: 'pending',
        branch: 'ticket/res-2',
        worktreePath: '/tmp/wt/RES-2',
        logPath: '/tmp/logs/RES-2.log',
        pid: null,
        prUrl: null,
        startedAt: null,
        finishedAt: null,
        error: null,
        assignedPort: null,
        retryCount: 0,
        workerName: null,
      },
    };
    saveFullState(ticketB, true);

    const loaded = loadState();
    expect(loaded).not.toBeNull();
    // Both tickets should be present
    expect(Object.keys(loaded!.tickets)).toHaveLength(2);
    expect(loaded!.tickets['RES-1']!.status).toBe('done');
    expect(loaded!.tickets['RES-2']!.status).toBe('pending');
  });

  it('saveFullState without merge replaces all tickets', () => {
    // Save initial state
    const initial: OrchestratorState = {
      tickets: {
        'RES-1': {
          identifier: 'RES-1',
          status: 'done',
          branch: 'ticket/res-1',
          worktreePath: '/tmp/wt/RES-1',
          logPath: '/tmp/logs/RES-1.log',
          pid: null,
          prUrl: null,
          startedAt: null,
          finishedAt: new Date().toISOString(),
          error: null,
          assignedPort: null,
          retryCount: 0,
          workerName: null,
        },
      },
      startedAt: new Date().toISOString(),
      teamId: '',
      teamKey: 'RES',
      usedPorts: [],
      epicRoots: [],
    };
    saveState(initial);

    // Now save without merge
    const ticketB: Record<string, TicketState> = {
      'RES-2': {
        identifier: 'RES-2',
        status: 'pending',
        branch: 'ticket/res-2',
        worktreePath: '/tmp/wt/RES-2',
        logPath: '/tmp/logs/RES-2.log',
        pid: null,
        prUrl: null,
        startedAt: null,
        finishedAt: null,
        error: null,
        assignedPort: null,
        retryCount: 0,
        workerName: null,
      },
    };
    saveFullState(ticketB, false);

    const loaded = loadState();
    // Only RES-2 should be present (no merge)
    expect(Object.keys(loaded!.tickets)).toHaveLength(1);
    expect(loaded!.tickets['RES-2']).toBeDefined();
    expect(loaded!.tickets['RES-1']).toBeUndefined();
  });

  it('saveTicketState updates a single ticket', () => {
    // Save initial state with two tickets
    const initial: OrchestratorState = {
      tickets: {
        'RES-1': {
          identifier: 'RES-1',
          status: 'pending',
          branch: 'ticket/res-1',
          worktreePath: '',
          logPath: '',
          pid: null,
          prUrl: null,
          startedAt: null,
          finishedAt: null,
          error: null,
          assignedPort: null,
          retryCount: 0,
          workerName: null,
        },
        'RES-2': {
          identifier: 'RES-2',
          status: 'pending',
          branch: 'ticket/res-2',
          worktreePath: '',
          logPath: '',
          pid: null,
          prUrl: null,
          startedAt: null,
          finishedAt: null,
          error: null,
          assignedPort: null,
          retryCount: 0,
          workerName: null,
        },
      },
      startedAt: new Date().toISOString(),
      teamId: '',
      teamKey: 'RES',
      usedPorts: [],
      epicRoots: [],
    };
    saveState(initial);

    // Update RES-1 to done
    const updated: TicketState = {
      identifier: 'RES-1',
      status: 'done',
      branch: 'ticket/res-1',
      worktreePath: '',
      logPath: '',
      pid: null,
      prUrl: 'https://github.com/owner/repo/pull/1',
      startedAt: null,
      finishedAt: new Date().toISOString(),
      error: null,
      assignedPort: null,
      retryCount: 0,
      workerName: null,
    };
    saveTicketState('RES-1', updated);

    const loaded = loadState();
    expect(loaded!.tickets['RES-1']!.status).toBe('done');
    expect(loaded!.tickets['RES-1']!.prUrl).toBe('https://github.com/owner/repo/pull/1');
    // RES-2 should be unchanged
    expect(loaded!.tickets['RES-2']!.status).toBe('pending');
  });
});

describe('State — port management', () => {
  let state: OrchestratorState;

  beforeEach(() => {
    state = {
      tickets: {},
      startedAt: new Date().toISOString(),
      teamId: '',
      teamKey: '',
      usedPorts: [],
      epicRoots: [],
    };
  });

  it('allocatePort returns the first free port', () => {
    const port = allocatePort(state, 9000, 9099);
    expect(port).toBe(9000);
    expect(state.usedPorts).toContain(9000);
  });

  it('allocatePort skips used ports', () => {
    state.usedPorts = [9000, 9001];
    const port = allocatePort(state, 9000, 9099);
    expect(port).toBe(9002);
  });

  it('allocatePort returns null when pool exhausted', () => {
    state.usedPorts = [9000, 9001, 9002];
    const port = allocatePort(state, 9000, 9002);
    expect(port).toBeNull();
  });

  it('releasePort removes port from used list', () => {
    state.usedPorts = [9000, 9001];
    releasePort(state, 9000);
    expect(state.usedPorts).not.toContain(9000);
    expect(state.usedPorts).toContain(9001);
  });

  it('releasePort handles null port', () => {
    state.usedPorts = [9000];
    releasePort(state, null);
    expect(state.usedPorts).toHaveLength(1);
  });
});
