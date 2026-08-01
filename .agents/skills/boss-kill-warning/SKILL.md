---
name: boss-kill-warning
description: |
  Boss setup and critical warnings for the ticket agent system.
  Triggers on "boss", "kill server", "kill agent", "kill worker",
  "kill process", "stop agent", "stop server", "shutdown", "start boss".
---

# Boss Setup & Kill Warning

## FIRST — Register as "boss" with the server

**Do this before anything else.** The server and workers send messages to the
boss session. If you don't register, you won't receive status updates, questions,
or completion notifications.

Send a registration to the server via intercom:

```
intercom({ action: "send", to: "server", message: "BOSS: I am the boss" })
```

The server will reply with a confirmation. After that, `tellBoss()`
from the server and `send`/`ask` from workers will reach you.

Verify it worked:

```
intercom({ action: "list" })
```

You should see both `server` and your boss session connected.

---

**READ THIS BEFORE KILLING ANYTHING.**

## The Dashboard

The left pane of the tmux layout shows a **static dashboard** that refreshes
every 2 seconds. It displays:
- All managed epics and their tickets with status icons
- Worker assignments (which agent is working on which ticket)
- Summary counts

Read it with: `cat .pi/tickets/dashboard.txt`

The server log is at `.pi/tickets/server.log` if you need detailed output.

## Multi-Epic Support

The server manages **multiple epics simultaneously**. Workers are shared across
all epics and assigned to ready tickets from any epic.

Commands:
- `EPIC RES-10 RES-20` — add one or more epics
- `DROP RES-10` — remove an epic (frees its workers)
- `TICKET RES-42` — add a single ticket as a mini-graph
- All other commands (STOP, ASSIGN, CLOSE, STATUS) work across all epics

## Process hierarchy

```
Server (manages all panes, webhooks, ngrok, multiple epics)
 ├── Agent-1 worker (pane 1)
 ├── Agent-2 worker (pane 2)
 └── Agent-3 worker (pane 3)
```

## What happens when you kill

| You kill | Result |
|----------|--------|
| **Server** | **ALL panes die.** Workers, webhooks, ngrok — everything goes down. State is lost. |
| **A worker** | **Only that worker's pane dies.** Other workers and the server keep running. |

## Rule

If you want to stop or replace ONE agent, send `STOP agent-N` to the server — never kill the server.

If you need to stop everything, kill the server — but know that ALL work stops.

## How to stop a specific worker

Send to the server via intercom:
```
STOP agent-2
```

Or find the PID and `kill <pid>` — but prefer the server command so the orchestrator knows the agent was stopped and can re-queue the ticket.
