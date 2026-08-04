---
name: boss-kill-warning
description: |
  Boss setup and critical warnings for the Atlas agent system.
  Triggers on "boss", "kill server", "kill agent", "kill worker",
  "kill process", "stop agent", "stop server", "shutdown", "start boss",
  "kill banner", "kill pane".
---

# Boss Setup & Kill Warning

## FIRST — Register as "boss" with the orchestrator

**Do this before anything else.** The orchestrator and agents send messages to
the boss session. If you don't register, you won't receive status updates,
questions, or completion notifications.

```
intercom({ action: "send", to: "orchestrator", message: "BOSS: <session-id>" })
```

Verify it worked:

```
intercom({ action: "list" })
```

You should see `orchestrator` and your boss session connected. Agents appear
as they are spawned (e.g., `worker-1`, `reviewer`).

---

**READ THIS BEFORE KILLING ANYTHING.**

## The Dashboard

Read it with: `cat atlas/state/dashboard.txt`

The orchestrator log is at `atlas/state/orchestrator.log`.

## Process hierarchy

```
Orchestrator (background — manages scheduler, webhooks, ngrok, agent pool)
 ├── worker-1 (interactive pi session — registered via intercom)
 ├── worker-2 (interactive pi session)
 └── worker-3 (interactive pi session)
```

Agents are **persistent interactive pi sessions**. They register, wait for
TASK assignments, report STATUS, and go IDLE when done. They do NOT exit
between tickets.

## What happens when you kill

| You kill | Result |
|----------|--------|
| **Orchestrator** | **Everything dies.** Agents, webhooks, ngrok, scheduler — all gone. State is saved but work in progress may be lost. |
| **An agent** | **That agent's tmux pane dies.** The orchestrator detects the dead agent and re-queues its task. Other agents keep running. |
| **The banner pane** | **Right column collapses.** Dashboard and boss stretch to fill the window. The two-column layout cannot be restored without restarting `./agent.sh`. **NEVER kill the banner pane.** |

## Rules

1. **Never kill the orchestrator** — use `STOP` to halt all agents cleanly.
2. **Never kill the banner pane** — it's the structural anchor of the tmux layout.
   If you accidentally kill it, restart with `./agent.sh`.
3. **Never kill yourself** — `STOP boss`, `KILL boss`, and `SPAWN boss` are
   blocked by the orchestrator. Do NOT `kill` your own pi process from bash.
4. **Stop agents via intercom** — send `STOP worker-2` to the orchestrator.
   Do NOT `kill <pid>` directly — the orchestrator needs to know the agent was
   stopped so it can re-queue the task and clean up.
5. **Workers return to IDLE** — they don't exit after finishing a ticket.
   They stay alive and wait for the next TASK.

### Blocked commands (orchestrator enforces these)

| Command | Response |
|---------|----------|
| `STOP boss` | ⛔ Cannot stop "boss" — it is a protected system component |
| `STOP orchestrator` | ⛔ Cannot stop "orchestrator" — it is a protected system component |
| `STOP banner` | ⛔ Cannot stop "banner" — it is a protected system component |
| `KILL boss` | ⛔ Cannot KILL "boss" — the boss is a protected system component |
| `SPAWN boss` | ⛔ Cannot SPAWN boss — there can only be one boss |

## How to stop a specific agent

Send to the orchestrator via intercom:

```
STOP worker-2
```

The orchestrator sends `STOP <uuid>` to the agent, waits for graceful shutdown,
runs `post.sh`, and releases its port.

## How to stop everything

```
STOP
```

Halt all agents. The orchestrator keeps running.

## Spawning additional agent types

```
SPAWN reviewer      — Start a reviewer agent
SPAWN pr_manager    — Start a PR manager agent
KILL reviewer       — Stop all reviewer agents
```

## Adjusting system behavior

```
SET_INTERVAL pr_scan 30       — Scan PRs every 30 seconds
SET_INTERVAL queue_process 10 — Process queue every 10 seconds
GET_CONFIG                    — Show current configuration
```

Available intervals: `status_sync`, `pr_scan`, `dashboard_refresh`,
`agent_health`, `queue_process`, `scheduled_agents`

## If you fix an Atlas bug

Commit and push DIRECTLY to master:

```
git add <files> && git commit -m "fix(atlas): <description>" && git push origin master
```

Do NOT create a PR for Atlas fixes — deploy immediately. The next spawned
agent picks up prompt changes automatically.
