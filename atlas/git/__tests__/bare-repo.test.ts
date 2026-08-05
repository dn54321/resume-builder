/**
 * Unit tests for RES-99 bare-repo resilience at the git layer.
 *
 * The orchestrator crashed on 2026-08-06 02:33 with an UNCAUGHT throw at
 * mergeToBranch → getRepoRoot: a corrupted push flipped the main repo to
 * core.bare=true, `git rev-parse --show-toplevel` failed, and the throw
 * propagated through executeDirect and killed the whole process.
 *
 * Fixes under test:
 *  1. getRepoRoot now DETECTS the bare state (via --is-bare-repository) and
 *     throws a clean, diagnosable error naming the fault + recovery command,
 *     instead of the opaque "Not in a git repository".
 *  2. mergeToBranch catches that throw and RETURNS a clean retryable
 *     GitResult error — the git layer is now crash-proof even for callers
 *     that don't wrap it in try/catch (pool.ts, server.ts).
 *  3. isBranchMerged treats an unresolvable root as "not merged" instead of
 *     letting the throw escape.
 *
 * The real-git twin of this suite is bare-repo-integration.test.ts (verifies
 * actual git behavior for a core.bare=true repo).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process at the module level so we can control what `git`
// reports for --show-toplevel and --is-bare-repository (spawnSync is a
// read-only ESM export — can't spyOn it).
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import * as cp from 'node:child_process';
import { getRepoRoot, mergeToBranch, isBranchMerged } from '../operations';

function gitResult(stdout: string, status = 0, stderr = '') {
  return {
    stdout,
    stderr,
    status,
    pid: 0,
    output: [],
    signal: null,
  };
}

/** Mock git as a BARE repo (core.bare=true): --show-toplevel fails, --is-bare-repository says true. */
function mockBareRepo() {
  vi.mocked(cp.spawnSync).mockImplementation(((cmd: unknown, args: unknown) => {
    const a = (args as string[] ?? []).join(' ');
    if (a.includes('--show-toplevel')) {
      return gitResult('', 128, 'fatal: this operation must be run in a work tree');
    }
    if (a.includes('--is-bare-repository')) return gitResult('true\n');
    return gitResult('', 128);
  }) as any);
}

/** Mock git as NOT a repository at all. */
function mockNotARepo() {
  vi.mocked(cp.spawnSync).mockImplementation(((cmd: unknown, args: unknown) => {
    const a = (args as string[] ?? []).join(' ');
    if (a.includes('--show-toplevel')) {
      return gitResult('', 128, 'fatal: not a git repository (or any of the parent directories): .git');
    }
    if (a.includes('--is-bare-repository')) return gitResult('', 128);
    return gitResult('', 128);
  }) as any);
}

describe('getRepoRoot — bare repo detection (RES-99)', () => {
  beforeEach(() => {
    vi.mocked(cp.spawnSync).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws a descriptive "bare" error when core.bare=true (not the opaque generic)', () => {
    mockBareRepo();

    expect(() => getRepoRoot()).toThrowError(/bare \(core\.bare=true\)/);
    // The error must tell the operator how to recover
    expect(() => getRepoRoot()).toThrowError(/git config core\.bare false/);
  });

  it('throws "Not in a git repository" (with git stderr) when the dir is not a repo at all', () => {
    mockNotARepo();

    expect(() => getRepoRoot()).toThrowError(/Not in a git repository/);
    // Preserve git's own stderr for diagnosis
    expect(() => getRepoRoot()).toThrowError(/not a git repository \(or any of the parent/);
  });

  it('falls back to the generic message when git gives no diagnostics at all', () => {
    // --show-toplevel fails with empty stderr and the bare probe also fails
    // (e.g. git missing/broken) — repoRootError must still produce an Error.
    vi.mocked(cp.spawnSync).mockImplementation(((cmd: unknown, args: unknown) => {
      const a = (args as string[] ?? []).join(' ');
      if (a.includes('--show-toplevel')) return gitResult('', 128);
      if (a.includes('--is-bare-repository')) return gitResult('', 128);
      return gitResult('', 128);
    }) as any);

    expect(() => getRepoRoot()).toThrowError('Not in a git repository');
  });

  it('returns the root normally for a healthy repo (no --is-bare probe needed)', () => {
    vi.mocked(cp.spawnSync).mockImplementation(((cmd: unknown, args: unknown) => {
      const a = (args as string[] ?? []).join(' ');
      if (a.includes('--show-toplevel')) return gitResult('/main/repo\n');
      return gitResult('', 128);
    }) as any);

    expect(getRepoRoot()).toBe('/main/repo');
    // --is-bare-repository must NOT be probed when the root resolves fine
    const calls = vi.mocked(cp.spawnSync).mock.calls.map((c) => (c[1] as string[] ?? []).join(' '));
    expect(calls.some((c) => c.includes('--is-bare-repository'))).toBe(false);
  });
});

describe('mergeToBranch — never throws on repo-state faults (RES-99)', () => {
  beforeEach(() => {
    vi.mocked(cp.spawnSync).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a clean retryable error instead of throwing when the repo is bare', () => {
    mockBareRepo();

    let result: ReturnType<typeof mergeToBranch> | undefined;
    expect(() => {
      result = mergeToBranch('/tmp/wt', 'ticket/res-x', 'master', 'msg');
    }).not.toThrow();

    expect(result!.exitCode).toBe(1);
    expect(result!.stderr).toContain('Merge aborted');
    expect(result!.stderr).toContain('bare');
    // Bailed at getRepoRoot — no fetch/checkout/merge was even attempted
    const calls = vi.mocked(cp.spawnSync).mock.calls.map((c) => (c[1] as string[] ?? []).join(' '));
    expect(calls.some((c) => c.includes('fetch'))).toBe(false);
    expect(calls.some((c) => c.includes('checkout'))).toBe(false);
    expect(calls.some((c) => c.includes(' merge '))).toBe(false);
  });

  it('returns a clean error (not throw) when the repo root is unresolvable (not a repo)', () => {
    mockNotARepo();

    let result: ReturnType<typeof mergeToBranch> | undefined;
    expect(() => {
      result = mergeToBranch('/tmp/wt', 'ticket/res-x', 'master', 'msg');
    }).not.toThrow();

    expect(result!.exitCode).toBe(1);
    expect(result!.stderr).toContain('cannot resolve the main repo');
  });
});

describe('isBranchMerged — never throws on repo-state faults (RES-99)', () => {
  beforeEach(() => {
    vi.mocked(cp.spawnSync).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false instead of throwing when the repo is bare', () => {
    mockBareRepo();

    let merged: boolean | undefined;
    expect(() => {
      merged = isBranchMerged('ticket/res-x', 'master');
    }).not.toThrow();
    expect(merged).toBe(false);
  });

  it('returns true when the branch IS in the merged list (healthy repo)', () => {
    vi.mocked(cp.spawnSync).mockImplementation(((cmd: unknown, args: unknown) => {
      const a = (args as string[] ?? []).join(' ');
      if (a.includes('--show-toplevel')) return gitResult('/main/repo\n');
      if (a.includes('branch') && a.includes('--merged')) {
        return gitResult('  master\n  ticket/res-x\n');
      }
      return gitResult('', 128);
    }) as any);

    expect(isBranchMerged('ticket/res-x', 'master')).toBe(true);
  });
});
