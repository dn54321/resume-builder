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

# ─── Pick epics ──────────────────────────────────────────────────────

echo ""
echo "  Fetching epics from Linear..."
echo ""

EPIC_LIST=""
if [ -n "${LINEAR_API_KEY:-}" ]; then
  QUERY='{"query":"{ issues(filter: { state: { type: { in: [\"started\", \"unstarted\", \"backlog\"] } } } first: 25) { nodes { identifier title children { nodes { id } } } } }"}'
  RAW=$(curl -s -X POST https://api.linear.app/graphql \
    -H "Authorization: ${LINEAR_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$QUERY" 2>/dev/null || echo '{"data":null}')
  
  if command -v python3 &>/dev/null; then
    EPIC_LIST=$(echo "$RAW" | python3 -c "
import json, sys
try:
  data = json.load(sys.stdin)
  issues = data.get('data',{}).get('issues',{}).get('nodes',[]) or []
  for i in issues:
    ident = i.get('identifier','?')
    title = i.get('title','')[:60]
    kids = len(i.get('children',{}).get('nodes',[]) or [])
    tag = '[epic]' if kids > 0 else '[ticket]'
    print(f'{ident} {tag} {title}')
except: pass
" 2>/dev/null)
  fi
  
  if [ -z "$EPIC_LIST" ]; then
    EPIC_LIST=$(echo "$RAW" | grep -oP '"identifier":"[A-Z]+-\d+"' | sed 's/"identifier":"//;s/"//' | sort -u)
  fi
fi

if [ -z "$EPIC_LIST" ]; then
  echo "  (Could not fetch from Linear. Enter ticket identifiers manually.)"
  echo ""
  read -rp "  Epic/ticket IDs (space-separated): " MANUAL_IDS
  SELECTED_EPICS="$MANUAL_IDS"
else
  SELECTED_EPICS=$(echo "$EPIC_LIST" | awk '{print $1}' | tr '\n' ' ')
  echo "$EPIC_LIST" | head -20
  echo ""
  echo "  Auto-selecting all: $SELECTED_EPICS"
fi

if [ -z "${SELECTED_EPICS:-}" ]; then
  echo "No epics selected. The server will start idle."
  echo "The boss can send EPIC <ID> commands to add work."
  SELECTED_EPICS=""
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

INITIAL_EPIC_CMDS=""
if [ -n "${SELECTED_EPICS:-}" ]; then
  INITIAL_EPIC_CMDS="After registration, immediately send: EPIC $SELECTED_EPICS"
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
  TICKET <id>           — Add a single ticket as a mini-graph
  STOP                  — Halt all workers
  STOP agent-N          — Stop a specific worker
  CLOSE <id>            — Close a ticket in Linear and mark done
  STATUS                — Get current state summary
- Use linear tools to find epics, check statuses, create follow-up tickets
- Answer worker questions when they ask you
- The server manages MULTIPLE epics simultaneously — send EPIC for each

${INITIAL_EPIC_CMDS}

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

# ─── Agent pane display script ───────────────────────────────────────
# Each agent pane runs this loop. The server uses tmux send-keys to
# interrupt it and show worker output, then reset it afterward.

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

HAS_EPICS="${SELECTED_EPICS:-}"

if [ -n "$HAS_EPICS" ]; then
  # ── Workers + Boss layout ──

  # Pane 1: agent-1 (right column, top)
  tmux split-window -h -t "$SESSION_NAME:0" -c "$REPO_ROOT" \
    "$PROMPT_DIR/agent-pane.sh agent-1"
  PANE_ID=$(tmux display-message -p -t "$SESSION_NAME:0.1" '#{pane_id}')
  echo "$PANE_ID" > "$PANES_DIR/agent-1.pane"
  echo "  agent-1 → pane $PANE_ID"

  # Panes 2..N: additional agents (split vertically from the previous)
  for i in $(seq 2 "$MAX_AGENTS"); do
    # Split from the previous agent pane
    PREV_PANE=$((i-1))
    tmux split-window -v -t "$SESSION_NAME:0.$PREV_PANE" -c "$REPO_ROOT" \
      "$PROMPT_DIR/agent-pane.sh agent-$i"
    PANE_ID=$(tmux display-message -p -t "$SESSION_NAME:0.$i" '#{pane_id}')
    echo "$PANE_ID" > "$PANES_DIR/agent-$i.pane"
    echo "  agent-$i → pane $PANE_ID"
  done

  # Boss pane (bottom-left, 10 lines)
  tmux split-window -v -t "$SESSION_NAME:0.0" -c "$REPO_ROOT" -l 10 \
    "$PI_BIN --append-system-prompt @$PROMPT_DIR/boss-prompt.txt Start"
else
  # ── No epics: just Dashboard + Boss ──
  echo "No epics selected — starting with boss only."

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
