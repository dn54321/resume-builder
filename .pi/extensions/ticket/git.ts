/**
 * Git worktree and branch management for ticket workers.
 */

import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function execGit(args: string[], cwd?: string): GitResult {
  try {
    const result = cp.spawnSync('git', args, {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf-8',
      timeout: 30_000,
    });
    return {
      stdout: result.stdout?.trim() ?? '',
      stderr: result.stderr?.trim() ?? '',
      exitCode: result.status ?? 1,
    };
  } catch (err: any) {
    return { stdout: '', stderr: err.message, exitCode: 1 };
  }
}

/** Get the repo root directory. */
export function getRepoRoot(): string {
  const result = execGit(['rev-parse', '--show-toplevel']);
  if (result.exitCode !== 0) {
    throw new Error('Not in a git repository');
  }
  return result.stdout;
}

/** Get the default branch name (main or master). */
export function getDefaultBranch(): string {
  // Try origin/HEAD first
  const originHead = execGit(['rev-parse', '--abbrev-ref', 'origin/HEAD']);
  if (originHead.exitCode === 0 && originHead.stdout) {
    return originHead.stdout.replace('origin/', '');
  }
  // Fallback: check local branches
  for (const name of ['main', 'master']) {
    const check = execGit(['rev-parse', '--verify', name]);
    if (check.exitCode === 0) return name;
  }
  // Last resort: use HEAD
  const head = execGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (head.exitCode === 0 && head.stdout) return head.stdout;
  return 'main';
}

/** Create branch name from ticket identifier. */
export function branchName(identifier: string): string {
  const slug = identifier.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `ticket/${slug}`;
}

/** Ensure a git worktree exists. Returns the worktree path. */
export function ensureWorktree(
  repoRoot: string,
  identifier: string,
  baseBranch: string,
  worktreesDir: string,
): { worktreePath: string; branch: string; created: boolean } {
  const branch = branchName(identifier);
  const worktreePath = path.join(worktreesDir, identifier);
  const branchCheck = execGit(['rev-parse', '--verify', branch], repoRoot);
  const worktreeExists = fs.existsSync(worktreePath);

  const branchExists = branchCheck.exitCode === 0;

  if (worktreeExists) {
    // Worktree already exists — just verify it
    return { worktreePath, branch, created: false };
  }

  if (!branchExists) {
    // Try creating from origin/<base> first, then local <base>, then HEAD
    let createResult = execGit(['branch', branch, `origin/${baseBranch}`], repoRoot);
    if (createResult.exitCode !== 0) {
      createResult = execGit(['branch', branch, baseBranch], repoRoot);
    }
    if (createResult.exitCode !== 0) {
      // Last resort: create from HEAD
      createResult = execGit(['branch', branch, 'HEAD'], repoRoot);
    }
    if (createResult.exitCode !== 0) {
      throw new Error(`Failed to create branch ${branch}: ${createResult.stderr}`);
    }
  }

  // Create worktree
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  const addResult = execGit(['worktree', 'add', worktreePath, branch], repoRoot);
  if (addResult.exitCode !== 0) {
    throw new Error(`Failed to create worktree at ${worktreePath}: ${addResult.stderr}`);
  }

  return { worktreePath, branch, created: true };
}

/** Stash changes, pull from base branch, stash pop. */
export function syncWorktree(worktreePath: string, baseBranch: string): GitResult {
  // Stash any pending changes
  const stashResult = execGit(['stash', '--include-untracked'], worktreePath);
  const hasStash = stashResult.stdout !== 'No local changes to save';

  // Fetch and pull base
  execGit(['fetch', 'origin', baseBranch], worktreePath);
  const pullResult = execGit(['pull', 'origin', baseBranch, '--rebase'], worktreePath);

  // Pop stash if we stashed
  if (hasStash) {
    execGit(['stash', 'pop'], worktreePath);
  }

  return pullResult;
}

/** Stage all changes and commit. */
export function commitAll(worktreePath: string, message: string): GitResult {
  execGit(['add', '-A'], worktreePath);
  return execGit(['commit', '-m', message, '--allow-empty'], worktreePath);
}

/** Push branch to origin. */
export function pushBranch(worktreePath: string, branch: string): GitResult {
  return execGit(['push', '-u', 'origin', branch], worktreePath);
}

/** Create a PR using gh CLI. Returns PR URL. */
export function createPR(
  worktreePath: string,
  branch: string,
  title: string,
  body: string,
  baseBranch: string,
): { url: string | null; error: string | null } {
  try {
    const result = cp.spawnSync('gh', [
      'pr', 'create',
      '--base', baseBranch,
      '--head', branch,
      '--title', title,
      '--body', body,
    ], {
      cwd: worktreePath,
      encoding: 'utf-8',
      timeout: 30_000,
    });

    if (result.status === 0) {
      const url = result.stdout.trim();
      return { url, error: null };
    }
    return { url: null, error: result.stderr?.trim() ?? 'gh pr create failed' };
  } catch (err: any) {
    return { url: null, error: err.message };
  }
}

/*
 * ⚠️ WARNING — Do NOT delete the branch when removing a worktree.
 *
 * RES-45 and RES-46 were lost because `git branch -D` destroyed the
 * only ref to their commits. The branches had been pushed, PR creation
 * had failed silently, and the branch deletion made the commits
 * unreachable (dangling). They were only recoverable via git fsck.
 *
 * Removing the worktree directory is safe — the branch preserves the
 * commit history for manual recovery or later PR creation.
 */
export function removeWorktree(repoRoot: string, worktreePath: string, _branch: string): void {
  try {
    execGit(['worktree', 'remove', '--force', worktreePath], repoRoot);
  } catch {
    // ignore
  }
  // DO NOT delete the branch — it's the only record of the work.
  // Branches are cleaned up by git remote prune / manual review.
}

/** Check if gh CLI is available. */
export function hasGhCLI(): boolean {
  try {
    const result = cp.spawnSync('gh', ['--version'], { encoding: 'utf-8', timeout: 5000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

/** Check current git status — returns true if clean. */
export function isClean(worktreePath: string): boolean {
  const result = execGit(['status', '--porcelain'], worktreePath);
  return result.stdout === '';
}

/** Get the last commit message or null. */
export function getLastCommitMessage(worktreePath: string): string | null {
  const result = execGit(['log', '-1', '--format=%s'], worktreePath);
  if (result.exitCode !== 0 || !result.stdout) return null;
  return result.stdout;
}

/** Get GitHub owner/repo from remote URL. */
export function getGitHubRepo(): { owner: string; repo: string } | null {
  const result = execGit(['remote', 'get-url', 'origin']);
  if (result.exitCode !== 0) return null;
  const url = result.stdout;
  // git@github.com:owner/repo.git → owner/repo
  // https://github.com/owner/repo.git → owner/repo
  const match = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) return null;
  return { owner: match[1]!, repo: match[2]! };
}

/** Create a PR via GitHub REST API (fallback when gh CLI is unavailable). */
export async function createPRViaApi(
  worktreePath: string,
  branch: string,
  title: string,
  body: string,
  baseBranch: string,
  token: string,
): Promise<{ url: string | null; error: string | null }> {
  try {
    const repo = getGitHubRepo();
    if (!repo) return { url: null, error: 'Could not determine GitHub repo from git remote' };

    const resp = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/pulls`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title,
        head: branch,
        base: baseBranch,
        body,
      }),
    });

    const json = await resp.json() as any;
    if (resp.ok && json.html_url) {
      return { url: json.html_url, error: null };
    }
    return { url: null, error: json.message ?? `GitHub API returned ${resp.status}` };
  } catch (err: any) {
    return { url: null, error: err.message };
  }
}
