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
  recoverFromWorktree,
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
          agentId: null,
          paneId: null,
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
          agentId: null,
          paneId: null,
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
          agentId: null,
          paneId: null,
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
          agentId: null,
          paneId: null,
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
          agentId: null,
          paneId: null,
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
          agentId: null,
          paneId: null,
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
          agentId: null,
          paneId: null,
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
          agentId: null,
          paneId: null,
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

describe('State — worktree recovery', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-recovery-test-'));
    setStateDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('recovers a ticket as done when its branch is merged into the target', () => {
    // Build a throwaway repo: base commit, ticket branch with work,
    // then merge the ticket branch into the target branch.
    const repo = path.join(tmpDir, 'repo');
    const wt = path.join(tmpDir, 'wt');
    fs.mkdirSync(repo);
    runGit(['init', '-b', 'master'], repo);
    fs.writeFileSync(path.join(repo, 'file.txt'), 'base\n');
    runGit(['add', '.'], repo);
    runGit(['commit', '-m', 'base'], repo);

    runGit(['branch', 'ticket/res-77', 'master'], repo);
    runGit(['worktree', 'add', wt, 'ticket/res-77'], repo);
    fs.writeFileSync(path.join(wt, 'file.txt'), 'base\nwork\n');
    runGit(['add', '.'], wt);
    runGit(['commit', '-m', '[RES-77] real work'], wt);

    // Merge the ticket branch into master (simulates a completed delivery)
    runGit(['checkout', 'master'], repo);
    runGit(['merge', 'ticket/res-77', '-m', 'Closes RES-77'], repo);

    const recovered = recoverFromWorktree('RES-77', wt, 'master', 'master');
    expect(recovered).not.toBeNull();
    expect(recovered!.status).toBe('done');
  });

  it('does NOT recover a ticket when its branch was never merged', () => {
    const repo = path.join(tmpDir, 'repo2');
    const wt = path.join(tmpDir, 'wt2');
    fs.mkdirSync(repo);
    runGit(['init', '-b', 'master'], repo);
    fs.writeFileSync(path.join(repo, 'file.txt'), 'base\n');
    runGit(['add', '.'], repo);
    runGit(['commit', '-m', 'base'], repo);

    runGit(['branch', 'ticket/res-85', 'master'], repo);
    runGit(['worktree', 'add', wt, 'ticket/res-85'], repo);
    fs.writeFileSync(path.join(wt, 'file.txt'), 'base\nlocked\n');
    runGit(['add', '.'], wt);
    runGit(['commit', '-m', '[RES-85] add locked column'], wt);

    // Work is committed but NEVER merged to master — the exact scenario
    // that previously lost tickets (RES-85). Must NOT recover as done.
    const recovered = recoverFromWorktree('RES-85', wt, 'master', 'master');
    expect(recovered).toBeNull();
  });

  it('returns null when the worktree does not exist', () => {
    const recovered = recoverFromWorktree(
      'RES-99',
      path.join(tmpDir, 'missing'),
      'master',
      'master',
    );
    expect(recovered).toBeNull();
  });
});

function runGit(args: string[], cwd: string): void {
  const res = require('node:child_process').spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${res.stderr || res.stdout}`);
  }
}
