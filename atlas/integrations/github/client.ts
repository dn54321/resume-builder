/**
 * GitHub REST + GraphQL API client.
 * PR creation, comment scanning, merge conflict detection, webhooks.
 */

import type { PRInfo, PRComment, GitHubRepo } from '../../orchestrator/types';
import { getConfig } from '../../orchestrator/config';

// ─── Token ──────────────────────────────────────────────────────────

function getGitHubToken(): string {
  const envToken = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT_KEY;
  if (envToken) return envToken;

  // Try .env.agent (legacy)
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const envPath = path.join(process.cwd(), '.env.agent');
    if (fs.existsSync(envPath)) {
      const raw = fs.readFileSync(envPath, 'utf-8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        if (trimmed.slice(0, eq).trim() === 'GITHUB_PAT_KEY') {
          return trimmed.slice(eq + 1).trim();
        }
      }
    }
  } catch { /* ignore */ }

  throw new Error('No GitHub token found. Set GITHUB_TOKEN or GITHUB_PAT_KEY.');
}

function getRepo(): GitHubRepo {
  // Try to determine from git remote
  try {
    const cp = require('node:child_process');
    const result = cp.spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf-8', timeout: 5000 });
    const url = result.stdout?.trim() ?? '';
    const match = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) return { owner: match[1]!, repo: match[2]! };
  } catch { /* ignore */ }

  throw new Error('Could not determine GitHub repo from git remote.');
}

// ─── API Helpers ────────────────────────────────────────────────────

async function ghApi<T>(apiPath: string, opts: RequestInit = {}): Promise<T> {
  const token = getGitHubToken();
  const resp = await fetch(`https://api.github.com${apiPath}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers as Record<string, string> ?? {}),
    },
  });
  if (!resp.ok && resp.status !== 404) {
    const body = await resp.text().catch(() => '');
    throw new Error(`GitHub API ${resp.status} ${resp.url}: ${body.slice(0, 200)}`);
  }
  return resp.json() as Promise<T>;
}

// ─── PR Operations ──────────────────────────────────────────────────

export async function listOpenPRs(): Promise<PRInfo[]> {
  const { owner, repo } = getRepo();
  const prs = await ghApi<any[]>(`/repos/${owner}/${repo}/pulls?state=open&per_page=50`);

  return prs.map((pr) => {
    const branch = pr.head?.ref ?? '';
    const ticketMatch = branch.match(/ticket\/([a-z]+-\d+)/i);
    return {
      number: pr.number,
      url: pr.html_url,
      title: pr.title,
      branch,
      ticketIdentifier: ticketMatch ? ticketMatch[1]!.toUpperCase() : null,
    };
  });
}

export async function createPR(
  branch: string,
  title: string,
  body: string,
  baseBranch: string,
): Promise<{ url: string | null; error: string | null }> {
  try {
    const { owner, repo } = getRepo();
    const config = getConfig();

    const resp = await ghApi<any>(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        head: branch,
        base: baseBranch,
        body,
        draft: config.github.pr_draft,
      }),
    });

    if (resp.html_url) {
      // Add labels
      if (config.github.pr_labels.length > 0) {
        try {
          await ghApi(`/repos/${owner}/${repo}/issues/${resp.number}/labels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ labels: config.github.pr_labels }),
          });
        } catch { /* labels are non-critical */ }
      }
      return { url: resp.html_url, error: null };
    }
    return { url: null, error: resp.message ?? 'Unknown error' };
  } catch (err: any) {
    return { url: null, error: err.message };
  }
}

export async function findPRByBranch(branch: string): Promise<PRInfo | null> {
  try {
    const { owner, repo } = getRepo();
    const prs = await ghApi<any[]>(
      `/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open&per_page=5`,
    );
    if (!prs || prs.length === 0) return null;
    return {
      number: prs[0].number,
      url: prs[0].html_url,
      title: prs[0].title,
      branch,
      ticketIdentifier: null,
    };
  } catch {
    return null;
  }
}

export async function isPRMerged(ticketId: string): Promise<boolean> {
  const { owner, repo } = getRepo();
  const branch = `ticket/${ticketId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
  const prs = await ghApi<any[]>(
    `/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=closed&per_page=5`,
  ).catch(() => []);
  return prs.length > 0 && prs[0]!.merged_at != null;
}

export async function isPRClosed(ticketId: string): Promise<boolean> {
  const { owner, repo } = getRepo();
  const branch = `ticket/${ticketId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
  const prs = await ghApi<any[]>(
    `/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=closed&per_page=5`,
  ).catch(() => []);
  return prs.length > 0 && prs[0]!.merged_at == null;
}

export async function getPRFiles(prNumber: number): Promise<Array<{ filename: string; status: string }>> {
  const { owner, repo } = getRepo();
  const files = await ghApi<any[]>(
    `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
  );
  return files.map((f: any) => ({ filename: f.filename, status: f.status }));
}

// ─── Comments ───────────────────────────────────────────────────────

function hasReply(comment: any, allComments: any[]): boolean {
  const commentTime = new Date(comment.created_at).getTime();
  const commentUser = comment.user?.login;
  for (const c of allComments) {
    if (c.id === comment.id) continue;
    if (new Date(c.created_at).getTime() > commentTime && c.user?.login !== commentUser) {
      return true;
    }
  }
  return false;
}

function isAddressed(comment: any, allComments: any[]): boolean {
  const commentTime = new Date(comment.created_at).getTime();
  for (const c of allComments) {
    if (new Date(c.created_at).getTime() > commentTime) {
      const body = (c.body ?? '').toLowerCase();
      const isBot = c.user?.login?.includes('bot') || c.user?.type === 'Bot';
      const mentionsResolution = ['addressed', 'fixed', 'resolved', 'done'].some((w) => body.includes(w));
      if (isBot || mentionsResolution) return true;
    }
  }
  return false;
}

export async function getUnaddressedComments(prNumber: number): Promise<PRComment[]> {
  const { owner, repo } = getRepo();
  const pr = await ghApi<any>(`/repos/${owner}/${repo}/pulls/${prNumber}`);
  const [issueComments, reviewComments] = await Promise.all([
    ghApi<any[]>(`/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=50`),
    ghApi<any[]>(`/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=50`),
  ]);

  const prAuthor = pr.user?.login;
  const allComments = [
    ...issueComments.map((c: any) => ({ ...c, _type: 'issue' })),
    ...reviewComments.map((c: any) => ({ ...c, _type: 'review' })),
  ];

  const unaddressed: PRComment[] = [];
  for (const comment of allComments) {
    const user = comment.user?.login ?? '';
    if (user.includes('bot') || user === 'github-actions') continue;
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

export async function scanAllPRComments(): Promise<Map<string, PRComment[]>> {
  const prs = await listOpenPRs();
  const result = new Map<string, PRComment[]>();
  for (const pr of prs) {
    if (!pr.ticketIdentifier) continue;
    try {
      const comments = await getUnaddressedComments(pr.number);
      if (comments.length > 0) result.set(pr.ticketIdentifier, comments);
    } catch { /* skip */ }
  }
  return result;
}

// ─── Merge Conflicts ────────────────────────────────────────────────

export async function findMergeConflicts(): Promise<Array<{ pr1: PRInfo; pr2: PRInfo; files: string[] }>> {
  const prs = await listOpenPRs();
  const conflicts: Array<{ pr1: PRInfo; pr2: PRInfo; files: string[] }> = [];

  const prFiles = new Map<number, Array<{ filename: string; status: string }>>();
  for (const pr of prs) {
    try { prFiles.set(pr.number, await getPRFiles(pr.number)); } catch { /* skip */ }
  }

  for (let i = 0; i < prs.length; i++) {
    for (let j = i + 1; j < prs.length; j++) {
      const f1 = prFiles.get(prs[i]!.number) ?? [];
      const f2 = prFiles.get(prs[j]!.number) ?? [];
      const overlap = f1.filter((f) => f2.some((g) => g.filename === f.filename)).map((f) => f.filename);
      if (overlap.length > 0) {
        conflicts.push({ pr1: prs[i]!, pr2: prs[j]!, files: overlap });
      }
    }
  }
  return conflicts;
}

// ─── Webhook Registration ───────────────────────────────────────────

export async function registerWebhook(baseUrl: string): Promise<string> {
  const { owner, repo } = getRepo();

  const existing = await ghApi<any[]>(`/repos/${owner}/${repo}/hooks?per_page=50`);
  const webhookUrl = `${baseUrl}/github-webhook`;
  const match = existing.find((h: any) => h.config?.url?.endsWith('/github-webhook'));

  if (match) {
    await ghApi(`/repos/${owner}/${repo}/hooks/${match.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { ...match.config, url: webhookUrl } }),
    });
    return `Webhook updated: ${webhookUrl}`;
  }

  await ghApi(`/repos/${owner}/${repo}/hooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'web',
      active: true,
      events: ['pull_request', 'issue_comment', 'pull_request_review_comment'],
      config: { url: webhookUrl, content_type: 'json', insecure_ssl: '1' },
    }),
  });
  return `Webhook registered: ${webhookUrl}`;
}

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
