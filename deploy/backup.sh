#!/usr/bin/env bash
# ─── backup.sh — daily Postgres snapshot (pg_dump → gzip) ────────────────
# Run from cron ON the droplet:
#   0 3 * * * /root/resume-v3/deploy/backup.sh >> /var/log/resume-backup.log 2>&1
#
# Keeps RETENTION_DAYS (default 14) daily snapshots in backups/ and prunes
# the rest. Restore:
#   gunzip -c backups/resume_YYYY-MM-DD_HHMM.sql.gz | \
#     docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db \
#       psql -U resume resume_builder
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_DIR/.env.prod"
BACKUP_DIR="$REPO_DIR/backups"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

[ -f "$ENV_FILE" ] || { echo "[backup] $ENV_FILE missing — nothing to do" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
cd "$REPO_DIR"

# Read user/db from .env.prod (defaults match docker-compose.prod.yml)
POSTGRES_USER="$(sed -n 's/^POSTGRES_USER=//p' "$ENV_FILE" | tail -1)"
POSTGRES_DB="$(sed -n 's/^POSTGRES_DB=//p' "$ENV_FILE" | tail -1)"
POSTGRES_USER="${POSTGRES_USER:-resume}"
POSTGRES_DB="${POSTGRES_DB:-resume_builder}"

OUT="$BACKUP_DIR/resume_$(date +%F_%H%M).sql.gz"
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT"

find "$BACKUP_DIR" -name '*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

echo "[backup] wrote $OUT ($(du -h "$OUT" | cut -f1))"
