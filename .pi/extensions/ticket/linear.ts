/**
 * Linear API integration for the /ticket extension.
 * Uses disk caching to avoid rate limit exhaustion on server restarts.
 */

import type { TicketInfo } from './types';
import { cachedGraphql, getCachedApiKey } from './cache';

const LINEAR_API = 'https://api.linear.app/graphql';
const IDENTIFIER_PATTERN = /^([A-Z]{1,7})-(\d+)$/;

function getApiKey(): string {
  return getCachedApiKey();
}

/** Direct (uncached) GraphQL call — used for mutations and force-refresh. */
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

/** Cached read query — uses disk cache, bypass for mutations. */
async function graphql(query: string, variables?: Record<string, unknown>): Promise<any> {
  // Detect mutations — never cache these
  const isMutation = query.trim().startsWith('mutation');
  if (isMutation) {
    return graphqlDirect(query, variables);
  }
  return cachedGraphql(query, variables);
}

/** Parse "RES-11" into { teamKey: "RES", number: 11 }. */
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
  // Strip markdown links: [RES-13](url) → RES-13
  const cleaned = (match[1] ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  return cleaned
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.toLowerCase() !== 'none');
}

/** Fetch all child tickets for a parent issue (tickets with parent.id = parentId). */
export async function fetchChildren(parentId: string): Promise<TicketInfo[]> {
  const data = await graphql(`
    query GetChildren($parentId: ID!) {
      issues(
        first: 50
        filter: { parent: { id: { eq: $parentId } } }
      ) {
        nodes {
          id
          identifier
          title
          description
          parent { id }
          url
        }
      }
    }
  `, { parentId });

  const nodes = data?.issues?.nodes ?? [];
  return nodes.map((issue: any) => ({
    identifier: issue.identifier,
    id: issue.id,
    title: issue.title,
    description: issue.description ?? '',
    parentId: issue.parent?.id ?? null,
    refs: parseRefs(issue.description ?? ''),
    url: issue.url,
  }));
}

/** Fetch a ticket by its UUID. */
export async function fetchTicketById(id: string): Promise<TicketInfo | null> {
  const data = await graphql(`
    query GetTicket($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        description
        parent { id }
        url
      }
    }
  `, { id });

  const issue = data?.issue;
  if (!issue) return null;

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

/** Fetch a ticket by its human-readable identifier (e.g. "RES-11"). */
export async function fetchTicketByIdentifier(identifier: string): Promise<TicketInfo | null> {
  const parsed = parseIdentifier(identifier);
  if (!parsed) return null;

  const data = await graphql(`
    query GetTicketByIdentifier($teamKey: String!, $number: Float!) {
      issues(
        first: 1
        filter: {
          team: { key: { eq: $teamKey } }
          number: { eq: $number }
        }
      ) {
        nodes {
          id
          identifier
          title
          description
          parent { id }
          url
        }
      }
    }
  `, {
    teamKey: parsed.teamKey,
    number: parsed.number,
  });

  const nodes = data?.issues?.nodes ?? [];
  if (nodes.length === 0) return null;
  const issue = nodes[0];

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

/** Get all teams for the user. */
export async function fetchTeams(): Promise<Array<{ id: string; name: string; key: string }>> {
  const data = await graphql(`{ teams { nodes { id name key } } }`);
  return data?.teams?.nodes ?? [];
}

/** Get workflow states for a team. */
export async function fetchWorkflowStates(
  teamId: string,
): Promise<Array<{ id: string; name: string; type: string }>> {
  const data = await graphql(
    `query($teamId: String!) {
      workflowStates(filter: { team: { id: { eq: $teamId } } }) {
        nodes { id name type }
      }
    }`,
    { teamId },
  );
  return data?.workflowStates?.nodes ?? [];
}

/** Update an issue's state by state ID. */
export async function updateIssueState(
  issueId: string,
  stateId: string,
): Promise<boolean> {
  const data = await graphql(
    `mutation($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) {
        success
      }
    }`,
    { id: issueId, stateId },
  );
  return data?.issueUpdate?.success ?? false;
}

/** Get the team ID for a ticket by its issue ID. */
export async function getTeamIdForIssue(issueId: string): Promise<string | null> {
  const data = await graphql(
    `query($id: String!) {
      issue(id: $id) {
        team { id }
      }
    }`,
    { id: issueId },
  );
  return data?.issue?.team?.id ?? null;
}

/**
 * Transition a ticket to a target state by name.
 * Searches workflow states for a match (case-insensitive substring).
 * Common state names: "In Progress", "Todo", "Done", "In Review", "Ready for Review", "Canceled".
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

    // Try exact match first, then substring, then starts-with
    let match = states.find((s) => s.name.toLowerCase() === target);
    if (!match) match = states.find((s) => s.name.toLowerCase().includes(target));
    if (!match) match = states.find((s) => s.name.toLowerCase().startsWith(target));

    if (!match) return { success: false };

    const ok = await updateIssueState(issueId, match.id);
    return { success: ok, actualState: match.name };
  } catch {
    return { success: false };
  }
}
