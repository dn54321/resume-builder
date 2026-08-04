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
   * Create a worker pane by splitting the banner vertically.
   */
  createWorkerPane(agentName: string, ticketId: string): string | null {
    if (!this.bannerPaneId) {
      console.error('[PaneManager] No banner pane — cannot create worker pane');
      return null;
    }

    // Check session exists
    if (!this.sessionExists()) return null;

    try {
      const workerScript = path.join(
        this.stateDir,
        'panes',
        'worker-pane.sh',
      );

      // Split banner vertically with 8 lines
      const result = cp.execSync(
        `tmux split-window -v -t "${this.bannerPaneId}" -l 8 -c "${process.cwd()}" ` +
        `"${workerScript}" "${agentName}" "${this.fifoDir}"`,
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

        // Send THINKING signal so the pane starts showing status
        const worktreePath = path.join(this.stateDir, 'worktrees', ticketId);
        this.writeToFifo(fifoPath, `THINKING:${worktreePath}`);

        this.updateBanner();
        return result;
      }
    } catch (err: any) {
      console.error(`[PaneManager] Failed to create pane for ${agentName}: ${err.message}`);
    }
    return null;
  }

  /**
   * Kill a worker pane. The banner remains.
   */
  killWorkerPane(agentName: string): void {
    const pane = this.workerPanes.get(agentName);
    if (!pane) return;

    try {
      // Send IDLE briefly
      this.writeToFifo(pane.fifoPath, 'IDLE');

      // Small delay then kill
      setTimeout(() => {
        try {
          cp.execSync(`tmux kill-pane -t "${pane.paneId}"`, { timeout: 3000 });
        } catch { /* already dead */ }
      }, 500);
    } catch { /* ignore */ }

    this.workerPanes.delete(agentName);
    this.updateBanner();
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
    if (!this.bannerPaneId) return false;
    try {
      cp.execSync(
        `tmux display-message -t "${this.bannerPaneId}" -p '#{pane_id}' 2>/dev/null`,
        { timeout: 2000 },
      );
      return true;
    } catch {
      console.error('[PaneManager] BANNER PANE IS DEAD! Right column collapsed.');
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
        if (this.sessionExists()) {
          cp.execSync(
            `tmux display-message -t "${savedId}" -p '#{pane_id}' 2>/dev/null`,
            { timeout: 2000 },
          );
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
