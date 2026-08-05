/**
 * Git worktree, branch, merge, and status operations.
 */

import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function execGit(args: string[], cwd?: string, timeout = 30_000): GitResult {
  try {
    const result = cp.spawnSync('git', args, {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf-8',
      timeout,
    });
    return {
      stdout: (result.stdout ?? '').trim(),
      stderr: (result.stderr ?? '').trim(),
      exitCode: result.status ?? 1,
    };
  } catch (err: any) {
    return { stdout: '', stderr: err.message, exitCode: 1 };
  }
}

// ─── Repo ───────────────────────────────────────────────────────────

export function getRepoRoot(): string {
  const result = execGit(['rev-parse', '--show-toplevel']);
  if (result.exitCode !== 0) {
    throw new Error('Not in a git repository');
  }
  return result.stdout;
}

export function getDefaultBranch(): string {
  const originHead = execGit(['rev-parse', '--abbrev-ref', 'origin/HEAD']);
  if (originHead.exitCode === 0 && originHead.stdout) {
    return originHead.stdout.replace('origin/', '');
  }
  for (const name of ['main', 'master']) {
    const check = execGit(['rev-parse', '--verify', name]);
    if (check.exitCode === 0) return name;
  }
  return 'main';
}

export function getGitHubRepo(): { owner: string; repo: string } | null {
  const result = execGit(['remote', 'get-url', 'origin']);
  if (result.exitCode !== 0) return null;
  const match = result.stdout.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) return null;
  return { owner: match[1]!, repo: match[2]! };
}

// ─── Branch ─────────────────────────────────────────────────────────

export function branchName(identifier: string): string {
  const slug = identifier.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `ticket/${slug}`;
}

export function branchExists(branch: string, cwd?: string): boolean {
  const result = execGit(['rev-parse', '--verify', branch], cwd);
  return result.exitCode === 0;
}

// ─── Worktree ───────────────────────────────────────────────────────

export function ensureWorktree(
  repoRoot: string,
  identifier: string,
  baseBranch: string,
  worktreesDir: string,
): { worktreePath: string; branch: string; created: boolean } {
  const branch = branchName(identifier);
  const worktreePath = path.join(worktreesDir, identifier);
  const branchExistsFlag = branchExists(branch, repoRoot);
  const worktreeExists = fs.existsSync(worktreePath);

  if (worktreeExists) {
    return { worktreePath, branch, created: false };
  }

  if (!branchExistsFlag) {
    let createResult = execGit(['branch', branch, `origin/${baseBranch}`], repoRoot);
    if (createResult.exitCode !== 0) {
      createResult = execGit(['branch', branch, baseBranch], repoRoot);
    }
    if (createResult.exitCode !== 0) {
      createResult = execGit(['branch', branch, 'HEAD'], repoRoot);
    }
    if (createResult.exitCode !== 0) {
      throw new Error(`Failed to create branch ${branch}: ${createResult.stderr}`);
    }
  }

  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  const addResult = execGit(['worktree', 'add', worktreePath, branch], repoRoot);
  if (addResult.exitCode !== 0) {
    throw new Error(`Failed to create worktree at ${worktreePath}: ${addResult.stderr}`);
  }

  return { worktreePath, branch, created: true };
}

export function syncWorktree(worktreePath: string, baseBranch: string): GitResult {
  const stashResult = execGit(['stash', '--include-untracked'], worktreePath);
  const hasStash = stashResult.stdout !== 'No local changes to save';

  execGit(['fetch', 'origin', baseBranch], worktreePath);
  const pullResult = execGit(['pull', 'origin', baseBranch, '--rebase'], worktreePath);

  if (hasStash) {
    execGit(['stash', 'pop'], worktreePath);
  }

  return pullResult;
}

export function removeWorktree(repoRoot: string, worktreePath: string): void {
  try {
    execGit(['worktree', 'remove', '--force', worktreePath], repoRoot);
  } catch { /* ignore */ }
  // NOTE: We do NOT delete the branch — it preserves commit history
  // for manual recovery or later PR creation.
}

// ─── Commit & Push ──────────────────────────────────────────────────

export function commitAll(worktreePath: string, message: string): GitResult {
  execGit(['add', '-A'], worktreePath);
  return execGit(['commit', '-m', message, '--allow-empty'], worktreePath);
}

export function pushBranch(worktreePath: string, branch: string): GitResult {
  return execGit(['push', '-u', 'origin', branch], worktreePath);
}

// ─── Merge ──────────────────────────────────────────────────────────

/**
 * Merge the worker's branch into the target branch and push.
 * Runs from the MAIN repo directory (worktrees cannot checkout branches
 * that are already checked out in another worktree).
 */
export function mergeToBranch(
  worktreePath: string,
  sourceBranch: string,
  targetBranch: string,
  commitMessage: string,
): GitResult {
  const mainRepo = getRepoRoot();

  // Fetch latest
  const fetchResult = execGit(['fetch', 'origin'], mainRepo);
  if (fetchResult.exitCode !== 0) return fetchResult;

  // Checkout target branch in main repo
  const checkoutResult = execGit(['checkout', targetBranch], mainRepo);
  if (checkoutResult.exitCode !== 0) return checkoutResult;

  // Pull latest
  const pullResult = execGit(['pull', 'origin', targetBranch], mainRepo);
  if (pullResult.exitCode !== 0) return pullResult;

  // Merge
  const mergeResult = execGit(['merge', sourceBranch, '-m', commitMessage], mainRepo);
  if (mergeResult.exitCode !== 0) return mergeResult;

  // Push
  return execGit(['push', 'origin', targetBranch], mainRepo);
}

// ─── Status ─────────────────────────────────────────────────────────

export function isClean(worktreePath: string): boolean {
  const result = execGit(['status', '--porcelain'], worktreePath);
  return result.stdout === '';
}

const GENERATED_FILES = ['frontend/resume.pdf'];

/**
 * Check whether a branch's head is an ancestor of the target branch
 * (i.e. the branch was actually merged into it). Runs in the worktree's
 * git context (shared object store). Returns false on any error.
 */
export function isBranchMergedTo(
  worktreePath: string,
  branch: string,
  targetBranch: string,
): boolean {
  try {
    const result = execGit(
      ['merge-base', '--is-ancestor', branch, targetBranch],
      worktreePath,
    );
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Check if the branch contains meaningful changes beyond generated files.
 */
export function hasMeaningfulWork(worktreePath: string, baseBranch: string): boolean {
  try {
    const result = execGit(
      ['diff', '--name-only', baseBranch, 'HEAD'],
      worktreePath,
    );
    const files = result.stdout.split('\n').filter(Boolean);
    return files.some((f) => !GENERATED_FILES.includes(f));
  } catch {
    return false;
  }
}

/**
 * Check if the worktree branch has any commits beyond the base branch.
 */
export function hasExistingWork(worktreePath: string, baseBranch: string): boolean {
  try {
    const result = execGit(
      ['rev-list', '--count', `${baseBranch}..HEAD`],
      worktreePath,
    );
    const count = parseInt(result.stdout || '0', 10);
    return !isNaN(count) && count > 0;
  } catch {
    return false;
  }
}

export function getLastCommitMessage(worktreePath: string): string | null {
  const result = execGit(['log', '-1', '--format=%s'], worktreePath);
  return result.exitCode === 0 && result.stdout ? result.stdout : null;
}

/**
 * Check if a branch has been merged into the target branch.
 */
export function isBranchMerged(branch: string, targetBranch: string): boolean {
  const result = execGit(['branch', '--merged', targetBranch], getRepoRoot());
  return result.stdout.includes(branch);
}
