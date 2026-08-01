/**
 * GitHub PR + comment API client.
 * Used for PR comment monitoring, merge conflict detection, and webhook handling.
 */

import * as cp from 'node:child_process';
import type { PRInfo, PRComment } from './types.js';
import { getRepoRoot, getGitHubRepo } from './git.js';
import { getAgentConfig } from './orchestrator.js';

// ─── Token ──────────────────────────────────────────────────────────

function getGitHubToken(): string {
  const config = getAgentConfig();
  if (config.githubToken) return config.githubToken;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  throw new Error('No GitHub token found. Set GITHUB_PAT_KEY in .env.agent or GITHUB_TOKEN env var.');
}

function getRepo(): { owner: string; repo: string } {
  const r = getGitHubRepo();
  if (!r) throw new Error('Could not determine GitHub repo from git remote.');
  return r;
}

// ─── API Helpers ────────────────────────────────────────────────────

async function ghApi<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getGitHubToken();
  const resp = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers as Record<string, string> ?? {}),
    },
  });
  if (!resp.ok) {
    throw new Error(`GitHub API ${resp.status} ${resp.url}: ${await resp.text()}`);
  }
  return resp.json() as Promise<T>;
}

// ─── PRs ────────────────────────────────────────────────────────────

/** List open PRs, optionally filtered by branch prefix. */
export async function listOpenPRs(): Promise<PRInfo[]> {
  const { owner, repo } = getRepo();
  const prs = await ghApi<any[]>(`/repos/${owner}/${repo}/pulls?state=open&per_page=50`);

  return prs.map((pr) => {
    // Extract ticket identifier from branch name: ticket/res-6 → RES-6
    const branch = pr.head?.ref ?? '';
    const ticketMatch = branch.match(/ticket\/([a-z]+-\d+)/i);
    const ticketId = ticketMatch ? ticketMatch[1]!.toUpperCase() : null;

    return {
      number: pr.number,
      url: pr.html_url,
      title: pr.title,
      branch,
      ticketIdentifier: ticketId,
    };
  });
}

// ─── Comments ───────────────────────────────────────────────────────

/** Check if a bot or the PR author has replied to a comment. */
function hasReply(comment: any, allComments: any[]): boolean {
  const commentTime = new Date(comment.created_at).getTime();
  const commentUser = comment.user?.login;
  const prAuthor = comment._prAuthor;

  for (const c of allComments) {
    if (c.id === comment.id) continue;
    const cTime = new Date(c.created_at).getTime();
    // A reply is any comment after this one by a different user
    // Ignore the original PR body (issue comment by PR author at PR creation)
    if (cTime > commentTime && c.user?.login !== commentUser) {
      return true;
    }
  }
  return false;
}

/** Check if a comment has been addressed (resolved/replied by bot). */
function isAddressed(comment: any, allComments: any[]): boolean {
  const commentTime = new Date(comment.created_at).getTime();
  for (const c of allComments) {
    const cTime = new Date(c.created_at).getTime();
    if (cTime > commentTime) {
      // Check if this comment is from a bot or mentions resolution
      const body = (c.body ?? '').toLowerCase();
      const isBot = c.user?.login?.includes('bot') || c.user?.type === 'Bot';
      const mentionsResolution = body.includes('addressed') || body.includes('fixed') || body.includes('resolved') || body.includes('done');
      if (isBot || mentionsResolution) return true;
    }
  }
  return false;
}

/** Get unaddressed review comments on a PR (comments from humans that haven't been replied to). */
export async function getUnaddressedComments(prNumber: number): Promise<PRComment[]> {
  const { owner, repo } = getRepo();

  // Fetch PR details to know the author
  const pr = await ghApi<any>(`/repos/${owner}/${repo}/pulls/${prNumber}`);

  // Fetch all comments (issue comments + review comments)
  const [issueComments, reviewComments] = await Promise.all([
    ghApi<any[]>(`/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=50`),
    ghApi<any[]>(`/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=50`),
  ]);

  const prAuthor = pr.user?.login;
  // Combine and tag with PR author
  const allComments = [
    ...issueComments.map((c: any) => ({ ...c, _prAuthor: prAuthor, _type: 'issue' })),
    ...reviewComments.map((c: any) => ({ ...c, _prAuthor: prAuthor, _type: 'review' })),
  ];

  const unaddressed: PRComment[] = [];

  for (const comment of allComments) {
    // Skip bot comments
    const user = comment.user?.login ?? '';
    if (user.includes('bot') || user === 'github-actions') continue;
    // Skip PR author's own comments (they're self-notes)
    if (user === prAuthor) continue;

    if (!hasReply(comment, allComments) && !isAddressed(comment, allComments)) {
      unaddressed.push({
        id: comment.id,
        user,
        body: comment.body ?? '',
        createdAt: comment.created_at,
        prNumber,
      });
    }
  }

  return unaddressed;
}

/** Scan all open PRs for unaddressed comments. Returns a map of ticket ID → unaddressed comments. */
export async function scanAllPRComments(): Promise<Map<string, PRComment[]>> {
  const prs = await listOpenPRs();
  const result = new Map<string, PRComment[]>();

  for (const pr of prs) {
    if (!pr.ticketIdentifier) continue;
    try {
      const comments = await getUnaddressedComments(pr.number);
      if (comments.length > 0) {
        result.set(pr.ticketIdentifier, comments);
      }
    } catch (err) {
      console.error(`Failed to fetch comments for PR #${pr.number}:`, (err as Error).message);
    }
  }

  return result;
}

// ─── Merge Conflicts ────────────────────────────────────────────────

interface FileChange {
  filename: string;
  status: string;
}

/** Get the list of files changed in a PR. */
export async function getPRFiles(prNumber: number): Promise<FileChange[]> {
  const { owner, repo } = getRepo();
  const files = await ghApi<any[]>(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`);
  return files.map((f: any) => ({
    filename: f.filename,
    status: f.status,
  }));
}

/** Find merge conflicts among open PRs. Returns pairs of PRs that touch the same files. */
export async function findMergeConflicts(): Promise<Array<{ pr1: PRInfo; pr2: PRInfo; files: string[] }>> {
  const prs = await listOpenPRs();
  const conflicts: Array<{ pr1: PRInfo; pr2: PRInfo; files: string[] }> = [];

  // Get file lists for all PRs
  const prFiles = new Map<number, FileChange[]>();
  for (const pr of prs) {
    try {
      prFiles.set(pr.number, await getPRFiles(pr.number));
    } catch (err) {
      console.error(`Failed to get files for PR #${pr.number}:`, (err as Error).message);
    }
  }

  // Check all pairs
  for (let i = 0; i < prs.length; i++) {
    for (let j = i + 1; j < prs.length; j++) {
      const files1 = prFiles.get(prs[i]!.number) ?? [];
      const files2 = prFiles.get(prs[j]!.number) ?? [];
      const overlapping = files1
        .filter((f) => files2.some((f2) => f2.filename === f.filename))
        .map((f) => f.filename);

      if (overlapping.length > 0) {
        conflicts.push({ pr1: prs[i]!, pr2: prs[j]!, files: overlapping });
      }
    }
  }

  return conflicts;
}

/** Get merge conflicts involving a specific ticket's PR. */
export async function getConflictsForTicket(ticketId: string): Promise<string[]> {
  const conflicts = await findMergeConflicts();
  for (const conflict of conflicts) {
    if (conflict.pr1.ticketIdentifier === ticketId || conflict.pr2.ticketIdentifier === ticketId) {
      const other = conflict.pr1.ticketIdentifier === ticketId ? conflict.pr2 : conflict.pr1;
      const fileList = conflict.files.slice(0, 10).join(', ');
      const suffix = conflict.files.length > 10 ? ` and ${conflict.files.length - 10} more` : '';
      return [`Merge conflict with ${other.ticketIdentifier ?? 'unknown'} (PR #${other.number}): ${fileList}${suffix}`];
    }
  }
  return [];
}

/** Check if an individual PR has merge conflicts against its base branch. */
export async function checkPRMergeConflict(prNumber: number): Promise<{ hasConflict: boolean; state: string }> {
  try {
    const { owner, repo } = getRepo();
    const pr = await ghApi<any>(`/repos/${owner}/${repo}/pulls/${prNumber}`);
    const state = pr.mergeable_state ?? 'unknown';
    return { hasConflict: state === 'dirty' || state === 'behind', state };
  } catch {
    return { hasConflict: false, state: 'unknown' };
  }
}

/** Scan all open PRs for merge conflicts against their base branch. Returns ticket IDs with conflicts. */
export async function findBaseConflictPRs(): Promise<Map<string, string>> {
  const prs = await listOpenPRs();
  const result = new Map<string, string>();
  for (const pr of prs) {
    if (!pr.ticketIdentifier) continue;
    try {
      const { hasConflict, state } = await checkPRMergeConflict(pr.number);
      if (hasConflict) {
        result.set(pr.ticketIdentifier, `PR #${pr.number} is ${state} — needs rebase against base branch`);
      }
    } catch { /* skip */ }
  }
  return result;
}

/** Check if a ticket's PR is clean — no pending comments, no merge conflicts, mergeable. */
export async function isPRClean(ticketId: string): Promise<boolean> {
  const prs = await listOpenPRs();
  const pr = prs.find(p => p.ticketIdentifier === ticketId);
  if (!pr) return false; // No PR exists — needs work

  try {
    // Check for unaddressed comments
    const comments = await getUnaddressedComments(pr.number);
    if (comments.length > 0) return false;

    // Check for merge conflicts
    const { hasConflict } = await checkPRMergeConflict(pr.number);
    if (hasConflict) return false;

    return true;
  } catch {
    return false;
  }
}

// ─── Webhook Registration ───────────────────────────────────────────

/** Register a GitHub webhook for the repo at the given base URL. */
export async function registerWebhook(baseUrl: string): Promise<string | null> {
  try {
    const { owner, repo } = getRepo();
    const token = getGitHubToken();

    // Check existing webhooks
    const existing = await ghApi<any[]>(`/repos/${owner}/${repo}/hooks?per_page=50`);
    const webhookUrl = `${baseUrl}/github-webhook`;

    // Check if any webhook already points to our path (regardless of host)
    const exists = existing.find((h: any) => h.config?.url?.endsWith('/github-webhook'));
    if (exists) {
      // Update the existing webhook to the new URL
      await ghApi(`/repos/${owner}/${repo}/hooks/${exists.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { ...exists.config, url: webhookUrl } }),
      });
      return `Webhook updated: ${webhookUrl} (id: ${exists.id})`;
    }

    await ghApi(`/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['pull_request', 'issue_comment', 'pull_request_review_comment'],
        config: {
          url: webhookUrl,
          content_type: 'json',
          insecure_ssl: '1', // for localhost
        },
      }),
    });

    return `Webhook registered: ${webhookUrl}`;
  } catch (err) {
    return `Webhook registration failed: ${(err as Error).message}`;
  }
}

/** Unregister all localhost webhooks. */
export async function unregisterWebhooks(): Promise<void> {
  try {
    const { owner, repo } = getRepo();
    const hooks = await ghApi<any[]>(`/repos/${owner}/${repo}/hooks?per_page=50`);
    for (const hook of hooks) {
      if (hook.config?.url?.includes('localhost')) {
        await ghApi(`/repos/${owner}/${repo}/hooks/${hook.id}`, { method: 'DELETE' });
      }
    }
  } catch { /* best effort */ }
}
