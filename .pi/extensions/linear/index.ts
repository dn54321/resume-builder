/**
 * Linear Extension for pi
 *
 * Provides tools and commands to interact with Linear (linear.app).
 * Reads the API key from LINEAR_KEY in .env.agent or .env.
 *
 * Tools (LLM-callable):
 *   linear_list_teams        - List workspace teams
 *   linear_list_users        - List workspace users
 *   linear_list_projects     - List projects
 *   linear_list_workflow_states - List workflow states for a team
 *   linear_list_issues       - List issues with filters
 *   linear_get_issue         - Get issue details
 *   linear_search_issues     - Search issues by text
 *   linear_create_issue      - Create an issue
 *   linear_update_issue      - Update an issue
 *   linear_add_comment       - Add a comment
 *
 * Commands:
 *   /linear                  - Show Linear connection status + recent issues
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { linearClient } from "./linear-client";
import { registerLinearTools } from "./tools";

export default async function (pi: ExtensionAPI) {
  // Load the API key on startup
  const apiKey = await linearClient.loadApiKey(process.cwd());

  if (!apiKey) {
    console.warn(
      "[linear] Linear API key not found. Set LINEAR_KEY in .env.agent or .env. Tools will return an error until configured.",
    );
  } else {
    console.warn("[linear] Linear API key loaded successfully.");
  }

  // Register all LLM-callable tools
  registerLinearTools(pi, linearClient);

  // On session start, verify connection
  pi.on("session_start", async (_event, ctx) => {
    if (!linearClient.isConfigured()) {
      ctx.ui.setStatus("linear", "Linear: not configured");
      return;
    }

    // Verify the key works by fetching teams
    try {
      const teams = await linearClient.listTeams();
      ctx.ui.setStatus("linear", `Linear: ${teams.length} team(s)`);
    } catch {
      ctx.ui.setStatus("linear", "Linear: auth failed");
    }
  });

  // Register /linear command to show status and recent issues
  pi.registerCommand("linear", {
    description: "Show Linear connection status and recent issues",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("The /linear command requires interactive mode.", "error");
        return;
      }

      if (!linearClient.isConfigured()) {
        ctx.ui.notify(
          "Linear API key not configured. Set LINEAR_KEY in .env.agent or .env.\nGet a key at https://linear.app/settings/api",
          "error",
        );
        return;
      }

      // Fetch teams and recent issues
      try {
        const teams = await linearClient.listTeams();

        ctx.ui.notify(
          `Connected to Linear — ${teams.length} team(s): ${teams.map((t) => t.name).join(", ")}`,
          "info",
        );

        // Show recent open issues across all teams
        if (teams.length > 0) {
          const issues = await linearClient.listIssues({ first: 10 });
          if (issues.length > 0) {
            const issueLines = issues.map(
              (i) => `${i.identifier} [${i.state?.name ?? "?"}] ${i.title}`,
            );
            ctx.ui.notify(`Recent issues:\n${issueLines.join("\n")}`, "info");
          }
        }
      } catch (e: any) {
        ctx.ui.notify(`Linear connection failed: ${e.message}`, "error");
      }
    },
  });
}
