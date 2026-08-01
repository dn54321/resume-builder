/**
 * Linear GraphQL API client.
 * Handles authentication, query execution, and response parsing.
 */

const LINEAR_API_URL = "https://api.linear.app/graphql";

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state?: { id: string; name: string; type: string };
  assignee?: { id: string; name: string };
  priority?: number;
  parent?: { id: string; identifier: string; title: string };
  project?: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface LinearComment {
  id: string;
  body: string;
  user?: { id: string; name: string };
  createdAt: string;
}

export interface LinearProject {
  id: string;
  name: string;
  description?: string;
  state?: string;
  url: string;
}

export interface CreateIssueInput {
  teamId: string;
  title: string;
  description?: string;
  parentId?: string;
  assigneeId?: string;
  priority?: number;
  projectId?: string;
}

export interface UpdateIssueInput {
  title?: string;
  description?: string;
  assigneeId?: string;
  priority?: number;
  stateId?: string;
  projectId?: string;
}

export interface IssueFilter {
  teamId?: string;
  assigneeId?: string;
  stateName?: string;
  search?: string;
  first?: number;
}

class LinearClient {
  private apiKey: string | null = null;

  /** Load API key from environment, .env.agent, or .env file */
  async loadApiKey(cwd: string): Promise<string | null> {
    if (this.apiKey) return this.apiKey;

    // Check env var first
    if (process.env.LINEAR_KEY) {
      this.apiKey = process.env.LINEAR_KEY;
      return this.apiKey;
    }
    if (process.env.LINEAR_API_KEY) {
      this.apiKey = process.env.LINEAR_API_KEY;
      return this.apiKey;
    }

    // Try reading .env.agent
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");

      const envAgentPath = path.join(cwd, ".env.agent");
      const content = await fs.readFile(envAgentPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || !trimmed) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (key === "LINEAR_KEY" || key === "LINEAR_API_KEY") {
          this.apiKey = value;
          return this.apiKey;
        }
      }
    } catch {
      // .env.agent doesn't exist, continue
    }

    // Try .env
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");

      const envPath = path.join(cwd, ".env");
      const content = await fs.readFile(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || !trimmed) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (key === "LINEAR_KEY" || key === "LINEAR_API_KEY") {
          this.apiKey = value;
          return this.apiKey;
        }
      }
    } catch {
      // .env doesn't exist, continue
    }

    return null;
  }

  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  private async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    if (!this.apiKey) {
      throw new Error("Linear API key not configured. Set LINEAR_KEY in .env.agent");
    }

    const response = await fetch(LINEAR_API_URL, {
      method: "POST",
      headers: {
        Authorization: this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Linear API error (${response.status}): ${text}`);
    }

    const data = await response.json();
    if (data.errors) {
      throw new Error(`Linear GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    return data.data as T;
  }

  // --- Teams ---

  async listTeams(): Promise<LinearTeam[]> {
    const query = `
      query {
        teams {
          nodes {
            id
            name
            key
          }
        }
      }
    `;
    const result = await this.graphql<{ teams: { nodes: LinearTeam[] } }>(query);
    return result.teams.nodes;
  }

  // --- Issues ---

  async listIssues(filter: IssueFilter = {}): Promise<LinearIssue[]> {
    const first = filter.first ?? 25;
    let filterClause = "";
    const filterParts: string[] = [];

    if (filter.teamId) {
      filterParts.push(`team: { id: { eq: "${filter.teamId}" } }`);
    }
    if (filter.assigneeId) {
      filterParts.push(`assignee: { id: { eq: "${filter.assigneeId}" } }`);
    }
    if (filter.stateName) {
      filterParts.push(`state: { name: { eq: "${filter.stateName}" } }`);
    }

    if (filterParts.length > 0) {
      filterClause = `filter: { and: [${filterParts.join(", ")}] }`;
    }

    const query = `
      query {
        issues(first: ${first}, ${filterClause}${filter.search ? `, filter: { title: { contains: "${filter.search.replace(/"/g, '\\"')}" } }` : ""}) {
          nodes {
            id
            identifier
            title
            description
            state { id name type }
            assignee { id name }
            priority
            parent { id identifier title }
            project { id name }
            createdAt
            updatedAt
            url
          }
        }
      }
    `;
    const result = await this.graphql<{ issues: { nodes: LinearIssue[] } }>(query);
    return result.issues.nodes;
  }

  async getIssue(identifier: string): Promise<LinearIssue | null> {
    const query = `
      query($id: String!) {
        issue(id: $id) {
          id
          identifier
          title
          description
          state { id name type }
          assignee { id name }
          priority
          parent { id identifier title }
          project { id name }
          createdAt
          updatedAt
          url
        }
      }
    `;
    const result = await this.graphql<{ issue: LinearIssue | null }>(query, { id: identifier });
    return result.issue;
  }

  async createIssue(input: CreateIssueInput): Promise<LinearIssue> {
    const mutation = `
      mutation($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          issue {
            id
            identifier
            title
            description
            state { id name type }
            assignee { id name }
            priority
            parent { id identifier title }
            project { id name }
            createdAt
            updatedAt
            url
          }
          success
        }
      }
    `;
    const result = await this.graphql<{
      issueCreate: { issue: LinearIssue; success: boolean };
    }>(mutation, { input });
    if (!result.issueCreate.success) {
      throw new Error("Failed to create issue in Linear");
    }
    return result.issueCreate.issue;
  }

  async updateIssue(identifier: string, input: UpdateIssueInput): Promise<LinearIssue> {
    // First lookup the issue to get the internal ID
    const existing = await this.getIssue(identifier);
    if (!existing) {
      throw new Error(`Issue ${identifier} not found`);
    }

    const mutation = `
      mutation($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          issue {
            id
            identifier
            title
            description
            state { id name type }
            assignee { id name }
            priority
            parent { id identifier title }
            project { id name }
            createdAt
            updatedAt
            url
          }
          success
        }
      }
    `;
    const result = await this.graphql<{
      issueUpdate: { issue: LinearIssue; success: boolean };
    }>(mutation, { id: existing.id, input });
    if (!result.issueUpdate.success) {
      throw new Error("Failed to update issue in Linear");
    }
    return result.issueUpdate.issue;
  }

  // --- Comments ---

  async getComments(issueId: string): Promise<LinearComment[]> {
    const query = `
      query($id: String!) {
        issue(id: $id) {
          comments {
            nodes {
              id
              body
              user { id name }
              createdAt
            }
          }
        }
      }
    `;
    const result = await this.graphql<{
      issue: { comments: { nodes: LinearComment[] } };
    }>(query, { id: issueId });
    return result.issue.comments.nodes;
  }

  async addComment(issueId: string, body: string): Promise<LinearComment> {
    const mutation = `
      mutation($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          comment {
            id
            body
            user { id name }
            createdAt
          }
          success
        }
      }
    `;
    const result = await this.graphql<{
      commentCreate: { comment: LinearComment; success: boolean };
    }>(mutation, { input: { issueId, body } });
    if (!result.commentCreate.success) {
      throw new Error("Failed to add comment in Linear");
    }
    return result.commentCreate.comment;
  }

  // --- Projects ---

  async listProjects(teamId?: string): Promise<LinearProject[]> {
    let filterArg = "";
    if (teamId) {
      filterArg = `filter: { team: { id: { eq: "${teamId}" } } }`;
    }
    const query = `
      query {
        projects(${filterArg}) {
          nodes {
            id
            name
            description
            state
            url
          }
        }
      }
    `;
    const result = await this.graphql<{ projects: { nodes: LinearProject[] } }>(query);
    return result.projects.nodes;
  }

  // --- Workflow States ---

  async listWorkflowStates(teamId: string): Promise<{ id: string; name: string; type: string }[]> {
    const query = `
      query($teamId: String!) {
        workflowStates(filter: { team: { id: { eq: $teamId } } }) {
          nodes {
            id
            name
            type
          }
        }
      }
    `;
    const result = await this.graphql<{
      workflowStates: { nodes: { id: string; name: string; type: string }[] };
    }>(query, { teamId });
    return result.workflowStates.nodes;
  }

  // --- Users (assignees) ---

  async listUsers(): Promise<{ id: string; name: string; email: string }[]> {
    const query = `
      query {
        users {
          nodes {
            id
            name
            email
          }
        }
      }
    `;
    const result = await this.graphql<{
      users: { nodes: { id: string; name: string; email: string }[] };
    }>(query);
    return result.users.nodes;
  }
}

/** Singleton Linear client */
export const linearClient = new LinearClient();
