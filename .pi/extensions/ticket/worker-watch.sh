#!/bin/bash
# worker-watch.sh — tmux pane script that tails active worker logs.
# Usage: ./worker-watch.sh <pane-id>  (pane-id: 1, 2, or 3)
#
# Watches .pi/tickets/logs/ for new worker activity.
# When a worker is assigned to this pane, tails its log.
# When the worker exits, goes back to watching.

PANE_ID="${1:-1}"
LOG_DIR="$(dirname "$0")/../../.pi/tickets/logs"
ASSIGN_FILE="$(dirname "$0")/../../.pi/tickets/pane-assignments.json"

echo "══ Worker Pane ${PANE_ID} ══"
echo "Watching for assignments..."
echo ""

tail_pid=""

cleanup() {
  [ -n "$tail_pid" ] && kill "$tail_pid" 2>/dev/null
  exit 0
}
trap cleanup EXIT INT TERM

while true; do
  # Check if this pane has an assignment
  if [ -f "$ASSIGN_FILE" ]; then
    assigned_log=$(python3 -c "
import json, sys
try:
    d = json.load(open('$ASSIGN_FILE'))
    a = d.get('pane_${PANE_ID}', {})
    ticket = a.get('ticket', '')
    log = a.get('log', '')
    if ticket and log:
        print(log)
except: pass
" 2>/dev/null)
    
    if [ -n "$assigned_log" ] && [ -f "$assigned_log" ]; then
      ticket=$(python3 -c "
import json
d = json.load(open('$ASSIGN_FILE'))
print(d['pane_${PANE_ID}']['ticket'])
" 2>/dev/null)
      echo ""
      echo "═══ Working on ${ticket} ═══"
      echo ""
      
      # Kill previous tail if any
      [ -n "$tail_pid" ] && kill "$tail_pid" 2>/dev/null
      
      # Tail the log
      tail -f "$assigned_log" &
      tail_pid=$!
      
      # Wait for the worker to finish (tail exits when log stops or we detect completion)
      wait $tail_pid 2>/dev/null
      tail_pid=""
      
      echo ""
      echo "═══ ${ticket} complete — waiting for next assignment ═══"
      echo ""
    fi
  fi
  
  sleep 3
done
