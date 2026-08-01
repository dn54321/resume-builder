/**
 * Linear tools - registered so the LLM can interact with Linear.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { linearClient } from "./linear-client";

export function registerLinearTools(pi: ExtensionAPI, client: typeof linearClient) {
  // --- list_teams ---
  pi.registerTool({
    name: "linear_list_teams",
    label: "Linear: List Teams",
    description: "List all Linear teams in the workspace. Returns team IDs, names, and keys.",
    promptSnippet: "List Linear teams (id, name, key)",
    parameters: Type.Object({}),
    async execute() {
      if (!client.isConfigured()) {
        return {
          content: [{ type: "text", text: "Linear API key not configured. Set LINEAR_KEY in .env.agent" }],
          details: { error: "not_configured" },
        };
      }
      try {
        const teams = await client.listTeams();
        if (teams.length === 0) {
          return {
            content: [{ type: "text", text: "No teams found." }],
            details: { teams: [] },
          };
        }
        const text = teams.map((t) => `- **${t.name}** (key: \`${t.key}\`, id: \`${t.id}\`)`).join("\n");
        return {
          content: [{ type: "text", text }],
          details: { teams },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          details: { error: e.message },
          isError: true,
        };
      }
    },
  });

  // --- list_issues ---
  pi.registerTool({
    name: "linear_list_issues",
    label: "Linear: List Issues",
    description: "List Linear issues with optional filters for team, assignee, state, and text search. Returns up to 25 issues by default.",
    promptSnippet: "List Linear issues with optional filters (teamId, assigneeId, stateName, search)",
    parameters: Type.Object({
      teamId: Type.Optional(Type.String({ description: "Team ID to filter by" })),
      assigneeId: Type.Optional(Type.String({ description: "Assignee user ID to filter by" })),
      stateName: Type.Optional(Type.String({ description: "State name to filter by (e.g. 'Todo', 'In Progress', 'Done')" })),
      search: Type.Optional(Type.String({ description: "Text to search in issue titles" })),
    }),
    async execute(_id, params) {
      if (!client.isConfigured()) {
        return {
          content: [{ type: "text", text: "Linear API key not configured. Set LINEAR_KEY in .env.agent" }],
          details: { error: "not_configured" },
        };
      }
      try {
        const issues = await client.listIssues({
          teamId: params.teamId,
          assigneeId: params.assigneeId,
          stateName: params.stateName,
          search: params.search,
        });
        if (issues.length === 0) {
          return {
            content: [{ type: "text", text: "No issues found matching the filters." }],
            details: { issues: [] },
          };
        }
        const text = issues
          .map((i) => {
            const state = i.state ? `[${i.state.name}]` : "";
            const assignee = i.assignee ? ` (👤 ${i.assignee.name})` : "";
            const prio = i.priority ? ` P${i.priority}` : "";
            return `- **${i.identifier}** ${state}${prio} ${i.title}${assignee}\n  ${i.url}`;
          })
          .join("\n");
        return {
          content: [{ type: "text", text }],
          details: { issues },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          details: { error: e.message },
          isError: true,
        };
      }
    },
  });

  // --- get_issue ---
  pi.registerTool({
    name: "linear_get_issue",
    label: "Linear: Get Issue",
    description: "Get full details for a Linear issue by its identifier (e.g. 'RES-42') or UUID.",
    promptSnippet: "Get a Linear issue by identifier (e.g. RES-42)",
    parameters: Type.Object({
      identifier: Type.String({ description: "Issue identifier (e.g. 'RES-42') or UUID" }),
    }),
    async execute(_id, params) {
      if (!client.isConfigured()) {
        return {
          content: [{ type: "text", text: "Linear API key not configured. Set LINEAR_KEY in .env.agent" }],
          details: { error: "not_configured" },
        };
      }
      try {
        const issue = await client.getIssue(params.identifier);
        if (!issue) {
          return {
            content: [{ type: "text", text: `Issue ${params.identifier} not found.` }],
            details: { error: "not_found" },
          };
        }
        const lines = [
          `## ${issue.identifier}: ${issue.title}`,
          `**URL:** ${issue.url}`,
          issue.state ? `**State:** ${issue.state.name} (${issue.state.type})` : "",
          issue.assignee ? `**Assignee:** ${issue.assignee.name}` : "",
          issue.priority ? `**Priority:** P${issue.priority}` : "",
          issue.project ? `**Project:** ${issue.project.name}` : "",
          issue.parent ? `**Parent:** ${issue.parent.identifier}: ${issue.parent.title}` : "",
          "",
          issue.description || "(no description)",
        ].filter(Boolean);
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { issue },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          details: { error: e.message },
          isError: true,
        };
      }
    },
  });

  // --- create_issue ---
  pi.registerTool({
    name: "linear_create_issue",
    label: "Linear: Create Issue",
    description:
      "Create a new issue in Linear. Requires a team ID. Optionally set title, description, parent (epic), assignee, priority (1-urgent, 2-high, 3-medium, 4-low), and project.",
    promptSnippet: "Create a Linear issue in a team",
    parameters: Type.Object({
      teamId: Type.String({ description: "Team ID to create the issue in" }),
      title: Type.String({ description: "Issue title" }),
      description: Type.Optional(Type.String({ description: "Issue description (markdown)" })),
      parentId: Type.Optional(Type.String({ description: "Parent issue/epic ID" })),
      assigneeId: Type.Optional(Type.String({ description: "Assignee user ID" })),
      priority: Type.Optional(Type.Number({ description: "Priority: 1=urgent, 2=high, 3=medium, 4=low" })),
      projectId: Type.Optional(Type.String({ description: "Project ID" })),
    }),
    async execute(_id, params) {
      if (!client.isConfigured()) {
        return {
          content: [{ type: "text", text: "Linear API key not configured. Set LINEAR_KEY in .env.agent" }],
          details: { error: "not_configured" },
        };
      }
      try {
        const issue = await client.createIssue({
          teamId: params.teamId,
          title: params.title,
          description: params.description,
          parentId: params.parentId,
          assigneeId: params.assigneeId,
          priority: params.priority,
          projectId: params.projectId,
        });
        return {
          content: [
            { type: "text", text: `✅ Created **${issue.identifier}**: ${issue.title}\n${issue.url}` },
          ],
          details: { issue },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error creating issue: ${e.message}` }],
          details: { error: e.message },
          isError: true,
        };
      }
    },
  });

  // --- update_issue ---
  pi.registerTool({
    name: "linear_update_issue",
    label: "Linear: Update Issue",
    description:
      "Update an existing Linear issue. Only fields provided will be changed. Use to change title, description, assignee, priority, state, or project.",
    promptSnippet: "Update a Linear issue (title, description, assignee, priority, state, project)",
    parameters: Type.Object({
      identifier: Type.String({ description: "Issue identifier (e.g. 'RES-42')" }),
      title: Type.Optional(Type.String({ description: "New title" })),
      description: Type.Optional(Type.String({ description: "New description (markdown)" })),
      assigneeId: Type.Optional(Type.String({ description: "New assignee user ID" })),
      priority: Type.Optional(Type.Number({ description: "New priority: 1=urgent, 2=high, 3=medium, 4=low" })),
      stateId: Type.Optional(Type.String({ description: "New workflow state ID" })),
      projectId: Type.Optional(Type.String({ description: "New project ID" })),
    }),
    async execute(_id, params) {
      if (!client.isConfigured()) {
        return {
          content: [{ type: "text", text: "Linear API key not configured. Set LINEAR_KEY in .env.agent" }],
          details: { error: "not_configured" },
        };
      }
      try {
        const { identifier, ...updates } = params;
        const issue = await client.updateIssue(identifier, updates);
        return {
          content: [
            { type: "text", text: `✅ Updated **${issue.identifier}**: ${issue.title}\n${issue.url}` },
          ],
          details: { issue },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error updating issue: ${e.message}` }],
          details: { error: e.message },
          isError: true,
        };
      }
    },
  });

  // --- add_comment ---
  pi.registerTool({
    name: "linear_add_comment",
    label: "Linear: Add Comment",
    description: "Add a comment to an existing Linear issue.",
    promptSnippet: "Add a comment to a Linear issue",
    parameters: Type.Object({
      identifier: Type.String({ description: "Issue identifier (e.g. 'RES-42')" }),
      body: Type.String({ description: "Comment body (markdown)" }),
    }),
    async execute(_id, params) {
      if (!client.isConfigured()) {
        return {
          content: [{ type: "text", text: "Linear API key not configured. Set LINEAR_KEY in .env.agent" }],
          details: { error: "not_configured" },
        };
      }
      try {
        const existing = await client.getIssue(params.identifier);
        if (!existing) {
          return {
            content: [{ type: "text", text: `Issue ${params.identifier} not found.` }],
            details: { error: "not_found" },
          };
        }
        const comment = await client.addComment(existing.id, params.body);
        return {
          content: [
            { type: "text", text: `✅ Comment added to **${params.identifier}**` },
          ],
          details: { comment },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error adding comment: ${e.message}` }],
          details: { error: e.message },
          isError: true,
        };
      }
    },
  });

  // --- list_projects ---
  pi.registerTool({
    name: "linear_list_projects",
    label: "Linear: List Projects",
    description: "List Linear projects, optionally filtered by team.",
    promptSnippet: "List Linear projects (optionally filter by teamId)",
    parameters: Type.Object({
      teamId: Type.Optional(Type.String({ description: "Team ID to filter projects by" })),
    }),
    async execute(_id, params) {
      if (!client.isConfigured()) {
        return {
          content: [{ type: "text", text: "Linear API key not configured. Set LINEAR_KEY in .env.agent" }],
          details: { error: "not_configured" },
        };
      }
      try {
        const projects = await client.listProjects(params.teamId);
        if (projects.length === 0) {
          return {
            content: [{ type: "text", text: "No projects found." }],
            details: { projects: [] },
          };
        }
        const text = projects
          .map((p) => {
            const state = p.state ? ` [${p.state}]` : "";
            return `- **${p.name}**${state}\n  ${p.url}`;
          })
          .join("\n");
        return {
          content: [{ type: "text", text }],
          details: { projects },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          details: { error: e.message },
          isError: true,
        };
      }
    },
  });

  // --- list_users ---
  pi.registerTool({
    name: "linear_list_users",
    label: "Linear: List Users",
    description: "List users in the Linear workspace (useful for finding assignee IDs).",
    promptSnippet: "List Linear workspace users (id, name, email)",
    parameters: Type.Object({}),
    async execute() {
      if (!client.isConfigured()) {
        return {
          content: [{ type: "text", text: "Linear API key not configured. Set LINEAR_KEY in .env.agent" }],
          details: { error: "not_configured" },
        };
      }
      try {
        const users = await client.listUsers();
        if (users.length === 0) {
          return {
            content: [{ type: "text", text: "No users found." }],
            details: { users: [] },
          };
        }
        const text = users.map((u) => `- **${u.name}** (id: \`${u.id}\`, email: ${u.email})`).join("\n");
        return {
          content: [{ type: "text", text }],
          details: { users },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          details: { error: e.message },
          isError: true,
        };
      }
    },
  });

  // --- list_workflow_states ---
  pi.registerTool({
    name: "linear_list_workflow_states",
    label: "Linear: List Workflow States",
    description: "List workflow states for a team (useful for finding state IDs when updating issues).",
    promptSnippet: "List workflow states for a Linear team",
    parameters: Type.Object({
      teamId: Type.String({ description: "Team ID" }),
    }),
    async execute(_id, params) {
      if (!client.isConfigured()) {
        return {
          content: [{ type: "text", text: "Linear API key not configured. Set LINEAR_KEY in .env.agent" }],
          details: { error: "not_configured" },
        };
      }
      try {
        const states = await client.listWorkflowStates(params.teamId);
        if (states.length === 0) {
          return {
            content: [{ type: "text", text: "No workflow states found." }],
            details: { states: [] },
          };
        }
        const text = states.map((s) => `- **${s.name}** (type: ${s.type}, id: \`${s.id}\`)`).join("\n");
        return {
          content: [{ type: "text", text }],
          details: { states },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          details: { error: e.message },
          isError: true,
        };
      }
    },
  });

  // --- search_issues ---
  pi.registerTool({
    name: "linear_search_issues",
    label: "Linear: Search Issues",
    description: "Search Linear issues by a text query across titles and descriptions.",
    promptSnippet: "Search Linear issues by text query",
    parameters: Type.Object({
      query: Type.String({ description: "Search query text" }),
      teamId: Type.Optional(Type.String({ description: "Optional team ID to narrow search" })),
    }),
    async execute(_id, params) {
      if (!client.isConfigured()) {
        return {
          content: [{ type: "text", text: "Linear API key not configured. Set LINEAR_KEY in .env.agent" }],
          details: { error: "not_configured" },
        };
      }
      try {
        const issues = await client.listIssues({
          teamId: params.teamId,
          search: params.query,
          first: 25,
        });
        if (issues.length === 0) {
          return {
            content: [{ type: "text", text: `No issues found matching "${params.query}".` }],
            details: { issues: [] },
          };
        }
        const text = issues
          .map((i) => {
            const state = i.state ? `[${i.state.name}]` : "";
            return `- **${i.identifier}** ${state} ${i.title}\n  ${i.url}`;
          })
          .join("\n");
        return {
          content: [{ type: "text", text }],
          details: { issues },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          details: { error: e.message },
          isError: true,
        };
      }
    },
  });
}
