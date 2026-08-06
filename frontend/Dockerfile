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

RUN corepack enable

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

# SPA fallback: any non-file route → index.html (Vue Router history mode)
RUN printf 'server {\n\
  listen 80;\n\
  server_name _;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  # SPA history-mode fallback\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
  # Static assets: long cache, immutable\n\
  location /assets/ {\n\
    expires 1y;\n\
    add_header Cache-Control "public, immutable";\n\
  }\n\
  # Security headers\n\
  add_header X-Frame-Options "SAMEORIGIN" always;\n\
  add_header X-Content-Type-Options "nosniff" always;\n\
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
