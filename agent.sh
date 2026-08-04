#!/usr/bin/env bash
# agent.sh — Launch the Atlas multi-agent orchestration system.
#
# This is a thin wrapper that loads environment config, optionally fetches
# active tickets from Linear, and delegates to atlas/atlas.sh.
#
# Quickstart:
#   ./agent.sh
#
# The orchestrator auto-discovers active tickets on startup. The boss can
# manually add tickets via EPIC <id> and TICKET <id> commands.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Resolve repo root ───────────────────────────────────────────────

if command -v git &>/dev/null && git -C "$SCRIPT_DIR" rev-parse --show-toplevel &>/dev/null; then
  REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
else
  REPO_ROOT="$SCRIPT_DIR"
fi
cd "$REPO_ROOT"

# ─── Load env ──────────────────────────────────────────────────────

if [ -f "$REPO_ROOT/.env.agent" ]; then
  set -a; source "$REPO_ROOT/.env.agent"; set +a
  echo "[agent.sh] Loaded .env.agent"
else
  echo "[agent.sh] WARNING: .env.agent not found — LINEAR_API_KEY may not be set"
fi

# ─── Delegate to Atlas ─────────────────────────────────────────────

ATLAS_SH="$REPO_ROOT/atlas/atlas.sh"

if [ ! -f "$ATLAS_SH" ]; then
  echo "FATAL: Atlas not found at $ATLAS_SH"
  echo "Run: cd atlas && npm install && npm run setup"
  exit 1
fi

# ─── Optional: pre-fetch tickets from Linear ──────────────────────

if [ -n "${LINEAR_API_KEY:-}" ] && command -v python3 &>/dev/null; then
  echo ""
  echo "  Fetching active tickets from Linear..."
  echo ""

  QUERY='{"query":"{ issues(filter: { state: { type: { nin: [\"completed\", \"canceled\"] } } } first: 50) { nodes { identifier title children { nodes { id } } } } }"}'
  RAW=$(curl -s -X POST https://api.linear.app/graphql \
    -H "Authorization: ${LINEAR_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$QUERY" 2>/dev/null || echo '{"data":null}')

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

  if [ -n "${TICKET_LIST:-}" ]; then
    echo "$TICKET_LIST" | head -30
    echo ""

    EPIC_IDS=$(echo "$TICKET_LIST" | grep '\[EPIC\]' | awk '{print $1}' | tr '\n' ' ' | sed 's/ *$//')
    STANDALONE_IDS=$(echo "$TICKET_LIST" | grep '\[TICKET\]' | awk '{print $1}' | tr '\n' ' ' | sed 's/ *$//')

    # Export for atlas.sh to pick up
    export ATLAS_INITIAL_EPICS="${EPIC_IDS:-}"
    export ATLAS_INITIAL_TICKETS="${STANDALONE_IDS:-}"

    if [ -n "$EPIC_IDS" ]; then
      echo "  Epics:   $EPIC_IDS"
    fi
    if [ -n "$STANDALONE_IDS" ]; then
      echo "  Tickets: $STANDALONE_IDS"
    fi
    echo ""
    echo "  Auto-discovered tickets have been exported."
    echo "  The orchestrator will also auto-discover on startup."
    echo ""
  fi
fi

exec bash "$ATLAS_SH" "$@"
