/**
 * Tests for the mergeToBranch dirty-tree guard — the anti-clobbering
 * protection that keeps worker merges from wiping the boss's staged work.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process at the module level so we can control what `git status`
// reports to the guard (spawnSync is a read-only ESM export — can't spyOn it).
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import * as cp from 'node:child_process';
import { mergeToBranch } from '../operations';

type SpawnArgs = [unknown, unknown];

function gitStatusResult(stdout: string) {
  return {
    stdout,
    stderr: '',
    status: 0,
    pid: 0,
    output: [],
    signal: null,
  };
}

describe('mergeToBranch — dirty-tree guard', () => {
  let statusOutput: string;

  beforeEach(() => {
    statusOutput = '';
    process.env.ATLAS_MERGE_DIRTY_TIMEOUT_MS = '1500';
    vi.mocked(cp.spawnSync).mockImplementation(((cmd: unknown, args: unknown) => {
      const c = String(cmd);
      const a = (args as string[] ?? []).join(' ');
      if (c === 'git' && a.includes('status') && a.includes('--porcelain')) {
        return gitStatusResult(statusOutput);
      }
      if (c === 'git' && a.includes('rev-parse') && a.includes('--show-toplevel')) {
        return gitStatusResult('/tmp/main-repo\n');
      }
      if (c === 'sleep') return gitStatusResult('');
      // fetch/checkout/merge/push fail fast (no remote)
      return { ...gitStatusResult(''), status: 128, stderr: 'no remote' };
    }) as any);
  });

  afterEach(() => {
    delete process.env.ATLAS_MERGE_DIRTY_TIMEOUT_MS;
    vi.restoreAllMocks();
  });

  it('does not clobber staged boss work — returns a defer error when tree stays dirty', () => {
    statusOutput = ' M atlas/orchestrator/server.ts\n';
    const result = mergeToBranch('/tmp/wt', 'ticket/res-x', 'master', 'msg');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('dirty');
    // No checkout was attempted (the guard bailed before fetch/checkout)
    const calls = vi.mocked(cp.spawnSync).mock.calls.map((c) => (c[1] as string[] ?? []).join(' '));
    expect(calls.some((c) => c.includes('checkout'))).toBe(false);
  });

  it('proceeds past the guard when the tree is clean', () => {
    statusOutput = '';
    const result = mergeToBranch('/tmp/wt', 'ticket/res-x', 'master', 'msg');

    // Clean → guard passes → proceeds to fetch (fails: no remote).
    expect(result.stderr).not.toContain('dirty');
    const calls = vi.mocked(cp.spawnSync).mock.calls.map((c) => (c[1] as string[] ?? []).join(' '));
    expect(calls.some((c) => c.includes('fetch'))).toBe(true);
  });
});
