---
name: orchestrator-control
description: |
  Manage the Atlas orchestrator process: restart it safely, detect and kill
  zombie/stale instances, verify it's healthy after restart, and avoid the
  multi-orchestrator bug. Triggers on "restart orchestrator", "orchestrator
  restart", "zombie orchestrator", "multiple orchestrators", "kill
  orchestrator", "orchestrator processes".
---

# Orchestrator Control Skill

Use this skill whenever you need to restart the Atlas orchestrator, clean up
stale/zombie orchestrator processes, or verify the orchestrator is running
healthily. This exists because restarts previously left MULTIPLE orchestrator
processes running simultaneously — a serious bug (all connected to intercom,
all spawning workers, workers getting confused).

## Why zombies happened (the trap)

The orchestrator runs as a background `tsx orchestrator/index.ts` process.
Restarts went wrong for two reasons:

1. **Graceful SIGTERM cleanup hangs.** The old cleanup called `pool.stopAll()`,
   which waits **5s per agent** before exiting. With several workers, the old
   orchestrator took 15s+ to die, and restart scripts only waited 2s before
   giving up — leaving the old process alive.
2. **`pkill` / `pgrep` matching your own shell.** A command like
   `pkill -9 -f "orchestrator/index"` run from a bash shell whose command line
   contains that same string will match and kill YOUR OWN shell, not (only)
   the orchestrator. `pgrep -f "tsx orchestrator/index" | head -1` can also
   match the bash wrapper (`bash -c "cd ...; tsx orchestrator/index.ts ..."`)
   instead of the real node process, so the orchestrator never gets killed.

## Current safeguards (already in code)

- `startOrchestrator()` calls `killStaleOrchestrators()` on startup — it
  SIGKILLs any other `orchestrator/index.ts` process before the new one
  registers on intercom.
- SIGTERM/SIGINT cleanup exits immediately (no `pool.stopAll()` wait).
- The orchestrator intercom name is stable (`orchestrator`), so workers'
  IDLE/STATUS reach it across restarts; worker panes survive restarts and are
  re-adopted via `adoptSurvivingWorkers()`.

**Restart ≠ stop.** SIGTERM restarts PRESERVE workers (their tmux panes keep
running pi). To actually shut everything down, use the boss command `STOP`
(which calls `pool.stopAll()` and kills worker panes).

## How to restart the orchestrator (safe procedure)

### 1. Verify current state

```bash
pgrep -af "orchestrator/index" | grep -v grep
```

Expect exactly ONE `node ... tsx ... orchestrator/index.ts` line (plus possibly
a `bash -c` wrapper). More than one node line = zombies.

### 2. Kill all orchestrator node processes

Use **SIGKILL on the exact node PIDs** — do NOT use `pkill -9 -f
"orchestrator/index"` (it matches your own shell). Read PIDs first:

```bash
# Capture the node process PIDs only (not bash wrappers, not your shell)
ORCH_PIDS=$(ps -eo pid,args | grep "orchestrator/index.ts" | grep -v grep | grep -v "bash -c" | awk '{print $1}')
echo "PIDs to kill: $ORCH_PIDS"
for pid in $ORCH_PIDS; do kill -9 "$pid" 2>/dev/null && echo "killed $pid" || echo "$pid gone"; done
```

Alternatively, the single-instance guard means you can skip manual cleanup:
just start the new orchestrator and it kills stale ones itself.

### 3. Start the new orchestrator

```bash
cd /home/dn54321/projects/resume-v3/atlas
rm -f state/ready
nohup node_modules/.bin/tsx orchestrator/index.ts >> state/orchestrator.log 2>&1 &
# Wait for readiness
for i in $(seq 1 30); do [ -f state/ready ] && break; sleep 0.5; done
[ -f state/ready ] && echo "READY" || echo "NOT READY"
```

### 4. Verify

```bash
# Exactly ONE orchestrator process
pgrep -af "orchestrator/index" | grep -v grep | grep -v "bash -c"
# Intercom name written
cat /home/dn54321/projects/resume-v3/atlas/state/orchestrator-name
# Workers alive (panes running pi)
tmux list-panes -t atlas -F '#{pane_id} #{pane_current_command} dead:#{pane_dead}' | grep pi
# Dashboard reflects adopted workers
head -10 /home/dn54321/projects/resume-v3/atlas/state/dashboard.txt
```

### 5. Re-register the boss

```bash
# Use the name from state/orchestrator-name (should be "orchestrator")
intercom({ action: "send", to: "<name>", message: "BOSS: registering" })
intercom({ action: "send", to: "<name>", message: "STATUS" })
```

## Diagnosing problems

| Symptom | Cause | Fix |
|---------|-------|-----|
| Multiple orchestrators in `intercom list` | Zombies from a hung cleanup or bad kill | Kill all node PIDs (step 2), restart once |
| "worker lifetime spawn cap reached" | A death/requeue loop burned 5 spawns | Find WHY workers die (capture pane output), fix, restart (counter resets) |
| Workers die instantly after spawn | Extension double-load (`-e` + worktree `.pi`), missing backend `.env`, stale prisma client | Check pane output; see boss notes |
| Workers idle with no TASK | Pre-spawn without a node (fixed) | Restart with current code |
| Dashboard says running but no panes | Orphaned in_progress tickets from dead workers | healthCheck re-queues them; verify `Re-queuing` in log |

## Golden rules

1. **Never** `pkill -9 -f "orchestrator/index"` from a shell whose command
   line contains that string — it kills your own shell.
2. Kill the **node** processes by exact PID, not the bash wrapper.
3. After any restart, verify: 1 orchestrator process, `Boss: alive` on the
   dashboard, worker panes running pi.
4. Restart preserves workers; use `STOP` to actually kill them.
