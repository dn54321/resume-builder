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
# the pnpm shim DOWNLOAD pnpm from the npm registry at build time — on
# Render that download OOMs/times out ('Corepack is about to download …'
# then status 137). A global npm install is a cached layer: no runtime
# fetch, pinned version, works offline.
RUN npm install -g pnpm@11.20.0

# Manifests first for layer caching
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --child-concurrency=1 --network-concurrency=4

# Cap the Node heap for the Vite build (Render RAM-limited; default heap
# can SIGKILL with status 137 during bundling).
ENV NODE_OPTIONS="--max-old-space-size=2048"

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

# SPA fallback + security headers. nginx listens on ${PORT} (Render injects
# it, e.g. 10000); the CMD envsubst renders the real value at boot. Without
# this, nginx stays on 80 and Render reports 'No open ports detected'.
RUN printf 'server {\n\
  listen ${PORT};\n\
  server_name _;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
  location /assets/ {\n\
    expires 1y;\n\
    add_header Cache-Control "public, immutable";\n\
  }\n\
  add_header X-Frame-Options "SAMEORIGIN" always;\n\
  add_header X-Content-Type-Options "nosniff" always;\n\
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n\
}\n' > /etc/nginx/conf.d/default.conf

# Render sets PORT (e.g. 10000); default 80 for local docker runs. envsubst
# substitutes ONLY $PORT into the listen line at boot.
CMD sh -c 'export PORT="${PORT:-80}"; envsubst "\$PORT" < /etc/nginx/conf.d/default.conf > /tmp/default.conf && mv /tmp/default.conf /etc/nginx/conf.d/default.conf && nginx -g "daemon off;"'
