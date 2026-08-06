#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# setup-droplet.sh — bootstrap a DigitalOcean droplet to host Resume Builder
#
# Run ON the droplet, from a checkout of this repo:
#   sudo DOMAIN=resumes.example.com EMAIL=you@example.com ./deploy/setup-droplet.sh
#
# Idempotent — safe to re-run (updates packages, preserves existing
# .env.prod secrets, skips steps already done).
#
# What it does:
#   1. System: 2G swap (protects docker builds from OOM on small droplets),
#      ufw (22/80/443), fail2ban, nginx, certbot
#   2. Docker CE + compose plugin (get.docker.com), enabled at boot
#   3. Secrets: generates .env.prod from .env.prod.template. NEVER
#      overwrites an existing .env.prod — regenerating the encryption keys
#      makes stored data undecryptable (see AGENTS.md key-separation rules).
#   4. nginx site config (deploy/nginx/resume-builder.conf) + Let's Encrypt
#      certificate for DOMAIN (auto-renewal via certbot's systemd timer)
#   5. Builds & starts the stack: docker compose up -d --build
#
# Before running: point an A record for DOMAIN at this droplet's public IP
# and ensure ports 80/443 are open (ufw is configured below; a DO cloud
# firewall also works).
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Config ─────────────────────────────────────────────────────────────
DOMAIN="${DOMAIN:?set DOMAIN, e.g. sudo DOMAIN=resumes.example.com EMAIL=you@x.com ./deploy/setup-droplet.sh}"
EMAIL="${EMAIL:?set EMAIL (needed for TLS cert expiry notices, e.g. you@example.com)}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_DIR/.env.prod"
SWAP_SIZE_MB="${SWAP_SIZE_MB:-2048}"

log()  { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[setup!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[setup ✗]\033[0m %s\n' "$*" >&2; exit 1; }

# ─── Preflight ──────────────────────────────────────────────────────────
[ "$(id -u)" -eq 0 ] || die "run as root: sudo $0"

log "Checking DNS for $DOMAIN …"
# DNS preflight is a WARNING HELPER ONLY — it must never abort the
# bootstrap. Every probe is failure-tolerant (2>/dev/null + || true) and
# every reference uses ${VAR:-} so `set -u` can never trip here (observed
# on a fresh Ubuntu VM: 'PUBLIC_IP: unbound variable' despite the
# assignments above — environment-specific, but the check doesn't need to
# exist in a form that can crash the install).
PUBLIC_IP="$(curl -4 -fsSL --max-time 10 https://api.ipify.org 2>/dev/null || true)"
DOMAIN_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1; exit}' || true)"
if [ -n "${PUBLIC_IP:-}" ] && [ -n "${DOMAIN_IP:-}" ] && [ "${PUBLIC_IP:-}" != "${DOMAIN_IP:-}" ]; then
  warn "$DOMAIN resolves to ${DOMAIN_IP:-?} but this droplet's IP is ${PUBLIC_IP:-?} — TLS issuance will fail."
  warn "Point an A record at this droplet first, then re-run."
elif [ -z "${DOMAIN_IP:-}" ]; then
  warn "$DOMAIN does not resolve yet — TLS issuance will fail. Point DNS first, then re-run."
else
  log "DNS OK ($DOMAIN → ${DOMAIN_IP:-?})"
fi

# ─── 1. System: swap / firewall / hardening ─────────────────────────────
if [ ! -f /swapfile ]; then
  log "Creating ${SWAP_SIZE_MB}MB swap (docker builds OOM without it on 1GB droplets) …"
  fallocate -l "${SWAP_SIZE_MB}M" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  log "Swap already present — skipping"
fi

log "Installing system packages (nginx, certbot, fail2ban, ufw) …"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx fail2ban ufw ca-certificates curl

log "Configuring ufw (allow 22/80/443, enable) …"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true
ufw status | sed -n '1,8p' | sed 's/^/    /'

log "Enabling fail2ban (protects SSH from brute force) …"
systemctl enable --now fail2ban >/dev/null 2>&1 || warn "fail2ban failed to start — check 'systemctl status fail2ban'"

# ─── 2. Docker ──────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker CE + compose plugin …"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  log "Docker already installed ($(docker --version))"
  docker compose version >/dev/null 2>&1 || die "docker compose plugin missing — run: apt-get install -y docker-compose-plugin"
fi

# ─── 3. Secrets (.env.prod) ─────────────────────────────────────────────
# Every var docker-compose.prod.yml requires with ${VAR:?} must be present
# with a real (non-placeholder) value. A placeholder value starts with '<'
# (template tokens like <RANDOM:32> / <ENC:AES-256> / <your-domain>); real
# generated values never do.
REQUIRED_VARS="POSTGRES_PASSWORD DATABASE_URL FRONTEND_URL VITE_API_BASE_URL RESUME_FIELD_ENCRYPTION_KEY SESSION_ENCRYPTION_KEY"

# Returns 0 if the env file is present AND every required var has a real
# value; 1 otherwise. A real value is non-empty and contains no '<' —
# template tokens (<RANDOM:32>, <ENC:AES-256>, <your-domain>) always do.
env_file_usable() {
  local missing="" v
  for v in $REQUIRED_VARS; do
    grep -qE "^${v}=[^<]+$" "$ENV_FILE" 2>/dev/null || missing="$missing $v"
  done
  [ -z "$missing" ]
}

# Echoes how many required vars currently hold a real (non-placeholder)
# value in the env file. 0 = fresh/placeholder-only; all = complete;
# between = half-filled by hand — which we refuse to auto-overwrite.
real_required_vars() {
  local n=0 v
  for v in $REQUIRED_VARS; do
    grep -qE "^${v}=[^<]+$" "$ENV_FILE" 2>/dev/null && n=$((n + 1)) || true
  done
  echo "$n"
}

generate_env_file() {
  log "Generating $ENV_FILE from .env.prod.template …"
  [ -f "$REPO_DIR/.env.prod.template" ] || die "missing .env.prod.template — is the repo checked out at $REPO_DIR?"

  # Each secret gets its OWN independently-generated value (AGENTS.md:
  # never share keys across purposes). awk emits one replacement per line.
  POSTGRES_PASSWORD="$(openssl rand -hex 16)"
  FIELD_KEY="$(openssl rand -hex 32)"
  SESSION_KEY="$(openssl rand -hex 32)"
  awk \
    -v domain="$DOMAIN" \
    -v pw="$POSTGRES_PASSWORD" \
    -v fkey="$FIELD_KEY" \
    -v skey="$SESSION_KEY" '
      /^POSTGRES_PASSWORD=/        { print "POSTGRES_PASSWORD=" pw; next }
      /^DATABASE_URL=/             { print "DATABASE_URL=postgresql://resume:" pw "@db:5432/resume_builder"; next }
      /^FRONTEND_URL=/             { print "FRONTEND_URL=https://" domain; next }
      /^VITE_API_BASE_URL=/        { print "VITE_API_BASE_URL=https://" domain; next }
      /^RESUME_FIELD_ENCRYPTION_KEY=/ { print "RESUME_FIELD_ENCRYPTION_KEY=" fkey; next }
      /^SESSION_ENCRYPTION_KEY=/   { print "SESSION_ENCRYPTION_KEY=" skey; next }
      { print }
    ' "$REPO_DIR/.env.prod.template" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log "Generated .env.prod (DB password + 2 encryption keys + URLs) — back it up, never regenerate"
}

if [ -f "$ENV_FILE" ]; then
  REAL_COUNT="$(real_required_vars)"
  REQUIRED_COUNT="$(printf '%s\n' $REQUIRED_VARS | wc -l | tr -d ' ')"
  if [ "$REAL_COUNT" -eq "$REQUIRED_COUNT" ]; then
    log "Preserving existing $ENV_FILE (secrets are never regenerated)"
  elif [ "$REAL_COUNT" -eq 0 ]; then
    warn "$ENV_FILE exists but is empty or still holds template placeholders (a copied template or a stray empty file)."
    warn "It never contained real secrets, so regenerating is safe (no database volume exists yet)."
    rm -f "$ENV_FILE"
    generate_env_file
  else
    # Half-filled by hand (some real values, some placeholders/missing).
    # Never silently overwrite real secrets — say exactly what's missing.
    MISSING=""
    for v in $REQUIRED_VARS; do
      grep -qE "^${v}=[^<]+$" "$ENV_FILE" 2>/dev/null || MISSING="$MISSING $v"
    done
    warn "$ENV_FILE exists with REAL values but is missing:$MISSING"
    warn "Fill those in manually — or, if this is a fresh install with no data yet, delete the file and re-run to regenerate."
    die "refusing to overwrite real secrets in $ENV_FILE"
  fi
else
  generate_env_file
fi

# Fail loudly HERE instead of letting docker compose report confusing
# 'required variable X is missing a value' interpolation errors later.
MISSING=""
for v in $REQUIRED_VARS; do
  grep -qE "^${v}=[^<]+$" "$ENV_FILE" 2>/dev/null || MISSING="$MISSING $v"
done
[ -z "$MISSING" ] || die "generated $ENV_FILE is incomplete — missing:$MISSING (template drift? update .env.prod.template)"

# ─── 4. nginx site + TLS ────────────────────────────────────────────────
SITE_CONF=/etc/nginx/sites-available/resume-builder
if [ -f "$SITE_CONF" ]; then
  # certbot --nginx upgrades this block to TLS (443 server + redirect +
  # managed cert paths). Overwriting it on EVERY run stripped that TLS
  # config (leaving nginx HTTP-only until certbot re-added it) — and the
  # re-add could hang (see below). Preserve the installed file so re-runs
  # are idempotent and TLS stays wired.
  log "Preserving existing $SITE_CONF (certbot-managed TLS config)"
else
  log "Installing nginx site config for $DOMAIN …"
  sed "s|DOMAIN|$DOMAIN|g" "$REPO_DIR/deploy/nginx/resume-builder.conf" > "$SITE_CONF"
  ln -sf "$SITE_CONF" /etc/nginx/sites-enabled/resume-builder
  rm -f /etc/nginx/sites-enabled/default
fi

nginx -t >/dev/null
systemctl reload nginx

if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  log "Certificate for $DOMAIN already exists — skipping issuance"
  # ⚠️ Was: `certbot --nginx -d $DOMAIN --redirect >/dev/null 2>&1 || true`
  # WITHOUT --non-interactive — certbot could block on an interactive
  # prompt whose output was hidden by the redirect, freezing the script at
  # this exact line (observed in the field on a re-run whose template
  # overwrite had stripped the 443 block). --non-interactive turns any
  # question into a safe default/error; `|| true` tolerates errors.
  certbot --nginx -d "$DOMAIN" --redirect --non-interactive >/dev/null 2>&1 || true
  # Repair: if the vhost still has no TLS block (an older run already
  # clobbered it), deterministically install the EXISTING cert into nginx
  # — no ACME/network involved, cannot prompt, cannot hang.
  if ! nginx -T 2>/dev/null | grep -q "ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem"; then
    log "nginx has no TLS block for $DOMAIN — reinstalling existing certificate …"
    certbot install --nginx -d "$DOMAIN" --cert-name "$DOMAIN" --non-interactive >/dev/null 2>&1 || true
  fi
  systemctl reload nginx
else
  if [ -n "${DOMAIN_IP:-}" ] && { [ -z "${PUBLIC_IP:-}" ] || [ "${PUBLIC_IP:-}" = "${DOMAIN_IP:-}" ]; }; then
    log "Issuing Let's Encrypt certificate for $DOMAIN …"
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect
  else
    warn "Skipping TLS issuance (DNS not pointing at this droplet yet)."
    warn "Once DNS resolves here, run: certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL --redirect"
  fi
fi

# ─── 5. Build & start the stack ─────────────────────────────────────────
# Self-hosted Postgres (USE_EXTERNAL_DB=0, default) merges in the local db
# container via docker-compose.prod.local-db.yml. USE_EXTERNAL_DB=1 runs
# WITHOUT it — DATABASE_URL then points at externally managed Postgres.
# Read from .env.prod so the flag survives on the droplet (same pattern
# backup.sh uses). COMPOSE_FILES is intentionally unquoted below so it
# word-splits into multiple -f args (no spaces inside the values).
USE_EXTERNAL_DB="$(sed -n 's/^USE_EXTERNAL_DB=//p' "$ENV_FILE" | tail -1)"
USE_EXTERNAL_DB="${USE_EXTERNAL_DB:-0}"
COMPOSE_FILES="-f docker-compose.prod.yml"
if [ "$USE_EXTERNAL_DB" = "1" ]; then
  log "USE_EXTERNAL_DB=1 — no local Postgres container (DATABASE_URL must be an external host)"
else
  COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.prod.local-db.yml"
fi

log "Building and starting containers (first build takes a few minutes) …"
cd "$REPO_DIR"
docker compose --env-file "$ENV_FILE" $COMPOSE_FILES up -d --build

log "Waiting for services to become healthy …"
for _ in $(seq 1 30); do
  PS_OUT="$(docker compose --env-file "$ENV_FILE" $COMPOSE_FILES ps --format '{{.Service}}={{.Health}}' 2>/dev/null || true)"
  if echo "$PS_OUT" | grep -q 'backend=healthy' \
     && echo "$PS_OUT" | grep -q 'frontend=healthy' \
     && { [ "$USE_EXTERNAL_DB" = "1" ] || echo "$PS_OUT" | grep -q 'db=healthy'; }; then
    break
  fi
  sleep 5
done
docker compose --env-file "$ENV_FILE" $COMPOSE_FILES ps

log "──────────────────────────────────────────────────────────────"
log "Done. Site: https://$DOMAIN"
log "Next steps:"
log "  1. Auto-deploy: add GitHub repo secrets DROPLET_HOST, DROPLET_USER,"
log "     DROPLET_SSH_KEY (see .github/workflows/deploy.yml) — every push"
log "     to the release branch then rebuilds & restarts the stack."
log "  2. Backups: crontab -e →  0 3 * * * $REPO_DIR/deploy/backup.sh"
log "  3. Logs: docker compose --env-file $ENV_FILE $COMPOSE_FILES logs -f"
log "──────────────────────────────────────────────────────────────"
