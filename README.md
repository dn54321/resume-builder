# resume-v3

A resume-building application with a NestJS backend and Vue 3 frontend.

## Architecture

```
resume-v3/
├── backend/          # NestJS 11 REST API
│   ├── src/          # Application source
│   ├── test/         # E2E tests
│   └── prisma/       # Database schema
├── frontend/         # Vue 3 + Vite SPA
│   ├── src/          # Application source
│   └── e2e/          # Playwright E2E tests
└── .github/
    └── workflows/    # CI/CD pipelines
```

## Agentic Development

This project is developed through **agentic loops and flows** — most code is
written, tested, and reviewed by AI agents, not humans.

The [ticket agent system](./AGENTS.md#ticket-agent-system) (`./agent.sh`)
spawns parallel AI workers that implement [Linear](https://linear.app)
tickets in isolated git worktrees. Each worker runs a headless `pi` session
that reads the ticket description, dependency graph, and any PR review
context, then implements the feature end-to-end — writing code, running
tests, committing, pushing, and opening a pull request.

### How it works

1. **Graph building** — Tickets and their child dependencies are fetched from
   Linear and assembled into a DAG. Blocked tickets wait for their
   dependencies to finish.

2. **Priority queue** — Tickets are ranked: review feedback > merge conflicts
   > ready to run > blocked. Workers pick the highest-priority ticket.

3. **Isolated workers** — Each agent gets its own git worktree and port, so
   multiple features can be built in parallel without conflicts.

4. **Continuous feedback** — A webhook server receives GitHub events (PR
   comments, pushes, merge conflicts) and re-prioritizes the queue. Agents
   are preempted or spawned in response.

5. **Completion** — On success, the agent commits, pushes, creates a PR, and
   transitions the Linear ticket to Done. On failure, it retries with the
   previous attempt's output as context.

The result is a self-correcting development loop: tickets flow from Linear
through AI agents, into pull requests, through human review, and back to
the agents for iteration — all orchestrated automatically.

## Quickstart

```bash
# 1. Set up environment files (generates encryption keys, syncs templates)
./setup.sh

# 2. Start the backend (http://localhost:3000)
cd backend && pnpm install && pnpm start:dev

# 3. Start the frontend (http://localhost:5173)
cd frontend && pnpm install && pnpm dev
```

`setup.sh` scans the project root, `backend/`, and `frontend/` for `.template`
files and creates corresponding env files. It preserves existing values,
fills in missing keys, and auto-generates secrets for placeholders like
`<ENC:AES-256>` (AES-256-GCM keys) and `<RANDOM:32>` (random strings). Run
it whenever new `.template` files are added or existing templates gain new
keys.

## Testing

```bash
# Backend
cd backend
pnpm test          # Unit tests
pnpm test:e2e      # E2E tests (Jest + supertest)
pnpm test:cov      # Coverage (90% threshold)

# Frontend
cd frontend
pnpm test:unit     # Unit tests (Vitest)
pnpm test:e2e      # E2E tests (Playwright)
```

## CI/CD

Pull requests trigger the [E2E Tests](.github/workflows/e2e.yml) workflow, which runs backend and frontend E2E suites in parallel on every push.

## Tech Stack

| Layer     | Backend                | Frontend              |
| --------- | ---------------------- | --------------------- |
| Framework | NestJS 11              | Vue 3.5               |
| Language  | TypeScript 5.7         | TypeScript 6.0        |
| Runtime   | Node.js 24+            | Node.js 22+           |
| Database  | SQLite (Prisma 7)      | —                     |
| Tests     | Jest 30 + supertest    | Vitest 4 + Playwright |
| Linting   | ESLint 9 + Prettier    | ESLint 10 + oxlint    |
| Formatting| Prettier               | oxfmt                 |

## Environment Variables

See `.env.template` in each package directory for required variables.

## License

UNLICENSED — Private project.
