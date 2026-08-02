/**
 * pane-service.ts — Reliable tmux pane management for the ticket agent system.
 *
 * Problem with the old approach (send-keys):
 *   - `tmux send-keys C-c` to kill processes is unreliable — process may ignore it,
 *     may not die fast enough, or the pane may have been repurposed.
 *   - `tmux send-keys 'command' Enter` relies on a shell being present and ready.
 *   - Pane IDs are ephemeral — recreating a tmux session gives new %N IDs.
 *   - No verification that the pane actually exists before sending commands.
 *   - Panes can die silently and the server won't know until it tries to use them.
 *
 * Solution: FIFO-based display + robust pane management
 *   - Each agent pane runs a tiny script that reads from a named pipe (FIFO).
 *   - The server writes worker output to the FIFO. No typing into terminals.
 *   - Before any operation, panes are verified to exist and recreated if needed.
 *   - Periodic health checks detect dead panes and respawn them.
 *   - All tmux operations are done through execSync with proper error handling.
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

interface PaneState {
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

// ─── PaneService class ───────────────────────────────────────────────

export class PaneService {
  private sessionName: string;
  private repoRoot: string;
  private maxAgents: number;
  private panesDir: string;
  private fifoDir: string;
  private paneScript: string;
  private states: Map<string, PaneState> = new Map();
  private initialized = false;
  private healthInterval: NodeJS.Timeout | null = null;

  constructor(options: PaneServiceOptions) {
    this.sessionName = options.sessionName;
    this.repoRoot = options.repoRoot;
    this.maxAgents = options.maxAgents;
    this.panesDir = options.panesDir || path.join(this.repoRoot, '.pi', 'tickets', 'panes');
    this.fifoDir = path.join(this.panesDir, FIFO_DIR_NAME);
    this.paneScript = path.join(this.panesDir, PANE_SCRIPT_NAME);

    // Initialize states for all agents
    for (let i = 1; i <= this.maxAgents; i++) {
      const agentName = `agent-${i}`;
      this.states.set(agentName, {
        agentName,
        paneId: null,
        fifoPath: path.join(this.fifoDir, `${agentName}.fifo`),
        currentTicket: null,
        alive: false,
        lastVerified: 0,
      });
    }
  }

  // ─── Initialization ──────────────────────────────────────────────────

  /**
   * Initialize the pane service: create directories, FIFOs, the display script,
   * and scan for existing panes. Call once before any other operations.
   */
  init(): void {
    if (this.initialized) return;

    // Create directories
    fs.mkdirSync(this.fifoDir, { recursive: true });

    // Write the pane display script (reads from FIFO, displays content)
    this.writePaneDisplayScript();

    // Create FIFOs if they don't exist
    for (const [, state] of this.states) {
      this.ensureFifo(state);
    }

    // Scan existing tmux panes to see which ones already exist
    this.scanExistingPanes();

    // Start periodic health checks
    this.healthInterval = setInterval(() => this.healthCheck(), 15_000);

    this.initialized = true;
    console.log(`[PaneService] Initialized with ${this.maxAgents} agents, session "${this.sessionName}"`);
  }

  /**
   * Clean up: remove health check interval, but leave FIFOs for reuse.
   */
  shutdown(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
    this.initialized = false;
  }

  // ─── FIFO management ─────────────────────────────────────────────────

  private ensureFifo(state: PaneState): void {
    try {
      if (!fs.existsSync(state.fifoPath)) {
        cp.execSync(`mkfifo "${state.fifoPath}"`, { timeout: 2000 });
      } else {
        // Check it's actually a FIFO
        const stat = fs.statSync(state.fifoPath);
        if (!stat.isFIFO()) {
          fs.unlinkSync(state.fifoPath);
          cp.execSync(`mkfifo "${state.fifoPath}"`, { timeout: 2000 });
        }
      }
    } catch (err: any) {
      console.error(`[PaneService] Failed to create FIFO for ${state.agentName}: ${err.message}`);
    }
  }

  /**
   * Write content to an agent's FIFO. The pane display script will pick it up.
   * Uses a background process to avoid blocking if no reader is attached.
   */
  private writeToFifo(agentName: string, content: string): void {
    const state = this.states.get(agentName);
    if (!state) return;

    this.ensureFifo(state);

    // Write in a background process — writing to a FIFO blocks until
    // a reader opens it, so we use a short timeout.
    const writer = cp.spawn('bash', ['-c', `echo '${content.replace(/'/g, "'\\''")}' > '${state.fifoPath}' 2>/dev/null || true`], {
      detached: true,
      stdio: 'ignore',
      timeout: 3000,
    });
    writer.unref();
  }

  // ─── Pane display script ─────────────────────────────────────────────

  /**
   * Write the pane-display.sh script that runs inside each agent pane.
   * It reads from the FIFO in a loop and displays the content.
   */
  private writePaneDisplayScript(): void {
    const script = `#!/bin/bash
# pane-display.sh — Reads from FIFO and displays messages, or shows idle state.
# Usage: pane-display.sh <agentName>

AGENT_NAME="\${1:-unknown}"

cleanup() {
  # Kill any running tail process
  kill %1 2>/dev/null || true
  exit 0
}
trap cleanup EXIT INT TERM

# Clear screen, show idle message
clear
printf '\\n  Waiting for tasks... (%s)\\n\\n' "$AGENT_NAME"

while true; do
  # Read one line from the FIFO. This blocks until a writer sends data.
  # Format: CMD:arguments
  #   DISPLAY:message    — display a message
  #   TAIL:logpath        — start tailing a log file
  #   IDLE                — return to idle state
  #   CLEAR               — clear the screen
  #   TICKET:ticketId     — update the current ticket name in the header
  read -r line < "${FIFO_DIR}/${AGENT_NAME}.fifo" 2>/dev/null || continue

  # Kill any running tail
  kill %1 2>/dev/null || true
  wait 2>/dev/null

  case "$line" in
    CLEAR)
      clear
      ;;
    IDLE)
      clear
      printf '\\n  Waiting for tasks... (%s)\\n\\n' "$AGENT_NAME"
      ;;
    DISPLAY:*)
      msg="\${line#DISPLAY:}"
      # Decode escaped newlines
      msg="\${msg//\\\\n/$'\\n'}"
      clear
      printf '%s\\n' "$msg"
      ;;
    TAIL:*)
      logpath="\${line#TAIL:}"
      clear
      printf '\\n  %s: Working on ticket...\\n\\n' "$AGENT_NAME"
      tail -n +0 -f "$logpath" 2>/dev/null &
      ;;
    TICKET:*)
      # Just update the state, actual display handled by next DISPLAY/TAIL
      ticket="\${line#TICKET:}"
      ;;
    *)
      # Unknown command or empty — ignore
      ;;
  esac
done
`
    .replace(/\$\{FIFO_DIR\}/g, this.fifoDir);

    fs.writeFileSync(this.paneScript, script, { mode: 0o755 });
  }

  // ─── Tmux pane operations ────────────────────────────────────────────

  /**
   * Scan the tmux session to find which agent panes already exist and
   * update our state accordingly.
   */
  private scanExistingPanes(): void {
    try {
      // Check if the tmux session exists
      const hasSession = cp.execSync(
        `tmux has-session -t "${this.sessionName}" 2>/dev/null && echo yes || echo no`,
        { timeout: 3000, encoding: 'utf-8' }
      ).trim();

      if (hasSession !== 'yes') {
        console.log(`[PaneService] Tmux session "${this.sessionName}" does not exist yet`);
        return;
      }

      // List all panes with their IDs
      const panes = cp.execSync(
        `tmux list-panes -t "${this.sessionName}" -F '#{pane_id}'`,
        { timeout: 3000, encoding: 'utf-8' }
      ).trim().split('\n').filter(Boolean);

      console.log(`[PaneService] Found ${panes.length} existing panes: ${panes.join(', ')}`);

      // Check each pane to see if it's running our display script
      for (const paneId of panes) {
        try {
          const cmd = cp.execSync(
            `tmux display-message -t "${paneId}" -p '#{pane_current_command}' 2>/dev/null`,
            { timeout: 2000, encoding: 'utf-8' }
          ).trim();

          // If this pane is running pane-display.sh, figure out which agent
          if (cmd === 'bash' || cmd === 'fish' || cmd === 'pane-display') {
            // Try to get the full command to identify the agent
            try {
              const fullCmd = cp.execSync(
                `tmux display-message -t "${paneId}" -p '#{pane_start_command}' 2>/dev/null`,
                { timeout: 2000, encoding: 'utf-8' }
              ).trim();

              for (const [, state] of this.states) {
                if (fullCmd.includes(state.agentName)) {
                  state.paneId = paneId;
                  state.alive = true;
                  state.lastVerified = Date.now();
                  console.log(`[PaneService] Mapped ${state.agentName} → ${paneId} (auto-detected)`);
                  break;
                }
              }
            } catch {
              // Can't get start command — assign to first unassigned agent
            }
          }
        } catch {
          // Pane might have a dead process
        }
      }

      // Assign any unassigned agent to panes that need assignment
      this.assignUnmappedPanes();

      // Save pane IDs to files for compatibility with existing code
      this.savePaneFiles();
    } catch (err: any) {
      console.error(`[PaneService] Failed to scan panes: ${err.message}`);
    }
  }

  /**
   * Check if a pane is running our display script for a specific agent.
   * Returns true only if the pane exists AND is running pane-display.sh with matching agent name.
   */
  private isPaneForAgent(paneId: string, agentName: string): boolean {
    try {
      // Verify pane exists
      cp.execSync(`tmux display-message -t "${paneId}" -p '#{pane_id}' 2>/dev/null`, { timeout: 2000 });
      // Check if it's running our display script for this agent
      const startCmd = cp.execSync(
        `tmux display-message -t "${paneId}" -p '#{pane_start_command}' 2>/dev/null`,
        { timeout: 2000, encoding: 'utf-8' }
      ).trim();
      // The start command should contain both the script path and the agent name
      return startCmd.includes(this.paneScript) && startCmd.includes(agentName);
    } catch {
      return false;
    }
  }

  /**
   * Assign pane IDs to agents that don't have one yet.
   */
  private assignUnmappedPanes(): void {
    for (const [, state] of this.states) {
      if (state.paneId) continue; // already assigned

      // Try to find this agent's pane ID from the saved file (legacy)
      const paneFile = path.join(this.panesDir, `${state.agentName}.pane`);
      try {
        if (fs.existsSync(paneFile)) {
          const savedId = fs.readFileSync(paneFile, 'utf-8').trim();
          // CRITICAL: verify the pane is actually running OUR display script,
          // not just that a pane with that ID exists (it could be the boss pane!)
          if (this.isPaneForAgent(savedId, state.agentName)) {
            state.paneId = savedId;
            state.alive = true;
            state.lastVerified = Date.now();
            console.log(`[PaneService] Mapped ${state.agentName} → ${savedId} (from saved file, verified)`);
            continue;
          } else {
            console.log(`[PaneService] Saved pane ${savedId} for ${state.agentName} is not our display script — will recreate`);
          }
        }
      } catch { /* ignore */ }

      // Pane doesn't exist — create it
      this.createPane(state);
    }
  }

  /**
   * Create a new tmux pane for an agent and start the display script in it.
   */
  private createPane(state: PaneState): string | null {
    try {
      // Check session exists
      const hasSession = cp.execSync(
        `tmux has-session -t "${this.sessionName}" 2>/dev/null && echo yes || echo no`,
        { timeout: 3000, encoding: 'utf-8' }
      ).trim();

      if (hasSession !== 'yes') {
        console.error(`[PaneService] Cannot create pane — session "${this.sessionName}" doesn't exist`);
        return null;
      }

      // Determine where to split based on agent number
      const agentNum = parseInt(state.agentName.split('-')[1] || '1', 10);

      let splitCmd: string;
      let targetPane: string;

      if (agentNum === 1) {
        // Agent 1: split right from pane 0 (dashboard)
        splitCmd = `split-window -h -t "${this.sessionName}:0.0"`;
        targetPane = `${this.sessionName}:0.0`;
      } else {
        // Agents 2+: split below the previous agent pane
        // First, check if the previous agent pane exists
        const prevAgent = `agent-${agentNum - 1}`;
        const prevState = this.states.get(prevAgent);
        if (prevState?.paneId) {
          targetPane = prevState.paneId;
          splitCmd = `split-window -v -t "${targetPane}"`;
        } else {
          // Fallback: split from pane 0
          splitCmd = `split-window -h -t "${this.sessionName}:0.0"`;
          targetPane = `${this.sessionName}:0.0`;
        }
      }

      const displayCmd = `"${this.paneScript}" "${state.agentName}"`;
      const result = cp.execSync(
        `tmux ${splitCmd} -c "${this.repoRoot}" ${displayCmd}; tmux display-message -p '#{pane_id}'`,
        { timeout: 5000, encoding: 'utf-8' }
      ).trim();

      if (result && result.startsWith('%')) {
        state.paneId = result;
        state.alive = true;
        state.lastVerified = Date.now();
        console.log(`[PaneService] Created ${state.agentName} → pane ${result}`);
        this.savePaneFiles();
        return result;
      }

      console.error(`[PaneService] Unexpected pane creation result: "${result}"`);
      return null;
    } catch (err: any) {
      console.error(`[PaneService] Failed to create pane for ${state.agentName}: ${err.message}`);
      return null;
    }
  }

  /**
   * Verify a specific pane is alive and responsive.
   * Returns true if the pane exists and is running our display script.
   */
  verifyPane(agentName: string): boolean {
    const state = this.states.get(agentName);
    if (!state) return false;

    if (!state.paneId) {
      // No pane assigned — try to create one
      const created = this.createPane(state);
      if (!created) return false;
    }

    try {
      // Check if the pane still exists in tmux
      const exists = cp.execSync(
        `tmux display-message -t "${state.paneId}" -p '#{pane_id}' 2>/dev/null`,
        { timeout: 2000, encoding: 'utf-8' }
      ).trim();

      if (exists !== state.paneId) {
        console.log(`[PaneService] Pane ${state.paneId} for ${agentName} is gone (got ${exists || 'nothing'})`);
        state.alive = false;
        // Try to recreate
        const created = this.createPane(state);
        if (created) {
          state.alive = true;
          state.lastVerified = Date.now();
          return true;
        }
        return false;
      }

      // Check if the display script is still running in the pane
      try {
        const panePid = cp.execSync(
          `tmux display-message -t "${state.paneId}" -p '#{pane_pid}' 2>/dev/null`,
          { timeout: 2000, encoding: 'utf-8' }
        ).trim();

        if (panePid) {
          // Check if the process is still alive
          try {
            cp.execSync(`kill -0 ${panePid} 2>/dev/null`, { timeout: 1000 });
            state.alive = true;
            state.lastVerified = Date.now();
            return true;
          } catch {
            // Process died — pane still exists but script is gone
            console.log(`[PaneService] Display script in pane ${state.paneId} (${agentName}) died, restarting...`);
            this.restartDisplayScript(state);
            state.alive = true;
            state.lastVerified = Date.now();
            return true;
          }
        }
      } catch {
        // Can't get PID, try sending a test command
      }

      state.alive = true;
      state.lastVerified = Date.now();
      return true;
    } catch {
      state.alive = false;
      // Try to recreate
      const created = this.createPane(state);
      if (created) {
        state.alive = true;
        state.lastVerified = Date.now();
        return true;
      }
      return false;
    }
  }

  /**
   * Restart the display script in an existing pane.
   */
  private restartDisplayScript(state: PaneState): void {
    if (!state.paneId) return;
    try {
      // Kill whatever is running in the pane
      cp.execSync(`tmux send-keys -t "${state.paneId}" C-c`, { timeout: 2000 });
      cp.execSync('sleep 0.3', { timeout: 1000 });
      // Start the display script
      const displayCmd = `"${this.paneScript}" "${state.agentName}"`;
      cp.execSync(`tmux send-keys -t "${state.paneId}" '${displayCmd}' Enter`, { timeout: 2000 });
      console.log(`[PaneService] Restarted display script in pane ${state.paneId} (${state.agentName})`);
    } catch (err: any) {
      console.error(`[PaneService] Failed to restart display script for ${state.agentName}: ${err.message}`);
      // Pane might be dead — try full recreation
      state.paneId = null;
      this.createPane(state);
    }
  }

  // ─── Public API for server-daemon ──────────────────────────────────

  /**
   * Get the pane ID for an agent. Creates the pane if it doesn't exist.
   * Returns null if the pane cannot be created.
   */
  getPaneId(agentName: string): string | null {
    const state = this.states.get(agentName);
    if (!state) return null;

    // If we have a cached pane ID, verify it still exists
    if (state.paneId && state.alive && (Date.now() - state.lastVerified < 30_000)) {
      return state.paneId;
    }

    // Verify or create
    if (this.verifyPane(agentName)) {
      return this.states.get(agentName)?.paneId || null;
    }

    return null;
  }

  /**
   * Attach a worker's log output to its designated pane.
   * The pane will start tailing the log file.
   */
  attachWorker(agentName: string, logPath: string, ticketId: string): void {
    const state = this.states.get(agentName);
    if (!state) {
      console.log(`[PaneService] No state for ${agentName} — running headless`);
      return;
    }

    // Ensure the pane exists
    if (!this.verifyPane(agentName)) {
      console.log(`[PaneService] No pane for ${agentName} — running headless`);
      return;
    }

    state.currentTicket = ticketId;

    // Send TAIL command with ticket ID for the header display
    this.writeToFifo(agentName, `TAIL:${logPath}:${ticketId}`);
    console.log(`[PaneService] ${agentName} → tailing ${logPath} (${ticketId})`);
  }

  /**
   * Reset a pane to idle state after a worker finishes.
   */
  resetPane(agentName: string): void {
    const state = this.states.get(agentName);
    if (!state) return;

    state.currentTicket = null;

    // Send IDLE command to the FIFO
    this.writeToFifo(agentName, 'IDLE');
    console.log(`[PaneService] Reset pane for ${agentName}`);
  }

  /**
   * Reset all panes to idle state (called on server startup).
   */
  resetAllPanes(): void {
    for (const [, state] of this.states) {
      // Ensure pane exists
      if (!this.verifyPane(state.agentName)) continue;

      this.writeToFifo(state.agentName, 'IDLE');
    }
  }

  /**
   * Periodic health check — verifies all panes are alive, recreates dead ones.
   */
  healthCheck(): void {
    let dead = 0;
    let recreated = 0;

    for (const [, state] of this.states) {
      if (!state.paneId) {
        dead++;
        this.createPane(state);
        if (state.paneId) recreated++;
        continue;
      }

      // Quick-fail check: does the pane still exist?
      try {
        cp.execSync(
          `tmux display-message -t "${state.paneId}" -p '#{pane_id}' 2>/dev/null`,
          { timeout: 2000, encoding: 'utf-8' }
        );
      } catch {
        // Pane is gone
        dead++;
        state.alive = false;
        state.paneId = null;
        this.createPane(state);
        if (state.paneId) recreated++;
        continue;
      }

      // Check if the display script process is alive
      try {
        const panePid = cp.execSync(
          `tmux display-message -t "${state.paneId}" -p '#{pane_pid}' 2>/dev/null`,
          { timeout: 2000, encoding: 'utf-8' }
        ).trim();

        if (panePid) {
          try {
            cp.execSync(`kill -0 ${panePid} 2>/dev/null`, { timeout: 1000 });

            // Also verify the FIFO has a reader attached
            const readers = cp.execSync(
              `lsof "${state.fifoPath}" 2>/dev/null | wc -l`,
              { timeout: 2000, encoding: 'utf-8' }
            ).trim();

            if (parseInt(readers || '0', 10) === 0 && state.currentTicket) {
              // FIFO has no reader but there's a current ticket —
              // the display script might have died. Restart it.
              console.log(`[PaneService] ${state.agentName}: display script appears dead (no FIFO reader), restarting...`);
              this.restartDisplayScript(state);
              recreated++;
            }
          } catch {
            // Process died
            dead++;
            this.restartDisplayScript(state);
            recreated++;
          }
        }
      } catch { /* best effort */ }
    }

    if (dead > 0 || recreated > 0) {
      console.log(`[PaneService] Health check: ${dead} dead, ${recreated} recreated`);
    }

    this.savePaneFiles();
  }

  // ─── File persistence ────────────────────────────────────────────────

  /**
   * Save pane ID files for compatibility with existing code that reads them.
   */
  private savePaneFiles(): void {
    try {
      fs.mkdirSync(this.panesDir, { recursive: true });
      for (const [, state] of this.states) {
        if (state.paneId) {
          fs.writeFileSync(
            path.join(this.panesDir, `${state.agentName}.pane`),
            state.paneId,
            'utf-8'
          );
        }
      }
    } catch (err: any) {
      console.error(`[PaneService] Failed to save pane files: ${err.message}`);
    }
  }

  /**
   * Check if any pane exists for any agent (used to determine if we're
   * running in a tmux environment).
   */
  hasAnyPane(): boolean {
    for (const [, state] of this.states) {
      if (state.paneId && state.alive) return true;
    }
    return false;
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
