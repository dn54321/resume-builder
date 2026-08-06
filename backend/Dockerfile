# ─── Backend production image (NestJS + pnpm) ───────────────────────────
# Multi-stage: build the compiled dist/, run a slim runtime image.
#
# RUNTIME ENVIRONMENT (inject at run time, NEVER bake into the image):
#   FRONTEND_URL                 — the EXTERNAL frontend origin (CORS). Must
#                                  match where the frontend is served from,
#                                  e.g. https://resumes.example.com. The
#                                  backend allows this origin via CORS.
#   DATABASE_URL                 — SQLite file path (default) or a real DB
#                                  connection string for production.
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

# Copy manifests first for layer caching
COPY backend/pnpm-workspace.yaml ./
COPY backend/package.json backend/pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

# Prisma schema + client (patched for CJS compatibility)
COPY backend/prisma ./prisma
COPY backend/scripts ./scripts
RUN pnpm run prisma:generate

# Copy source + config and compile
COPY backend/src ./src
COPY backend/nest-cli.json backend/tsconfig.json backend/tsconfig.build.json ./
RUN pnpm run build

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
