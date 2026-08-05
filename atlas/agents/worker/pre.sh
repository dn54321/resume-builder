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

# ─── Copy the generated Prisma client into the worktree ────────────
# backend/src/generated/prisma is GITIGNORED (Prisma 7 output), so fresh
# worktrees never get it — prisma-schema.spec.ts and every DB-backed test
# throw missing-client errors until the worker figures out to run
# `pnpm prisma:generate` (which ALSO runs scripts/patch-prisma-client.js to
# fix Prisma 7's ESM import.meta.url — bare `npx prisma generate` crashes
# NestJS at runtime). Copying the already-patched client means workers can
# run tests immediately, and re-generating later is still safe (the patch
# is idempotent). Only 540K — cheap.
GEN_CLIENT_SRC="${MAIN_REPO_ROOT}/backend/src/generated/prisma"
GEN_CLIENT_DST="${ATLAS_WORKTREE}/backend/src/generated/prisma"
if [ -d "$GEN_CLIENT_SRC" ]; then
  if [ ! -d "$GEN_CLIENT_DST" ]; then
    mkdir -p "$(dirname "$GEN_CLIENT_DST")"
    cp -r "$GEN_CLIENT_SRC" "$GEN_CLIENT_DST"
    echo "[pre.sh] Copied generated Prisma client → worktree (540K, pre-patched)"
  else
    echo "[pre.sh] generated Prisma client already present in worktree"
  fi
else
  echo "[pre.sh] WARNING: no generated Prisma client in main repo — run pnpm prisma:generate"
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

# ─── Sync playwright configs (headless-by-default) ────────────────
# Worktrees branched BEFORE commit 4fabce6 carry an old playwright config
# with `headless: !!process.env.CI` — headed unless CI is set. Workers run
# e2e without CI, so Chromium opens a visible window (or fails on headless
# hosts) and the run is slow/fragile. Sync the current configs from the
# main repo when the worktree's copy is the stale pattern, so every worker
# runs headless by default (PW_HEADED opt-in). Skip if the worktree already
# has the new pattern (branch includes the fix, or the worker edited it).
sync_playwright_config() {
  local rel="$1"
  local src="${MAIN_REPO_ROOT}/${rel}"
  local dst="${ATLAS_WORKTREE}/${rel}"
  if [ ! -f "$src" ]; then
    echo "[pre.sh] WARNING: main repo $rel not found — cannot sync"
    return
  fi
  if [ ! -f "$dst" ]; then
    cp "$src" "$dst"
    echo "[pre.sh] Copied $rel → worktree (missing)"
    return
  fi
  if grep -q "PW_HEADED" "$dst"; then
    echo "[pre.sh] $rel already headless-by-default (PW_HEADED pattern)"
  else
    cp "$src" "$dst"
    echo "[pre.sh] Synced $rel from main repo (stale pre-4fabce6 config)"
  fi
}

sync_playwright_config "e2e/playwright.config.ts"
sync_playwright_config "frontend/playwright.config.ts"

echo "[pre.sh] Ready."
