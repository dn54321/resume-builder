#!/usr/bin/env bash
# agent.sh — Launch the ticket agent system.
#
# Layout:
#   ┌──────────┬──────────────────┐
#   │          │                  │
#   │ Dashboard│  Workers (0/3)   │
#   │          │                  │
#   │          │                  │
#   ├──────────┤                  │
#   │ Boss     │                  │
#   └──────────┴──────────────────┘
#
# The workers placeholder shows a live count of active workers.
# When the server spawns workers, it splits this placeholder pane
# to create worker panes for log output. When workers finish, their
# panes are killed (space returns to the placeholder).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
AGENT_LOG="$SCRIPT_DIR/.pi/tickets/agent-${TIMESTAMP}.log"
mkdir -p "$(dirname "$AGENT_LOG")"

# ─── Logging ─────────────────────────────────────────────────────────

log() {
  local msg="[$(date +%H:%M:%S)] $*"
  echo "$msg" | tee -a "$AGENT_LOG" >&2
}

die() {
  log "FATAL: $*"
  log "Full log at: $AGENT_LOG"
  exit 1
}

# ─── Resolve repo root ───────────────────────────────────────────────

if command -v git &>/dev/null && git -C "$SCRIPT_DIR" rev-parse --show-toplevel &>/dev/null; then
  REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
else
  REPO_ROOT="$SCRIPT_DIR"
fi
cd "$REPO_ROOT"
log "REPO_ROOT=$REPO_ROOT"
log "Log file: $AGENT_LOG"

SESSION_NAME="ticket-agents"

# ─── Config ──────────────────────────────────────────────────────────

MAX_AGENTS=3
if [ -f "$REPO_ROOT/.env.agent" ]; then
  val=$(grep MAX_SPAWN_AGENTS "$REPO_ROOT/.env.agent" 2>/dev/null | cut -d= -f2- | tr -d ' ')
  [ -n "$val" ] && MAX_AGENTS="$val"
fi
log "MAX_AGENTS=$MAX_AGENTS"

# ─── Find pi ────────────────────────────────────────────────────────

PI_BIN=""
for p in "$HOME/.local/share/pnpm/bin/pi" "$HOME/.local/bin/pi" /usr/local/bin/pi pi; do
  if command -v "$p" &>/dev/null || [ -x "$p" ]; then PI_BIN="$p"; break; fi
done
[ -z "$PI_BIN" ] && die "pi binary not found — checked HOME/.local/share/pnpm/bin/pi, HOME/.local/bin/pi, /usr/local/bin/pi, and PATH"

TSX_BIN=""
for p in "$REPO_ROOT/.pi/npm/node_modules/.bin/tsx" \
         "$REPO_ROOT/backend/node_modules/.bin/tsx" \
         "$REPO_ROOT/node_modules/.bin/tsx"; do
  [ -x "$p" ] && { TSX_BIN="$p"; break; }
done
[ -z "$TSX_BIN" ] && TSX_BIN="npx tsx"
log "PI_BIN=$PI_BIN"
log "TSX_BIN=$TSX_BIN"

# ─── Load env ────────────────────────────────────────────────────────

if [ -f "$REPO_ROOT/.env.agent" ]; then
  set -a; source "$REPO_ROOT/.env.agent"; set +a
  log "Loaded .env.agent"
else
  log "WARNING: .env.agent not found — LINEAR_API_KEY may not be set"
fi

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
    log "Selected: $SELECTED_IDS"
    log "Epics: $EPIC_IDS"
    log "Tickets: $STANDALONE_IDS"
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
  log "Manual selection: $SELECTED_IDS"
fi

if [ -z "${SELECTED_IDS:-}" ]; then
  echo "No tickets selected. The server will start idle."
  echo "The boss can send EPIC <id> and TICKET <id> commands to add work."
  SELECTED_IDS=""
  log "No tickets selected — server will start idle"
fi

# ─── Clean slate ─────────────────────────────────────────────────────

log "Cleaning up previous server and session..."
pkill -f "tsx.*server-daemon" 2>/dev/null && log "  Killed old server daemon" || log "  No old server daemon running"
tmux kill-session -t "$SESSION_NAME" 2>/dev/null && log "  Killed old tmux session" || log "  No old tmux session"
sleep 1
rm -f "$REPO_ROOT/.pi/tickets/state.json" 2>/dev/null || true
unset TMUX
log "Clean slate ready"

# ─── Start server daemon ─────────────────────────────────────────────

log "Starting server daemon..."
SERVER_LOG="$REPO_ROOT/.pi/tickets/server.log"
DASHBOARD_FILE="$REPO_ROOT/.pi/tickets/dashboard.txt"
mkdir -p "$(dirname "$SERVER_LOG")"
> "$SERVER_LOG"
echo "Initializing..." > "$DASHBOARD_FILE"

SERVER_SCRIPT="$REPO_ROOT/.pi/extensions/ticket/server-daemon.ts"
if [ ! -f "$SERVER_SCRIPT" ]; then
  die "Server script not found: $SERVER_SCRIPT"
fi

$TSX_BIN "$SERVER_SCRIPT" >> "$SERVER_LOG" 2>&1 &
SERVER_PID=$!
log "Server PID: $SERVER_PID"

# Verify server started
sleep 2
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  log "Server exited immediately. Last 20 lines of server log:"
  tail -20 "$SERVER_LOG" | while read -r line; do log "  server: $line"; done
  die "Server daemon failed to start"
fi
log "Server daemon running (PID $SERVER_PID)"

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

log "Writing boss prompt..."
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

log "Writing dashboard-watch.sh..."
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

# ─── Create tmux layout ──────────────────────────────────────────────

log "Creating tmux layout..."

# Verify tmux is reachable
if ! command -v tmux &>/dev/null; then
  die "tmux is not installed or not on PATH"
fi
log "tmux version: $(tmux -V)"

if ! command -v "$PI_BIN" &>/dev/null && [ ! -x "$PI_BIN" ]; then
  die "pi binary not executable: $PI_BIN"
fi

# Allow panes to persist after process exit (so server can reuse them)
tmux set-option -g remain-on-exit on 2>/dev/null || true

# Pane 0: Dashboard (left column, full height)
log "Creating dashboard pane..."
if ! tmux new-session -d -s "$SESSION_NAME" -c "$REPO_ROOT" \
  "$PROMPT_DIR/dashboard-watch.sh $DASHBOARD_FILE"; then
  die "tmux new-session failed"
fi
tmux rename-window -t "$SESSION_NAME:0" 'agents'
log "Dashboard pane created (session: $SESSION_NAME)"

# ─── Workers placeholder pane ────────────────────────────────────

WORKERS_PLACEHOLDER="$PANES_DIR/workers-placeholder.sh"
if [ ! -x "$WORKERS_PLACEHOLDER" ]; then
  die "Workers placeholder script not found or not executable: $WORKERS_PLACEHOLDER"
fi

# Pane %1: Workers placeholder (RHS, split right from dashboard)
# This single pane shows "Workers: 0/N active". When the server spawns
# workers, it splits this pane dynamically. When workers finish, their
# panes are killed and the placeholder expands back.
log "Creating workers placeholder pane..."
if ! tmux split-window -h -t "$SESSION_NAME:0" -c "$REPO_ROOT" \
  "$WORKERS_PLACEHOLDER $MAX_AGENTS"; then
  die "tmux split-window for workers placeholder failed"
fi
WORKERS_PANE=$(tmux display-message -p -t "$SESSION_NAME:0.1" '#{pane_id}' 2>/dev/null) || true
if [ -z "$WORKERS_PANE" ]; then
  log "  WARNING: Could not get pane ID via display-message, using fallback..."
  WORKERS_PANE=$(tmux list-panes -t "$SESSION_NAME:0" -F '#{pane_id}' | tail -1)
fi
echo "$WORKERS_PANE" > "$PANES_DIR/workers.pane"
log "  workers placeholder → pane $WORKERS_PANE"

# Boss pane (bottom-left, split from dashboard)
log "Creating boss pane..."
if ! tmux split-window -v -t "$SESSION_NAME:0.0" -c "$REPO_ROOT" -l 10 \
  "$PI_BIN --append-system-prompt @$PROMPT_DIR/boss-prompt.txt Start"; then
  die "tmux split-window for boss failed"
fi
log "  Boss pane created"

log "All panes created. Listing layout:"
tmux list-panes -t "$SESSION_NAME:0" -F "  #{pane_index}: #{pane_current_command} (id: #{pane_id})" 2>&1 | while read -r line; do log "$line"; done

# ─── Done ────────────────────────────────────────────────────────────

log "All panes running. Attaching tmux..."
tmux select-pane -t "$SESSION_NAME:0.0"
log "Layout ready. Log at: $AGENT_LOG"

cleanup() {
  kill "${SERVER_PID:-}" 2>/dev/null || true
  tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
  log "Cleanup complete"
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
