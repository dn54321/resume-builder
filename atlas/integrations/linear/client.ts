/**
 * Linear GraphQL API client.
 * Handles queries, mutations, caching, and rate limit handling.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TicketInfo } from '../../orchestrator/types';

const LINEAR_API = 'https://api.linear.app/graphql';

// ─── API Key ────────────────────────────────────────────────────────

function getApiKey(): string {
  if (process.env.LINEAR_API_KEY) return process.env.LINEAR_API_KEY;

  // Try pi-linear credentials
  try {
    const os = require('node:os');
    const credPath = path.join(os.homedir(), '.pi', 'agent', 'extensions', 'linear', 'credentials.json');
    if (fs.existsSync(credPath)) {
      const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
      const active = creds.activeWorkspace;
      if (active && creds.workspaces?.[active]?.apiKey) {
        return creds.workspaces[active].apiKey;
      }
      const first = Object.keys(creds.workspaces ?? {})[0];
      if (first) return creds.workspaces[first].apiKey;
    }
  } catch { /* ignore */ }

  throw new Error('No LINEAR_API_KEY found. Set LINEAR_API_KEY env var or run /linear-auth.');
}

// ─── Direct GraphQL ─────────────────────────────────────────────────

async function graphqlDirect(query: string, variables?: Record<string, unknown>): Promise<any> {
  const apiKey = getApiKey();
  const resp = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await resp.json() as any;
  if (json.errors) {
    throw new Error(`Linear API error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// ─── Cached GraphQL ─────────────────────────────────────────────────

const cache = new Map<string, { data: any; fetchedAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function cacheKey(query: string, variables?: Record<string, unknown>): string {
  return JSON.stringify({ q: query.trim(), v: variables ?? {} });
}

async function graphql(query: string, variables?: Record<string, unknown>): Promise<any> {
  const isMutation = query.trim().startsWith('mutation');
  if (isMutation) return graphqlDirect(query, variables);

  const key = cacheKey(query, variables);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const data = await graphqlDirect(query, variables);
  cache.set(key, { data, fetchedAt: Date.now() });
  return data;
}

// ─── Ticket Fetching ────────────────────────────────────────────────

const IDENTIFIER_PATTERN = /^([A-Z]{1,7})-(\d+)$/;

function parseIdentifier(identifier: string): { teamKey: string; number: number } | null {
  const match = identifier.trim().match(IDENTIFIER_PATTERN);
  if (!match) return null;
  return { teamKey: match[1]!.toUpperCase(), number: Number(match[2]!) };
}

/** Parse ref: RES-1 RES-2 from the first line of a description. */
function parseRefs(description: string): string[] {
  const firstLine = description.split('\n')[0] ?? '';
  const match = firstLine.match(/^ref:\s*(.+)$/i);
  if (!match) return [];
  const cleaned = (match[1] ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  return cleaned
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.toLowerCase() !== 'none');
}

/** Map a Linear API issue node to TicketInfo. */
function mapIssue(issue: any): TicketInfo {
  return {
    identifier: issue.identifier,
    id: issue.id,
    title: issue.title,
    description: issue.description ?? '',
    parentId: issue.parent?.id ?? null,
    refs: parseRefs(issue.description ?? ''),
    url: issue.url,
  };
}

export async function fetchTicketByIdentifier(identifier: string): Promise<TicketInfo | null> {
  const parsed = parseIdentifier(identifier);
  if (!parsed) return null;

  const data = await graphql(`
    query($teamKey: String!, $number: Float!) {
      issues(first: 1, filter: { team: { key: { eq: $teamKey } }, number: { eq: $number } }) {
        nodes {
          id identifier title description
          parent { id }
          url
        }
      }
    }
  `, { teamKey: parsed.teamKey, number: parsed.number });

  const nodes = data?.issues?.nodes ?? [];
  return nodes.length > 0 ? mapIssue(nodes[0]) : null;
}

export async function fetchTicketById(id: string): Promise<TicketInfo | null> {
  const data = await graphql(`
    query($id: String!) {
      issue(id: $id) {
        id identifier title description
        parent { id }
        url
      }
    }
  `, { id });

  return data?.issue ? mapIssue(data.issue) : null;
}

export async function fetchChildren(parentId: string): Promise<TicketInfo[]> {
  const data = await graphql(`
    query($parentId: ID!) {
      issues(first: 50, filter: { parent: { id: { eq: $parentId } } }) {
        nodes {
          id identifier title description
          parent { id }
          url
        }
      }
    }
  `, { parentId });

  return (data?.issues?.nodes ?? []).map(mapIssue);
}

// ─── Workflow ───────────────────────────────────────────────────────

export async function fetchTeams(): Promise<Array<{ id: string; name: string; key: string }>> {
  const data = await graphql(`{ teams { nodes { id name key } } }`);
  return data?.teams?.nodes ?? [];
}

export async function fetchWorkflowStates(teamId: string): Promise<Array<{ id: string; name: string; type: string }>> {
  const data = await graphql(`
    query($teamId: String!) {
      workflowStates(filter: { team: { id: { eq: $teamId } } }) {
        nodes { id name type }
      }
    }
  `, { teamId });
  return data?.workflowStates?.nodes ?? [];
}

export async function getTeamIdForIssue(issueId: string): Promise<string | null> {
  const data = await graphql(`
    query($id: String!) { issue(id: $id) { team { id } } }
  `, { id: issueId });
  return data?.issue?.team?.id ?? null;
}

export async function updateIssueState(issueId: string, stateId: string): Promise<boolean> {
  const data = await graphql(`
    mutation($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) { success }
    }
  `, { id: issueId, stateId });
  return data?.issueUpdate?.success ?? false;
}

/**
 * Transition a ticket to a target state by name.
 * Searches workflow states for a match (case-insensitive, substring).
 */
export async function transitionTicket(
  issueId: string,
  targetName: string,
): Promise<{ success: boolean; actualState?: string }> {
  try {
    const teamId = await getTeamIdForIssue(issueId);
    if (!teamId) return { success: false };

    const states = await fetchWorkflowStates(teamId);
    const target = targetName.toLowerCase();

    let match = states.find((s) => s.name.toLowerCase() === target)
      ?? states.find((s) => s.name.toLowerCase().includes(target))
      ?? states.find((s) => s.name.toLowerCase().startsWith(target));

    if (!match) return { success: false };

    const ok = await updateIssueState(issueId, match.id);
    return { success: ok, actualState: match.name };
  } catch {
    return { success: false };
  }
}

// ─── Active Epics Discovery ─────────────────────────────────────────

export async function findActiveEpics(): Promise<string[]> {
  try {
    const data = await graphql(`
      query {
        issues(
          filter: { state: { type: { in: ["started", "unstarted"] } } }
          first: 25
        ) {
          nodes {
            id identifier title
            state { name type }
            children { nodes { id } }
          }
        }
      }
    `);

    const issues: any[] = data?.issues?.nodes ?? [];
    const epics = issues.filter((i: any) => i.children?.nodes?.length > 0);
    if (epics.length > 0) return epics.map((e: any) => e.identifier);
    if (issues.length > 0) return [issues[0].identifier];
  } catch { /* ignore */ }
  return [];
}

// ─── Comment ────────────────────────────────────────────────────────

export async function addComment(issueId: string, body: string): Promise<boolean> {
  try {
    await graphql(`
      mutation($input: CommentCreateInput!) {
        commentCreate(input: $input) { success }
      }
    `, { input: { issueId, body } });
    return true;
  } catch {
    return false;
  }
}

// ─── Close Ticket ───────────────────────────────────────────────────

export async function closeTicket(identifier: string): Promise<boolean> {
  const ticket = await fetchTicketByIdentifier(identifier);
  if (!ticket) return false;

  const teamId = await getTeamIdForIssue(ticket.id);
  if (!teamId) return false;

  const states = await fetchWorkflowStates(teamId);
  const target = states.find((s: any) => s.type === 'canceled')
    ?? states.find((s: any) => s.type === 'completed');
  if (!target) return false;

  return updateIssueState(ticket.id, target.id);
}
