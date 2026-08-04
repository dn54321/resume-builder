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

## NestJS conventions

### Type placement: dto/, models/, entities/

All TypeScript types (interfaces, type aliases) must live inside one of three
directories within their owning module:

| Directory | Purpose |
|-----------|---------|
| `dto/` | Data Transfer Objects — request/response shapes, validated with `class-validator` |
| `models/` | Domain models — pure interfaces and type aliases for internal use (tree shapes, config types, request extensions like `AuthenticatedRequest`) |
| `entities/` | Database entities — ORM-mapped classes representing database rows |

**Rules:**
- Never declare `interface` or `export type` inline in service/controller files — extract them to the appropriate directory
- Files in these directories must have the `.model.ts` suffix (e.g. `resume-tree.model.ts`)
- Shared types used across multiple modules (e.g. `AuthenticatedRequest`) go in `common/models/`
- Module-specific types go in `<module>/models/`
- Exception: declaration-merged interfaces (e.g. `interface PrismaService extends PrismaClientType`) may stay in their companion class file when TypeScript requires it, but must have an explanatory comment

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

## No Hacky Workarounds

### Always implement proper, maintainable solutions

When a tool or dependency isn't available, fix the root cause — never create a
throwaway script that bypasses the intended architecture. Hacky workarounds
create technical debt, confuse future agents, and break when the underlying
system changes.

**Rules:**
- Never write a one-off script to work around a missing tool or extension.
  If an extension isn't loading, fix the extension loading mechanism.
- Never create files in gitignored directories as a workaround.
  If state needs to be stored, put it in the proper state directory.
- Never duplicate functionality that already exists in a loaded package.
  Understand why it's not working and fix that.
- If you're tempted to write a hack: step back, diagnose the root cause,
  and implement a proper fix that all future agents can rely on.

**Examples of hacky workarounds:**
- Writing a Node.js script to bypass the intercom broker because the
  pi-intercom extension isn't loaded (fix: load the extension properly)
- Shell scripts that duplicate what a properly configured tool does
- Hardcoding paths that should come from config

## Agent-to-Agent Warnings

### If you discover a catastrophic path, leave a warning

When you encounter a change or approach that causes silent breakage,
cascading failures, or a revert of previous work, you MUST leave a
warning for the next agent. Otherwise the same trap will be discovered
again by someone else, wastes cycles, and damages trust in the system.

**What counts as catastrophic:**
- A change that compiles and passes tests but crashes at runtime
- A configuration tweak that was already tried and reverted (check git log)
- A generated file that gets silently wiped by a tool, undoing a fix
- An approach that looks correct on inspection but is empirically wrong

**How to warn:**
1. Add a **conspicuous block comment** at the top of the affected file
   explaining what was tried, why it failed, and what the correct
   approach is. Start the block with `⚠️ WARNING` so it stands out.
2. Update this AGENTS.md if the trap is a recurring pattern across files.
3. Reference the commit(s) where the approach was tried and reverted.

**Example of a good warning:**
```
/*
 * ⚠️ WARNING — DO NOT add "type": "module" to package.json.
 *
 * Prisma 7 generates ESM-only code (import.meta.url), so it's tempting to
 * switch the whole project to ESM. This was tried in RES-12 and reverted in
 * commit 4d48f39. It requires .js extensions on ~80 relative imports and
 * breaks ts-jest module resolution. The working fix is in
 * scripts/patch-prisma-client.js — run `pnpm prisma:generate` instead of
 * bare `prisma generate`.
 */

/**
 * ⚠️ WARNING — DO NOT put bare colour literals in Tailwind's @theme inline.
 *
 * Tailwind v4's @theme inline substitutes values directly into utility
 * classes (text-foreground → color: #0a0a0a), NOT via var() references.
 * This means html.dark overrides of --color-foreground have ZERO effect on
 * Tailwind utilities — the dark theme appears to work (variables are set)
 * but all utilities are frozen to light-mode colours.
 *
 * Fix (RES-72): use var() indirection:
 *
 *   @theme inline {
 *     --color-foreground: var(--_tw-fg);        // ← indirection
 *   }
 *   :root    { --_tw-fg: #0a0a0a; }             // light palette
 *   html.dark { --_tw-fg: #fafafa; }             // dark palette
 *
 * Tailwind inlines var(--_tw-fg) into utilities, and the cascade makes
 * it resolve to the right palette.
 *
 * If you ever add a new theme colour, you MUST use this var() pattern.
 * Adding a bare literal (--color-foo: #abc;) will freeze that colour
 * across themes.
 */
```

## Ticket Agent System

The ticket agent system is now **Atlas** (`atlas/`). See `atlas/ARCHITECTURE.md`
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

2. **Agent pool:** Workers are persistent interactive pi sessions that register
   via intercom. They receive TASK assignments, report STATUS, and go IDLE
   when finished. No headless processes — all agents are interactive.

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
