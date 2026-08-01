#!/usr/bin/env bash
# setup.sh — First-time project setup.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Installing git hooks..."
git config core.hooksPath .githooks

echo "Installing backend dependencies..."
cd backend && npm install && cd ..

echo "Installing frontend dependencies..."
cd frontend && pnpm install && cd ..

echo ""
echo "✓ Setup complete."
echo "  Pre-push hook: active (lint → type-check → test:cov)"
echo "  Backend:  cd backend  && npm run start:dev"
echo "  Frontend: cd frontend && npm run dev"
