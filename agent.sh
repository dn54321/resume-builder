#!/usr/bin/env bash
# agent.sh — Launch the ticket agent system.
#
# Layout (MAX_AGENTS=3):
#   ┌──────────┬──────────────┐
#   │ Server   │  agent-1     │
#   │ log      ├──────────────┤
#   │          │  agent-2     │
#   ├──────────┤              │
#   │ Boss     │  agent-3     │
#   └──────────┴──────────────┘
#
# No tmux send-keys — pi panes run pi directly as the pane command.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if command -v git &>/dev/null && git -C "$SCRIPT_DIR" rev-parse --show-toplevel &>/dev/null; then
  REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
else
  REPO_ROOT="$SCRIPT_DIR"
fi
cd "$REPO_ROOT"

SESSION_NAME="ticket-agents"

# ─── Config ──────────────────────────────────────────────────────────

MAX_AGENTS=3
if [ -f "$REPO_ROOT/.env.agent" ]; then
  val=$(grep MAX_SPAWN_AGENTS "$REPO_ROOT/.env.agent" 2>/dev/null | cut -d= -f2- | tr -d ' ')
  [ -n "$val" ] && MAX_AGENTS="$val"
fi

# ─── Find pi ────────────────────────────────────────────────────────

PI_BIN=""
for p in "$HOME/.local/share/pnpm/bin/pi" "$HOME/.local/bin/pi" /usr/local/bin/pi pi; do
  if command -v "$p" &>/dev/null || [ -x "$p" ]; then PI_BIN="$p"; break; fi
done
[ -z "$PI_BIN" ] && { echo "Error: pi not found"; exit 1; }

TSX_BIN=""
for p in "$REPO_ROOT/.pi/npm/node_modules/.bin/tsx" \
         "$REPO_ROOT/backend/node_modules/.bin/tsx" \
         "$REPO_ROOT/node_modules/.bin/tsx"; do
  [ -x "$p" ] && { TSX_BIN="$p"; break; }
done
[ -z "$TSX_BIN" ] && TSX_BIN="npx tsx"

# ─── Load env ────────────────────────────────────────────────────────

[ -f "$REPO_ROOT/.env.agent" ] && { set -a; source "$REPO_ROOT/.env.agent"; set +a; }

# ─── Clean slate ─────────────────────────────────────────────────────

pkill -f "tsx.*server-daemon" 2>/dev/null || true
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
sleep 1
rm -f "$REPO_ROOT/.pi/tickets/state.json" 2>/dev/null || true
unset TMUX

# ─── Start server daemon ─────────────────────────────────────────────

echo "Starting server daemon..."
SERVER_LOG="$REPO_ROOT/.pi/tickets/server.log"
mkdir -p "$(dirname "$SERVER_LOG")"
> "$SERVER_LOG"
$TSX_BIN "$REPO_ROOT/.pi/extensions/ticket/server-daemon.ts" >> "$SERVER_LOG" 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"
sleep 2

# ─── Prompt templates ────────────────────────────────────────────────

BOSS_PROMPT='You are the BOSS. Oversee the system, fix anything that breaks.

On startup: /name boss

CAPABILITIES:
- Read and edit any project file to fix bugs
- Run bash commands to restart the server or check processes
- Command workers: intercom({ action: "send", to: "agent-2", message: "TASK: do X" })
- Redirect server: intercom({ action: "send", to: "server", message: "EPIC RES-13" })
- Also: TICKET <ID>, STOP, STATUS commands work the same way
- Stop a specific worker: intercom({ action: "send", to: "server", message: "STOP agent-2" })
- Manually assign a ticket to a worker: intercom({ action: "send", to: "server", message: "ASSIGN agent-1 RES-15" })
- Create bespoke tickets via linear tools and assign them to workers
- Close irrelevant tickets: intercom({ action: "send", to: "server", message: "CLOSE RES-11" })
- Use linear tools to find epics, check statuses, create follow-up tickets
- Answer worker questions when they ask you

If server crashes: pkill -f server-daemon; npx tsx .pi/extensions/ticket/server-daemon.ts &
If a PR closed without merging, tell the server so it re-queues the ticket.
If priorities shift, redirect the server to a different epic.

Be proactive. Monitor the server log. Fix problems before they escalate.'

WORKER_PROMPT='You are agent-N, a ticket worker.

On startup:
1. /name agent-N
2. Register with server: intercom({ action: "send", to: "server", message: "REGISTER: agent-N" })
3. Announce idle: intercom({ action: "send", to: "server", message: "IDLE" })
4. Wait for a TASK: message from the server with a ticket to work on

While working:
- Send STATUS updates to the boss: intercom({ action: "send", to: "boss", message: "STATUS: doing X" })
- Ask boss if stuck: intercom({ action: "ask", to: "boss", message: "Question: ..." })
- Write the PR description to pr-body.md in the worktree root

When done, use the create-pr skill:
- The skill commits, pushes, creates the PR, writes pr-url.txt
- Read .agents/skills/create-pr/SKILL.md for details
- Do NOT use gh pr create directly — use the create-pr skill
- Then: intercom({ action: "send", to: "boss", message: "DONE: <pr-url>" })
- Then: intercom({ action: "send", to: "server", message: "IDLE" })'

# ─── Create tmux layout — pi runs directly as pane commands ──────────

echo "Creating tmux layout..."

# Pane 0: server log (left column, full height)
tmux new-session -d -s "$SESSION_NAME" -c "$REPO_ROOT" \
  "echo '── Server Log ──'; tail -n 100 -f '$SERVER_LOG'"
tmux rename-window -t "$SESSION_NAME:0" 'agents'

# Pane 1: worker 1 (split right, runs pi directly)
AGENT1="${WORKER_PROMPT//agent-N/agent-1}"
tmux split-window -h -t "$SESSION_NAME:0" -c "$REPO_ROOT" \
  "$PI_BIN --append-system-prompt '$AGENT1' Go"

# Panes 2..N: additional workers (stacked in right column)
for i in $(seq 2 "$MAX_AGENTS"); do
  AGENT="${WORKER_PROMPT//agent-N/agent-$i}"
  tmux split-window -v -t "$SESSION_NAME:0.$((i-1))" -c "$REPO_ROOT" \
    "$PI_BIN --append-system-prompt '$AGENT' Go"
done

# Boss pane (bottom-left, 8 lines)
BOSS_IDX=$((MAX_AGENTS + 1))
tmux split-window -v -t "$SESSION_NAME:0.0" -c "$REPO_ROOT" -l 8 \
  "$PI_BIN --append-system-prompt '$BOSS_PROMPT' Start"

echo "Panes:"
tmux list-panes -t "$SESSION_NAME:0" -F "  #{pane_index}: #{pane_current_command}"

# ─── Done ────────────────────────────────────────────────────────────

echo "All panes running. Attaching tmux..."
tmux select-pane -t "$SESSION_NAME:0.0"

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
}
trap cleanup EXIT

tmux attach-session -t "$SESSION_NAME"
wait "$SERVER_PID" 2>/dev/null || true
