# AGENTS.md — Project conventions for coding agents

## Testing

### Coverage minimum: 90%

Both backend and frontend enforce a **90% minimum coverage threshold** across
all metrics: branches, functions, lines, and statements. The build fails if
coverage drops below this threshold.

```bash
# Backend (Jest)
cd backend && npm run test:cov

# Frontend (Vitest)
cd frontend && npm run test:cov
```

**Rules:**
- Every new feature must include tests that maintain or improve coverage
- Never disable or lower the threshold to bypass a failing build
- Use `test:cov` (not bare `test`) in CI and pre-push to enforce the threshold
- Excluded from coverage: config/bootstrap files (`main.ts`, `router/index.ts`),
  type declaration files, and `__tests__` directories themselves

## Security

### Encryption key separation

Never use a single encryption key for multiple purposes. Each distinct type of data
being encrypted must have its own dedicated key with a descriptive name indicating
exactly what it protects.

**Rationale:** If one key is compromised, only the data it protects is exposed.
A single master key creates a single point of failure.

**Current keys:**

| Key | Protects |
|-----|----------|
| `RESUME_FIELD_ENCRYPTION_KEY` | SectionField.value PII at rest (AES-256-GCM) |

**Future keys** (when the features are built) must follow the same pattern:

| Key | Protects |
|-----|----------|
| `SESSION_ENCRYPTION_KEY` | Session token encryption |
| `FILE_UPLOAD_ENCRYPTION_KEY` | Uploaded file encryption |

**Rules:**
- Key names must indicate **what** is being encrypted, e.g. `RESUME_FIELD_ENCRYPTION_KEY` not `ENCRYPTION_KEY`
- Each key must be a 32-byte (64 hex char) value generated independently via `openssl rand -hex 32` or the `<ENC:AES-256>` template placeholder
- The `CryptoService` and any future encryption services must read their specific key by name from config — never share a key instance across services
- Pino logger must redact all encryption key names
- `.env` and `.env.*.template` files must list each key under its own descriptive name

## Verification

### Verify means test, not inspect

When a change is made to fix a bug, do not stop at reading the code and
concluding it looks correct. Actually execute the code path (or an isolated
reproduction) to confirm:

- The bug reproduces before the fix
- The fix eliminates the bug
- No new regressions are introduced

Code that "looks right" on inspection can still fail at runtime due to
unexpected API behavior, environment differences, or mistaken assumptions.
Empirical verification catches what code review misses.

**Examples of inadequate verification:**
- "The padEnd call looks fine" — without checking that `padEnd` mishandles
  ANSI escape codes (zero visible width, non-zero `.length`)
- "The flag is passed to both the CLI and spawn options, so it's safe" —
  without confirming the CLI actually accepts the flag

**Examples of adequate verification:**
- Run the exact command with the flag to see if it errors
- Render the component with themed (ANSI-wrapped) strings and measure
  visible line widths against the target column width

## Ticket Agent System

The ticket agent system (`agent.sh` + `.pi/extensions/ticket/`) spawns
parallel AI workers that implement Linear tickets in isolated git worktrees.

### Quickstart

```bash
./agent.sh
```

Picks an active epic/ticket from Linear (via fzf), then opens a terminal
dashboard with live agent output, queue status, and manual controls.

### Secrets

All secrets go in `.env.agent` (template: `.env.agent.template`):

| Key | Purpose | Source |
|-----|---------|--------|
| `LINEAR_API_KEY` | Linear GraphQL API (fetch tickets, transition states) | Linear settings → API keys, or `/linear-auth` in pi |
| `GITHUB_PAT_KEY` | GitHub API (create PRs, scan comments, detect merge conflicts, register webhooks) | GitHub → Settings → Developer settings → Personal access tokens (classic) → `repo` scope |
| `NGROK_AUTHTOKEN` | ngrok tunnel for receiving GitHub webhooks on localhost | [dashboard.ngrok.com](https://dashboard.ngrok.com/get-started/your-authtoken) (free tier works) |
| `IMGBB_API_KEY` | imgbb image hosting for PR screenshots | [api.imgbb.com](https://api.imgbb.com) |

Agent config (also in `.env.agent`):

| Key | Default | Purpose |
|-----|---------|---------|
| `MAX_SPAWN_AGENTS` | `3` | Maximum concurrent worker processes |
| `AGENT_PORT_MIN` | `9000` | Start of port pool for workers + webhook server |
| `AGENT_PORT_MAX` | `9099` | End of port pool |

### Architecture

```
agent.sh                      # Interactive launcher (fzf picker)
└─ cli.ts                     # Blessed TUI dashboard
     ├─ orchestrator.ts       # Graph builder, worker spawner, state machine
     │    ├─ linear.ts        # Linear GraphQL client
     │    ├─ git.ts           # Git worktree + branch + PR management
     │    └─ worker-prompt.md # Static worker instructions template
     ├─ queue.ts              # Priority queue (review > conflict > pending > blocked)
     ├─ github-pr.ts          # GitHub API: PR comments, merge conflicts, webhooks
     ├─ server.ts             # HTTP webhook server + ngrok tunnel
     └─ types.ts              # Shared types
```

### How it works

1. **Graph building:** Fetches a ticket and all its children/dependencies from
   Linear, builds a DAG. Blocked tickets wait for their dependencies to finish.

2. **Queue:** Tickets are prioritized:
   - `review` — open PR has unaddressed human comments
   - `conflict` — PR touches files that overlap with another open PR
   - `pending` — all dependencies done, ready to run
   - `blocked` — waiting on unfinished dependencies

3. **Workers:** Each worker is a headless `pi` process running in an isolated
   git worktree. Workers get an assigned port from the pool and a prompt
   containing the ticket description, dependency info, and an optional context
   (PR review comments or merge conflict details).

4. **Completion:** On success, the worker commits changes, pushes the branch,
   creates a PR (via `gh` CLI or GitHub API), and transitions the Linear ticket
   to "Done". On failure with retries remaining, the worker restarts with the
   previous attempt's output as context.

5. **Webhooks:** A local HTTP server receives GitHub events. Ngrok exposes it
   to the internet. On `pull_request` (push/sync), merge conflicts are
   re-scanned. On `issue_comment` / `pull_request_review_comment`, unaddressed
   comments are re-scanned. The queue is re-prioritized and agents are spawned
   or preempted accordingly.

6. **Preemption:** If a running agent is blocked on unfinished dependencies
   and a higher-priority ticket is ready, the agent is killed (SIGTERM) and
   re-queued. The higher-priority ticket gets spawned.

### Dashboard (tmux)

```
┌──────────────────────────┬──────────────────────────────┐
│ ══ Ticket Agents         │ agent-1 (pi)                 │
│     Dashboard  12:34:56  │                              │
│                           ├──────────────────────────────┤
│ 2 epic(s) · 8 tickets    │ agent-2 (pi)                 │
│ 2 running · 3 done       │                              │
│                           │                              │
│ ── RES-10: Auth System ─ │                              │
│   ◉ RES-11  Add login    │                              │
│   ✓ RES-12  Add JWT      ├──────────────────────────────┤
│                           │ agent-3 (pi)                 │
│ ── RES-20: Database ──── │                              │
│   ◉ RES-21  Migrations   │                              │
│   ○ RES-22  Seeds        │                              │
│                           │                              │
│ ── Workers ──             │                              │
│   ◉ agent-1 → RES-11     │                              │
│   ◉ agent-2 → RES-21     │                              │
│   ○ agent-3  idle        │                              │
├───────────────────────────┴──────────────────────────────┤
│ boss (pi) — small pane at bottom                         │
└──────────────────────────────────────────────────────────┘
```

The left pane shows a **static dashboard** that refreshes every 2 seconds.
The right panes are interactive pi sessions for workers and the boss.

Server commands (send via intercom to "server"):
- `EPIC <id1> <id2> ...` — add one or more epic graphs
- `DROP <id>` — remove an epic from management
- `TICKET <id>` — add a single ticket as a mini-graph
- `STOP` / `STOP agent-N` — halt all or a specific worker
- `ASSIGN agent-N TICKET-ID` — manually assign a ticket
- `CLOSE <id>` — close a ticket in Linear
- `STATUS` — get current state summary

### State persistence

State is saved to `.pi/tickets/state.json`. On restart, the system loads
previous state and resumes: previously-running agents are checked for
liveness, failed tickets with retries left are reset to pending, done
tickets stay done.

### Testing conventions

When testing agent system changes:
1. Start with `./agent.sh` and pick a ticket
2. Verify the dashboard renders with the agent list, output, and status bar
3. Press `p` on an agent and send a prompt — verify the worker restarts
4. Press `q` to quit — verify `ps aux | grep pi` shows no orphaned workers
5. Check `.pi/tickets/logs/` for worker output and `.pi/tickets/state.json`
   for saved state
