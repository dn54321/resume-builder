#!/usr/bin/env bash
# test.sh — Run all Atlas tests with coverage.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ATLAS_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ATLAS_DIR"
npx vitest run --coverage
