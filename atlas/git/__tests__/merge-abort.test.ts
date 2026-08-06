/**
 * Tests for RES-110 merge-abort hardening at the git layer.
 *
 * The bug: mergeToBranch left a conflicted merge IN PROGRESS in the main
 * repo when the worker's branch conflicted with master. MERGE_HEAD +
 * conflict markers then broke EVERY subsequent push (the pre-push hook
 * lints the whole tree), stalling the entire board until a human aborted
 * (observed: RES-103 — three orphaned merges, manual abort ×3 recovery).
 *
 * Fixes under test:
 *  1. abortInProgressMerge — aborts a stale/in-progress merge and restores
 *     the tree clean, PRESERVING legitimately staged/unstaged work on files
 *     NOT involved in the conflict (the boss stages atlas fixes in the same
 *     tree; a bare `git merge --abort` wiped them twice — see AGENTS.md).
 *  2. mergeToBranch PRE-FLIGHT — clears a stale MERGE_HEAD (crashed worker)
 *     before the dirty-tree guard, so the guard doesn't defer forever on
 *     conflict-marker porcelain output.
 *  3. mergeToBranch CONFLICT path — aborts the conflicted merge and returns
 *     a retryable error carrying the conflict details (strategy layer
 *     re-queues the ticket instead of the board stalling).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Mock child_process at the module level (spawnSync is a read-only ESM
// export — can't spyOn it). node:fs stays REAL so tests create an actual
// .git/MERGE_HEAD file in a temp dir.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { hasMergeInProgress, abortInProgressMerge, mergeToBranch } from '../operations';

type SpawnCall = { cmd: string; args: string[]; options?: unknown };

function gitResult(stdout = '', status = 0, stderr = '') {
  return { stdout, stderr, status, pid: 0, output: [], signal: null };
}

interface MockOpts {
  repoRoot: string;
  mergeStatus?: number;
  mergeStderr?: string;
  conflictedFiles?: string[];
  conflictedStatus?: number;
  stagedPatch?: string;
  unstagedPatch?: string;
  abortStatus?: number;
}

/** Configurable git mock; records every spawn call for ordering assertions. */
function mockGit(opts: MockOpts): SpawnCall[] {
  const calls: SpawnCall[] = [];
  vi.mocked(cp.spawnSync).mockImplementation(((cmd: unknown, args: unknown, options?: unknown) => {
    const c = String(cmd);
    const a = (args as string[] ?? []).join(' ');
    calls.push({ cmd: c, args: args as string[], options });
    if (c === 'git' && a.includes('--show-toplevel')) return gitResult(opts.repoRoot + '\n');
    if (c === 'git' && a.includes('status') && a.includes('--porcelain')) return gitResult('');
    if (c === 'git' && a.includes('diff') && a.includes('--name-only') && a.includes('--diff-filter=U')) {
      return gitResult((opts.conflictedFiles ?? []).join('\n'), opts.conflictedStatus ?? 0);
    }
    // A diff restricted with :(exclude) pathspecs returns nothing — the
    // conflicted files' marker content is filtered out (real git behavior).
    if (c === 'git' && a.includes('diff') && a.includes(':(exclude)')) return gitResult('');
    if (c === 'git' && a.includes('diff') && a.includes('--cached')) {
      return gitResult(opts.stagedPatch ?? '');
    }
    if (c === 'git' && a.includes('diff')) {
      return gitResult(opts.unstagedPatch ?? '');
    }
    if (c === 'git' && a.includes('merge') && a.includes('--abort')) {
      return gitResult('', opts.abortStatus ?? 0);
    }
    if (c === 'git' && a.includes('merge')) {
      return gitResult('', opts.mergeStatus ?? 0, opts.mergeStderr ?? '');
    }
    if (c === 'git' && a.includes('apply')) return gitResult('');
    if (c === 'git' && a.includes('fetch')) return gitResult('');
    if (c === 'git' && a.includes('checkout')) return gitResult('');
    if (c === 'git' && a.includes('pull')) return gitResult('');
    if (c === 'git' && a.includes('push')) return gitResult('');
    return gitResult('', 128, 'no remote');
  }) as any);
  return calls;
}

describe('hasMergeInProgress', () => {
  it('returns false when no .git/MERGE_HEAD exists', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-no-merge-'));
    try {
      expect(hasMergeInProgress(repo)).toBe(false);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('returns true when .git/MERGE_HEAD exists (stale/conflicted merge)', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-stale-merge-'));
    try {
      fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
      fs.writeFileSync(path.join(repo, '.git', 'MERGE_HEAD'), 'refs/heads/master\n');
      expect(hasMergeInProgress(repo)).toBe(true);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('abortInProgressMerge', () => {
  let repo: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-abort-'));
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function writeMergeHead(): void {
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.git', 'MERGE_HEAD'), 'refs/heads/master\n');
  }

  it('is a no-op when no merge is in progress', () => {
    mockGit({ repoRoot: repo });
    const result = abortInProgressMerge(repo);
    expect(result.aborted).toBe(false);
    expect(result.note).toContain('no merge in progress');
    const calls = vi.mocked(cp.spawnSync).mock.calls.map((c) => (c[1] as string[] ?? []).join(' '));
    expect(calls.some((c) => c.includes('merge --abort'))).toBe(false);
  });

  it('aborts an in-progress merge and reports conflicted files', () => {
    writeMergeHead();
    const calls = mockGit({ repoRoot: repo, conflictedFiles: ['src/foo.ts', 'src/bar.vue'] });

    const result = abortInProgressMerge(repo);

    expect(result.aborted).toBe(true);
    expect(result.note).toContain('2 conflicted file(s)');
    const joined = calls.map((c) => c.args.join(' '));
    expect(joined.some((c) => c.includes('merge --abort'))).toBe(true);
    // Conflicted-file list was probed so the restore can exclude them
    expect(joined.some((c) => c.includes('--diff-filter=U'))).toBe(true);
  });

  it('returns aborted:false (with note) when git merge --abort itself fails', () => {
    writeMergeHead();
    mockGit({ repoRoot: repo, abortStatus: 128 });
    const result = abortInProgressMerge(repo);
    expect(result.aborted).toBe(false);
    expect(result.note).toContain('merge --abort failed');
  });

  it('preserves legitimately STAGED work by re-applying it after the abort', () => {
    writeMergeHead();
    const patch = 'diff --git a/atlas/orchestrator/server.ts b/atlas/orchestrator/server.ts\nindex 0000000..1111111 100644\n--- a/atlas/orchestrator/server.ts\n+++ b/atlas/orchestrator/server.ts\n@@ -1,2 +1,3 @@\n foo\n+bar\n';
    const calls = mockGit({ repoRoot: repo, stagedPatch: patch });

    const result = abortInProgressMerge(repo);

    expect(result.aborted).toBe(true);
    expect(result.note).toContain('restored: staged');
    const applyCall = calls.find((c) => c.args.includes('apply') && c.args.includes('--cached'));
    expect(applyCall).toBeDefined();
    // The patch is fed to `git apply --cached` via stdin (input option).
    // execGit trims stdout, so the trailing newline is stripped.
    expect((applyCall!.options as { input?: string })?.input).toBe(patch.trim());
  });

  it('does NOT restore unstaged changes to files involved in the conflict (conflict markers)', () => {
    writeMergeHead();
    // The unstaged diff would contain conflict markers for src/foo.ts —
    // the exclude pathspec must keep them out of the restore.
    const calls = mockGit({
      repoRoot: repo,
      conflictedFiles: ['src/foo.ts'],
      unstagedPatch: 'diff --git a/src/foo.ts b/src/foo.ts\n<<<<<<< HEAD\n',
    });

    const result = abortInProgressMerge(repo);

    expect(result.aborted).toBe(true);
    // The unstaged-diff probe excludes the conflicted file
    const diffCall = calls.find((c) => c.args[0] === 'diff' && c.args.includes('--') && !c.args.includes('--cached'));
    expect(diffCall?.args).toContain(':(exclude)src/foo.ts');
    // No apply happened because the excluded diff is empty (nothing to restore)
    const applyCalls = calls.filter((c) => c.args.includes('apply'));
    expect(applyCalls.length).toBe(0);
  });

  it('skips the unstaged restore entirely when the conflicted-file list cannot be computed', () => {
    writeMergeHead();
    const calls = mockGit({
      repoRoot: repo,
      conflictedStatus: 128,
      unstagedPatch: 'diff --git a/src/foo.ts b/src/foo.ts\n<<<<<<< HEAD\n',
    });

    const result = abortInProgressMerge(repo);

    expect(result.aborted).toBe(true);
    // No `git diff -- .` probe (can't know which files are conflicted, so a
    // blind restore could re-apply conflict markers — the failure this fixes)
    const unstagedProbe = calls.find((c) => c.args[0] === 'diff' && c.args.includes('--') && !c.args.includes('--cached'));
    expect(unstagedProbe).toBeUndefined();
  });
});

describe('mergeToBranch — RES-110 merge-abort integration', () => {
  let repo: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-mtb-abort-'));
    process.env.ATLAS_MERGE_DIRTY_TIMEOUT_MS = '1500';
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
    delete process.env.ATLAS_MERGE_DIRTY_TIMEOUT_MS;
    vi.restoreAllMocks();
  });

  function writeMergeHead(): void {
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.git', 'MERGE_HEAD'), 'refs/heads/master\n');
  }

  it('clears a STALE in-progress merge before the dirty guard and proceeds', () => {
    writeMergeHead();
    const calls = mockGit({ repoRoot: repo });

    const result = mergeToBranch('/tmp/wt', 'ticket/res-x', 'master', 'msg');

    // Merge succeeded end-to-end (clean state after the stale abort)
    expect(result.exitCode).toBe(0);
    const joined = calls.map((c) => c.args.join(' '));
    const abortIdx = joined.findIndex((c) => c.includes('merge --abort'));
    const fetchIdx = joined.findIndex((c) => c.includes('fetch origin'));
    expect(abortIdx).toBeGreaterThanOrEqual(0);
    // Stale merge aborted BEFORE the merge pipeline (fetch) started
    expect(abortIdx).toBeLessThan(fetchIdx);
    // And a real merge + push still happened
    expect(joined.some((c) => c.includes('merge ticket/res-x -m'))).toBe(true);
    expect(joined.some((c) => c.includes('push origin master'))).toBe(true);
  });

  it('aborts a CONFLICTED merge and returns the conflict details (tree restored clean)', () => {
    writeMergeHead();
    const calls = mockGit({
      repoRoot: repo,
      mergeStatus: 1,
      mergeStderr: 'CONFLICT (content): Merge conflict in src/useResumeData.ts\nCONFLICT (modify/delete): src/ResumeBuilder.vue',
    });

    const result = mergeToBranch('/tmp/wt', 'ticket/res-x', 'master', 'msg');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Merge conflict detected');
    expect(result.stderr).toContain('CONFLICT (content)');
    expect(result.stderr).toContain('aborted in-progress merge');
    expect(result.stderr).toContain('tree restored clean');
    expect(result.stderr).toContain('ticket re-queued');
    // TWO aborts: the pre-flight stale-merge clear (MERGE_HEAD was present)
    // and the abort of the fresh conflict after the merge failed. The LAST
    // abort must come AFTER the merge — that is the one that guarantees no
    // MERGE_HEAD + conflict markers are left behind in the main repo.
    const joined = calls.map((c) => c.args.join(' '));
    const abortCalls = joined.filter((c) => c.includes('merge --abort'));
    expect(abortCalls.length).toBeGreaterThanOrEqual(2);
    const mergeIdx = joined.findIndex((c) => c.includes('merge ticket/res-x -m'));
    let lastAbortIdx = -1;
    joined.forEach((c, i) => { if (c.includes('merge --abort')) lastAbortIdx = i; });
    expect(lastAbortIdx).toBeGreaterThan(mergeIdx);
  });
});
