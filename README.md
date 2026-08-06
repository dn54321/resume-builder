# Resume Builder

A resume-building application with a NestJS backend and Vue 3 frontend.
Build resumes in a live-preview builder, tailor them to any job description,
and export polished PDFs.

Demo Link: https://resume-builder.dnxe.dev/

## Screenshots

| | |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Builder](docs/screenshots/builder.png) |
| Two-pane dashboard: resume list + live preview | Section-based builder with live preview |
| ![Tailor Resume](docs/screenshots/tailor-modal.png) | ![Home](docs/screenshots/home.png) |
| Job Description modal — the Tailor entry point | Landing page |

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
├── atlas/            # Ticket agent system (orchestrator, workers, boss)
├── e2e/              # Shared Playwright E2E suite (real backend + DB)
├── docs/             # Screenshots and project docs
└── .github/
    └── workflows/    # CI/CD pipelines
```

## AI Harness

This project is built **by AI, for humans** — an agentic harness writes,
tests, and ships most of the code, with a human reviewing the results.

The harness is the [`atlas`](./atlas) system: a `pi`-based orchestrator
spawns one-shot **worker agents** in isolated git worktrees, each assigned a
[Linear](https://linear.app) ticket. Workers read the ticket, implement it
end-to-end (code, tests, migrations), run the full verification suite, and
merge to master — all autonomously, in parallel. A **boss** agent oversees
the flow, fixes harness bugs, and fields human feedback, while the
orchestrator schedules spawns, sweeps stale merges, and reports status to a
live dashboard.

Why it works: every change lands with tests + a green pre-push gate
(frontend 800+ unit tests, backend 280+, e2e, coverage ≥90%), so the AI's
output is continuously validated rather than trusted on faith. The
[Agentic Development](#agentic-development) section below documents how the
harness operates, and [Running Atlas](#running-atlas-the-agent-system)
covers launching it.

## Agentic Development

This project is developed through **agentic loops and flows** — most code is
written, tested, and reviewed by AI agents, not humans.

The [ticket agent system](./AGENTS.md#ticket-agent-system) (`./atlas/atlas.sh`)
spawns parallel AI workers that implement [Linear](https://linear.app)
tickets in isolated git worktrees. Each worker runs a headless `pi` session
that reads the ticket description, dependency graph, and any PR review
context, then implements the feature end-to-end — writing code, running
tests, committing, pushing, and opening a pull request.

### Security: agents run in a contained WSL container

All agent processes — the orchestrator, workers, and the boss — run inside
the project's **WSL (Windows Subsystem for Linux) container**, isolated from
the host operating system. This containment provides several security
properties:

- **Process isolation** — agents cannot reach host processes, services, or
  files outside the WSL filesystem; their blast radius is the container.
- **Filesystem confinement** — agent file access is limited to the container
  mount; host directories are only reachable via explicit, read-only-ish
  bind mounts where required.
- **Network scoping** — agent-originated traffic flows through the container
  network namespace; hosts and LAN services are not directly addressable.
- **Clean teardown** — the container is disposable; terminating it removes
  agent state, logs, and any intermediate artifacts.

This is defense-in-depth on top of the agents' own restrictions (isolated
git worktrees, per-ticket ports, scoped API keys). Treat the container as a
**containment boundary, not a trust boundary** — secrets are still stored
scoped (see Environment Variables) and never shared across agents.

### Running Atlas (the agent system)

![Dashboard](docs/screenshots/ai-agents.png)

To launch the multi-agent ticket system:

```bash
cd atlas
./atlas.sh
```

**Prerequisites / tools you need:**

| Tool | Why | Where from |
|------|-----|------------|
| `pi` | The agent runtime (each agent is a `pi` session) | npm global: `npm i -g @earendil-works/pi-coding-agent` |
| Node.js ≥ 22 | Runtime for pi, the orchestrator, and the app | nvm / nodejs.org |
| `tsx` | Runs the orchestrator TypeScript directly | `cd atlas && pnpm install` |
| `tmux` | The dashboard/banner/boss pane layout | apt: `sudo apt install tmux` |
| Linear API key | Fetch tickets, transition states | Linear settings → API keys (`LINEAR_API_KEY`) |
| GitHub PAT | Create PRs, scan comments, webhooks | GitHub → Developer settings → classic PAT, `repo` scope (`GITHUB_PAT_KEY`) |
| ngrok token | Expose the webhook server to GitHub | ngrok dashboard (`NGROK_AUTHTOKEN`) |
| imgbb key | Host PR screenshots | api.imgbb.com (`IMGBB_API_KEY`) |

Configure secrets in `atlas/.env.agent` (see `atlas/.env.agent.template`) and
tuning in `atlas/atlas.config.yaml` (worker count, strategies, intervals).
See [`atlas/AGENTS.md`](atlas/AGENTS.md) and
[`atlas/ARCHITECTURE.md`](atlas/ARCHITECTURE.md) for the full protocol.

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

Pull requests trigger the [E2E Tests](.github/workflows/e2e.yml) workflow, which runs backend and frontend E2E suites in parallel on every push. Pushes to **any release branch** (`release/*` — e.g. `release/v1.0.0`, `release/v1.0.1`, `release/v2.0.0`) trigger the [Deploy to Droplet](.github/workflows/deploy.yml) workflow, which rebuilds and restarts the production stack on the server — pushes to `master` never deploy.

## Deploying to a DigitalOcean Droplet

The production target is a single Droplet running the whole stack in Docker:
Postgres 16, the NestJS backend, and the Vue frontend behind an nginx reverse
proxy with auto-renewing Let's Encrypt TLS. Everything lives in
`docker-compose.prod.yml` + `deploy/`.

```
Internet ── 80/443 ── host nginx (TLS, certbot) ──┬─ /api/v1/* → backend  :3000
                                                 └─ /*        → frontend :80
```

Single-origin layout: the browser only talks to `https://<domain>`, so auth
cookies work with no CORS/SameSite gymnastics (`FRONTEND_URL` ==
`VITE_API_BASE_URL` == the domain).

### 1. Create the droplet

- **Size**: 1 GB RAM / 1 vCPU is the target size — the idle stack sits at
  ~500 MB (Postgres ~180 MB, backend ~250 MB, two nginx ~25 MB, dockerd
  ~60 MB). Build stages are heap-capped at 768 MB and ride the 2 GB swap
  the setup script adds.
- **Region**: anywhere; add your SSH key so deploys can connect.

### 2. Point DNS

Create an `A` record for your domain → the droplet's public IP. TLS issuance
needs this before the bootstrap runs.

### 3. Run the bootstrap

```bash
ssh root@<droplet-ip>
# Dir name stays "resume-v3" on purpose — deploy.sh and the deploy workflow
# expect the checkout at ~/resume-v3.
git clone git@github.com:dn54321/resume-builder.git resume-v3 && cd resume-v3
sudo DOMAIN=resumes.example.com EMAIL=you@example.com ./deploy/setup-droplet.sh
```

This idempotent script:

1. Creates 2G swap, enables ufw (22/80/443) and fail2ban
2. Installs Docker CE + the compose plugin
3. Generates `.env.prod` (DB password + independent encryption keys;
   **never overwrites** an existing one — regenerating keys makes stored
   data undecryptable)
4. Installs the host nginx reverse proxy (`deploy/nginx/resume-builder.conf`)
   and issues a Let's Encrypt certificate (auto-renewed by a systemd timer)
5. Builds & starts the stack, waits for all healthchecks to pass

**External database:** the droplet runs its own Postgres container by
default. To point the app at an externally managed Postgres (e.g. a DO
managed database), set `USE_EXTERNAL_DB=1` and `DATABASE_URL` to the
external host in `.env.prod` before (re)running the bootstrap — the local
`db` container is then never started. `setup-droplet.sh`, `deploy.sh`, the
CI workflow, and `backup.sh` all honor the flag.

### 4. Deploy updates

**Automatic** — add these GitHub repo secrets and every push to the
**release branch** deploys (pushes to `master` never do):

| Secret | Value |
|--------|-------|
| `DROPLET_HOST` | droplet IP or hostname |
| `DROPLET_USER` | `root` (or your sudo user) |
| `DROPLET_SSH_KEY` | private key matching the droplet's authorized keys |

**Manual** — `DROPLET_USER=root DROPLET_HOST=<ip> ./deploy/deploy.sh`

### Backups

```bash
crontab -e   # add:
0 3 * * * /root/resume-v3/deploy/backup.sh >> /var/log/resume-backup.log 2>&1
```

Keeps 14 daily `pg_dump` snapshots in `backups/` (restore instructions in
the script header).

## Tech Stack

| Layer     | Backend                | Frontend              |
| --------- | ---------------------- | --------------------- |
| Framework | NestJS 11              | Vue 3.5               |
| Language  | TypeScript 5.7         | TypeScript 6.0        |
| Runtime   | Node.js 24+            | Node.js 22+           |
| Database  | SQLite (dev) / PostgreSQL 16 (prod) | —         |
| Tests     | Jest 30 + supertest    | Vitest 4 + Playwright |
| Linting   | ESLint 9 + Prettier    | ESLint 10 + oxlint    |
| Formatting| Prettier               | oxfmt                 |

## Environment Variables

See `.env.template` in each package directory for required variables.

## License

UNLICENSED — Private project.
