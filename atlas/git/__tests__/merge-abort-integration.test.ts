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
 * Real-git verification for RES-110: mergeToBranch left conflicted merges
 * IN PROGRESS in the main repo (MERGE_HEAD + conflict markers), which broke
 * every subsequent push and stalled the whole board (observed: RES-103).
 *
 * These tests reproduce the EXACT incident against real git and prove:
 *
 *  1. A CONFLICTED merge is aborted: mergeToBranch returns a retryable
 *     error carrying the conflict details, and the main repo is left with
 *     NO .git/MERGE_HEAD and a CLEAN working tree (no conflict markers) —
 *     the pre-push hook can never choke on the next push.
 *  2. A STALE in-progress merge (crashed worker left MERGE_HEAD behind) is
 *     cleared pre-flight before the merge pipeline starts.
 *  3. The happy path (no conflict) still merges and pushes successfully.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as cp from 'node:child_process';

// See WARNING above — isolate this suite from any inherited GIT_* env vars.
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

import { mergeToBranch, hasMergeInProgress } from '../operations';

let tmpDirs: string[] = [];
let cwdSpy: { mockRestore(): void } | null = null;

function runGit(args: string[], cwd: string, allowFailure = false): cp.SpawnSyncReturns<string> {
  const env = { ...process.env };
  for (const key of GIT_ENV_KEYS) {
    delete env[key];
  }
  const res = cp.spawnSync('git', args, { cwd, encoding: 'utf-8', env });
  if (res.status !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(' ')} failed: ${res.stderr || res.stdout}`);
  }
  return res;
}

/** Create origin (bare) + a working clone with git identity configured. */
function makeRepoPair(): { origin: string; repo: string } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-merge-abort-'));
  tmpDirs.push(tmp);
  const origin = path.join(tmp, 'origin.git');
  const repo = path.join(tmp, 'repo');
  runGit(['init', '--bare', '-b', 'master', origin], tmp);
  runGit(['clone', origin, repo], tmp);
  runGit(['config', 'user.email', 'test@example.com'], repo);
  runGit(['config', 'user.name', 'Test Agent'], repo);
  fs.writeFileSync(path.join(repo, 'file.txt'), 'base\n');
  runGit(['add', '.'], repo);
  runGit(['commit', '-m', 'base'], repo);
  runGit(['push', '-u', 'origin', 'master'], repo);
  return { origin, repo };
}

/**
 * Create a feature branch that conflicts with master:
 *  - ticket/res-x edits line 1 of file.txt (feature change)
 *  - master edits line 1 of file.txt DIFFERENTLY (landed by another ticket)
 * Both pushed to origin, so mergeToBranch's fetch/checkout/pull see them.
 */
function makeConflictingBranches(repo: string): void {
  runGit(['checkout', '-b', 'ticket/res-x'], repo);
  fs.writeFileSync(path.join(repo, 'file.txt'), 'feature\n');
  runGit(['add', '.'], repo);
  runGit(['commit', '-m', 'feature change'], repo);
  runGit(['push', '-u', 'origin', 'ticket/res-x'], repo);

  runGit(['checkout', 'master'], repo);
  fs.writeFileSync(path.join(repo, 'file.txt'), 'other-ticket\n');
  runGit(['add', '.'], repo);
  runGit(['commit', '-m', 'master change'], repo);
  runGit(['push', '-u', 'origin', 'master'], repo);
}

afterEach(() => {
  cwdSpy?.mockRestore();
  cwdSpy = null;
  for (const d of tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpDirs = [];
});

describe('mergeToBranch — real conflicted merge (RES-110 incident)', () => {
  let repo: string;

  beforeEach(() => {
    const pair = makeRepoPair();
    repo = pair.repo;
    makeConflictingBranches(repo);
  });

  it('aborts the conflicted merge: clean tree, no MERGE_HEAD, conflict details returned', () => {
    // Point the main-repo resolution (getRepoRoot uses process.cwd()) at
    // the throwaway repo — this is the orchestrator running its merge in
    // the main repo working tree.
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(repo);

    let result: ReturnType<typeof mergeToBranch> | undefined;
    expect(() => {
      result = mergeToBranch(
        path.join(repo, 'wt'),
        'ticket/res-x',
        'master',
        'Closes RES-X',
      );
    }).not.toThrow();

    // Retryable error carrying the conflict details (strategy layer
    // re-queues the ticket with them).
    expect(result!.exitCode).toBe(1);
    expect(result!.stderr).toContain('Merge conflict detected');
    expect(result!.stderr).toContain('CONFLICT');
    expect(result!.stderr).toContain('tree restored clean');
    expect(result!.stderr).toContain('ticket re-queued');

    // ⚠️ The acceptance criterion: NO MERGE_HEAD and NO conflict markers
    // left behind — the next push's pre-push hook sees a clean tree.
    expect(fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD'))).toBe(false);
    expect(hasMergeInProgress(repo)).toBe(false);
    const status = runGit(['status', '--porcelain'], repo);
    expect(status.stdout.trim()).toBe('');
    // No conflict markers anywhere in the tree
    const content = fs.readFileSync(path.join(repo, 'file.txt'), 'utf-8');
    expect(content).not.toContain('<<<<<<<');
    expect(content).not.toContain('>>>>>>>');
    // The master branch itself is untouched (merge never landed)
    expect(content).toBe('other-ticket\n');
  });

  it('clears a STALE in-progress merge pre-flight before starting a fresh merge', () => {
    // Simulate a crashed worker: start a conflicted merge and NEVER abort
    // it (the exact RES-103 orphan). MERGE_HEAD + conflict markers persist.
    const orphan = runGit(['merge', 'ticket/res-x', '-m', 'orphaned merge'], repo, true);
    expect(orphan.status).not.toBe(0); // conflicted merge fails as expected
    expect(fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD'))).toBe(true);
    const staleStatus = runGit(['status', '--porcelain'], repo);
    expect(staleStatus.stdout.trim()).not.toBe('');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(repo);

    let result: ReturnType<typeof mergeToBranch> | undefined;
    expect(() => {
      result = mergeToBranch(
        path.join(repo, 'wt'),
        'ticket/res-x',
        'master',
        'Closes RES-X',
      );
    }).not.toThrow();

    // The stale merge was detected and cleared pre-flight (logged)...
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Cleared stale in-progress merge'));
    // ...then the fresh merge ran, conflicted again, and was aborted clean.
    expect(result!.exitCode).toBe(1);
    expect(result!.stderr).toContain('Merge conflict detected');
    expect(fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD'))).toBe(false);
    const status = runGit(['status', '--porcelain'], repo);
    expect(status.stdout.trim()).toBe('');
    warnSpy.mockRestore();
  });

  it('happy path still merges and pushes when there is NO conflict', () => {
    // Non-conflicting branch: touches a DIFFERENT file than master.
    runGit(['checkout', '-b', 'ticket/res-clean'], repo);
    fs.writeFileSync(path.join(repo, 'other.txt'), 'feature\n');
    runGit(['add', '.'], repo);
    runGit(['commit', '-m', 'clean feature'], repo);
    runGit(['push', '-u', 'origin', 'ticket/res-clean'], repo);

    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(repo);

    let result: ReturnType<typeof mergeToBranch> | undefined;
    expect(() => {
      result = mergeToBranch(
        path.join(repo, 'wt'),
        'ticket/res-clean',
        'master',
        'Closes RES-CLEAN',
      );
    }).not.toThrow();

    expect(result!.exitCode).toBe(0);
    // The merged work landed on master (fast-forward — the -m message is
    // ignored for fast-forwards, so assert on the tree + refs instead)
    expect(fs.existsSync(path.join(repo, 'other.txt'))).toBe(true);
    const localMaster = runGit(['rev-parse', 'master'], repo).stdout.trim();
    const remoteMaster = runGit(['ls-remote', 'origin', 'master'], repo).stdout.trim().split(/\s+/)[0];
    expect(remoteMaster).toBe(localMaster); // pushed successfully
  });
});
