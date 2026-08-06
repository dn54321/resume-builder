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
EMAIL="${EMAIL:?set EMAIL (Let's Encrypt expiry notices)}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_DIR/.env.prod"
SWAP_SIZE_MB="${SWAP_SIZE_MB:-2048}"

log()  { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[setup!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[setup ✗]\033[0m %s\n' "$*" >&2; exit 1; }

# ─── Preflight ──────────────────────────────────────────────────────────
[ "$(id -u)" -eq 0 ] || die "run as root: sudo $0"

log "Checking DNS for $DOMAIN …"
PUBLIC_IP="$(curl -4 -fsSL --max-time 10 https://api.ipify.org || true)"
DOMAIN_IP="$(getent ahostsv4 "$DOMAIN" | awk '{print $1; exit}' || true)"
if [ -n "$PUBLIC_IP" ] && [ -n "$DOMAIN_IP" ] && [ "$PUBLIC_IP" != "$DOMAIN_IP" ]; then
  warn "$DOMAIN resolves to $DOMAIN_IP but this droplet's IP is $PUBLIC_IP — TLS issuance will fail."
  warn "Point an A record at this droplet first, then re-run."
elif [ -z "$DOMAIN_IP" ]; then
  warn "$DOMAIN does not resolve yet — TLS issuance will fail. Point DNS first, then re-run."
else
  log "DNS OK ($DOMAIN → $DOMAIN_IP)"
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
if [ -f "$ENV_FILE" ]; then
  log "Preserving existing $ENV_FILE (secrets are never regenerated)"
else
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
  log "Generated .env.prod — keep it safe (contains DB password + encryption keys)"
fi

# ─── 4. nginx site + TLS ────────────────────────────────────────────────
SITE_CONF=/etc/nginx/sites-available/resume-builder
log "Installing nginx site config for $DOMAIN …"
sed "s|DOMAIN|$DOMAIN|g" "$REPO_DIR/deploy/nginx/resume-builder.conf" > "$SITE_CONF"
ln -sf "$SITE_CONF" /etc/nginx/sites-enabled/resume-builder
rm -f /etc/nginx/sites-enabled/default

nginx -t >/dev/null
systemctl reload nginx

if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  log "Certificate for $DOMAIN already exists — skipping issuance"
  certbot --nginx -d "$DOMAIN" --redirect >/dev/null 2>&1 || true
  systemctl reload nginx
else
  if [ -n "$DOMAIN_IP" ] && { [ -z "$PUBLIC_IP" ] || [ "$PUBLIC_IP" = "$DOMAIN_IP" ]; }; then
    log "Issuing Let's Encrypt certificate for $DOMAIN …"
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect
  else
    warn "Skipping TLS issuance (DNS not pointing at this droplet yet)."
    warn "Once DNS resolves here, run: certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL --redirect"
  fi
fi

# ─── 5. Build & start the stack ─────────────────────────────────────────
log "Building and starting containers (first build takes a few minutes) …"
cd "$REPO_DIR"
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml up -d --build

log "Waiting for services to become healthy …"
for _ in $(seq 1 30); do
  PS_OUT="$(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml ps --format '{{.Service}}={{.Health}}' 2>/dev/null || true)"
  if echo "$PS_OUT" | grep -q 'backend=healthy' \
     && echo "$PS_OUT" | grep -q 'frontend=healthy' \
     && echo "$PS_OUT" | grep -q 'db=healthy'; then
    break
  fi
  sleep 5
done
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml ps

log "──────────────────────────────────────────────────────────────"
log "Done. Site: https://$DOMAIN"
log "Next steps:"
log "  1. Auto-deploy: add GitHub repo secrets DROPLET_HOST, DROPLET_USER,"
log "     DROPLET_SSH_KEY (see .github/workflows/deploy.yml) — every push"
log "     to the release branch then rebuilds & restarts the stack."
log "  2. Backups: crontab -e →  0 3 * * * $REPO_DIR/deploy/backup.sh"
log "  3. Logs: docker compose --env-file $ENV_FILE -f docker-compose.prod.yml logs -f"
log "──────────────────────────────────────────────────────────────"
