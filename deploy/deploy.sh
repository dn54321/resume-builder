#!/usr/bin/env bash
# ─── deploy.sh — manual redeploy over SSH ─────────────────────────────────
# Hard-syncs the release branch on the droplet, rebuilds, and restarts the
# stack. (CI does the same thing automatically on every push to the release
# branch — see .github/workflows/deploy.yml. This script is for manual
# deploys.)
#
# Usage:
#   DROPLET_USER=root DROPLET_HOST=203.0.113.10 ./deploy/deploy.sh
#   DROPLET_USER=root DROPLET_HOST=203.0.113.10 REPO_DIR=/srv/resume-v3 ./deploy/deploy.sh
#   DEPLOY_BRANCH=release/v1.0.0 … # override the branch (default: release/v1.0.0)
set -euo pipefail

: "${DROPLET_USER:?set DROPLET_USER (e.g. root)}"
: "${DROPLET_HOST:?set DROPLET_HOST (droplet IP or hostname)}"
REPO_DIR="${REPO_DIR:-~/resume-v3}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-release/v1.0.0}"

echo "==> Deploying $DEPLOY_BRANCH to $DROPLET_USER@$DROPLET_HOST:$REPO_DIR"

ssh -o BatchMode=yes "$DROPLET_USER@$DROPLET_HOST" '
  set -euo pipefail
  cd '"$REPO_DIR"'
  # Hard-sync to the release branch — the droplet is a single-purpose
  # deploy box (all state lives in .env.prod + the pgdata volume, both
  # gitignored), so resetting tracked files is always safe and guarantees
  # we build exactly what we intend — even after a force-push or a stray
  # commit on the droplet. Never add '"git clean"' here (it would delete
  # .env.prod).
  git fetch origin '"$DEPLOY_BRANCH"'
  git checkout -f '"$DEPLOY_BRANCH"'
  git reset --hard origin/'"$DEPLOY_BRANCH"'
  echo "Deploying '"$DEPLOY_BRANCH"' @ $(git log -1 --oneline)"
  docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
  docker image prune -f
  docker compose --env-file .env.prod -f docker-compose.prod.yml ps --status running
'

echo "==> Deploy finished"
