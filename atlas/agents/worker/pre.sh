#!/usr/bin/env bash
# pre.sh — Worker agent pre-start script.
# Sets up the worktree environment so the agent can access shared skills.
set -euo pipefail

echo "[pre.sh] Worker agent starting: ${ATLAS_AGENT_NAME}"
echo "[pre.sh] Port: ${ATLAS_AGENT_PORT}"
echo "[pre.sh] Worktree: ${ATLAS_WORKTREE}"

# ─── Locate the main repo root ──────────────────────────────────────
# The worktree is an isolated git checkout. pi resolves skills relative to
# `git rev-parse --show-toplevel`, which inside a worktree returns the
# worktree path — NOT the main repo. We need to symlink the main repo's
# .agents/ directory into the worktree so the worker can find shared skills.
#
# ATLAS_CONFIG points to atlas/atlas.config.yaml in the main repo.
# Walk up from there to find the repo root.

if [ -n "${ATLAS_CONFIG:-}" ] && [ -f "$ATLAS_CONFIG" ]; then
  MAIN_REPO_ROOT="$(cd "$(dirname "$ATLAS_CONFIG")/.." && pwd)"
elif [ -n "${ATLAS_WORKTREE:-}" ]; then
  # Fallback: worktrees live under atlas/state/worktrees/<id>
  # Walk up: <id> → worktrees → state → atlas → repo root
  MAIN_REPO_ROOT="$(cd "$ATLAS_WORKTREE/../../.." && pwd)"
else
  MAIN_REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fi

echo "[pre.sh] Main repo root: $MAIN_REPO_ROOT"

# ─── Symlink skills into the worktree ──────────────────────────────
# pi auto-discovers skills from .agents/skills/ relative to the git root.
# By symlinking the main repo's .agents/ into the worktree, the worker
# can access all shared skills: create-pr, screenshot, sql-query,
# e2e-test, imgbb-upload, and pi-intercom.

AGENTS_LINK="${ATLAS_WORKTREE}/.agents"
AGENTS_SRC="${MAIN_REPO_ROOT}/.agents"

if [ -d "$AGENTS_SRC" ]; then
  if [ ! -e "$AGENTS_LINK" ]; then
    ln -s "$AGENTS_SRC" "$AGENTS_LINK"
    echo "[pre.sh] Symlinked .agents/ → $AGENTS_SRC"
  else
    echo "[pre.sh] .agents/ already exists in worktree"
  fi
else
  echo "[pre.sh] WARNING: .agents/ not found at $AGENTS_SRC — skills unavailable"
fi

# ─── Symlink pi-intercom if available ──────────────────────────────
# pi-intercom lives in .pi/npm/node_modules/pi-intercom
# The skill file is at pi-intercom/skills/pi-intercom/SKILL.md
# pi discovers it if .pi/ is symlinked or if the intercom module is on PATH.

PI_DIR_LINK="${ATLAS_WORKTREE}/.pi"
PI_DIR_SRC="${MAIN_REPO_ROOT}/.pi"

if [ -d "$PI_DIR_SRC" ] && [ ! -e "$PI_DIR_LINK" ]; then
  ln -s "$PI_DIR_SRC" "$PI_DIR_LINK"
  echo "[pre.sh] Symlinked .pi/ → $PI_DIR_SRC (intercom + extensions)"
fi

# ─── Copy backend .env into the worktree ─────────────────────────────
# backend/.env is gitignored (holds DATABASE_URL + encryption keys), so
# worktrees never get it. Without it, prisma-schema.spec.ts and other DB-
# backed tests throw 'DATABASE_URL environment variable is required' and
# the ENTIRE backend test suite fails for workers — which then conclude
# the ticket failed and exit, causing a spawn/re-queue loop.
BACKEND_ENV_SRC="${MAIN_REPO_ROOT}/backend/.env"
BACKEND_ENV_DST="${ATLAS_WORKTREE}/backend/.env"
if [ -f "$BACKEND_ENV_SRC" ]; then
  if [ ! -f "$BACKEND_ENV_DST" ]; then
    cp "$BACKEND_ENV_SRC" "$BACKEND_ENV_DST"
    echo "[pre.sh] Copied backend/.env → worktree (DB config for tests)"
  else
    echo "[pre.sh] backend/.env already exists in worktree"
  fi
else
  echo "[pre.sh] WARNING: no backend/.env in main repo — DB-backed tests will fail"
fi

# ─── Verify key tools ───────────────────────────────────────────────

if ! command -v pi &>/dev/null; then
  echo "[pre.sh] WARNING: pi binary not found on PATH"
fi

# Check intercom skill is reachable
if [ -f "${AGENTS_SRC}/skills/pi-intercom/SKILL.md" ] || [ -f "${PI_DIR_SRC}/npm/node_modules/pi-intercom/skills/pi-intercom/SKILL.md" ]; then
  echo "[pre.sh] ✓ pi-intercom skill available"
else
  echo "[pre.sh] ⚠ pi-intercom skill NOT found — intercom() calls may fail"
fi

# List available skills
if [ -d "${AGENTS_SRC}/skills" ]; then
  echo "[pre.sh] Available skills:"
  ls "${AGENTS_SRC}/skills/" 2>/dev/null | while read -r skill; do
    echo "[pre.sh]   - $skill"
  done
fi

echo "[pre.sh] Ready."
