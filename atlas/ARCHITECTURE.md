# Atlas — Multi-Agent Ticket Orchestration System

## Overview

Atlas is an extensible, agent-first orchestration system that spawns interactive
AI agents to implement Linear tickets. Each agent type is a self-contained unit
with its own prompts, lifecycle scripts, and skills. Agents communicate via
intercom — there are no headless processes. The boss agent controls the
orchestrator's polling frequencies in real time, and branch strategies are
fully configurable per deployment.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          atlas.sh (launcher)                          │
│   Reads atlas.config.yaml, creates tmux layout, starts orchestrator   │
└──────────────┬───────────────────────────────────┬───────────────────┘
               │                                   │
    ┌──────────▼──────────┐              ┌─────────▼──────────────┐
    │    orchestrator      │              │  boss agent            │
    │    (background)      │◄─intercom──►│  (interactive pi)      │
    │                      │              │                        │
    │  • scheduler         │              │  /set-interval <key>   │
    │  • graph builder     │              │    <seconds>           │
    │  • strategist        │              │  EPIC <ids>            │
    │  • state manager     │              │  STOP agent-2          │
    │  • webhook server    │              │  STATUS                │
    │  • pane manager      │              │  SPAWN reviewer        │
    └──────────┬───────────┘              └────────────────────────┘
               │
    ┌──────────▼──────────────────────────────────────────────────┐
    │                    agent pool (up to max_workers)             │
    │                                                              │
    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
    │  │ worker-1 │  │ worker-2 │  │ worker-3 │  │ (reviewer)  │  │
    │  │ pi -s    │  │ pi -s    │  │ pi -s    │  │  pi -s      │  │
    │  │ <prompt> │  │ <prompt> │  │ <prompt> │  │  <prompt>   │  │
    │  └──────────┘  └──────────┘  └──────────┘  └─────────────┘  │
    │                                                              │
    │  All agents are interactive pi sessions.                     │
    │  They register via intercom, receive TASK messages,          │
    │  send STATUS updates, and go IDLE when finished.             │
    └──────────────────────────────────────────────────────────────┘
```

---

## Core Principles

### 1. No Headless Workers

Every agent in Atlas is a **full interactive pi session**. Workers register with
the orchestrator via intercom, wait for task assignments, report status as they
work, and return to idle when done. This means:

- Workers persist across tickets — warm caches, loaded project context
- Workers can ask the boss questions without restarting
- The boss can send mid-task corrections without killing the process
- Workers write `agent-status.txt` with condensed thinking steps; the tmux pane shows just the high-level phases, not the full log

### 2. Banner Persistence

The right column of the tmux layout contains a **persistent banner pane** that is
never killed. If it were killed, the dashboard and boss would stretch to fill the
window, and restoring a clean vertical split would be impossible. Worker panes are
created by splitting the banner vertically (`split-window -v`) — they stack below
it. When a worker finishes, only the worker pane is killed; the banner remains.
This guarantees the two-column layout is always available for new worker spawns.
See § Tmux Pane Architecture for the full contract.

### 3. Agent-First Design

Each agent type lives in its own folder with everything it needs:

```
agents/<type>/
├── prompt.md       # System prompt (Markdown with template variables)
├── pre.sh          # Runs before the agent starts (set up env, secrets)
├── post.sh         # Runs after the agent stops (cleanup, notify)
└── skills/         # Agent-specific skills (merged with shared skills)
    └── *.md
```

Adding a new agent type means creating a folder — no code changes to the
orchestrator.

### 4. Configurable Everything

Atlas is driven by a YAML config file. The boss can adjust intervals at runtime.
Branch strategies (PR target, review target, direct-push target) are explicit
and per-deployment.

### 5. Extensible Agent Ecosystem

Agents are not just workers. Atlas supports multiple agent roles:

| Agent Type | Purpose | Spawn Trigger |
|------------|---------|---------------|
| `boss` | Oversees the system, fixes bugs, adjusts config | `atlas.sh` |
| `worker` | Implements Linear tickets | Orchestrator on ready tickets |
| `reviewer` | Reviews PRs, checks for regressions | Boss command or PR opened |
| `pr-manager` | Merges approved PRs, manages branch lifecycle | Boss command or schedule |

New agents can be added without modifying the orchestrator.

---

## Project Structure

```
atlas/
├── atlas.sh                     # Interactive launcher (tmux layout + orchestrator)
├── atlas.config.yaml            # Main configuration file
├── ARCHITECTURE.md              # This file
│
├── agents/                      # Agent type definitions
│   ├── boss/                    # Boss — oversees, fixes, configures
│   │   ├── prompt.md            #   System prompt with template variables
│   │   ├── pre.sh               #   Runs before pi starts
│   │   ├── post.sh              #   Runs after pi exits
│   │   └── skills/              #   Boss-specific skills
│   │       └── boss-commands/
│   │           └── SKILL.md
│   │
│   ├── worker/                  # Worker — implements tickets
│   │   ├── prompt.md            #   System prompt ({{PLACEHOLDER}} vars)
│   │   ├── pre.sh               #   Runs before pi starts (setup worktree env)
│   │   ├── post.sh              #   Runs after pi exits (cleanup)
│   │   └── skills/              #   Worker-specific skills
│   │       └── worker-task/
│   │           └── SKILL.md
│   │
│   ├── reviewer/                # Reviewer — reviews PRs for quality
│   │   ├── prompt.md
│   │   ├── pre.sh
│   │   ├── post.sh
│   │   └── skills/
│   │       └── code-review/
│   │           └── SKILL.md
│   │
│   └── pr-manager/              # PR Manager — merges, cleans up branches
│       ├── prompt.md
│       ├── pre.sh
│       ├── post.sh
│       └── skills/
│           └── pr-lifecycle/
│               └── SKILL.md
│
├── orchestrator/                # Core orchestration engine
│   ├── index.ts                 #   Entry point — wires everything together
│   ├── server.ts                #   Intercom + HTTP server bootstrap
│   ├── scheduler.ts             #   Main loop with configurable intervals
│   ├── graph.ts                 #   Dependency graph builder (Linear → DAG)
│   ├── pool.ts                  #   Agent pool manager (spawn, kill, health)
│   ├── strategist.ts            #   Branch strategy (PR / direct / review)
│   ├── state.ts                 #   State persistence & recovery
│   ├── types.ts                 #   All shared TypeScript types
│   └── __tests__/               #   Orchestrator unit tests
│       ├── scheduler.test.ts
│       ├── graph.test.ts
│       ├── pool.test.ts
│       ├── strategist.test.ts
│       ├── state.test.ts
│       └── fixtures/            #   Test fixtures (mock state, mock graphs)
│           ├── basic-epic.json
│           ├── multi-epic.json
│           └── complex-deps.json
│
├── integrations/                # External service integrations
│   ├── linear/                  #   Linear GraphQL API
│   │   ├── client.ts            #     API client (queries, mutations)
│   │   ├── cache.ts             #     Response cache (TTL-based)
│   │   ├── ticket-cache.ts      #     TicketInfo persistent cache
│   │   └── __tests__/
│   │       ├── client.test.ts
│   │       └── fixtures/
│   │
│   ├── github/                  #   GitHub REST + GraphQL API
│   │   ├── client.ts            #     API client (auth, base requests)
│   │   ├── pr.ts                #     PR creation, status, merge
│   │   ├── comments.ts          #     PR comment scanning
│   │   ├── conflicts.ts         #     Merge conflict detection
│   │   ├── webhooks.ts          #     Webhook registration + events
│   │   └── __tests__/
│   │       ├── pr.test.ts
│   │       ├── comments.test.ts
│   │       ├── conflicts.test.ts
│   │       └── fixtures/
│   │
│   └── intercom/                #   pi-intercom wrapper
│       ├── client.ts            #     Intercom client (connect, send, on)
│       ├── protocol.ts          #     Message protocol types & validation
│       └── __tests__/
│           └── protocol.test.ts
│
├── git/                         # Git operations (no external API)
│   ├── worktree.ts              #   Worktree create/sync/remove
│   ├── branch.ts                #   Branch create/push/delete
│   ├── merge.ts                 #   Merge to target branches
│   ├── status.ts                #   File status, meaningful work detection
│   └── __tests__/
│       ├── worktree.test.ts
│       ├── merge.test.ts
│       └── status.test.ts
│
├── tui/                         # Terminal UI (tmux panes + dashboard)
│   ├── pane-manager.ts          #   Banner-based pane lifecycle (see § Tmux Pane Architecture)
│   ├── dashboard.ts             #   Dashboard renderer (ticket graph + counts)
│   ├── launcher.ts              #   Tmux layout builder (creates session)
│   ├── scripts/                 #   Shell scripts run inside tmux panes
│   │   ├── dashboard-watch.sh   #     Polls dashboard.txt every N seconds
│   │   ├── banner.sh            #     Persistent banner — shows worker count (NEVER killed)
│   │   └── worker-pane.sh       #     Per-worker pane — tailed thinking steps
│   └── __tests__/
│       ├── pane-manager.test.ts
│       └── dashboard.test.ts
│
├── skills/                      # Shared skills (all agents have access)
│   ├── create-pr/               #   Create a GitHub pull request
│   │   └── SKILL.md
│   ├── screenshot/              #   Capture frontend screenshots
│   │   └── SKILL.md
│   ├── imgbb-upload/            #   Upload images to imgbb
│   │   └── SKILL.md
│   ├── sql-query/               #   Query database at rest
│   │   └── SKILL.md
│   └── e2e-test/                #   Run end-to-end tests
│       └── SKILL.md
│
├── state/                       # Runtime state directory (gitignored)
│   ├── atlas.json               #   Persistent orchestrator state
│   ├── logs/                    #   Agent output logs
│   │   └── <TICKET-ID>.log
│   ├── worktrees/               #   Isolated git worktrees
│   │   └── <TICKET-ID>/
│   ├── cache/                   #   Linear API + ticket data cache
│   └── panes/                   #   Tmux pane IDs + FIFOs
│       ├── banner.pane          #   Banner pane ID (PERSISTENT — never killed)
│       └── fifos/               #   Named pipes for pane communication
│
├── tests/                       # Integration + E2E tests
│   ├── integration/
│   │   ├── agent-lifecycle.test.ts   # Spawn → task → complete → idle
│   │   ├── git-workflow.test.ts      # Worktree → commit → PR → merge
│   │   ├── multi-epic.test.ts        # Multiple epics concurrently
│   │   ├── boss-commands.test.ts     # Boss intercom commands
│   │   └── recovery.test.ts          # Crash recovery scenarios
│   ├── fixtures/
│   │   ├── linear/                   # Mock Linear API responses
│   │   │   ├── single-ticket.json
│   │   │   ├── epic-with-children.json
│   │   │   └── rate-limit.json
│   │   └── github/                   # Mock GitHub API responses
│   │       ├── pr-list.json
│   │       ├── pr-comments.json
│   │       └── merge-conflict.json
│   └── helpers/
│       ├── mock-linear-server.ts     # Fake Linear GraphQL server
│       ├── mock-github-server.ts     # Fake GitHub REST server
│       └── test-harness.ts           # Agent spawn test utilities
│
├── scripts/                     # Build + dev tooling
│   ├── setup.sh                 #   First-time setup
│   ├── test.sh                  #   Run all tests with coverage
│   └── clean.sh                 #   Clean state, worktrees, cache
│
├── tsconfig.json
├── vitest.config.ts             #   Test runner configuration
└── package.json
```

---

## Configuration: `atlas.config.yaml`

```yaml
# =============================================================================
# Atlas Configuration
# =============================================================================
# This file defines all agent types, branch strategies, polling intervals,
# and integration settings. The boss can adjust intervals at runtime via
# intercom commands.
# =============================================================================

version: "2.0"

# ─── Agent Definitions ───────────────────────────────────────────────────────
# Each agent type declares its prompt, lifecycle scripts, and runtime limits.
# Adding a new agent type is a config-only change — no orchestrator code needed.
agents:

  # Maximum concurrent agents across ALL types (workers + reviewers + ...)
  max_concurrent: 4

  # ── Boss Agent ──────────────────────────────────────────────────────────
  boss:
    enabled: true
    prompt_file: agents/boss/prompt.md
    pre_script: agents/boss/pre.sh
    post_script: agents/boss/post.sh
    # Boss is spawned by atlas.sh, not the orchestrator
    spawn: manual

  # ── Worker Agent ─────────────────────────────────────────────────────────
  worker:
    enabled: true
    prompt_file: agents/worker/prompt.md
    pre_script: agents/worker/pre.sh
    post_script: agents/worker/post.sh
    spawn: on_demand          # Spawned when ready tickets exist
    max_instances: 3           # Max concurrent worker agents
    retry_limit: 2             # Max retries per ticket
    task_timeout_minutes: 30   # Kill if task exceeds this

  # ── Reviewer Agent ───────────────────────────────────────────────────────
  reviewer:
    enabled: false             # Disabled by default — boss enables at runtime
    prompt_file: agents/reviewer/prompt.md
    pre_script: agents/reviewer/pre.sh
    post_script: agents/reviewer/post.sh
    spawn: on_pr_opened        # Spawned when a worker PR is opened
    max_instances: 1
    review_checklist:
      - "Tests pass and coverage >= 90%"
      - "No security vulnerabilities"
      - "Follows project conventions (AGENTS.md)"
      - "PR body has all AC verification blocks"
      - "Frontend screenshots show normal + error states"

  # ── PR Manager Agent ─────────────────────────────────────────────────────
  pr_manager:
    enabled: false
    prompt_file: agents/pr-manager/prompt.md
    pre_script: agents/pr-manager/pre.sh
    post_script: agents/pr-manager/post.sh
    spawn: schedule            # Runs on a schedule (see intervals)
    max_instances: 1
    auto_merge_threshold_hours: 24   # Auto-merge approved PRs after this
    cleanup_stale_branches_days: 7   # Delete merged branches after this

# ─── Branch Strategy ─────────────────────────────────────────────────────────
# Defines which branches are used for PRs, reviews, and direct pushes.
strategy:

  # Default strategy when no override is specified
  default: pr                  # "pr" | "direct" | "review"

  branches:
    # Branch that PRs are created against (base branch for PRs)
    pr_target: main

    # Branch that triggers a Linear review step
    # When a PR is merged to this branch, the ticket moves to "In Review"
    review_target: staging

    # Branch that receives direct pushes (used in "direct" strategy)
    direct_push: main

    # Branch that workers branch off from (base for worktrees)
    worktree_base: main

  # Strategy overrides per branch pattern (glob)
  # Example: hotfix branches push directly, feature branches use PRs
  overrides:
    - pattern: "hotfix/*"
      strategy: direct
    - pattern: "release/*"
      strategy: direct
    - pattern: "feature/*"
      strategy: pr
      pr_target: develop          # Feature branches PR into develop
    - pattern: "experiment/*"
      strategy: review            # Experiments require review before merge

# ─── Main Loop Intervals ─────────────────────────────────────────────────────
# How often the orchestrator runs each check. Boss can adjust these at runtime:
#   /set-interval status_sync 30
#   /set-interval pr_scan 60
intervals:
  # Sync ticket statuses with Linear (seconds)
  status_sync: 10

  # Scan open PRs for unaddressed comments and merge conflicts (seconds)
  pr_scan: 10

  # Refresh the tmux dashboard (seconds)
  dashboard_refresh: 2

  # Health-check all running agents (seconds)
  agent_health: 15

  # Check for ready tickets and spawn workers (seconds)
  queue_process: 5

  # Run scheduled agents like pr_manager (seconds)
  scheduled_agents: 300      # Every 5 minutes

  # Webhook event processing timeout (seconds)
  webhook_timeout: 30

# ─── Linear Integration ──────────────────────────────────────────────────────
linear:
  # Linear team key (e.g., "RES")
  team_key: RES

  # State transitions
  transitions:
    on_start: "In Progress"
    on_done: "Done"
    on_failure: "Todo"
    on_review: "In Review"

  # API rate limit handling
  cache_ttl_minutes: 15
  max_retries_on_rate_limit: 3
  retry_backoff_ms: 1000

  # Auto-discovery
  auto_discover_epics: true   # Fetch active epics on startup

# ─── GitHub Integration ───────────────────────────────────────────────────────
github:
  # Enable webhook server (receives PR events from GitHub)
  webhook_enabled: true

  # PR metadata
  pr_labels:
    - "atlas"
    - "ai-generated"
  pr_draft: false              # Create as draft PR?

  # Merge settings
  merge_method: squash         # "merge" | "squash" | "rebase"
  delete_branch_on_merge: true

  # Review settings
  required_approvals: 1        # Auto-merge requires this many approvals

# ─── Agent Port Pool ──────────────────────────────────────────────────────────
# Ports allocated to agents for running local servers during implementation.
ports:
  min: 9000
  max: 9099

# ─── Logging ──────────────────────────────────────────────────────────────────
logging:
  level: info                  # "debug" | "info" | "warn" | "error"
  max_log_lines_per_agent: 5000
  retain_logs_days: 30

# ─── Testing ──────────────────────────────────────────────────────────────────
testing:
  # When true, orchestrator uses mock Linear/GitHub servers
  mock_external_services: false
  # Coverage threshold (enforced in CI)
  coverage_threshold: 90
  # Fixture directory for test data
  fixtures_dir: tests/fixtures
```

---

## Agent Lifecycle

### Agent Definition Contract

Every agent type must provide three files:

```
agents/<type>/
├── prompt.md       # Markdown with {{PLACEHOLDER}} template variables
├── pre.sh          # Executable, receives agent config as env vars
└── post.sh         # Executable, receives exit code + log path as env vars
```

**`prompt.md`** supports template variables:

| Variable | Populated by | Example value |
|----------|-------------|---------------|
| `{{AGENT_NAME}}` | Orchestrator | `worker-1` |
| `{{AGENT_TYPE}}` | Orchestrator | `worker` |
| `{{AGENT_PORT}}` | Orchestrator | `9001` |
| `{{TASK_TICKET_ID}}` | Orchestrator (on task assignment) | `RES-42` |
| `{{TASK_TITLE}}` | Orchestrator (on task assignment) | `Add login form` |
| `{{TASK_DESCRIPTION}}` | Orchestrator (on task assignment) | Ticket body |
| `{{TASK_DEPENDENCIES}}` | Orchestrator (on task assignment) | `RES-10, RES-13` |
| `{{WORKTREE_PATH}}` | Orchestrator (on task assignment) | `/path/to/worktree` |
| `{{STRATEGY}}` | Strategist | `pr` |
| `{{PR_TARGET}}` | Strategist | `main` |

**`pre.sh`** receives these environment variables:

| Variable | Description |
|----------|-------------|
| `ATLAS_AGENT_NAME` | Agent instance name (e.g., `worker-2`) |
| `ATLAS_AGENT_TYPE` | Agent type (e.g., `worker`) |
| `ATLAS_AGENT_PORT` | Allocated port from pool |
| `ATLAS_WORKTREE` | Worktree path (worker agents only) |
| `ATLAS_CONFIG` | Path to atlas.config.yaml |
| `ATLAS_STATE_DIR` | Path to state directory |

**`post.sh`** receives:

| Variable | Description |
|----------|-------------|
| `ATLAS_AGENT_NAME` | Agent instance name |
| `ATLAS_AGENT_EXIT_CODE` | pi process exit code |
| `ATLAS_AGENT_LOG` | Path to agent's log file |
| `ATLAS_WORKTREE` | Worktree path (if applicable) |

### Worker Agent Lifecycle

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                      WORKER AGENT LIFECYCLE                       │
 │                                                                   │
 │  ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌─────────────┐  │
 │  │  SPAWN   │───►│  IDLE    │───►│  ACTIVE  │───►│  COMPLETING │  │
 │  │          │    │          │    │          │    │             │  │
 │  │ pre.sh   │    │ Waiting  │    │ Working  │    │ Creating PR │  │
 │  │ pi -s    │    │ for task │    │ on ticket│    │ or merging  │  │
 │  │ register │    │          │    │          │    │             │  │
 │  └─────────┘    └──────────┘    └──────────┘    └──────┬──────┘  │
 │       ▲              ▲              │                   │         │
 │       │              │              │                   ▼         │
 │       │              │              │            ┌─────────────┐  │
 │       │              └──────────────┼────────────│  REPORTING  │  │
 │       │                             │            │             │  │
 │       │                     TASK received        │ DONE: <url> │  │
 │       │                             │            │ IDLE <uuid> │  │
 │       │                             │            └──────┬──────┘  │
 │       │                             │                   │         │
 │       │                             ▼                   │         │
 │       │                      ┌──────────┐              │         │
 │       │                      │  STUCK   │              │         │
 │       │                      │          │──────────────┘         │
 │       │                      │ Asking   │  Boss resolved         │
 │       │                      │ boss for │                        │
 │       │                      │ help     │                        │
 │       │                      └──────────┘                        │
 │       │                                                          │
 │       └──────────────────────────────────────────────────────────┘
 │                          Returns to IDLE                          │
 └──────────────────────────────────────────────────────────────────┘
```

### Intercom Protocol

All communication between the orchestrator, boss, and agents uses intercom
with a structured message protocol:

**Agent → Orchestrator:**

| Message | Description |
|---------|-------------|
| `REGISTER <uuid> <agent_type> <agent_name>` | Register with orchestrator |
| `IDLE <uuid>` | Agent is free for a new task |
| `STATUS <uuid> <phase>` | Current work phase (e.g., "Implementing auth") |
| `ERROR <uuid> <description>` | Report a non-fatal error |

**Agent → Boss:**

| Message | Description |
|---------|-------------|
| `ASK <uuid> <question>` | Blocking question — waits for boss reply |
| `DONE <uuid> <pr_url>` | Task complete with PR URL |
| `FAILED <uuid> <reason>` | Task failed with reason |

**Orchestrator → Agent:**

| Message | Description |
|---------|-------------|
| `TASK <uuid> <ticket_json>` | Assign a ticket to the agent |
| `STOP <uuid>` | Kill current task, return to idle |
| `RECONFIGURE <uuid> <config_json>` | Update agent's runtime config |

**Boss → Orchestrator:**

| Message | Description |
|---------|-------------|
| `BOSS: <session_id>` | Register as boss |
| `EPIC <id1> <id2> ...` | Add epics to management |
| `TICKET <id1> ...` | Add standalone tickets |
| `DROP <id>` | Remove epic/ticket |
| `STOP` | Halt all agents |
| `STOP <agent_name>` | Halt specific agent |
| `CLOSE <id>` | Close ticket in Linear |
| `STATUS` | Get current state summary |
| `SPAWN <agent_type>` | Spawn a new agent of type |
| `KILL <agent_type>` | Kill all agents of type |
| `SET_INTERVAL <key> <seconds>` | Adjust scheduler interval |
| `SET_STRATEGY <strategy>` | Change default branch strategy |
| `GET_CONFIG` | Return current effective configuration |

**Boss → Agent:**

| Message | Description |
|---------|-------------|
| `REPLY <uuid> <answer>` | Answer to an ASK question |
| `SUGGEST <uuid> <suggestion>` | Unsolicited suggestion for the agent |

---

## Agent Prompt Structure

### Worker Prompt (`agents/worker/prompt.md`)

```markdown
# {{AGENT_NAME}} — {{AGENT_TYPE}} Agent

You are an Atlas worker agent. Your job is to implement Linear tickets.

## Identity
- Name: {{AGENT_NAME}}
- Port: {{AGENT_PORT}}
- Worktree: {{WORKTREE_PATH}}

## Startup

1. /name {{AGENT_NAME}}
2. Register with the orchestrator:
   intercom({ action: "send", to: "orchestrator", message: "REGISTER <your-uuid> worker {{AGENT_NAME}}" })
   intercom({ action: "send", to: "orchestrator", message: "IDLE <your-uuid>" })

## When you receive a TASK

The orchestrator will send you:
```
TASK <uuid> {"identifier":"RES-42","title":"...","description":"...","deps":["RES-10"]}
```

Then follow these steps:

### 1. Understand the task
Read the ticket description. Identify dependencies ({{TASK_DEPENDENCIES}}).
Read AGENTS.md for project conventions.

### 2. Implement changes
Work in your worktree at {{WORKTREE_PATH}}.
Follow the project conventions in AGENTS.md.

### 3. Report progress
Write one line per phase to `agent-status.txt` in the worktree root.
Prefix active steps with `▸`, completed steps with `✓`, failed steps with `✗`.
One line per phase, present tense. This drives the condensed thinking-steps
display in your tmux pane:
```
▸ Implementing login form component
▸ Writing tests for auth validation
  ✓ Codebase read complete
  ✓ Dependencies resolved
```
Send phase changes to boss:
  intercom({ action: "send", to: "boss", message: "STATUS <uuid> Implementing X" })

### 4. Test
- Backend: pnpm type-check && pnpm lint && pnpm test
- Frontend: pnpm type-check && pnpm lint && pnpm test:unit
- Use the e2e-test skill for API/UI changes.
- Coverage must be >= 90%.

### 5. Verify rendered output
Test what the user SEES, not just what events are emitted.
Test full round-trips: component → store → component.

### 6. Write PR body
Write pr-body.md following the template (see create-pr skill).

### 7. Complete
Commit your changes.
Notify the boss:
  intercom({ action: "send", to: "boss", message: "DONE <uuid> <pr-url>" })
Go idle:
  intercom({ action: "send", to: "orchestrator", message: "IDLE <uuid>" })

## Strategy: {{STRATEGY}}

The current strategy is **{{STRATEGY}}** targeting branch **{{PR_TARGET}}**.
{% if STRATEGY == "direct" %}
The orchestrator will merge your branch directly to {{PR_TARGET}}.
{% else %}
The orchestrator will create a PR against {{PR_TARGET}}.
{% endif %}

## Important
- Never run prisma migrate dev, prisma db push, or pnpm format.
- Write agent-status.txt with current phase (one line).
- Use skills for screenshots, SQL queries, and PR creation.
- If stuck: intercom({ action: "ask", to: "boss", message: "ASK <uuid> ..." })
```

### Boss Prompt (`agents/boss/prompt.md`)

```markdown
# Boss Agent — Atlas Overseer

You are the BOSS. Oversee Atlas, fix bugs, adjust configuration, and ensure
tickets get implemented correctly.

## Startup

1. /name boss
2. Register:
   intercom({ action: "send", to: "orchestrator", message: "BOSS: <session-id>" })

## Your Tools

### Viewing State
- Dashboard: cat state/dashboard.txt
- Server log: cat state/logs/orchestrator.log
- Agent logs: cat state/logs/<TICKET-ID>.log
- State file: cat state/atlas.json
- Config: cat atlas.config.yaml

### Commands (send to "orchestrator" via intercom)

| Command | Effect |
|---------|--------|
| EPIC <id1> <id2> | Add epics to management |
| TICKET <id1> | Add standalone ticket |
| DROP <id> | Remove epic/ticket |
| STOP | Halt all agents |
| STOP <name> | Halt specific agent |
| CLOSE <id> | Close ticket in Linear |
| STATUS | Get state summary |
| SPAWN <type> | Spawn new agent |
| KILL <type> | Kill all agents of type |
| SET_INTERVAL <key> <s> | Adjust scheduler interval |
| SET_STRATEGY <strategy> | Change default strategy |
| GET_CONFIG | Show effective config |

### Adjusting Intervals

View current intervals: GET_CONFIG
Change an interval: SET_INTERVAL pr_scan 30

Avaiailable intervals: status_sync, pr_scan, dashboard_refresh,
agent_health, queue_process, scheduled_agents

### Spawning New Agent Types

SPAWN reviewer     — Start a reviewer agent
SPAWN pr_manager   — Start a PR manager agent
KILL reviewer      — Stop all reviewer agents

### Bug Fix Protocol

If you find a bug in Atlas itself (orchestrator, integrations, agents):
1. Fix the bug
2. Commit and push DIRECTLY to master:
   git add <files> && git commit -m "fix(atlas): <description>" && git push origin master
3. Do NOT create a PR for Atlas fixes — deploy immediately.

If you find a bug in an agent's prompt or skills, update the files in
agents/<type>/ — the next spawned agent will pick up the changes.

## Priority
1. Fix bugs that block ticket implementation
2. Answer worker ASK messages immediately
3. Monitor dashboard for stuck/failed tickets
4. Proactively re-prioritize if needed (DROP old epics, EPIC new ones)
```

---

## Scheduler (`orchestrator/scheduler.ts`)

The scheduler runs the main loop with **configurable intervals** that the boss
can adjust at runtime. Each action has its own interval.

```typescript
interface SchedulerConfig {
  intervals: {
    status_sync: number;        // seconds
    pr_scan: number;
    dashboard_refresh: number;
    agent_health: number;
    queue_process: number;
    scheduled_agents: number;
    webhook_timeout: number;
  };
}

class Scheduler {
  private config: SchedulerConfig;
  private timers: Map<string, NodeJS.Timeout> = new Map();

  // Boss can call this at runtime
  setInterval(key: string, seconds: number): void {
    this.config.intervals[key] = seconds;
    this.reschedule(key);
  }

  private schedule(key: string, fn: () => Promise<void>, interval: number): void {
    const run = async () => {
      await fn();
      this.timers.set(key, setTimeout(run, interval * 1000));
    };
    run();
  }

  start(): void {
    this.schedule('status_sync',   () => this.syncLinearStatus(),     this.config.intervals.status_sync);
    this.schedule('pr_scan',       () => this.scanPRs(),              this.config.intervals.pr_scan);
    this.schedule('dashboard',     () => this.renderDashboard(),      this.config.intervals.dashboard_refresh);
    this.schedule('health',        () => this.checkAgentHealth(),     this.config.intervals.agent_health);
    this.schedule('queue',         () => this.processQueue(),         this.config.intervals.queue_process);
    this.schedule('scheduled',     () => this.runScheduledAgents(),   this.config.intervals.scheduled_agents);
  }
}
```

### Scheduler Actions

| Action | Interval Key | What It Does |
|--------|-------------|--------------|
| `syncLinearStatus` | `status_sync` | Query Linear for ticket state changes, sync to internal state |
| `scanPRs` | `pr_scan` | Find unaddressed comments, merge conflicts, PR merges/closures |
| `renderDashboard` | `dashboard_refresh` | Write `state/dashboard.txt` for tmux display |
| `checkAgentHealth` | `agent_health` | Verify all registered agents are still alive via intercom ping |
| `processQueue` | `queue_process` | Check for ready tickets, spawn workers if slots available |
| `runScheduledAgents` | `scheduled_agents` | Run schedule-based agents (e.g., pr_manager) |

---

## Strategist (`orchestrator/strategist.ts`)

The strategist determines how completed work reaches the target branch.

```typescript
type Strategy = 'pr' | 'direct' | 'review';

interface StrategyConfig {
  default: Strategy;
  branches: {
    pr_target: string;
    review_target: string;
    direct_push: string;
    worktree_base: string;
  };
  overrides: Array<{
    pattern: string;     // glob pattern for branch name
    strategy: Strategy;
    pr_target?: string;
  }>;
}

class Strategist {
  resolve(branchName: string, ticketId: string): ResolvedStrategy {
    // 1. Check overrides for a matching glob pattern
    for (const override of this.config.overrides) {
      if (matchGlob(branchName, override.pattern)) {
        return this.buildStrategy(override.strategy, override.pr_target);
      }
    }
    // 2. Fall back to default
    return this.buildStrategy(this.config.default);
  }

  async execute(node: GraphNode): Promise<StrategyResult> {
    const strategy = this.resolve(node.state.branch, node.ticket.identifier);

    switch (strategy.type) {
      case 'direct':
        // Merge directly to direct_push branch
        return this.mergeDirect(node, strategy.targetBranch);

      case 'pr':
        // Create PR against pr_target branch
        return this.createPullRequest(node, strategy.targetBranch);

      case 'review':
        // Create PR against review_target, add review labels
        return this.createReviewPR(node, strategy.targetBranch);
    }
  }
}
```

### Strategy Resolution

```
┌─────────────────────────────────────────────────────────────┐
│                    Strategy Resolution                       │
│                                                              │
│  Ticket branch: ticket/res-42                                │
│                                                              │
│  1. Check overrides:                                         │
│     ✓ pattern "ticket/*" → no match (no override for this)   │
│     ✓ pattern "hotfix/*" → no match                          │
│                                                              │
│  2. Use default: pr                                          │
│     → Create PR against pr_target (main)                     │
│                                                              │
│  ─────────────────────────────────────────                  │
│                                                              │
│  Ticket branch: hotfix/security-patch                        │
│                                                              │
│  1. Check overrides:                                         │
│     ✓ pattern "hotfix/*" → MATCH! Strategy: direct           │
│     → Push directly to direct_push (main)                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Agent Pool Manager (`orchestrator/pool.ts`)

Manages the lifecycle of all non-boss agents. Spawns, kills, health-checks.

```typescript
interface PoolState {
  agents: Map<string, AgentInstance>;
  maxConcurrent: number;
}

interface AgentInstance {
  id: string;                // UUID
  name: string;              // "worker-1", "reviewer"
  type: AgentType;           // "worker" | "reviewer" | "pr_manager"
  process: ChildProcess;
  status: 'spawning' | 'idle' | 'active' | 'stuck' | 'stopping';
  currentTask: string | null; // Ticket ID if active
  port: number;
  paneId: string | null;     // Tmux pane ID
  logPath: string;
  spawnedAt: number;
  lastHeartbeat: number;
}

class AgentPool {
  async spawn(type: AgentType): Promise<AgentInstance> {
    // 1. Load agent definition from config
    // 2. Allocate port from pool
    // 3. Run pre.sh
    // 4. Build prompt from prompt.md + template variables
    // 5. Create worker pane by splitting the banner:
    //    tmux split-window -P -F '#{pane_id}' -v -t <banner-pane> -l 8 "bash"
    //    (pane manager returns the real pane id, e.g. "%3")
    // 6. Launch pi inside the pane via tmux send-keys (real TTY):
    //    unset PI_* session vars; export ATLAS_* env; then
    //    pi --system-prompt @prompt.md + /name + REGISTER/IDLE commands
    // 7. Wait for REGISTER intercom message
    // 8. Return AgentInstance (processPid=null — pi lives in the pane)
    // NOTE: The banner pane is NEVER killed (see § Tmux Pane Architecture)
  }

  async assignTask(agent: AgentInstance, ticket: TicketInfo): Promise<void> {
    // 1. Ensure worktree exists and is synced
    // 2. Build TASK message with ticket JSON
    // 3. Send via intercom: TASK <uuid> {"identifier":...}
    // 4. Wait for agent to acknowledge
    // 5. Update agent status → active
    //    (the worker writes agent-status.txt in the worktree; its pane
    //    shows the live pi session, so no FIFO tailing is needed)
  }

  async stop(agent: AgentInstance): Promise<void> {
    // 1. Send STOP <uuid> via intercom
    // 2. Wait for graceful shutdown (timeout: 30s)
    // 3. Run post.sh
    // 4. paneManager.killWorkerPane(name) → tmux kill-pane
    //    → space returns to banner/boss, right column preserved
  }

  async healthCheck(): Promise<HealthReport> {
    // 1. Ping each agent via intercom
    // 2. Check process is alive (kill -0)
    // 3. Check heartbeat recency
    // 4. Restart dead agents if they had active tasks
    // 5. CRITICAL: verify banner pane still exists
    //    If banner is gone, right column collapsed — must recreate layout
  }
}
```

---

## Testing Strategy

Atlas is designed for testability. Every module is independently testable.

### Unit Tests (`__tests__/` alongside each module)

| Module | What's Tested |
|--------|---------------|
| `orchestrator/graph.ts` | Graph building from Linear responses, dependency wiring, cycle detection, state recovery |
| `orchestrator/scheduler.ts` | Interval scheduling, rescheduling, action execution order |
| `orchestrator/pool.ts` | Agent spawn, task assignment, stop, health check |
| `orchestrator/strategist.ts` | Strategy resolution, override matching, merge/PR/review execution |
| `orchestrator/state.ts` | Save/load/merge state, corruption recovery |
| `integrations/linear/client.ts` | Query construction, response parsing, error handling, caching |
| `integrations/github/pr.ts` | PR creation, status checks, merge detection |
| `integrations/github/comments.ts` | Unaddressed comment detection, bot filtering |
| `integrations/github/conflicts.ts` | File overlap detection, conflict reporting |
| `integrations/intercom/protocol.ts` | Message parsing, validation, malformed message handling |
| `git/worktree.ts` | Create, sync, remove worktrees |
| `git/merge.ts` | Merge strategies, conflict handling |
| `git/status.ts` | Meaningful work detection, generated file filtering |

### Integration Tests (`tests/integration/`)

| Test | What It Verifies |
|------|-----------------|
| `agent-lifecycle.test.ts` | Full lifecycle: spawn → idle → task → active → done → idle |
| `git-workflow.test.ts` | Worktree setup → commit → PR creation → merge detection |
| `multi-epic.test.ts` | Multiple epics concurrently, worker sharing, state isolation |
| `boss-commands.test.ts` | Every boss command produces correct state change |
| `recovery.test.ts` | Crash during task, restart, resume without duplicate work |

### Test Infrastructure

```typescript
// tests/helpers/test-harness.ts
class AtlasTestHarness {
  // Start orchestrator with mock services
  static async start(config: Partial<AtlasConfig>): Promise<HarnessInstance>;

  // Create a mock Linear server with fixture responses
  static mockLinearServer(fixtures: LinearFixture[]): MockServer;

  // Create a mock GitHub server with fixture responses
  static mockGitHubServer(fixtures: GitHubFixture[]): MockServer;

  // Spawn a test agent (lightweight, no real pi process)
  static async spawnTestAgent(type: AgentType): Promise<TestAgent>;

  // Send a boss command and wait for result
  static async bossCommand(command: string): Promise<CommandResult>;

  // Assert on orchestrator state
  static async getState(): Promise<OrchestratorState>;
}
```

### Coverage

```bash
# Run all tests with coverage
cd atlas && pnpm test:cov

# Minimum threshold: 90% (branches, functions, lines, statements)
# Configured in vitest.config.ts
```

---

## Tmux Pane Architecture

### Why the banner must never be deleted

The tmux layout has a structural invariant: the **right column must always exist**.
If all panes in the right column are killed, tmux collapses the layout — the dashboard
and boss stretch to occupy the full window width. Once that happens, there is no way
to cleanly restore a vertical split down the middle: `split-window -h` from the dashboard
would bisect just the dashboard, and from the boss would bisect just the boss. Neither
recreates the original two-column layout.

To prevent this, Atlas uses a **persistent banner pane** in the right column. This
pane runs `banner.sh` — a tiny script (~3 lines tall) that displays the current worker
count: `Workers: 2/3 active`. The banner is **never killed**. Worker panes are created
by splitting the banner **vertically** (`split-window -v`), so they stack below it.

### Layout with 2 active workers

```
┌──────────────┬────────────────────────┐
│              │  ═══ Workers: 2/3 ═══  │ ← Banner (3 lines, PERSISTENT)
│              ├────────────────────────┤
│  Dashboard   │  worker-1  RES-42      │ ← Worker pane (~8 lines)
│              │  ▸ Implementing auth    │   Shows condensed thinking steps
│              │  ▸ Writing tests        │
│              ├────────────────────────┤
│              │  worker-2  RES-13      │ ← Worker pane (~8 lines)
├──────────────┤  ▸ Reading codebase     │
│  Boss (pi)   │                        │
└──────────────┴────────────────────────┘
```

### Layout when all workers are idle (no worker panes)

```
┌──────────────┬────────────────────────┐
│              │  ═══ Workers: 0/3 ═══  │ ← Banner (PERSISTENT — right column survives)
│              │                        │
│  Dashboard   │                        │
│              │                        │
│              │                        │
├──────────────┤                        │
│  Boss (pi)   │                        │
└──────────────┴────────────────────────┘
```

The banner preserves the vertical split. When a new worker spawns, the pane manager
splits the banner vertically and the worker appears below it — exactly where the
previous workers were.

### Worker pane sizing

Worker panes are compact by design. Rather than tailing the full agent log, each
worker pane shows a **condensed thinking-steps view** — the high-level phases the
agent is working through, one line each:

```
worker-1  RES-42  [active 4m]
▸ Implementing login form component
▸ Writing tests for auth validation
  ✓ Codebase read complete
  ✓ Dependencies resolved
```

This is driven by the `agent-status.txt` file in the worktree. The agent writes a
single line per phase (e.g., `Implementing login form component`). The pane display
script (`worker-pane.sh`) reads from a FIFO that the orchestrator updates whenever
the status file changes, keeping the display fresh without tailing verbose logs.

The banner gets the minimum possible height (3 lines). Worker panes get a fixed
height (~8 lines each). When more workers spawn than can fit, the pane manager
shrinks existing worker panes proportionally, with a floor of 4 lines before
workers spill into "...and N more" in the banner.

### Pane lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                        PANE LIFECYCLE                            │
│                                                                  │
│  atlas.sh creates:                                               │
│    Pane 0: dashboard (left, full height)                         │
│    Pane 1: banner (right, top, 3 lines)                          │
│    Pane 2: boss (left, bottom)                                   │
│                                                                  │
│  Worker spawned → pane-manager:                                  │
│    1. split-window -v -t <banner> -l 8                          │
│    2. Send THINKING:<logpath> to new pane's FIFO                 │
│    3. worker-pane.sh starts tailing agent-status.txt             │
│                                                                  │
│  Worker finished → pane-manager:                                 │
│    1. Send IDLE to worker pane's FIFO                            │
│    2. kill-pane -t <worker-pane>                                 │
│    3. Banner remains — space redistributes to banner+boss        │
│                                                                  │
│  Worker killed/evicted → same as finished                        │
│                                                                  │
│  Banner is NEVER killed. If it somehow dies, launcher.ts         │
│  must recreate the entire tmux layout.                           │
└─────────────────────────────────────────────────────────────────┘
```

### `banner.sh`

```bash
#!/bin/bash
# banner.sh — Persistent worker count banner. NEVER killed.
# Reads from workers.fifo, displays compact status bar.

MAX_WORKERS="${1:-3}"
FIFO_DIR="${2:-/tmp/atlas-fifos}"
WORKERS_FIFO="$FIFO_DIR/workers.fifo"

[ ! -p "$WORKERS_FIFO" ] && mkfifo "$WORKERS_FIFO" 2>/dev/null

clear
printf '═══ Workers: 0/%s ═══\n\n' "$MAX_WORKERS"

while true; do
  read -r line < "$WORKERS_FIFO" || continue
  case "$line" in
    UPDATE:*)
      payload="${line#UPDATE:}"
      count="${payload%%:*}"
      assignments="${payload#*:}"
      clear
      if [ "$count" -gt 0 ] 2>/dev/null; then
        printf '═══ Workers: %s/%s ═══\n' "$count" "$MAX_WORKERS"
        IFS=',' read -ra PAIRS <<< "$assignments"
        for pair in "${PAIRS[@]}"; do
          [ -z "$pair" ] && continue
          agent="${pair%%=*}"
          ticket="${pair#*=}"
          printf ' %s → %s\n' "$agent" "$ticket"
        done
      else
        printf '═══ Workers: 0/%s ═══\n\n' "$MAX_WORKERS"
      fi
      ;;
  esac
done
```

### `worker-pane.sh`

> **Note (current design):** worker panes no longer run this script. Since the
> pane wiring was introduced, a worker pane runs a plain `bash` shell and the
> AgentPool launches pi inside it via `tmux send-keys` — the pane shows the
> worker's live pi session (real TTY), exactly like the boss pane. This script
> and the per-agent FIFO (THINKING/IDLE) are retained for bookkeeping and
> historical reference only.

```bash
#!/bin/bash
# worker-pane.sh — Condensed thinking-steps display for a worker agent.
# Reads from <agent>.fifo. Commands:
#   THINKING:<worktree-path>  → tail -f agent-status.txt
#   IDLE                       → show idle state

AGENT_NAME="${1:-unknown}"
FIFO_DIR="${2:-/tmp/atlas-fifos}"
FIFO="$FIFO_DIR/${AGENT_NAME}.fifo"

[ ! -p "$FIFO" ] && mkfifo "$FIFO" 2>/dev/null

cleanup() { kill %1 2>/dev/null; exit 0; }
trap cleanup EXIT INT TERM

clear
printf '\n  %s: idle\n\n' "$AGENT_NAME"

while true; do
  read -r line < "$FIFO" || continue
  kill %1 2>/dev/null; wait 2>/dev/null

  case "$line" in
    IDLE)
      clear
      printf '\n  %s: idle\n\n' "$AGENT_NAME"
      ;;
    THINKING:*)
      status_file="${line#THINKING:}/agent-status.txt"
      clear
      printf '\n  %s\n' "$AGENT_NAME"
      printf '  ───────────────────────────\n'
      # Follow the status file, show last 6 lines
      tail -n 6 -f "$status_file" 2>/dev/null &
      ;;
  esac
done
```

## Launch: `atlas.sh`

```bash
#!/usr/bin/env bash
# atlas.sh — Launch the Atlas multi-agent orchestration system.
#
# Layout (see § Tmux Pane Architecture for rules):
#   ┌──────────────┬────────────────────────┐
#   │              │  ═══ Workers: 0/3 ═══  │ ← Banner (PERSISTENT)
#   │  Dashboard   │                        │
#   │              │  (worker panes split    │
#   │              │   from banner when      │
#   ├──────────────┤   agents are spawned)   │
#   │  Boss (pi)   │                        │
#   └──────────────┴────────────────────────┘

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Load config
CONFIG="$SCRIPT_DIR/atlas.config.yaml"
# Parse with yq or node

# 2. Clean up previous session
pkill -f "atlas.*orchestrator" 2>/dev/null || true
tmux kill-session -t "atlas" 2>/dev/null || true
sleep 1

# 3. Start orchestrator (it eagerly creates FIFOs + banner script)
npx tsx orchestrator/index.ts &
ORCHESTRATOR_PID=$!

# 4. Create tmux layout
#    - Ensure remain-on-exit so killed worker panes don't close the window
#    - Pane 0: Dashboard (left, full height) — dashboard-watch.sh
#    - Pane %1: Banner (right, top, 3 lines) — banner.sh (PERSISTENT)
#    - Pane %2: Boss (left, bottom) — pi --append-system-prompt @agents/boss/prompt.md
#
# tmux set-option -g remain-on-exit on
tmux new-session -d -s "atlas" -c "$SCRIPT_DIR" \
  "$SCRIPT_DIR/tui/scripts/dashboard-watch.sh $SCRIPT_DIR/state/dashboard.txt"
tmux split-window -h -t "atlas:0" -c "$SCRIPT_DIR" \
  "$SCRIPT_DIR/tui/scripts/banner.sh $MAX_WORKERS $SCRIPT_DIR/state/panes/fifos"
tmux split-window -v -t "atlas:0.0" -c "$SCRIPT_DIR" -l 10 \
  "pi --append-system-prompt @$SCRIPT_DIR/agents/boss/prompt.md Start"

# 5. Attach tmux
tmux attach-session -t "atlas"
```

---

## Migrating from v1 (Ticket Agent System)

| v1 Concept | v2 (Atlas) Equivalent |
|-----------|----------------------|
| `.pi/extensions/ticket/` | `atlas/` |
| `agent.sh` | `atlas/atlas.sh` |
| `server-daemon.ts` | `orchestrator/index.ts` + `orchestrator/server.ts` |
| `orchestrator.ts` (monolithic) | `orchestrator/graph.ts` + `orchestrator/pool.ts` + `orchestrator/strategist.ts` |
| Hardcoded intervals (10s) | Configurable `intervals` in atlas.config.yaml |
| Headless workers (`--no-session`) | Interactive agents (`-s` with intercom) |
| `MERGE_MODE=direct\|pr` in .env | `strategy.default` + `strategy.branches` in config |
| Single `worker-prompt.md` | `agents/worker/prompt.md` with template variables |
| No pre/post scripts | `agents/<type>/pre.sh` + `agents/<type>/post.sh` |
| `tmux-controller.ts` + `pane-service.ts` (placeholder could be killed) | `tui/pane-manager.ts` (banner is PERSISTENT — never killed) |
| `github-pr.ts` (monolithic) | `integrations/github/pr.ts` + `comments.ts` + `conflicts.ts` + `webhooks.ts` |
| `.env.agent` | `atlas.config.yaml` |
| `.pi/tickets/state.json` | `state/atlas.json` |
| No tests | `__tests__/` at every level + `tests/integration/` |
| Ticket agent only | Worker + Boss + Reviewer + PR Manager agents |
| No boss interval control | `/set-interval` boss command |
| Single branch target | Per-strategy branch targets with overrides |

---

## Extending Atlas: Adding a New Agent Type

1. Create the agent folder:
   ```
   agents/notifier/
   ├── prompt.md
   ├── pre.sh
   └── post.sh
   ```

2. Add to `atlas.config.yaml`:
   ```yaml
   agents:
     notifier:
       enabled: false
       prompt_file: agents/notifier/prompt.md
       pre_script: agents/notifier/pre.sh
       post_script: agents/notifier/post.sh
       spawn: on_pr_merged    # Spawn when a PR is merged
       max_instances: 1
   ```

3. Implement the agent's prompt with the intercom protocol

4. Add any agent-specific skills to `agents/notifier/skills/`

5. If the spawn trigger is new (not `on_demand`, `on_pr_opened`, `schedule`,
   `manual`), add a handler in `orchestrator/pool.ts`.

No orchestrator code changes are needed for existing spawn triggers.

---

## Error Recovery

### Agent crashes mid-task

1. Health check detects dead agent (process gone, no heartbeat)
2. Pool manager checks worktree for meaningful work
3. If work exists → mark ticket `done` (agent completed before crash)
4. If no work → reset ticket to `pending`, spawn new agent
5. Ticket retry_count incremented

### Orchestrator crashes

1. `atlas.sh` detects orchestrator exit
2. Reads `state/atlas.json` on restart
3. Checks each agent's worktree for commits
4. Rebuilds graph from cached Linear data
5. Resumes agent pool from last known state
6. Agents that were `active` are pinged — if alive, re-assigned; if dead, tasks re-queued

### State corruption

1. `state.ts` validates state on load
2. Corrupt entries are dropped
3. Worktrees are scanned for existing commits
4. Tickets with committed work are marked `done`
5. Tickets without work are reset to `pending`

### GitHub API rate limiting

1. PR scan uses conditional requests (`If-None-Match`)
2. Comment scan results cached for 60 seconds
3. Webhook events trigger targeted refreshes (not full scans)
4. Exponential backoff on 429 responses
