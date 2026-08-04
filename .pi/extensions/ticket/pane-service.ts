/**
 * pane-service.ts — Reliable tmux pane management for the ticket agent system.
 *
 * Design (v2 — placeholder-based):
 *   - agent.sh creates a SINGLE "workers" placeholder pane showing "Workers: 0/N active".
 *   - When the server spawns a worker, this service splits the placeholder to create
 *     a worker pane, starts pane-display.sh in it, and sends the log to tail.
 *   - When a worker finishes, its pane is KILLED (space returns to the placeholder).
 *   - The placeholder reads from workers.fifo and always shows the current count.
 *
 * This replaces the old pre-allocation approach where agent.sh created N agent panes
 * upfront, regardless of how many were actually active.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cp from 'node:child_process';

// ─── Types ───────────────────────────────────────────────────────────

export interface PaneServiceOptions {
  sessionName: string;
  repoRoot: string;
  maxAgents: number;
  /**
   * Directory where pane files are stored (pane IDs + FIFO paths).
   * Default: $repoRoot/.pi/tickets/panes
   */
  panesDir?: string;
}

interface WorkerPaneState {
  agentName: string;
  paneId: string | null;      // tmux %N identifier
  fifoPath: string;           // named pipe path
  currentTicket: string | null;
  alive: boolean;             // confirmed alive in last health check
  lastVerified: number;       // timestamp of last verification
}

// ─── Constants ───────────────────────────────────────────────────────

const FIFO_DIR_NAME = 'fifos';  // subdirectory within panesDir
const PANE_SCRIPT_NAME = 'pane-display.sh';
const WORKERS_FIFO_NAME = 'workers.fifo';
const PLACEHOLDER_PANE_FILE = 'workers.pane';

// ─── PaneService class ───────────────────────────────────────────────

export class PaneService {
  private sessionName: string;
  private repoRoot: string;
  private maxAgents: number;
  private panesDir: string;
  private fifoDir: string;
  private paneScript: string;
  private workersFifo: string;
  private placeholderPaneId: string | null = null;
  /** Currently active worker panes (created by splitting the placeholder). */
  private workerPanes: Map<string, WorkerPaneState> = new Map();
  private initialized = false;
  private healthInterval: NodeJS.Timeout | null = null;

  constructor(options: PaneServiceOptions) {
    this.sessionName = options.sessionName;
    this.repoRoot = options.repoRoot;
    this.maxAgents = options.maxAgents;
    this.panesDir = options.panesDir || path.join(this.repoRoot, '.pi', 'tickets', 'panes');
    this.fifoDir = path.join(this.panesDir, FIFO_DIR_NAME);
    this.paneScript = path.join(this.panesDir, PANE_SCRIPT_NAME);
    this.workersFifo = path.join(this.fifoDir, WORKERS_FIFO_NAME);
  }

  // ─── Initialization ──────────────────────────────────────────────────

  /**
   * Initialize the pane service: create directories, FIFOs, the display script,
   * detect the placeholder pane, and start health checks.
   * Call once before any other operations.
   */
  init(): void {
    if (this.initialized) return;

    // Create directories
    fs.mkdirSync(this.fifoDir, { recursive: true });

    // Write runtime-generated scripts (used inside tmux panes)
    this.writePaneDisplayScript();
    this.writeWorkersPlaceholderScript();

    // Ensure workers.fifo exists
    this.ensureFifo(this.workersFifo);

    // Detect the placeholder pane (created by agent.sh)
    this.scanPlaceholderPane();

    // Start periodic health checks
    this.healthInterval = setInterval(() => this.healthCheck(), 15_000);

    this.initialized = true;
    console.log(`[PaneService] Initialized — maxAgents=${this.maxAgents}, session="${this.sessionName}"`);
  }

  /**
   * Clean up: remove health check interval.
   */
  shutdown(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
    this.initialized = false;
  }

  // ─── FIFO management ─────────────────────────────────────────────────

  private ensureFifo(fifoPath: string): void {
    try {
      if (!fs.existsSync(fifoPath)) {
        cp.execSync(`mkfifo "${fifoPath}"`, { timeout: 2000 });
      } else {
        // Check it's actually a FIFO
        const stat = fs.statSync(fifoPath);
        if (!stat.isFIFO()) {
          fs.unlinkSync(fifoPath);
          cp.execSync(`mkfifo "${fifoPath}"`, { timeout: 2000 });
        }
      }
    } catch (err: any) {
      console.error(`[PaneService] Failed to create FIFO ${fifoPath}: ${err.message}`);
    }
  }

  private ensureFifoForAgent(agentName: string): string {
    const fifoPath = path.join(this.fifoDir, `${agentName}.fifo`);
    this.ensureFifo(fifoPath);
    return fifoPath;
  }

  /**
   * Write content to a FIFO. Uses a background process to avoid blocking
   * if no reader is attached.
   */
  private writeToFifo(fifoPath: string, content: string): void {
    this.ensureFifo(fifoPath);
    const escaped = content.replace(/'/g, "'\\''");
    const writer = cp.spawn('bash', ['-c', `echo '${escaped}' > '${fifoPath}' 2>/dev/null || true`], {
      detached: true,
      stdio: 'ignore',
      timeout: 3000,
    });
    writer.unref();
  }

  // ─── Placeholder management ──────────────────────────────────────────

  /**
   * Read the placeholder pane ID saved by agent.sh.
   */
  private scanPlaceholderPane(): void {
    const placeholderFile = path.join(this.panesDir, PLACEHOLDER_PANE_FILE);
    try {
      if (fs.existsSync(placeholderFile)) {
        const savedId = fs.readFileSync(placeholderFile, 'utf-8').trim();
        // Verify the pane still exists and is running our placeholder script
        if (this.isPaneRunningScript(savedId, 'workers-placeholder.sh')) {
          this.placeholderPaneId = savedId;
          console.log(`[PaneService] Placeholder pane detected: ${savedId}`);
          // Send initial update to the placeholder
          this.updatePlaceholder();
          return;
        } else {
          console.log(`[PaneService] Saved placeholder pane ${savedId} is gone or wrong — will re-detect`);
        }
      }
    } catch { /* ignore */ }

    // Try to auto-detect by scanning the session
    try {
      const hasSession = this.sessionExists();
      if (!hasSession) {
        console.log(`[PaneService] Tmux session "${this.sessionName}" does not exist yet`);
        return;
      }
      const panes = cp.execSync(
        `tmux list-panes -t "${this.sessionName}" -F '#{pane_id}'`,
        { timeout: 3000, encoding: 'utf-8' }
      ).trim().split('\n').filter(Boolean);

      for (const paneId of panes) {
        if (this.isPaneRunningScript(paneId, 'workers-placeholder.sh')) {
          this.placeholderPaneId = paneId;
          fs.writeFileSync(placeholderFile, paneId, 'utf-8');
          console.log(`[PaneService] Placeholder pane auto-detected: ${paneId}`);
          this.updatePlaceholder();
          return;
        }
      }
    } catch { /* ignore */ }

    console.log('[PaneService] No placeholder pane found — workers will run headless');
  }

  /**
   * Check if a pane is running a specific script by name.
   */
  private isPaneRunningScript(paneId: string, scriptName: string): boolean {
    try {
      // Verify pane exists
      cp.execSync(`tmux display-message -t "${paneId}" -p '#{pane_id}' 2>/dev/null`, { timeout: 2000 });
      const startCmd = cp.execSync(
        `tmux display-message -t "${paneId}" -p '#{pane_start_command}' 2>/dev/null`,
        { timeout: 2000, encoding: 'utf-8' }
      ).trim();
      return startCmd.includes(scriptName);
    } catch {
      return false;
    }
  }

  private sessionExists(): boolean {
    try {
      const result = cp.execSync(
        `tmux has-session -t "${this.sessionName}" 2>/dev/null && echo yes || echo no`,
        { timeout: 3000, encoding: 'utf-8' }
      ).trim();
      return result === 'yes';
    } catch {
      return false;
    }
  }

  /**
   * Update the workers placeholder display via its FIFO.
   * Sends current count and assignments.
   */
  updatePlaceholder(): void {
    if (!this.placeholderPaneId) return;

    const activeCount = this.workerPanes.size;
    const assignmentParts: string[] = [];
    for (const [, state] of this.workerPanes) {
      if (state.currentTicket) {
        assignmentParts.push(`${state.agentName}=${state.currentTicket}`);
      }
    }
    const assignments = assignmentParts.join(',');
    const message = `UPDATE:${activeCount}:${assignments}`;
    this.writeToFifo(this.workersFifo, message);
  }

  // ─── Pane display script ─────────────────────────────────────────────

  /**
   * Write the workers-placeholder.sh script that shows the worker count.
   * Reads from workers.fifo, displays "Workers: X/N active" with assignments.
   */
  private writeWorkersPlaceholderScript(): void {
    const script = `#!/bin/bash
# workers-placeholder.sh — Placeholder pane showing worker count + active workers.
# Auto-generated by pane-service.ts — do not edit.
# Reads from workers.fifo, displays "Workers: X/N active" with assignments.

MAX_AGENTS="\${1:-3}"
WORKERS_FIFO="\${FIFO_DIR}/workers.fifo"

# Ensure FIFO exists
if [ ! -p "\$WORKERS_FIFO" ]; then
  rm -f "\$WORKERS_FIFO" 2>/dev/null
  mkfifo "\$WORKERS_FIFO" 2>/dev/null || {
    echo "workers-placeholder: cannot create FIFO \$WORKERS_FIFO" >&2
    exit 1
  }
fi

cleanup() { exit 0; }
trap cleanup EXIT INT TERM

clear
printf '\n\n'
printf '     ╔══════════════════════════════════╗\n'
printf '     ║                                  ║\n'
printf '     ║   Workers: 0/%s active           ║\n' "\$MAX_AGENTS"
printf '     ║                                  ║\n'
printf '     ║   (no workers running)           ║\n'
printf '     ║                                  ║\n'
printf '     ╚══════════════════════════════════╝\n'
printf '\n\n'

while true; do
  read -r line < "\$WORKERS_FIFO" 2>/dev/null || continue

  case "\$line" in
    UPDATE:*)
      payload="\${line#UPDATE:}"
      count="\${payload%%:*}"
      assignments="\${payload#*:}"

      clear
      printf '\n\n'
      printf '     ╔══════════════════════════════════╗\n'
      printf '     ║                                  ║\n'
      printf '     ║   Workers: %s/%s active           ║\n' "\$count" "\$MAX_AGENTS"
      printf '     ║                                  ║\n'

      if [ "\$count" -eq 0 ] 2>/dev/null; then
        printf '     ║   (no workers running)           ║\n'
      else
        IFS=',' read -ra PAIRS <<< "\$assignments"
        for pair in "\${PAIRS[@]}"; do
          if [ -n "\$pair" ]; then
            agent="\${pair%%=*}"
            ticket="\${pair#*=}"
            printf '     ║   ◉ %-12s → %-10s     ║\n' "\$agent" "\$ticket"
          fi
        done
        remaining=\$((MAX_AGENTS - count))
        for __i in \$(seq 1 "\$remaining"); do
          printf '     ║                                  ║\n'
        done
      fi

      printf '     ║                                  ║\n'
      printf '     ╚══════════════════════════════════╝\n'
      printf '\n\n'
      ;;
    *)
      ;;
  esac
done
`;

    const placeholderScript = path.join(this.panesDir, 'workers-placeholder.sh');
    fs.writeFileSync(placeholderScript, script.replace(/\$\{FIFO_DIR\}/g, this.fifoDir), { mode: 0o755 });
  }

  /**
   * Write the pane-display.sh script that runs inside each worker pane.
   * It reads from the agent's FIFO and displays messages or tails logs.
   */
  private writePaneDisplayScript(): void {
    const script = `#!/bin/bash
# pane-display.sh — Reads from FIFO and displays messages, or shows idle state.
# Usage: pane-display.sh <agentName>

AGENT_NAME="\${1:-unknown}"

cleanup() {
  kill %1 2>/dev/null || true
  exit 0
}
trap cleanup EXIT INT TERM

clear
printf '\\n  \${AGENT_NAME}: Waiting for task...\\n\\n'

while true; do
  read -r line < "\${FIFO_DIR}/\${AGENT_NAME}.fifo" 2>/dev/null || continue

  kill %1 2>/dev/null || true
  wait 2>/dev/null

  case "$line" in
    CLEAR)
      clear
      ;;
    IDLE)
      clear
      printf '\\n  \${AGENT_NAME}: Finished.\\n\\n'
      ;;
    DISPLAY:*)
      msg="\${line#DISPLAY:}"
      msg="\${msg//\\\\\\\\n/\$'\\\\n'}"
      clear
      printf '%s\\n' "\$msg"
      ;;
    TAIL:*)
      logpath="\${line#TAIL:}"
      clear
      printf '\\n  \${AGENT_NAME}: Working...\\n\\n'
      tail -n +0 -f "\$logpath" 2>/dev/null &
      ;;
    *)
      ;;
  esac
done
`
    .replace(/\$\{FIFO_DIR\}/g, this.fifoDir);

    fs.writeFileSync(this.paneScript, script, { mode: 0o755 });
  }

  // ─── Worker pane lifecycle ───────────────────────────────────────────

  /**
   * Create a worker pane by splitting from the placeholder.
   * Returns the new pane ID, or null on failure.
   */
  createWorkerPane(agentName: string): WorkerPaneState | null {
    if (!this.placeholderPaneId) {
      console.log(`[PaneService] No placeholder pane — cannot create pane for ${agentName}`);
      return null;
    }

    if (!this.sessionExists()) {
      console.log(`[PaneService] Session "${this.sessionName}" doesn't exist`);
      return null;
    }

    // Check if this agent already has a pane
    const existing = this.workerPanes.get(agentName);
    if (existing && existing.alive) {
      console.log(`[PaneService] ${agentName} already has pane ${existing.paneId}`);
      return existing;
    }

    try {
      // Split the placeholder pane to create the worker pane
      const displayCmd = `"${this.paneScript}" "${agentName}"`;
      const result = cp.execSync(
        `tmux split-window -v -t "${this.placeholderPaneId}" -c "${this.repoRoot}" ${displayCmd}; tmux display-message -p '#{pane_id}'`,
        { timeout: 5000, encoding: 'utf-8' }
      ).trim();

      if (result && result.startsWith('%')) {
        const fifoPath = this.ensureFifoForAgent(agentName);
        const state: WorkerPaneState = {
          agentName,
          paneId: result,
          fifoPath,
          currentTicket: null,
          alive: true,
          lastVerified: Date.now(),
        };
        this.workerPanes.set(agentName, state);

        // Save pane ID for compatibility
        fs.writeFileSync(path.join(this.panesDir, `${agentName}.pane`), result, 'utf-8');

        console.log(`[PaneService] Created ${agentName} → pane ${result} (split from placeholder ${this.placeholderPaneId})`);
        this.updatePlaceholder();
        return state;
      }

      console.error(`[PaneService] Unexpected pane creation result: "${result}"`);
      return null;
    } catch (err: any) {
      console.error(`[PaneService] Failed to create pane for ${agentName}: ${err.message}`);
      return null;
    }
  }

  /**
   * Kill a worker pane entirely. The space returns to the placeholder.
   */
  killWorkerPane(agentName: string): void {
    const state = this.workerPanes.get(agentName);
    if (!state || !state.paneId) return;

    try {
      // Try to verify the pane exists before killing
      cp.execSync(`tmux display-message -t "${state.paneId}" -p '#{pane_id}' 2>/dev/null`, { timeout: 2000 });
      cp.execSync(`tmux kill-pane -t "${state.paneId}"`, { timeout: 3000 });
      console.log(`[PaneService] Killed pane ${state.paneId} (${agentName})`);
    } catch (err: any) {
      // Pane may already be dead — remove from tracking
      console.log(`[PaneService] Pane ${state.paneId} (${agentName}) already gone: ${err.message}`);
    }

    // Remove pane file
    try { fs.unlinkSync(path.join(this.panesDir, `${agentName}.pane`)); } catch { }

    this.workerPanes.delete(agentName);
    this.updatePlaceholder();
  }

  // ─── Public API for server-daemon ──────────────────────────────────

  /**
   * Get the pane ID for an agent. Creates the worker pane if it doesn't exist
   * (by splitting from the placeholder). Returns null if creation fails.
   */
  getPaneId(agentName: string): string | null {
    // Check for existing live pane
    const state = this.workerPanes.get(agentName);
    if (state?.paneId && state.alive && (Date.now() - state.lastVerified < 30_000)) {
      return state.paneId;
    }

    // Verify existing pane
    if (state?.paneId) {
      try {
        cp.execSync(`tmux display-message -t "${state.paneId}" -p '#{pane_id}' 2>/dev/null`, { timeout: 2000 });
        state.alive = true;
        state.lastVerified = Date.now();
        return state.paneId;
      } catch {
        // Pane is dead — will recreate below
        this.workerPanes.delete(agentName);
      }
    }

    // Create new worker pane by splitting the placeholder
    const created = this.createWorkerPane(agentName);
    return created?.paneId ?? null;
  }

  /**
   * Attach a worker's log output to its pane. Creates the pane if needed
   * by splitting the placeholder, then starts tailing the log file.
   */
  attachWorker(agentName: string, logPath: string, ticketId: string): void {
    // Get or create the worker pane
    const paneId = this.getPaneId(agentName);
    if (!paneId) {
      console.log(`[PaneService] No pane for ${agentName} — running headless`);
      return;
    }

    const state = this.workerPanes.get(agentName);
    if (!state) return;

    state.currentTicket = ticketId;
    this.updatePlaceholder();

    // Send TAIL command so the pane starts following the log
    this.writeToFifo(state.fifoPath, `TAIL:${logPath}`);
    console.log(`[PaneService] ${agentName} (pane ${paneId}) → tailing ${logPath} (${ticketId})`);
  }

  /**
   * Reset a worker pane after the worker finishes.
   * Kills the pane entirely — space returns to the placeholder.
   */
  resetPane(agentName: string): void {
    const state = this.workerPanes.get(agentName);
    if (!state) return;

    // Send IDLE briefly so the pane display script stops tailing,
    // then kill the pane so space returns to placeholder.
    this.writeToFifo(state.fifoPath, 'IDLE');

    // Small delay to let the pane process the IDLE command
    setTimeout(() => {
      this.killWorkerPane(agentName);
    }, 500);
  }

  /**
   * Reset ALL worker panes (called on server shutdown).
   */
  resetAllPanes(): void {
    for (const [agentName] of this.workerPanes) {
      this.resetPane(agentName);
    }
  }

  /**
   * Check if any worker pane exists for any agent.
   */
  hasAnyPane(): boolean {
    return this.workerPanes.size > 0 || this.placeholderPaneId !== null;
  }

  // ─── Health check ────────────────────────────────────────────────────

  /**
   * Periodic health check: verifies the placeholder is alive, and all worker
   * panes are still present. Recreates dead panes only for workers that are
   * currently assigned to a ticket.
   */
  healthCheck(): void {
    // Check placeholder
    if (this.placeholderPaneId) {
      try {
        cp.execSync(`tmux display-message -t "${this.placeholderPaneId}" -p '#{pane_id}' 2>/dev/null`, { timeout: 2000 });
      } catch {
        console.log(`[PaneService] Placeholder pane ${this.placeholderPaneId} is gone — re-scanning...`);
        this.placeholderPaneId = null;
        this.scanPlaceholderPane();
      }
    }

    // Check worker panes
    for (const [agentName, state] of this.workerPanes) {
      if (!state.paneId) continue;
      try {
        cp.execSync(`tmux display-message -t "${state.paneId}" -p '#{pane_id}' 2>/dev/null`, { timeout: 2000 });
        state.alive = true;
        state.lastVerified = Date.now();
      } catch {
        console.log(`[PaneService] Worker pane ${state.paneId} (${agentName}) is dead`);
        state.alive = false;
        state.paneId = null;
        // If this worker is still running, re-create the pane
        if (state.currentTicket) {
          this.createWorkerPane(agentName);
          // Re-attach the log
          const newState = this.workerPanes.get(agentName);
          if (newState && state.currentTicket) {
            this.writeToFifo(newState.fifoPath, `TAIL:${path.join(this.repoRoot, '.pi', 'tickets', 'logs', `${state.currentTicket}.log`)}`);
          }
        }
      }
    }

    // Always keep placeholder in sync
    this.updatePlaceholder();
  }
}

// ─── Singleton ───────────────────────────────────────────────────────

let _instance: PaneService | null = null;

export function getPaneService(options?: PaneServiceOptions): PaneService {
  if (!_instance && options) {
    _instance = new PaneService(options);
    _instance.init();
  }
  if (!_instance) {
    throw new Error('PaneService not initialized. Call getPaneService(options) first.');
  }
  return _instance;
}

export function hasPaneService(): boolean {
  return _instance !== null;
}
