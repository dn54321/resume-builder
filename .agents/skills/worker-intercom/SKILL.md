---
name: worker-intercom
description: |
  How Atlas agents communicate with the orchestrator and boss via intercom.
  Triggers on "intercom", "send status", "register", "report done",
  "ask boss", "report idle".
---

# Agent Intercom Skill

Use this skill to communicate with the Atlas orchestrator via pi-intercom.
All Atlas agents (workers, reviewers, pr_managers) use the same protocol.

## Key contacts

| Name | Who | Use for |
|------|-----|---------|
| `orchestrator` | Atlas orchestrator | REGISTER, IDLE (announce availability) |
| `boss` | Boss pi session | STATUS updates, ASK questions, DONE reports |

## Startup — register as available

When you start, immediately register and go idle:

```
intercom({ action: "send", to: "orchestrator", message: "REGISTER <your-uuid> <agent-type> <agent-name>" })
intercom({ action: "send", to: "orchestrator", message: "IDLE <your-uuid>" })
```

- **UUID**: Your unique agent identifier (e.g., `a-lx3kf2-m8n4p7`). The orchestrator
  assigns this when you spawn. Keep it — it's your permanent identity.
- **Agent type**: `worker`, `reviewer`, or `pr_manager`
- **Agent name**: Your display name (e.g., `worker-1`)

The orchestrator will respond with a TASK message when work is available.
You stay alive between tasks — do NOT exit after completing one ticket.

## While working — send status

Update the boss on what you're doing:

```
intercom({ action: "send", to: "boss", message: "STATUS <uuid> Implementing the auth module" })
intercom({ action: "send", to: "boss", message: "STATUS <uuid> Writing tests" })
```

Keep these short — one line, present tense. These appear in the dashboard.

Also update `agent-status.txt` in your worktree with thinking steps:

```
▸ Implementing login form component
▸ Writing tests for auth validation
  ✓ Codebase read complete
  ✓ Dependencies resolved
```

This drives the condensed display in your tmux pane. Prefix active steps
with `▸`, completed with `✓`, failed with `✗`.

## When stuck — ask the boss

Block until the boss answers:

```
intercom({ action: "ask", to: "boss", message: "ASK <uuid> Should I use JWT or session cookies?" })
```

The `ask` action waits for a reply. Use it when you need a decision.
Prefer `send` for status updates, `ask` for questions.

## When done — report and go idle

After your work is committed (the orchestrator handles push/merge/PR):

```
intercom({ action: "send", to: "boss", message: "DONE <uuid> <pr-url>" })
intercom({ action: "send", to: "orchestrator", message: "IDLE <uuid>" })
```

This tells the boss you finished and the orchestrator you're free for the
next ticket. You stay alive and wait for the next TASK.

## If something goes wrong

```
intercom({ action: "send", to: "boss", message: "ERROR <uuid> Database migration fails with foreign key constraint" })
```

The boss will investigate. The orchestrator handles retries automatically.

## Handling STOP

If the orchestrator sends `STOP <uuid>`, finish your current work immediately,
commit what you have, report DONE or FAILED, and the process will be terminated
cleanly. `post.sh` will run after exit.

## Quick reference

```
# Register
intercom({ action: "send", to: "orchestrator", message: "REGISTER <uuid> worker worker-1" })
intercom({ action: "send", to: "orchestrator", message: "IDLE <uuid>" })

# Status
intercom({ action: "send", to: "boss", message: "STATUS <uuid> doing X" })

# Question (blocks until answer)
intercom({ action: "ask", to: "boss", message: "ASK <uuid> ..." })

# Done — return to idle (stay alive)
intercom({ action: "send", to: "boss", message: "DONE <uuid> <pr-url>" })
intercom({ action: "send", to: "orchestrator", message: "IDLE <uuid>" })

# Error
intercom({ action: "send", to: "boss", message: "ERROR <uuid> <description>" })
```
