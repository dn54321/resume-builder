---
name: worker-intercom
description: |
  How workers communicate with the server and boss via intercom.
  Triggers on "intercom", "send status", "register", "report done",
  "ask boss", "report idle".
---

# Worker Intercom Skill

Use this skill to communicate with the ticket agent system via pi-intercom.

## Key contacts

| Name | Who | Use for |
|------|-----|---------|
| `server` | Server daemon | REGISTER, IDLE (announce availability) |
| `boss` | Boss pi session | STATUS updates, questions, DONE reports |

## Startup — register as available

When you start, immediately register and go idle:

```
intercom({ action: "send", to: "server", message: "REGISTER: agent-N" })
intercom({ action: "send", to: "server", message: "IDLE" })
```

Replace `agent-N` with your assigned name (agent-1, agent-2, etc).

The server will send you a `TASK:` message with a ticket to work on.

## While working — send status

Update the boss on what you're doing:

```
intercom({ action: "send", to: "boss", message: "STATUS: Reading the codebase" })
intercom({ action: "send", to: "boss", message: "STATUS: Implementing the auth module" })
intercom({ action: "send", to: "boss", message: "STATUS: Writing tests" })
```

Keep these short — one line, present tense.

## When stuck — ask the boss

Block until the boss answers:

```
intercom({ action: "ask", to: "boss", message: "Question: Should I use JWT or session cookies for auth?" })
```

The `ask` action waits for a reply. Use it when you need a decision to continue.
Prefer `send` for status updates, `ask` for questions.

## When done — report and go idle

After creating the PR (use the create-pr skill):

```
intercom({ action: "send", to: "boss", message: "DONE: https://github.com/owner/repo/pull/123" })
intercom({ action: "send", to: "server", message: "IDLE" })
```

This tells the boss you finished and the server you're free for the next ticket.

## If something goes wrong

```
intercom({ action: "send", to: "boss", message: "ERROR: The database migration fails with a foreign key constraint" })
```

The boss will investigate and may assign another worker to help or fix the issue.

## Quick reference

```
# Register
intercom({ action: "send", to: "server", message: "REGISTER: agent-1" })
intercom({ action: "send", to: "server", message: "IDLE" })

# Status
intercom({ action: "send", to: "boss", message: "STATUS: doing X" })

# Question (blocks until answer)
intercom({ action: "ask", to: "boss", message: "Question: ..." })

# Done
intercom({ action: "send", to: "boss", message: "DONE: <pr-url>" })
intercom({ action: "send", to: "server", message: "IDLE" })

# Error
intercom({ action: "send", to: "boss", message: "ERROR: <description>" })
```
