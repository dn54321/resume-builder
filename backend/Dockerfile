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

# pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# DATABASE_URL build arg selects the Prisma provider for `prisma generate`
# (set-db-provider.js rewrites schema.prisma: sqlite for file:/libsql:,
# postgresql for postgresql://). Defaults to the sqlite dev path so a bare
# `docker build` still works; production builds pass their real URL.
ARG DATABASE_URL=file:./prisma/db/dev.db
ENV DATABASE_URL=$DATABASE_URL

# Copy manifests first for layer caching
COPY backend/pnpm-workspace.yaml ./
COPY backend/package.json backend/pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

# Prisma schema + scripts (client is generated AFTER src is copied — the
# generated output lands in src/generated and would be clobbered otherwise)
COPY backend/prisma ./prisma
COPY backend/scripts ./scripts

# Copy source + config and compile
COPY backend/src ./src
COPY backend/nest-cli.json backend/tsconfig.json backend/tsconfig.build.json ./

# Generate the client with the provider selected by DATABASE_URL (ARG above),
# patch for CJS, then compile. Order matters: generate writes src/generated,
# so it must run AFTER the src copy to avoid being overwritten by the host's
# committed (sqlite) client.
RUN pnpm run prisma:generate && pnpm run build

# ─── Stage 2: slim runtime ──────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@latest --activate

# Carry the FULL node_modules from build (Prisma CLI is needed for
# `prisma migrate deploy` at boot; the compiled dist is independent of
# source). Copy package files so the runtime image has valid metadata.
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
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

EXPOSE 3000

# ⚠️ migrate deploy (additive, safe) — never `db push` (drops tables).
# CORS: FRONTEND_URL is read by the app at boot; set it to the external
# frontend origin so the browser can call this API cross-origin.
# Entry: nest build emits dist/src/main.js (tsconfig outDir ./dist keeps
# the src/ prefix — verified; do NOT use dist/main.js).
CMD ["sh", "-c", "pnpm run prisma:migrate && node dist/src/main.js"]
