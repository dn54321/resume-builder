#!/usr/bin/env bash
# clean.sh — Clean Atlas state, worktrees, and cache.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ATLAS_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ATLAS_DIR"
rm -rf state/worktrees/* state/logs/* state/cache/* state/prompts/* state/dashboard.txt
echo "Cleaned."
