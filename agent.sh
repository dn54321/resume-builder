#!/usr/bin/env bash
# agent.sh — Launch the ticket agent system.
#
# Layout (MAX_AGENTS=3):
#   ┌──────────┬──────────────┐
#   │ Dashboard│  agent-1     │
#   │          ├──────────────┤
#   │          │  agent-2     │
#   ├──────────┤              │
#   │ Boss     │  agent-3     │
#   └──────────┴──────────────┘
#
# Agent panes run simple bash loops displaying "Waiting for tasks...".
# The server uses tmux send-keys to attach worker output to panes and
# reset them when workers finish.

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

# ─── Pick tickets ────────────────────────────────────────────────────

echo ""
echo "  Fetching tickets from Linear..."
echo ""

TICKET_LIST=""
SELECTED_IDS=""
EPIC_IDS=""
STANDALONE_IDS=""

if [ -n "${LINEAR_API_KEY:-}" ]; then
  QUERY='{"query":"{ issues(filter: { state: { type: { nin: [\"completed\", \"canceled\"] } } } first: 50) { nodes { identifier title children { nodes { id } } } } }"}'
  RAW=$(curl -s -X POST https://api.linear.app/graphql \
    -H "Authorization: ${LINEAR_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$QUERY" 2>/dev/null || echo '{"data":null}')

  if command -v python3 &>/dev/null; then
    TICKET_LIST=$(echo "$RAW" | python3 -c "
import json, sys
try:
  data = json.load(sys.stdin)
  issues = data.get('data',{}).get('issues',{}).get('nodes',[]) or []
  for i in issues:
    ident = i.get('identifier','?')
    title = i.get('title','')[:80]
    kids = len(i.get('children',{}).get('nodes',[]) or [])
    tag = 'EPIC' if kids > 0 else 'TICKET'
    print(f'{ident} [{tag}] {title}')
except: pass
" 2>/dev/null)
  fi

  if [ -n "${TICKET_LIST:-}" ]; then
    echo "$TICKET_LIST" | head -30
    echo ""

    SELECTED_IDS=$(echo "$TICKET_LIST" | awk '{print $1}' | tr '\n' ' ' | sed 's/ *$//')
    EPIC_IDS=$(echo "$TICKET_LIST" | grep '\[EPIC\]' | awk '{print $1}' | tr '\n' ' ' | sed 's/ *$//')
    STANDALONE_IDS=$(echo "$TICKET_LIST" | grep '\[TICKET\]' | awk '{print $1}' | tr '\n' ' ' | sed 's/ *$//')
    echo "  Auto-selecting all: $SELECTED_IDS"
    [ -n "$EPIC_IDS" ] && echo "  Epics:              $EPIC_IDS"
    [ -n "$STANDALONE_IDS" ] && echo "  Tickets:            $STANDALONE_IDS"
  fi
fi

if [ -z "${SELECTED_IDS:-}" ]; then
  echo "  (Could not fetch from Linear or nothing selected. Enter identifiers manually.)"
  echo ""
  read -rp "  Ticket IDs (space-separated): " MANUAL_IDS
  SELECTED_IDS="$MANUAL_IDS"
  # Assume all are epics when entered manually (backward-compatible)
  EPIC_IDS="$MANUAL_IDS"
  STANDALONE_IDS=""
fi

if [ -z "${SELECTED_IDS:-}" ]; then
  echo "No tickets selected. The server will start idle."
  echo "The boss can send EPIC <id> and TICKET <id> commands to add work."
  SELECTED_IDS=""
fi

# ─── Clean slate ─────────────────────────────────────────────────────

pkill -f "tsx.*server-daemon" 2>/dev/null || true
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
sleep 1
rm -f "$REPO_ROOT/.pi/tickets/state.json" 2>/dev/null || true
unset TMUX

# ─── Start server daemon ─────────────────────────────────────────────

echo ""
echo "Starting server daemon..."
SERVER_LOG="$REPO_ROOT/.pi/tickets/server.log"
DASHBOARD_FILE="$REPO_ROOT/.pi/tickets/dashboard.txt"
mkdir -p "$(dirname "$SERVER_LOG")"
> "$SERVER_LOG"
echo "Initializing..." > "$DASHBOARD_FILE"
$TSX_BIN "$REPO_ROOT/.pi/extensions/ticket/server-daemon.ts" >> "$SERVER_LOG" 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"
sleep 2

# ─── Pane ID directory ───────────────────────────────────────────────

PANES_DIR="$REPO_ROOT/.pi/tickets/panes"
mkdir -p "$PANES_DIR"

# ─── Write prompts to files ──────────────────────────────────────────

PROMPT_DIR="$REPO_ROOT/.pi/tickets"
mkdir -p "$PROMPT_DIR"

INITIAL_COMMANDS=""
if [ -n "${SELECTED_IDS:-}" ]; then
  CMD_PARTS=""
  [ -n "${EPIC_IDS:-}" ] && CMD_PARTS="EPIC $EPIC_IDS"
  [ -n "${STANDALONE_IDS:-}" ] && CMD_PARTS="${CMD_PARTS:+$CMD_PARTS; }TICKET $STANDALONE_IDS"
  INITIAL_COMMANDS="After registration, immediately send: $CMD_PARTS"
fi

cat > "$PROMPT_DIR/boss-prompt.txt" << PROMPTEOF
You are the BOSS. Oversee the system, fix anything that breaks.

On startup: /name boss
Then: intercom({ action: "send", to: "server", message: "BOSS: I am the boss" })

CAPABILITIES:
- Read and edit any project file to fix bugs
- Run bash commands to restart the server or check processes
- Command workers via intercom send with TASK messages
- Server commands:
  EPIC <id1> <id2> ...  — Add one or more epic graphs (multiple epics supported!)
  DROP <id>             — Remove an epic from management
  TICKET <id1> <id2> ... — Add standalone tickets (no children) as mini-graphs
  STOP                  — Halt all workers
  STOP agent-N          — Stop a specific worker
  CLOSE <id>            — Close a ticket in Linear and mark done
  STATUS                — Get current state summary
- Use linear tools to find epics, check statuses, create follow-up tickets
- Answer worker questions when they ask you
- The server manages MULTIPLE epics simultaneously — send EPIC for each

${INITIAL_COMMANDS}

If server crashes: pkill -f server-daemon; npx tsx .pi/extensions/ticket/server-daemon.ts &
If a PR closed without merging, tell the server: CLOSE <id>
If priorities shift, DROP old epic and EPIC new one.

Be proactive. Monitor the dashboard (cat .pi/tickets/dashboard.txt) to see status.
Fix problems before they escalate.

CRITICAL: If you fix a bug related to the agent workflow (server-daemon.ts,
orchestrator.ts, prompts, skills, intercom routing, worker assignment, state
management, etc.), immediately commit and push the fix directly to master:
  git add <files> && git commit -m "fix(agents): <description>" && git push origin master
Do not wait for a PR — agent workflow fixes must be deployed immediately.
PROMPTEOF

# ─── Dashboard script ────────────────────────────────────────────────

cat > "$PROMPT_DIR/dashboard-watch.sh" << 'DASHBOARDEOF'
#!/usr/bin/env bash
DASHBOARD_FILE="$1"
while true; do
  clear
  if [ -f "$DASHBOARD_FILE" ]; then
    cat "$DASHBOARD_FILE"
  else
    echo "Waiting for dashboard..."
  fi
  sleep 2
done
DASHBOARDEOF
chmod +x "$PROMPT_DIR/dashboard-watch.sh"

# ─── Workers header script ───────────────────────────────────────────
# Shows active worker count and assignments at the top of the RHS.

cat > "$PROMPT_DIR/workers-header.sh" << 'HEADEREOF'
#!/usr/bin/env bash
DASHBOARD_FILE="$1"
while true; do
  clear
  if [ -f "$DASHBOARD_FILE" ]; then
    # Show counts line (2nd line of dashboard)
    sed -n '2p' "$DASHBOARD_FILE" 2>/dev/null
    echo ''
    # Show worker assignments (lines with ◉ or agent-)
    grep -E '(◉|agent-)' "$DASHBOARD_FILE" 2>/dev/null | head -10
  else
    echo '  Waiting for dashboard...'
  fi
  sleep 2
done
HEADEREOF
chmod +x "$PROMPT_DIR/workers-header.sh"

# ─── Legacy agent pane script (kept for backward compat) ────────────

cat > "$PROMPT_DIR/agent-pane.sh" << 'AGENTEOF'
#!/usr/bin/env bash
AGENT_NAME="$1"
while true; do
  clear
  printf '\n  Waiting for tasks... (%s)\n\n' "$AGENT_NAME"
  sleep 5
done
AGENTEOF
chmod +x "$PROMPT_DIR/agent-pane.sh"

# ─── Create tmux layout ──────────────────────────────────────────────

echo "Creating tmux layout..."

# Allow panes to persist after process exit (so server can reuse them)
tmux set-option -g remain-on-exit on 2>/dev/null || true

# Pane 0: Dashboard (left column, full height)
tmux new-session -d -s "$SESSION_NAME" -c "$REPO_ROOT" \
  "$PROMPT_DIR/dashboard-watch.sh '$DASHBOARD_FILE'"
tmux rename-window -t "$SESSION_NAME:0" 'agents'

HAS_SELECTIONS="${SELECTED_IDS:-}"

if [ -n "$HAS_SELECTIONS" ]; then
  # ── Workers + Boss layout ──
  # Layout:
  #   ┌──────────┬──────────────┐
  #   │ Dashboard│ Workers: N   │ ← header (5 lines)
  #   │          ├──────────────┤
  #   │          │ agent-1      │ ← pane-display.sh (FIFO)
  #   │          ├──────────────┤
  #   │          │ agent-2      │
  #   ├──────────┼──────────────┤
  #   │ Boss     │ agent-3      │
  #   └──────────┴──────────────┘

  PANE_DISPLAY="$PANES_DIR/pane-display.sh"

  # Pane %1: agent-1 (RHS, split right from dashboard)
  tmux split-window -h -t "$SESSION_NAME:0" -c "$REPO_ROOT" \
    "$PANE_DISPLAY agent-1"
  AGENT1_PANE=$(tmux display-message -p -t "$SESSION_NAME:0.1" '#{pane_id}')
  echo "$AGENT1_PANE" > "$PANES_DIR/agent-1.pane"
  echo "  agent-1 → pane $AGENT1_PANE"

  # Workers header (split ABOVE agent-1, 5 lines tall)
  tmux split-window -v -b -l 5 -t "$AGENT1_PANE" -c "$REPO_ROOT" \
    "bash $PROMPT_DIR/workers-header.sh '$DASHBOARD_FILE'"
  echo "  workers-header → created above agent-1"

  # Additional agent panes: split vertically from agent-1
  PREV_PANE="$AGENT1_PANE"
  for i in $(seq 2 "$MAX_AGENTS"); do
    tmux split-window -v -t "$PREV_PANE" -c "$REPO_ROOT" \
      "$PANE_DISPLAY agent-$i"
    PANE_ID=$(tmux display-message -p -t "$SESSION_NAME:0" '#{pane_id}')
    echo "$PANE_ID" > "$PANES_DIR/agent-$i.pane"
    echo "  agent-$i → pane $PANE_ID"
    PREV_PANE="$PANE_ID"
  done

  # Boss pane (bottom-left, split from dashboard)
  tmux split-window -v -t "$SESSION_NAME:0.0" -c "$REPO_ROOT" -l 10 \
    "$PI_BIN --append-system-prompt @$PROMPT_DIR/boss-prompt.txt Start"
else
  # ── No selections: just Dashboard + Boss ──
  echo "No tickets selected — starting with boss only."

  tmux split-window -v -t "$SESSION_NAME:0" -c "$REPO_ROOT" -l 15 \
    "$PI_BIN --append-system-prompt @$PROMPT_DIR/boss-prompt.txt Start"
fi

echo "Panes:"
tmux list-panes -t "$SESSION_NAME:0" -F "  #{pane_index}: #{pane_current_command} (id: #{pane_id})"

# ─── Done ────────────────────────────────────────────────────────────

echo ""
echo "All panes running. Attaching tmux..."
tmux select-pane -t "$SESSION_NAME:0.0"

cleanup() {
  kill "${SERVER_PID:-}" 2>/dev/null || true
  tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [ -t 0 ]; then
  tmux attach-session -t "$SESSION_NAME"
else
  echo "Non-interactive mode: tmux session running in background."
  echo "Attach with: tmux attach-session -t $SESSION_NAME"
  while tmux has-session -t "$SESSION_NAME" 2>/dev/null; do
    sleep 5
  done
fi
wait "$SERVER_PID" 2>/dev/null || true
