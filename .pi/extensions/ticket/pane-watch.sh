#!/bin/bash
# pane-watch.sh — tmux pane script showing live worker activity.
# Usage: ./pane-watch.sh <pane-id>  (pane-id: 1, 2, or 3)
#
# Reads .pi/tickets/pane-assignments.json to find which ticket
# this pane should display, then shows the worker's agent-status.txt
# and the tail of the worker log in real time.

PANE_ID="${1:-1}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ASSIGN_FILE="$REPO_ROOT/.pi/tickets/pane-assignments.json"

clear
echo "══ Worker Pane ${PANE_ID} ══"
echo "Waiting for assignment..."
echo ""

last_ticket=""

while true; do
  if [ -f "$ASSIGN_FILE" ]; then
    current=$(python3 -c "
import json, sys, os
try:
    d = json.load(open('$ASSIGN_FILE'))
    a = d.get('pane_${PANE_ID}', {})
    ticket = a.get('ticket', '')
    worktree = a.get('worktree', '')
    agent = a.get('agent', '')
    if ticket and worktree:
        status_file = os.path.join(worktree, 'agent-status.txt')
        status = open(status_file).read().strip() if os.path.exists(status_file) else '...'
        print(f'{ticket}|{agent}|{status}')
    else:
        print('')
except: print('')
" 2>/dev/null)
    
    if [ -n "$current" ]; then
      ticket=$(echo "$current" | cut -d'|' -f1)
      agent=$(echo "$current" | cut -d'|' -f2)
      status=$(echo "$current" | cut -d'|' -f3-)
      
      if [ "$ticket" != "$last_ticket" ]; then
        clear
        echo "══ ${agent} → ${ticket} ══"
        echo ""
        last_ticket="$ticket"
      fi
      
      # Move cursor to line 3 and print status
      printf "\033[3;0H\033[K%s" "$status"
    else
      if [ -n "$last_ticket" ]; then
        clear
        echo "══ Worker Pane ${PANE_ID} ══"
        echo "Waiting for assignment..."
        echo ""
        last_ticket=""
      fi
    fi
  fi
  
  sleep 2
done
