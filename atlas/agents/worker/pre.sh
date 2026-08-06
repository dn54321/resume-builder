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

# ─── Apply migrations to the worktree DB (SAFE — no snapshot copy) ───
# ⚠️ DO NOT copy the main repo's dev.db into worktrees. The only real dev DB
# is the Docker volume at backend/prisma/db/dev.db (docker-compose maps
# backend-db:/app/prisma/db). Copying any host .db file over it clobbered
# real data twice (2026-08-06). The safe path is `prisma migrate deploy`:
# it applies only the additive migrations in prisma/migrations/, never
# wiping existing rows.
#
# Worktrees need a DB for prisma-schema.spec.ts + backend tests. Create a
# FRESH one via migrations (idempotent, additive) at the canonical
# prisma/db/dev.db path rather than seeding from a drifted snapshot.
BACKEND_DB_DST="${ATLAS_WORKTREE}/backend/prisma/db/dev.db"
if [ ! -f "$BACKEND_DB_DST" ] || [ ! -s "$BACKEND_DB_DST" ]; then
  echo "[pre.sh] Applying migrations to fresh worktree DB (no snapshot copy)..."
  ( cd "${ATLAS_WORKTREE}/backend" && DATABASE_URL="file:./prisma/db/dev.db" timeout 120 pnpm prisma:migrate ) \
    && echo "[pre.sh] ✓ worktree DB migrated (prisma migrate deploy)" \
    || echo "[pre.sh] WARNING: prisma migrate deploy failed — DB-backed tests may fail"
else
  echo "[pre.sh] worktree DB present — skipping migrate"
fi

# ─── Seed the Section catalog (reference data, idempotent) ──────────
# Migrations create the tables but NOT the Section catalog rows — those are
# static reference data the resumes service FK-requires (an empty catalog
# makes every resume save fail with SQLITE_CONSTRAINT). The main repo's
# dev.db happened to carry them from manual seeding; a fresh migrated DB
# does not. INSERT OR IGNORE is idempotent and additive — never wipes.
if [ -f "$BACKEND_DB_DST" ]; then
  ( cd "${ATLAS_WORKTREE}/backend" && DATABASE_URL="file:./prisma/db/dev.db" node -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.env.DATABASE_URL.replace(/^file:/, ""));
    const cats = [["name_contact","Name & Contact"],["summary","Summary"],["experience","Experience"],["education","Education"],["hard_skills","Hard Skills"],["soft_skills","Soft Skills"],["certifications","Certifications"],["projects","Projects"],["languages","Languages"],["hobbies","Hobbies"],["volunteer","Volunteer"]];
    const st = db.prepare("INSERT OR IGNORE INTO Section (id, label) VALUES (?, ?)");
    for (const [id, label] of cats) st.run(id, label);
    console.log("[pre.sh] ✓ Section catalog seeded (" + db.prepare("SELECT COUNT(*) c FROM Section").get().c + " rows)");
  ' ) 2>/dev/null \
    || echo "[pre.sh] WARNING: Section catalog seed failed — resume saves may FK-fail"
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

# ─── Install backend dependencies if missing ────────────────────────
# Worktrees are fresh git checkouts — backend/node_modules is NOT part of
# the repo, so every worker used to rediscover this ad hoc: run `pnpm
# install`, hit confusing failures first ('Cannot find module dotenv/config'
# on prisma db push → 0-byte test-e2e.db → 'no such table: SectionField'
# in resetE2eDatabase) and burn time diagnosing (observed 2026-08-06:
# RES-104 worker mislabeled it as the RES-94 migration bug). Install once
# here so backend tests + e2e work out of the box. ~6s with warm pnpm
# store; no-op when already installed.
BACKEND_NM="${ATLAS_WORKTREE}/backend/node_modules"
if [ ! -d "$BACKEND_NM" ] || [ -z "$(ls -A "$BACKEND_NM" 2>/dev/null)" ]; then
  echo "[pre.sh] Installing backend dependencies (backend/node_modules missing)..."
  ( cd "${ATLAS_WORKTREE}/backend" && timeout 300 pnpm install --frozen-lockfile ) \
    && echo "[pre.sh] ✓ backend deps installed" \
    || echo "[pre.sh] WARNING: backend pnpm install failed — backend tests/e2e may fail"
else
  echo "[pre.sh] backend node_modules present"
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
