/**
 * Tmux pane manager — banner-based worker pane lifecycle.
 *
 * INVARIANT: The banner pane is NEVER killed. If the banner dies, the
 * right column collapses and the two-column layout cannot be restored
 * without recreating the entire tmux session.
 *
 * Worker panes are created by splitting the banner vertically.
 * When a worker finishes, only the worker pane is killed.
 */

import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PaneManagerOptions {
  sessionName: string;
  stateDir: string;
  maxWorkers: number;
}

/**
 * Target height (lines) for each worker pane. Must match the `-l` used in
 * createWorkerPane's split so compactWorkerPanes() restores exactly the
 * layout a fresh spawn expects.
 */
const WORKER_PANE_HEIGHT = 8;

interface WorkerPane {
  agentName: string;
  paneId: string;
  fifoPath: string;
  currentTicket: string | null;
}

export class PaneManager {
  private sessionName: string;
  private stateDir: string;
  private maxWorkers: number;
  private fifoDir: string;
  private bannerPaneId: string | null = null;
  private workerPanes: Map<string, WorkerPane> = new Map();

  constructor(options: PaneManagerOptions) {
    this.sessionName = options.sessionName;
    this.stateDir = options.stateDir;
    this.maxWorkers = options.maxWorkers;
    this.fifoDir = path.join(options.stateDir, 'panes', 'fifos');
    fs.mkdirSync(this.fifoDir, { recursive: true });
  }

  /**
   * Initialize: create FIFO dir, write scripts, detect banner pane.
   */
  init(): void {
    this.writeScripts();
    this.ensureWorkersFifo();
    this.detectBannerPane();
  }

  /**
   * Set the banner pane ID (called by launcher after tmux layout is created).
   */
  setBannerPane(paneId: string): void {
    this.bannerPaneId = paneId;
    const bannerFile = path.join(this.stateDir, 'panes', 'banner.pane');
    fs.writeFileSync(bannerFile, paneId, 'utf-8');
  }

  /**
   * Ensure we know a live banner pane id. Re-runs detection when the banner
   * was never resolved or has since died.
   *
   * WHY: PaneManager.init() → detectBannerPane() runs while the orchestrator
   * is still booting — BEFORE atlas.sh creates the tmux layout (atlas.sh
   * waits for state/ready, which the orchestrator writes after init()). On a
   * fresh ./agent.sh start the tmux session does not exist yet, so detection
   * finds nothing and bannerPaneId stays null forever — every worker spawn
   * then fails with "No banner pane". Restarting preserved the live session,
   * which masked this; a fresh start always hits it. Re-detecting lazily at
   * spawn/health time fixes it.
   */
  ensureBannerPane(): boolean {
    if (this.bannerPaneId && this.paneAlive(this.bannerPaneId, false)) {
      return true;
    }
    this.detectBannerPane();
    return !!this.bannerPaneId && this.paneAlive(this.bannerPaneId, false);
  }

  /**
   * Create a worker pane by splitting the banner vertically.
   *
   * The pane runs a plain `bash` shell (NOT worker-pane.sh) so the AgentPool
   * can launch pi inside it via `tmux send-keys` — giving each worker a real
   * TTY. The workerPanes map + banner update are still maintained so
   * killWorkerPane() can clean up and the banner shows live worker counts.
   *
   * Returns the tmux pane id (e.g. "%1") or null on failure.
   */
  createWorkerPane(agentName: string, ticketId: string): string | null {
    if (!this.ensureBannerPane()) {
      console.error('[PaneManager] No banner pane — cannot create worker pane');
      return null;
    }

    // Check session exists
    if (!this.sessionExists()) return null;

    // When a worker pane dies, tmux redistributes its lines to the surviving
    // worker panes — a survivor can balloon (e.g. 33 lines) and swallow the
    // space needed for the next 8-line split, so every new spawn hits "no
    // space for new pane" and falls back to a headless worker. Compacting
    // survivors back to the target height BEFORE splitting guarantees room
    // for this pane regardless of how many panes died since the last spawn.
    this.compactWorkerPanes();

    try {
      // Split the banner vertically (8 lines) and start a shell in the pane.
      // `-P -F '#{pane_id}'` is REQUIRED: split-window prints nothing without
      // -P, and plain -P prints "session:window.pane" rather than the pane id
      // (e.g. "%1") that the caller needs for send-keys / kill-pane.
      // `-d` keeps the new pane INACTIVE so spawning workers never steals
      // the user's typing focus (the boss pane stays active).
      const result = cp.execSync(
        `tmux split-window -d -P -F '#{pane_id}' -v -t "${this.bannerPaneId}" -l ${WORKER_PANE_HEIGHT} -c "${process.cwd()}" "bash"`,
        { timeout: 5000, encoding: 'utf-8' },
      ).trim();

      if (result && result.startsWith('%')) {
        const fifoPath = path.join(this.fifoDir, `${agentName}.fifo`);
        this.ensureFifo(fifoPath);

        const pane: WorkerPane = {
          agentName,
          paneId: result,
          fifoPath,
          currentTicket: ticketId,
        };
        this.workerPanes.set(agentName, pane);

        // NOTE: worker-pane.sh (the FIFO display loop) no longer runs in
        // worker panes — pi itself occupies the pane with a real TTY. The
        // agent FIFO is kept for bookkeeping only, so no THINKING write here.

        this.updateBanner();
        return result;
      }
    } catch (err: any) {
      console.error(`[PaneManager] Failed to create pane for ${agentName}: ${err.message}`);
    }
    return null;
  }

  /**
   * Register an EXISTING worker pane without splitting (used when the pool
   * re-adopts a surviving worker after an orchestrator restart). The pane is
   * added to workerPanes so compactWorkerPanes()/killWorkerPane() include it
   * — without this, an adopted pane is invisible to the manager: it never
   * gets compacted after sibling deaths (ballooning and starving new splits)
   * and can never be killed via killWorkerPane().
   */
  registerWorkerPane(agentName: string, paneId: string, ticketId: string): void {
    const fifoPath = path.join(this.fifoDir, `${agentName}.fifo`);
    this.ensureFifo(fifoPath);
    this.workerPanes.set(agentName, {
      agentName,
      paneId,
      fifoPath,
      currentTicket: ticketId,
    });
    this.updateBanner();
  }

  /**
   * Kill a worker pane. The banner remains.
   */
  killWorkerPane(agentName: string): void {
    const pane = this.workerPanes.get(agentName);
    if (!pane) return;

    try {
      // The pane runs pi (launched via send-keys) — killing the pane
      // terminates the worker's TTY session. No IDLE FIFO write: the
      // worker-pane.sh display loop no longer runs in worker panes.
      cp.execSync(`tmux kill-pane -t "${pane.paneId}"`, { timeout: 3000 });
    } catch { /* already dead */ }

    this.workerPanes.delete(agentName);
    // After a pane dies, tmux inflates the survivors with the freed lines.
    // Compact them back to the target height so the freed space is actually
    // available for the next worker split — otherwise one death cascades
    // into "no space for new pane" for every subsequent spawn.
    this.compactWorkerPanes();
    this.updateBanner();
  }

  /**
   * Resize every live worker pane back to the target split height.
   *
   * WHY: tmux rebalances a pane group when a pane dies — the survivors grow
   * to fill the freed space (a surviving worker can balloon from 8 to 33
   * lines). The next `split-window -l 8` then fails with "no space for new
   * pane" because the survivors ate the space, forcing the pool into the
   * headless fallback. Compacting keeps the worker column at
   * maxWorkers × targetHeight + banner, so there is always room for another
   * split. Best-effort: skips dead/missing panes and never touches the
   * banner.
   */
  private compactWorkerPanes(targetHeight: number = WORKER_PANE_HEIGHT): void {
    // Collect the panes to compact: all tracked worker panes PLUS any
    // untracked worker panes that survived an orchestrator restart. On a
    // fresh restart the workerPanes map is empty (the pool only re-adopts
    // workers whose agentId/paneId survived in state), so old panes like a
    // 33-line %10 from a previous session would never be compacted and the
    // column stays too full for new splits. Scan the session for every pane
    // that is not the banner and not a control pane (dashboard/boss), and
    // compact those too — best-effort, dead panes are skipped.
    const targets = new Set<string>();
    for (const [, pane] of this.workerPanes) targets.add(pane.paneId);
    try {
      if (this.sessionExists()) {
        const all = cp.execSync(
          `tmux list-panes -t "${this.sessionName}" -F '#{pane_id}'`,
          { timeout: 3000, encoding: 'utf-8' },
        ).trim().split('\n').filter(Boolean);
        for (const paneId of all) {
          if (paneId === this.bannerPaneId) continue;
          if (!this.isWorkerPane(paneId)) continue;
          targets.add(paneId);
        }
      }
    } catch { /* session gone — nothing to compact */ }

    for (const paneId of targets) {
      if (!this.paneAlive(paneId, false)) continue;
      try {
        cp.execSync(
          `tmux resize-pane -t "${paneId}" -y ${targetHeight}`,
          { timeout: 3000 },
        );
      } catch (err: any) {
        console.error(`[PaneManager] Failed to compact pane ${paneId}: ${err.message}`);
      }
    }
  }

  /**
   * True if the pane is a worker pane (runs pi or a bash shell in the
   * banner column) — i.e. not the banner itself and not the left-column
   * dashboard/boss panes. Worker panes are detected by their start command:
   * the pool launches them with `bash` and then types the pi command into
   * them, so they show up as `bash` (or `pi` once running) while the
   * dashboard/boss run `fish` via dashboard-watch.sh / the boss prompt.
   */
  private isWorkerPane(paneId: string): boolean {
    try {
      const startCmd = cp.execSync(
        `tmux display-message -t "${paneId}" -p '#{pane_start_command}'`,
        { timeout: 2000, encoding: 'utf-8' },
      ).trim();
      // Banner, dashboard, and boss panes are fish/script shells — never
      // touch them. Worker panes are created by the pool as plain `bash`
      // (pool.ts send-keys then types the pi command into the shell).
      if (startCmd.includes('banner.sh')) return false;
      if (startCmd.includes('dashboard-watch')) return false;
      if (startCmd.includes('pi --append-system-prompt')) return false;
      if (startCmd === 'fish') return false;
      if (startCmd === 'bash') return true;
      // A pane that now runs pi is a live worker regardless of start cmd
      // (covers panes from older sessions whose shell launched pi directly).
      const nowCmd = cp.execSync(
        `tmux display-message -t "${paneId}" -p '#{pane_current_command}'`,
        { timeout: 2000, encoding: 'utf-8' },
      ).trim();
      return nowCmd === 'pi';
    } catch {
      return false;
    }
  }



  /**
   * Update the banner display.
   */
  updateBanner(): void {
    const workersFifo = path.join(this.fifoDir, 'workers.fifo');
    const count = this.workerPanes.size;
    const assignments = [...this.workerPanes.values()]
      .map((p) => `${p.agentName}=${p.currentTicket ?? 'idle'}`)
      .join(',');

    this.writeToFifo(workersFifo, `UPDATE:${count}:${assignments}`);
  }

  /**
   * Verify the banner pane is still alive. If not, we're in trouble.
   */
  healthCheck(): boolean {
    if (!this.ensureBannerPane()) return false;
    return this.paneAlive(this.bannerPaneId!, /* warnOnDead */ true);
  }

  /**
   * Check whether a worker pane still exists and its process is running.
   *
   * NOTE: `display-message -p '#{pane_id}'` is NOT a valid liveness check —
   * tmux prints nothing and exits 0 for a pane id that no longer resolves,
   * so a killed pane would look alive. `#{pane_dead}` prints 0 while the
   * pane's process runs and 1 once it has exited; a gone pane prints empty,
   * which we treat as dead.
   */
  isPaneAlive(paneId: string): boolean {
    return this.paneAlive(paneId, /* warnOnDead */ false);
  }

  private paneAlive(paneId: string, warnOnDead: boolean): boolean {
    if (!this.sessionExists()) return false;
    try {
      const dead = cp.execSync(
        `tmux display-message -t "${paneId}" -p '#{pane_dead}' 2>/dev/null`,
        { timeout: 2000, encoding: 'utf-8' },
      ).trim();
      const alive = dead === '0';
      if (!alive && warnOnDead) {
        console.error('[PaneManager] BANNER PANE IS DEAD! Right column collapsed.');
      }
      return alive;
    } catch {
      return false;
    }
  }

  shutdown(): void {
    // Kill all worker panes
    for (const [name] of this.workerPanes) {
      this.killWorkerPane(name);
    }
  }

  // ─── Private ──────────────────────────────────────────────────────

  private sessionExists(): boolean {
    try {
      const result = cp.execSync(
        `tmux has-session -t "${this.sessionName}" 2>/dev/null && echo yes || echo no`,
        { timeout: 3000, encoding: 'utf-8' },
      ).trim();
      return result === 'yes';
    } catch {
      return false;
    }
  }

  private detectBannerPane(): void {
    // Try reading saved pane ID
    const bannerFile = path.join(this.stateDir, 'panes', 'banner.pane');
    try {
      if (fs.existsSync(bannerFile)) {
        const savedId = fs.readFileSync(bannerFile, 'utf-8').trim();
        // Pane ids are session-scoped; a saved id only counts if it resolves
        // to a live pane in the current session.
        if (savedId && this.isPaneAlive(savedId)) {
          this.bannerPaneId = savedId;
          return;
        }
      }
    } catch { /* not found or dead */ }

    // Auto-detect by scanning panes for banner.sh
    try {
      if (!this.sessionExists()) return;
      const panes = cp.execSync(
        `tmux list-panes -t "${this.sessionName}" -F '#{pane_id}'`,
        { timeout: 3000, encoding: 'utf-8' },
      ).trim().split('\n').filter(Boolean);

      for (const paneId of panes) {
        try {
          const cmd = cp.execSync(
            `tmux display-message -t "${paneId}" -p '#{pane_start_command}'`,
            { timeout: 2000, encoding: 'utf-8' },
          ).trim();
          if (cmd.includes('banner.sh')) {
            this.bannerPaneId = paneId;
            fs.writeFileSync(bannerFile, paneId, 'utf-8');
            return;
          }
        } catch { /* continue */ }
      }
    } catch { /* ignore */ }
  }

  private ensureFifo(fifoPath: string): void {
    try {
      if (!fs.existsSync(fifoPath)) {
        cp.execSync(`mkfifo "${fifoPath}"`, { timeout: 2000 });
      } else {
        const stat = fs.statSync(fifoPath);
        if (!stat.isFIFO()) {
          fs.unlinkSync(fifoPath);
          cp.execSync(`mkfifo "${fifoPath}"`, { timeout: 2000 });
        }
      }
    } catch { /* best effort */ }
  }

  private ensureWorkersFifo(): void {
    const workersFifo = path.join(this.fifoDir, 'workers.fifo');
    this.ensureFifo(workersFifo);
  }

  private writeToFifo(fifoPath: string, content: string): void {
    this.ensureFifo(fifoPath);
    const escaped = content.replace(/'/g, "'\\''");
    const writer = cp.spawn('bash', [
      '-c',
      `echo '${escaped}' > '${fifoPath}' 2>/dev/null || true`,
    ], {
      detached: true,
      stdio: 'ignore',
      timeout: 3000,
    });
    writer.unref();
  }

  private writeScripts(): void {
    const scriptsDir = path.join(this.stateDir, 'panes');
    fs.mkdirSync(scriptsDir, { recursive: true });

    // banner.sh
    fs.writeFileSync(
      path.join(scriptsDir, 'banner.sh'),
      `#!/bin/bash
# banner.sh — Persistent worker count banner. NEVER killed.
MAX_WORKERS="\${1:-3}"
FIFO_DIR="\${2:-${this.fifoDir}}"
WORKERS_FIFO="\$FIFO_DIR/workers.fifo"
[ ! -p "\$WORKERS_FIFO" ] && mkfifo "\$WORKERS_FIFO" 2>/dev/null
cleanup() { exit 0; }; trap cleanup EXIT INT TERM
clear
printf '═══ Workers: 0/%s ═══\\n\\n' "\$MAX_WORKERS"
while true; do
  read -r line < "\$WORKERS_FIFO" || continue
  case "\$line" in
    UPDATE:*)
      payload="\${line#UPDATE:}"
      count="\${payload%%:*}"
      assignments="\${payload#*:}"
      clear
      if [ "\$count" -gt 0 ] 2>/dev/null; then
        printf '═══ Workers: %s/%s ═══\\n' "\$count" "\$MAX_WORKERS"
        IFS=',' read -ra PAIRS <<< "\$assignments"
        for pair in "\${PAIRS[@]}"; do
          [ -z "\$pair" ] && continue
          agent="\${pair%%=*}"
          ticket="\${pair#*=}"
          printf ' %s → %s\\n' "\$agent" "\$ticket"
        done
      else
        printf '═══ Workers: 0/%s ═══\\n\\n' "\$MAX_WORKERS"
      fi
      ;;
  esac
done
`,
      { mode: 0o755 },
    );

    // worker-pane.sh
    fs.writeFileSync(
      path.join(scriptsDir, 'worker-pane.sh'),
      `#!/bin/bash
# worker-pane.sh — Condensed thinking-steps display for a worker agent.
AGENT_NAME="\${1:-unknown}"
FIFO_DIR="\${2:-${this.fifoDir}}"
FIFO="\$FIFO_DIR/\${AGENT_NAME}.fifo"
[ ! -p "\$FIFO" ] && mkfifo "\$FIFO" 2>/dev/null
cleanup() { kill %1 2>/dev/null; exit 0; }; trap cleanup EXIT INT TERM
clear
printf '\\n  %s: idle\\n\\n' "\$AGENT_NAME"
while true; do
  read -r line < "\$FIFO" || continue
  kill %1 2>/dev/null; wait 2>/dev/null
  case "\$line" in
    IDLE)
      clear
      printf '\\n  %s: idle\\n\\n' "\$AGENT_NAME"
      ;;
    THINKING:*)
      status_file="\${line#THINKING:}/agent-status.txt"
      clear
      printf '\\n  %s\\n' "\$AGENT_NAME"
      printf '  ───────────────────────────\\n'
      tail -n 6 -f "\$status_file" 2>/dev/null &
      ;;
  esac
done
`,
      { mode: 0o755 },
    );

    // dashboard-watch.sh
    fs.writeFileSync(
      path.join(scriptsDir, 'dashboard-watch.sh'),
      `#!/bin/bash
DASHBOARD_FILE="\${1:-${this.stateDir}/dashboard.txt}"
while true; do
  clear
  [ -f "\$DASHBOARD_FILE" ] && cat "\$DASHBOARD_FILE"
  sleep 2
done
`,
      { mode: 0o755 },
    );
  }
}
