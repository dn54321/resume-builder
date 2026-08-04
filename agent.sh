#!/usr/bin/env bash
# agent.sh — Launch the Atlas multi-agent orchestration system.
#
# This is a thin wrapper that loads environment config and delegates
# to atlas/atlas.sh. For the full architecture, see atlas/ARCHITECTURE.md.
#
# Quickstart:
#   ./agent.sh
#
# The orchestrator auto-discovers active tickets from Linear on startup.
# The boss can manually add tickets via EPIC <id> and TICKET <id> commands.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Resolve repo root ───────────────────────────────────────────────

if command -v git &>/dev/null && git -C "$SCRIPT_DIR" rev-parse --show-toplevel &>/dev/null; then
  REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
else
  REPO_ROOT="$SCRIPT_DIR"
fi
cd "$REPO_ROOT"

# ─── Load env ────────────────────────────────────────────────────────

if [ -f "$REPO_ROOT/.env.agent" ]; then
  set -a; source "$REPO_ROOT/.env.agent"; set +a
  echo "[agent.sh] Loaded .env.agent"
else
  echo "[agent.sh] WARNING: .env.agent not found — LINEAR_API_KEY may not be set"
fi

# ─── Delegate to Atlas ───────────────────────────────────────────────

ATLAS_SH="$REPO_ROOT/atlas/atlas.sh"

if [ ! -f "$ATLAS_SH" ]; then
  echo "FATAL: Atlas not found at $ATLAS_SH"
  echo "Run: cd atlas && npm install && npm run setup"
  exit 1
fi

exec bash "$ATLAS_SH" "$@"
