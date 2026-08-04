#!/usr/bin/env bash
# pre.sh — Worker agent pre-start script.
# Sets up environment, verifies tooling.
echo "[pre.sh] Worker agent starting: ${ATLAS_AGENT_NAME}"
echo "[pre.sh] Port: ${ATLAS_AGENT_PORT}"
echo "[pre.sh] Worktree: ${ATLAS_WORKTREE}"

# Verify pi binary
if ! command -v pi &>/dev/null; then
  echo "[pre.sh] WARNING: pi binary not found on PATH"
fi

# Verify we're in a git repo
if ! git rev-parse --show-toplevel &>/dev/null; then
  echo "[pre.sh] WARNING: not in a git repository"
fi

echo "[pre.sh] Ready."
