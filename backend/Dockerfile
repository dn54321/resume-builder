# ─── Backend production image (NestJS + pnpm) ───────────────────────────
# Multi-stage: build the compiled dist/, run a slim runtime image.
#
# RUNTIME ENVIRONMENT (inject at run time, NEVER bake into the image):
#   FRONTEND_URL                 — the EXTERNAL frontend origin (CORS). Must
#                                  match where the frontend is served from,
#                                  e.g. https://resumes.example.com. The
#                                  backend allows this origin via CORS.
#   DATABASE_URL                 — file:…/libsql:… (SQLite) or postgresql://…
#                                  (PostgreSQL). The schema provider + adapter
#                                  are chosen automatically from the scheme.
#   RESUME_FIELD_ENCRYPTION_KEY  — 64-hex AES-256-GCM key (PII fields).
#   SESSION_ENCRYPTION_KEY       — 64-hex AES-256-GCM key (session tokens).
#   NODE_ENV                     — production
#   PORT                         — internal port (default 3000).
#   MATCHING_ENGINE / LLM_API_KEY / LLM_MODEL / BULLET_CAP — Tailor config.

# ─── Stage 1: build ─────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# pnpm — installed globally via npm (NOT corepack). `corepack enable`
# makes the pnpm shim DOWNLOAD pnpm@<packageManager> from the npm registry
# at build time ('Corepack is about to download …') — a network fetch that
# fails/times out on constrained build hosts. A global npm install is a
# cached layer: no runtime fetch, pinned version, works offline.
RUN npm install -g pnpm@11.20.0

# Cap the Node heap for the TypeScript compile below — on a 1GB droplet
# the default heap can exceed physical RAM and get SIGKILL'd (status 137
# = OOM). 768MB fits this app's compile comfortably (dist is ~2MB).
ENV NODE_OPTIONS="--max-old-space-size=768"

# Reduce memory pressure during install: limited concurrency. The full
# dep tree install has hit OOM (status 137) on RAM-constrained hosts;
# one child at a time keeps the spike flat.
COPY backend/pnpm-workspace.yaml ./
COPY backend/package.json backend/pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --child-concurrency=1 --network-concurrency=4

# Prisma schema + scripts (client is generated AFTER src is copied — the
# generated output lands in src/generated and would be clobbered otherwise)
COPY backend/prisma ./prisma
COPY backend/scripts ./scripts

# Copy source + config and compile
COPY backend/src ./src
COPY backend/nest-cli.json backend/tsconfig.json backend/tsconfig.build.json ./

# DATABASE_URL build arg selects the Prisma provider for `prisma generate`
# (set-db-provider.js rewrites schema.prisma: sqlite for file:/libsql:,
# postgresql for postgresql://). Defaults to the sqlite dev path so a bare
# `docker build` still works; production builds pass their real URL.
ARG DATABASE_URL=file:./prisma/db/dev.db
ENV DATABASE_URL=$DATABASE_URL

# Generate the client with the provider selected by DATABASE_URL (ARG above),
# patch for CJS, then compile. Order matters: generate writes src/generated,
# so it must run AFTER the src copy to avoid being overwritten by the host's
# committed (sqlite) client.
RUN pnpm run prisma:generate && pnpm run build

# ─── Stage 2: slim runtime ──────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

RUN npm install -g pnpm@11.20.0

# Install ONLY production deps fresh in the runtime image (no 571MB
# devDeps copy — that bloats the image and the copy itself can OOM on
# RAM-constrained hosts). prisma is a prod dep so `prisma migrate deploy`
# works at boot. prisma:generate in the build stage already produced the
# client into dist/src/generated, so the runtime never regenerates it.
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --child-concurrency=1 --network-concurrency=4
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
# prisma.config.ts drives `prisma migrate deploy` (reads DATABASE_URL from
# the environment) — without it Prisma can't resolve the datasource URL.
COPY backend/prisma.config.ts ./prisma.config.ts
# (the generated Prisma client is already baked into dist/src/generated)

# Writable cwd for the SQLite DB when DATABASE_URL is file:./...
# (production should use a volume mount here).
RUN mkdir -p /app/data && chown -R node:node /app
USER node

# The app binds 0.0.0.0:PORT (PORT default 3000) — the droplet's host nginx
# routes /api/v1 to this container. EXPOSE is informational.
EXPOSE 3000

# ⚠️ migrate deploy (additive, safe) — never `db push` (drops tables).
# CORS: FRONTEND_URL is read by the app at boot; set it to the external
# frontend origin so the browser can call this API cross-origin.
# Entry: nest build emits dist/src/main.js (tsconfig outDir ./dist keeps
# the src/ prefix — verified; do NOT use dist/main.js).
# prisma runs from the local node_modules bin (it's a prod dep) — no pnpm
# indirection at boot.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/src/main.js"]
