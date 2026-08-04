#!/usr/bin/env bash
# atlas.sh — Launch the Atlas multi-agent orchestration system.
#
# Layout (see ARCHITECTURE.md § Tmux Pane Architecture):
#   ┌──────────────┬────────────────────────┐
#   │              │  ═══ Workers: 0/3 ═══  │ ← Banner (PERSISTENT)
#   │  Dashboard   │                        │
#   │              │  (worker panes split    │
#   │              │   from banner when      │
#   ├──────────────┤   agents are spawned)   │
#   │  Boss (pi)   │                        │
#   └──────────────┴────────────────────────┘

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ATLAS_LOG="$SCRIPT_DIR/state/atlas-${TIMESTAMP}.log"
mkdir -p "$(dirname "$ATLAS_LOG")"

# ─── Logging ─────────────────────────────────────────────────────

log() {
  local msg="[$(date +%H:%M:%S)] $*"
  echo "$msg" | tee -a "$ATLAS_LOG" >&2
}

die() {
  log "FATAL: $*"
  exit 1
}

# ─── Config ──────────────────────────────────────────────────────

CONFIG="$SCRIPT_DIR/atlas.config.yaml"
if [ ! -f "$CONFIG" ]; then
  die "atlas.config.yaml not found at $CONFIG"
fi

# Parse max workers from config (simple grep-based)
MAX_WORKERS=$(grep 'max_instances:' "$CONFIG" | head -1 | awk '{print $2}' | tr -d ' ')
MAX_WORKERS="${MAX_WORKERS:-3}"

# Check LINEAR_API_KEY
if [ -z "${LINEAR_API_KEY:-}" ]; then
  log "WARNING: LINEAR_API_KEY not set"
fi

log "MAX_WORKERS=$MAX_WORKERS"

# ─── Find binaries ───────────────────────────────────────────────

PI_BIN=""
for p in "$HOME/.local/share/pnpm/bin/pi" "$HOME/.local/bin/pi" /usr/local/bin/pi pi; do
  if command -v "$p" &>/dev/null || [ -x "$p" ]; then PI_BIN="$p"; break; fi
done
[ -z "$PI_BIN" ] && die "pi binary not found"

TSX_BIN=""
for p in "$SCRIPT_DIR/node_modules/.bin/tsx" \
         "$HOME/.local/share/pnpm/bin/tsx" \
         "$HOME/.local/bin/tsx"; do
  [ -x "$p" ] && { TSX_BIN="$p"; break; }
done
[ -z "$TSX_BIN" ] && TSX_BIN="npx tsx"

log "PI_BIN=$PI_BIN"
log "TSX_BIN=$TSX_BIN"

# ─── Clean slate ─────────────────────────────────────────────────

SESSION_NAME="atlas"

log "Cleaning up previous session..."
pkill -f "atlas.*orchestrator" 2>/dev/null && log "  Killed old orchestrator" || log "  No old orchestrator"
tmux kill-session -t "$SESSION_NAME" 2>/dev/null && log "  Killed old tmux session" || log "  No old tmux session"
sleep 1
unset TMUX

# ─── Initialize state dirs ───────────────────────────────────────

mkdir -p "$SCRIPT_DIR/state"/{logs,worktrees,cache,panes/fifos,prompts}

# ─── Start orchestrator ──────────────────────────────────────────

log "Starting orchestrator..."
ORCHESTRATOR_LOG="$SCRIPT_DIR/state/orchestrator.log"
READY_FILE="$SCRIPT_DIR/state/ready"
rm -f "$READY_FILE"  # Clear stale ready file
cd "$SCRIPT_DIR"
$TSX_BIN orchestrator/index.ts >> "$ORCHESTRATOR_LOG" 2>&1 &
ORCHESTRATOR_PID=$!
log "Orchestrator PID: $ORCHESTRATOR_PID"

# Wait for orchestrator to write pane scripts (banner.sh, etc).
# The orchestrator writes state/ready after PaneManager.init().
# Use a timeout of 15 seconds — if it takes longer, something is wrong.
WAITED=0
while [ ! -f "$READY_FILE" ] && [ $WAITED -lt 15 ]; do
  if ! kill -0 "$ORCHESTRATOR_PID" 2>/dev/null; then
    log "Orchestrator exited during startup. Last 20 lines:"
    tail -20 "$ORCHESTRATOR_LOG" | while read -r line; do log "  orch: $line"; done
    die "Orchestrator failed to start"
  fi
  sleep 0.5
  WAITED=$((WAITED + 1))
done

if [ ! -f "$READY_FILE" ]; then
  log "Timeout waiting for orchestrator ready file. Last 20 lines:"
  tail -20 "$ORCHESTRATOR_LOG" | while read -r line; do log "  orch: $line"; done
  die "Orchestrator did not become ready within 15 seconds"
fi
log "Orchestrator ready (scripts written after ${WAITED}s)"

# ─── Write boss prompt with initial ticket commands ─────────────

BOSS_PROMPT_FILE="$SCRIPT_DIR/agents/boss/prompt.md"
BOSS_PROMPT_DIR="$SCRIPT_DIR/state/prompts"
mkdir -p "$BOSS_PROMPT_DIR"

# Build initial commands for the boss to auto-execute on startup
INITIAL_COMMANDS=""
if [ -n "${ATLAS_INITIAL_EPICS:-}" ]; then
  INITIAL_COMMANDS="${INITIAL_COMMANDS}EPIC ${ATLAS_INITIAL_EPICS}"
fi
if [ -n "${ATLAS_INITIAL_TICKETS:-}" ]; then
  INITIAL_COMMANDS="${INITIAL_COMMANDS}${INITIAL_COMMANDS:+; }TICKET ${ATLAS_INITIAL_TICKETS}"
fi

if [ -n "$INITIAL_COMMANDS" ]; then
  log "Seeding boss prompt with: $INITIAL_COMMANDS"
  # Append initial commands to the boss prompt
  cat "$BOSS_PROMPT_FILE" > "$BOSS_PROMPT_DIR/boss-prompt.md"
  echo "" >> "$BOSS_PROMPT_DIR/boss-prompt.md"
  echo "## Immediate Actions" >> "$BOSS_PROMPT_DIR/boss-prompt.md"
  echo "" >> "$BOSS_PROMPT_DIR/boss-prompt.md"
  echo "After registering with the orchestrator, immediately send:" >> "$BOSS_PROMPT_DIR/boss-prompt.md"
  echo "" >> "$BOSS_PROMPT_DIR/boss-prompt.md"
  for cmd in $INITIAL_COMMANDS; do
    # Replace ; with actual line breaks
    echo "\`\`\`" >> "$BOSS_PROMPT_DIR/boss-prompt.md"
    echo "$cmd" | tr ';' '\n' | while read -r line; do
      [ -n "$line" ] && echo "intercom({ action: \"send\", to: \"orchestrator\", message: \"$line\" })" >> "$BOSS_PROMPT_DIR/boss-prompt.md"
    done
    echo "\`\`\`" >> "$BOSS_PROMPT_DIR/boss-prompt.md"
  done
  BOSS_PROMPT_ARG="@$BOSS_PROMPT_DIR/boss-prompt.md"
else
  BOSS_PROMPT_ARG="@$BOSS_PROMPT_FILE"
fi

# ─── Create tmux layout ──────────────────────────────────────────

log "Creating tmux layout..."
tmux set-option -g remain-on-exit on 2>/dev/null || true

DASHBOARD_WATCH="$SCRIPT_DIR/state/panes/dashboard-watch.sh"
BANNER_SCRIPT="$SCRIPT_DIR/state/panes/banner.sh"
FIFO_DIR="$SCRIPT_DIR/state/panes/fifos"

# Ensure scripts exist (pane-manager writes them eagerly)
if [ ! -x "$BANNER_SCRIPT" ]; then
  log "Banner script not found — orchestrator should have created it."
  die "Missing: $BANNER_SCRIPT"
fi

# Pane 0: Dashboard (left, full height)
log "Creating dashboard pane..."
tmux new-session -d -s "$SESSION_NAME" -c "$SCRIPT_DIR" \
  "$DASHBOARD_WATCH $SCRIPT_DIR/state/dashboard.txt" || die "tmux new-session failed"

# Pane %1: Banner (right, top, 3 lines) — PERSISTENT, NEVER KILLED
log "Creating banner pane..."
tmux split-window -h -t "$SESSION_NAME:0" -c "$SCRIPT_DIR" \
  "$BANNER_SCRIPT $MAX_WORKERS $FIFO_DIR" || die "tmux split-window for banner failed"

BANNER_PANE=$(tmux display-message -p -t "$SESSION_NAME:0.1" '#{pane_id}' 2>/dev/null) || true
echo "$BANNER_PANE" > "$SCRIPT_DIR/state/panes/banner.pane"
log "  Banner → pane $BANNER_PANE (PERSISTENT)"

# Pane 2: Boss (bottom-left)
log "Creating boss pane..."
tmux split-window -v -t "$SESSION_NAME:0.0" -c "$SCRIPT_DIR" -l 10 \
  "$PI_BIN --append-system-prompt ${BOSS_PROMPT_ARG} Start" || die "tmux split-window for boss failed"
log "  Boss pane created"

# ─── Done ────────────────────────────────────────────────────────

log "Layout ready. Log: $ATLAS_LOG"
log "Attaching tmux..."

cleanup() {
  kill "${ORCHESTRATOR_PID:-}" 2>/dev/null || true
  tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
  log "Cleanup complete"
}
trap cleanup EXIT INT TERM

if [ -t 0 ]; then
  tmux select-pane -t "$SESSION_NAME:0.0"
  tmux attach-session -t "$SESSION_NAME"
else
  echo "Non-interactive mode: tmux session running in background."
  echo "Attach with: tmux attach-session -t $SESSION_NAME"
  while tmux has-session -t "$SESSION_NAME" 2>/dev/null; do
    sleep 5
  done
fi
wait "$ORCHESTRATOR_PID" 2>/dev/null || true
