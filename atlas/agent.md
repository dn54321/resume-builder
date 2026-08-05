# agent.md — Agent Safety Rules

Warnings for coding agents (pi sessions, Atlas workers, the boss) operating in
this repo. These rules exist because past agents caused real damage. Read them.

## ⚠️ WARNING — do NOT put ticket references (RES-XX) in code comments

Ticket IDs in code comments rot: a comment written for RES-42 says nothing to
the next developer six months later, the ticket is closed, and the reference
becomes noise that obscures the actual explanation. Keep comments about WHAT
the code does and WHY it is shaped this way — never about WHICH ticket added
it.

**Allowed exceptions (keep the ticket ID):**

- **Critical bug alerts / discovery notes** — when the comment exists to warn
  that something is broken, dangerous, or non-obvious in a way that cost real
  time (e.g. a warning block about a broken API contract, a corrupting git
  hook, a DB constraint trap). These are "do not repeat this mistake" markers
  where the ticket ID anchors a documented incident.
- **Code that exists ONLY because of a specific ticket's requirement** and
  whose purpose would be incomprehensible without that anchor (rare).

**Remove ticket IDs from:**

- Routine feature attribution ("added in RES-81", "built for RES-86") — the
  feature comment should stand on its own.
- Section headers, breadcrumbs, or comments that merely tag a ticket.
- Anything where the reference is decorative rather than instructive.

**When in doubt, remove it.** A comment that needs a ticket ID to make sense
is either a warning (keep it) or a comment that should explain itself better
(rewrite it without the ID).

## ⚠️ WARNING — NEVER type into tmux panes with `tmux send-keys`

Do **NOT** use `tmux send-keys` to interact with panes for diagnosis or any
other purpose.

**What happened (2026-08-05):** the boss agent diagnosed a worker crash by
running repeated `tmux send-keys -t <pane> "..."` commands. The typed input
hit tmux's own prompt/copy-mode machinery (showing "jump to forward/backwards"
in the status line) and **froze the entire tmux session** — every pane stopped
responding until a human intervened. This is not a theoretical risk; it froze
the live Atlas session mid-operation.

**Why it's dangerous:**

- `send-keys` types raw characters into whatever process owns the pane's PTY.
  If that process is tmux itself (copy-mode, command prompt, `choose-tree`,
  pane border dragging), the keystrokes are interpreted as tmux commands, not
  shell input.
- A pane showing "jump to forward/backwards" is waiting for a character —
  every subsequent `send-keys` feeds that prompt and nothing reaches the shell.
- Key sequences like `[` (copy-mode), `:` (command prompt), or prefix-triggered
  bindings can silently enter these modes before you notice.

**What to use instead (read-only):**

- `tmux capture-pane -t <pane> -p` — read the pane's current screen. Safe.
  Add `-S -N` to include N lines of scrollback history.
- `tmux list-panes -t <session> -F '#{pane_id} #{pane_current_command}'` —
  inspect which panes exist and what command each runs. Safe.
- Reading agent log files (`atlas/state/logs/<agent>.log`) — always safe.

**If you believe you MUST send keys** (e.g. you are fixing the spawn flow
itself, where send-keys is the intended mechanism inside `AgentPool.spawn()`):

- Prefer launching a separate disposable shell to test command strings
  (`bash -c '...'`), never the live tmux panes.
- Never send keys to a pane you did not create and are not the owner of.
- One `send-keys` with a full quoted command and a single `Enter` is
  acceptable in the spawn path; never a stream of incremental keystrokes.

**If the session freezes anyway:** do not pile on more `send-keys`. Tell the
user immediately — recovery requires a human (usually `Escape` / `q` to exit
the prompt, or re-attaching the tmux session).
