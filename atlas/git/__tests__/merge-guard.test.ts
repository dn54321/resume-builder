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
import { mergeToBranch, pushBranch } from '../operations';

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

  /**
   * ⚠️ Regression test for the stranded-push loop (RES-92 + 7 other tickets):
   * the pre-push hook runs the full backend+frontend+atlas test:cov suites,
   * so `git push` takes minutes. When the orchestrator pushed with the
   * default 30s execGit timeout, EVERY push was killed mid-hook, git
   * reported "failed to push some refs", and the strategy retry loop
   * re-spawned workers forever on already-merged tickets. The push MUST use
   * PUSH_TIMEOUT_MS (default 45 min).
   */
  it('mergeToBranch push uses the long PUSH_TIMEOUT_MS (pre-push hook runs full suites)', () => {
    statusOutput = '';
    let pushOptions: unknown;
    vi.mocked(cp.spawnSync).mockImplementation(((cmd: unknown, args: unknown, options: unknown) => {
      const c = String(cmd);
      const a = (args as string[] ?? []).join(' ');
      if (c === 'git' && a.includes('push')) {
        pushOptions = options;
      }
      return { ...gitStatusResult(''), status: 0 };
    }) as any);

    const result = mergeToBranch('/tmp/wt', 'ticket/res-x', 'master', 'msg');

    expect(result.exitCode).toBe(0);
    expect(pushOptions).toBeDefined();
    expect((pushOptions as { timeout?: number })?.timeout ?? 0).toBeGreaterThan(30_000);
  });

  it('pushBranch also uses the long PUSH_TIMEOUT_MS', () => {
    let pushOptions: unknown;
    vi.mocked(cp.spawnSync).mockImplementation(((cmd: unknown, args: unknown, options: unknown) => {
      const a = (args as string[] ?? []).join(' ');
      if (String(cmd) === 'git' && a.includes('push')) {
        pushOptions = options;
      }
      return { ...gitStatusResult(''), status: 0 };
    }) as any);

    const result = pushBranch('/tmp/wt', 'ticket/res-x');

    expect(result.exitCode).toBe(0);
    expect((pushOptions as { timeout?: number })?.timeout ?? 0).toBeGreaterThan(30_000);
  });
});
