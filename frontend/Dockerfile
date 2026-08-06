# ─── Frontend production image (Vue 3 + Vite + nginx) ───────────────────
# Multi-stage: build the static assets, serve via nginx.
#
# BUILD ARG (the browser-facing backend URL — must match the backend's
# FRONTEND_URL for CORS to work):
#   VITE_API_BASE_URL  — e.g. https://api.resumes.example.com. This is
#                        baked into the JS bundle at build time; the
#                        browser calls THIS origin, and the backend must
#                        allow the FRONTEND origin (FRONTEND_URL) via CORS.

# ─── Stage 1: build ─────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# pnpm — installed globally via npm (NOT corepack). `corepack enable` makes
# the pnpm shim DOWNLOAD pnpm from the npm registry at build time
# ('Corepack is about to download …') — a network fetch that fails/times
# out on constrained build hosts. A global npm install is a cached layer:
# no runtime fetch, pinned version, works offline.
RUN npm install -g pnpm@11.20.0

# Cap the Node heap for install + Vite build — on a 1GB droplet the default
# heap can exceed physical RAM and get SIGKILL'd (status 137) during
# bundling. 768MB is plenty for this app's bundle (~1.6MB).
ENV NODE_OPTIONS="--max-old-space-size=768"

# Manifests first for layer caching
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --child-concurrency=1 --network-concurrency=4

# Config + source
COPY frontend/index.html \
     frontend/vite.config.ts \
     frontend/tsconfig.json \
     frontend/tsconfig.app.json \
     frontend/tsconfig.node.json \
     frontend/tsconfig.vitest.json \
     frontend/env.d.ts \
     ./
COPY frontend/src ./src
COPY frontend/public ./public

RUN pnpm run build

# ─── Stage 2: nginx static server ───────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Real nginx config: SPA fallback, gzip, immutable asset caching, security
# headers (frontend/nginx.conf). Listens on :80 — the droplet's host nginx
# terminates TLS and proxies here, so no $PORT envsubst gymnastics.
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
