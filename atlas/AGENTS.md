# AGENTS.md — Atlas (ticket agent system)

Atlas-specific instructions for agents operating the multi-agent orchestration
system in `atlas/`. General repository guidelines (testing, conventions,
security) live in the root [`AGENTS.md`](../AGENTS.md).

## ⚠️ Read first: atlas/agent.md

Any agent that will touch the Atlas tmux session MUST read
[`agent.md`](./agent.md) first. It contains the safety rules that prevent real
damage — in particular: **NEVER use `tmux send-keys` to type into tmux panes**
(it froze the entire live Atlas session by triggering tmux's own prompt mode).
Use `tmux capture-pane` (read-only) instead.

## Ticket Agent System

The ticket agent system is **Atlas** (`atlas/`). See `atlas/ARCHITECTURE.md`
for the full architecture.

### Quickstart

```bash
./agent.sh
```

Launches the Atlas multi-agent orchestration system. The orchestrator
auto-discovers active tickets from Linear on startup. The boss (an
interactive pi session) can add work via `EPIC <id>` and `TICKET <id>`
commands.

### Secrets

All secrets go in `.env.agent` (template: `.env.agent.template`):

| Key | Purpose | Source |
|-----|---------|--------|
| `LINEAR_API_KEY` | Linear GraphQL API (fetch tickets, transition states) | Linear settings → API keys, or `/linear-auth` in pi |
| `GITHUB_PAT_KEY` | GitHub API (create PRs, scan comments, detect merge conflicts, register webhooks) | GitHub → Settings → Developer settings → Personal access tokens (classic) → `repo` scope |
| `NGROK_AUTHTOKEN` | ngrok tunnel for receiving GitHub webhooks on localhost | [dashboard.ngrok.com](https://dashboard.ngrok.com/get-started/your-authtoken) (free tier works) |
| `IMGBB_API_KEY` | imgbb image hosting for PR screenshots | [api.imgbb.com](https://api.imgbb.com) |

Agent config is now in `atlas/atlas.config.yaml` (not `.env.agent`).

### Architecture

```
atlas/
├── atlas.sh                     # Interactive launcher (tmux layout)
├── atlas.config.yaml            # All configuration
├── orchestrator/                # Core engine
│   ├── server.ts                # Intercom server + main loop
│   ├── scheduler.ts             # Configurable interval scheduler
│   ├── graph.ts                 # Dependency graph builder
│   ├── pool.ts                  # Agent lifecycle manager
│   ├── strategist.ts            # PR/direct/review strategy resolver
│   ├── state.ts                 # State persistence & recovery
│   └── types.ts                 # Shared types
├── agents/                      # Agent type definitions
│   ├── boss/prompt.md           # Boss system prompt
│   └── worker/                  # Worker prompt + pre/post scripts
├── integrations/                # Linear, GitHub, Intercom clients
├── git/                         # Worktree + branch operations
├── tui/                         # Tmux pane manager + scripts
└── skills/                      # Shared agent skills
```

### How it works

1. **Graph building:** Fetches a ticket and all its children/dependencies from
   Linear, builds a DAG. Blocked tickets wait for their dependencies to finish.

2. **Agent pool:** One-shot workers are spawned per ticket (`pi -p`,
   non-interactive) with the task embedded in the prompt. They exit when done
   and new workers spawn for the next tickets. No persistent workers, no
   intercom TASK handoff.

3. **Completion:** On success, the strategist determines how to deliver the
   work: create a PR (`pr` strategy), merge directly (`direct`), or create a
   review PR (`review`). Strategy is configurable with glob-based overrides
   per branch pattern.

4. **Webhooks:** A local HTTP server receives GitHub events. Ngrok exposes it
   to the internet. On `pull_request` and comment events, merge conflicts and
   unaddressed comments are re-scanned.

5. **Banner persistence:** The right column of the tmux layout has a
   persistent banner pane that is never killed. Worker panes split from
   it vertically. This guarantees the two-column layout is always available.

6. **Boss control:** The boss can adjust scheduler intervals at runtime
   (`SET_INTERVAL pr_scan 30`), spawn/kill agent types (`SPAWN reviewer`),
   and change strategies. See `atlas/ARCHITECTURE.md` for full protocol.

### State persistence

State is saved to `atlas/state/atlas.json`. On restart, the system loads
previous state, checks liveness of running agents, and recovers completed
work from worktree commits.

### Testing conventions

When testing agent system changes:
1. Start with `./agent.sh`
2. Verify the tmux layout renders (dashboard, banner, boss)
3. Send `STATUS` via the boss — verify agents are spawning
4. Press `q` to quit — verify `ps aux | grep pi` shows no orphaned processes
5. Check `atlas/state/atlas.json` for saved state
