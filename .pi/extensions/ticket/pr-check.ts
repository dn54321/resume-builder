/**
 * PR header verification — checks that merged/updated PRs have all required
 * sections and flags incomplete ones for agent follow-up.
 */

import { listOpenPRs } from './github-pr.js';
import { getAgentConfig } from './orchestrator.js';

const REQUIRED_HEADERS = [
  '## Summary of Changes',
  '## Risks if This Fails',
  '## Setup & Verification',
  '## Proof of Changes',
  '## Blockers / Discoveries',
];

export interface PRHeaderIssue {
  prNumber: number;
  ticketId: string | null;
  url: string;
  missingHeaders: string[];
}

/** Check a single PR body for missing required headers. */
export function checkPRHeaders(body: string): string[] {
  if (!body || body.length < 50) return REQUIRED_HEADERS;
  const missing: string[] = [];
  for (const header of REQUIRED_HEADERS) {
    if (!body.includes(header)) {
      missing.push(header);
    }
  }
  return missing;
}

/** Scan all open ticket PRs for missing headers. */
export async function findIncompletePRs(): Promise<PRHeaderIssue[]> {
  const prs = await listOpenPRs();
  const issues: PRHeaderIssue[] = [];

  for (const pr of prs) {
    if (!pr.ticketIdentifier) continue;
    try {
      const token = getAgentConfig().githubToken || process.env.GITHUB_TOKEN || '';
      const resp = await fetch(`https://api.github.com/repos/dn54321/resume-v3/pulls/${pr.number}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      });
      if (!resp.ok) continue;
      const data = await resp.json() as any;
      const missing = checkPRHeaders(data.body || '');
      if (missing.length > 0) {
        issues.push({ prNumber: pr.number, ticketId: pr.ticketIdentifier, url: pr.url, missingHeaders: missing });
      }
    } catch { /* skip */ }
  }

  return issues;
}
