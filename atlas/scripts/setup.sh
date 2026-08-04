#!/usr/bin/env bash
# setup.sh — First-time Atlas setup.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ATLAS_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Atlas Setup ==="

# Install dependencies
cd "$ATLAS_DIR"
if [ -f package.json ]; then
  echo "Installing dependencies..."
  npm install
fi

# Create state directories
mkdir -p state/{logs,worktrees,cache,panes/fifos,prompts}

# Verify tools
echo ""
echo "Verifying tools..."

if command -v pi &>/dev/null; then
  echo "  ✓ pi: $(pi --version 2>/dev/null || echo 'found')"
else
  echo "  ✗ pi not found — install pi"
fi

if command -v tmux &>/dev/null; then
  echo "  ✓ tmux: $(tmux -V)"
else
  echo "  ✗ tmux not found — install tmux"
fi

if command -v git &>/dev/null; then
  echo "  ✓ git: $(git --version)"
else
  echo "  ✗ git not found"
fi

if [ -n "${LINEAR_API_KEY:-}" ]; then
  echo "  ✓ LINEAR_API_KEY is set"
else
  echo "  ⚠ LINEAR_API_KEY not set — Linear API calls will fail"
fi

echo ""
echo "Setup complete. Run: ./atlas.sh"
