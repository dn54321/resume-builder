/*
 * ⚠️ WARNING — REAL-GIT integration tests. NEVER run `git init`/`git add`/
 * `git commit` from these throwaway-repo tests without stripping inherited
 * GIT_* env vars.
 *
 * When the pre-push hook runs this suite during a push from a linked
 * worktree, git exports GIT_DIR=<common-git-dir>/worktrees/<branch> into
 * the hook environment. `git init` in a throwaway /tmp repo then
 * RE-INITIALIZES THE WRONG REPOSITORY instead of creating a new one, and
 * the subsequent git commands operate on the pushing worker's branch —
 * silently corrupting it (observed 2026-08-06 on RES-91; see
 * orchestrator/__tests__/state.test.ts for the full writeup).
 *
 * Fix: GIT_* vars are deleted from process.env at module load (below), so
 * EVERY git spawn in this suite — including the production execGit calls
 * made via getRepoRoot()/mergeToBranch() — operates on the throwaway repo,
 * not the pushing branch's repo. runGit() additionally strips GIT_* as
 * defense-in-depth for spawns that build their own env.
 */

/**
 * Real-git verification for RES-99: the orchestrator crashed with an
 * uncaught "Not in a git repository" when the main repo transiently
 * flipped to core.bare=true. These tests reproduce the EXACT incident
 * against real git (not mocks) and prove:
 *
 *  1. getRepoRoot() throws a clean, diagnosable "bare" error (not the
 *     opaque generic message) when core.bare=true.
 *  2. mergeToBranch() RETURNS a clean retryable error instead of throwing
 *     — the orchestrator survives the transient.
 *  3. The orchestrator recovers once core.bare is flipped back to false
 *     (the root-cause fix; a bare flip is not permanent).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as cp from 'node:child_process';

// See WARNING above — isolate this suite from any inherited GIT_* env vars
// (the worktree pre-push hook sets GIT_DIR).
const GIT_ENV_KEYS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CEILING_DIRECTORIES',
] as const;
for (const key of GIT_ENV_KEYS) {
  delete process.env[key];
}

import { getRepoRoot, mergeToBranch } from '../operations';

let tmpDirs: string[] = [];

function runGit(args: string[], cwd: string): void {
  const env = { ...process.env };
  for (const key of GIT_ENV_KEYS) {
    delete env[key];
  }
  const res = cp.spawnSync('git', args, { cwd, encoding: 'utf-8', env });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${res.stderr || res.stdout}`);
  }
}

/** Create a throwaway non-bare repo with one commit. */
function makeRepo(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-bare-test-'));
  tmpDirs.push(tmp);
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  runGit(['init', '-b', 'master'], repo);
  fs.writeFileSync(path.join(repo, 'file.txt'), 'base\n');
  runGit(['add', '.'], repo);
  runGit(['commit', '-m', 'base'], repo);
  return repo;
}

afterEach(() => {
  for (const d of tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpDirs = [];
});

describe('getRepoRoot — real bare repo (core.bare=true)', () => {
  it('throws a descriptive "bare" error naming the recovery command', () => {
    const repo = makeRepo();
    // Reproduce the exact incident: a corrupted op flips core.bare=true.
    runGit(['config', 'core.bare', 'true'], repo);

    expect(() => getRepoRoot(repo)).toThrowError(/bare \(core\.bare=true\)/);
    expect(() => getRepoRoot(repo)).toThrowError(/git config core\.bare false/);
  });
});

describe('mergeToBranch — real bare repo (RES-99 crash path)', () => {
  it('returns a clean error instead of throwing — the orchestrator survives', () => {
    const repo = makeRepo();
    runGit(['config', 'core.bare', 'true'], repo);

    // mergeToBranch resolves the main repo via getRepoRoot(), which uses
    // process.cwd(). vitest workers forbid process.chdir(), so point the
    // main-repo resolution at the bare throwaway repo by stubbing cwd. This
    // reproduces the EXACT incident: the orchestrator running with a
    // core.bare=true main repo, mid-merge.
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(repo);
    try {
      let result: ReturnType<typeof mergeToBranch> | undefined;
      expect(() => {
        result = mergeToBranch(
          path.join(repo, 'wt'),
          'ticket/res-x',
          'master',
          'Closes RES-X',
        );
      }).not.toThrow();

      expect(result!.exitCode).toBe(1);
      expect(result!.stderr).toContain('bare');
    } finally {
      cwdSpy.mockRestore();
    }
  });
});

describe('recovery after the transient', () => {
  it('getRepoRoot works again once core.bare is flipped back to false', () => {
    const repo = makeRepo();
    runGit(['config', 'core.bare', 'true'], repo);
    expect(() => getRepoRoot(repo)).toThrowError(/bare/);

    // Root-cause fix / operator recovery: flip it back.
    runGit(['config', 'core.bare', 'false'], repo);
    expect(getRepoRoot(repo)).toBe(path.resolve(repo));
  });

  it('mergeToBranch succeeds again once core.bare is flipped back (transient, not permanent)', () => {
    const repo = makeRepo();
    runGit(['config', 'core.bare', 'true'], repo);
    runGit(['config', 'core.bare', 'false'], repo);

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(repo);
    try {
      // Healthy repo → the merge proceeds past getRepoRoot. There is no
      // origin remote in the throwaway repo, so it fails cleanly at fetch
      // — but crucially it no longer reports a BARE fault (the transient
      // has passed) and it still does NOT throw.
      let result: ReturnType<typeof mergeToBranch> | undefined;
      expect(() => {
        result = mergeToBranch(
          path.join(repo, 'wt'),
          'ticket/res-x',
          'master',
          'Closes RES-X',
        );
      }).not.toThrow();
      expect(result!.exitCode).not.toBe(0);
      expect(result!.stderr).not.toContain('bare');
    } finally {
      cwdSpy.mockRestore();
    }
  });
});
