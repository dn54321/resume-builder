#!/usr/bin/env bash
# tmux-worker.sh — Interactive pi session for an agent tmux pane.
# Usage: tmux-worker.sh (no args)
# Just runs pi in interactive mode. The controller sends work via intercom.
# This replaces the old file-based command loop.

PI_BIN=""
for p in "$HOME/.local/share/pnpm/bin/pi" /usr/local/bin/pi pi; do
  if command -v "$p" &>/dev/null || [ -x "$p" ]; then PI_BIN="$p"; break; fi
done

exec $PI_BIN
