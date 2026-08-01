/**
 * /ticket extension — Spawn parallel AI workers for Linear tickets.
 *
 * Usage:
 *   /ticket <TICKET_ID>                 — start ticket workers
 *   /ticket-prompt <ID> <message>       — send prompt to a specific worker
 *   /ticket-stop                        — stop all workers
 *   /ticket-retry <ID>                  — retry a failed worker
 *
 * The ticket dashboard renders as a persistent widget above the editor
 * so you can continue prompting pi while workers run. Select a tab
 * with ↑↓, Enter for live log, q/Esc to exit detail view.
 *
 * Use /ticket-prompt to send instructions to a running or completed worker.
 */

import type { ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import type { ExtensionAPI, Theme } from '@mariozechner/pi-coding-agent';
import { matchesKey, Key, truncateToWidth, visibleWidth } from '@mariozechner/pi-tui';
import {
  buildGraph,
  readyTickets,
  spawnWorker,
  killAllWorkers,
  saveFullState,
  patchNode,
  loadState,
  getAgentConfig,
  sendPromptToWorker,
} from './orchestrator';
import type { GraphNode, TicketState } from './types';
import { getRepoRoot } from './git';

// ─── Live Log Tailer ────────────────────────────────────────────────

class LiveLogTailer {
  private positions = new Map<string, number>();

  /** Read new content from a log file since last call. */
  readNew(logPath: string): string {
    try {
      const stat = fs.statSync(logPath);
      const currentSize = stat.size;
      const lastPos = this.positions.get(logPath) ?? 0;

      if (currentSize <= lastPos) return '';

      const fd = fs.openSync(logPath, 'r');
      const buf = Buffer.alloc(currentSize - lastPos);
      fs.readSync(fd, buf, 0, buf.length, lastPos);
      fs.closeSync(fd);

      this.positions.set(logPath, currentSize);
      return buf.toString('utf-8');
    } catch {
      return '';
    }
  }

  /** Reset position for a log (e.g., when worker restarts). */
  reset(logPath: string): void {
    this.positions.delete(logPath);
  }

  /** Read the tail of a log file (up to maxLines). */
  readTail(logPath: string, maxLines: number): string[] {
    try {
      const content = fs.readFileSync(logPath, 'utf-8');
      return content.split('\n').filter((l) => l.trim()).slice(-maxLines);
    } catch {
      return [];
    }
  }
}

// ─── TUI: Ticket Dashboard Widget ───────────────────────────────────

interface TabEntry {
  identifier: string;
  title: string;
  status: TicketState['status'];
  prUrl: string | null;
}

class TicketWidget {
  private tabs: TabEntry[] = [];
  private selectedIndex = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];
  private theme!: Theme;
  private nodes: Map<string, GraphNode> = new Map();
  private workers: Map<string, ChildProcess> = new Map();
  private detailMode = false;
  private logTailer = new LiveLogTailer();
  private detailLogLines: string[] = [];
  private detailScrollOffset = 0;
  private visible = true;

  public onClose?: () => void;

  setVisible(v: boolean): void { this.visible = v; this.invalidate(); }
  isVisible(): boolean { return this.visible; }

  setData(nodes: Map<string, GraphNode>, workers: Map<string, ChildProcess>): void {
    this.nodes = nodes;
    this.workers = workers;
    this.refreshTabs();
  }

  updateNode(node: GraphNode): void {
    this.nodes.set(node.ticket.identifier, node);
    this.refreshTabs();
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
  }

  /** Feed live log output into the detail view. */
  feedLiveLogs(): void {
    if (!this.detailMode) return;
    const selected = this.tabs[this.selectedIndex];
    if (!selected) return;
    const node = this.nodes.get(selected.identifier);
    if (!node) return;

    const newText = this.logTailer.readNew(node.state.logPath);
    if (newText) {
      const newLines = newText.split('\n').filter((l) => l.trim());
      this.detailLogLines.push(...newLines);
      // Keep last 200 lines
      if (this.detailLogLines.length > 200) {
        this.detailLogLines = this.detailLogLines.slice(-200);
      }
      this.detailScrollOffset = Math.max(0, this.detailLogLines.length - 30);
      this.invalidate();
    }
  }

  private refreshTabs(): void {
    this.tabs = [];
    for (const [, node] of this.nodes) {
      this.tabs.push({
        identifier: node.ticket.identifier,
        title: node.ticket.title,
        status: node.state.status,
        prUrl: node.state.prUrl,
      });
    }
    const order: Record<string, number> = { running: 0, pending: 1, blocked: 2, done: 3, failed: 4 };
    this.tabs.sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5));
    if (this.selectedIndex >= this.tabs.length) {
      this.selectedIndex = Math.max(0, this.tabs.length - 1);
    }
    this.invalidate();
  }

  handleInput(data: string): void {
    if (!this.visible) return;

    if (this.detailMode) {
      if (matchesKey(data, Key.escape) || matchesKey(data, 'q')) {
        this.detailMode = false;
        this.detailLogLines = [];
        this.detailScrollOffset = 0;
        this.invalidate();
        return;
      }
      if (matchesKey(data, Key.up) || matchesKey(data, 'k')) {
        this.detailScrollOffset = Math.max(0, this.detailScrollOffset - 1);
        this.invalidate();
        return;
      }
      if (matchesKey(data, Key.down) || matchesKey(data, 'j')) {
        this.detailScrollOffset = Math.min(
          Math.max(0, this.detailLogLines.length - 1),
          this.detailScrollOffset + 1,
        );
        this.invalidate();
        return;
      }
      return;
    }

    if (matchesKey(data, Key.up) || matchesKey(data, 'k')) {
      if (this.selectedIndex > 0) { this.selectedIndex--; this.invalidate(); }
    } else if (matchesKey(data, Key.down) || matchesKey(data, 'j')) {
      if (this.selectedIndex < this.tabs.length - 1) { this.selectedIndex++; this.invalidate(); }
    } else if (matchesKey(data, Key.enter)) {
      // Enter detail mode — load current log tail
      const selected = this.tabs[this.selectedIndex];
      if (selected) {
        const node = this.nodes.get(selected.identifier);
        if (node) {
          this.detailLogLines = this.logTailer.readTail(node.state.logPath, 200);
          this.detailScrollOffset = Math.max(0, this.detailLogLines.length - 30);
          this.logTailer.reset(node.state.logPath);
        }
        this.detailMode = true;
        this.invalidate();
      }
    }
  }

  render(width: number): string[] {
    if (!this.visible) return [];

    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const t = this.theme;
    if (!t) return [];
    const lines: string[] = [];

    if (this.detailMode && this.tabs[this.selectedIndex]) {
      return this.renderDetail(width, t);
    }

    // Compact tab bar
    const tabWidth = Math.min(22, Math.floor(width / this.tabs.length) - 1);

    // Header
    const workerCount = [...this.nodes.values()].filter((n) => n.state.status === 'running').length;
    const doneCount = [...this.nodes.values()].filter((n) => n.state.status === 'done').length;
    const total = this.tabs.length;
    lines.push(truncateToWidth(
      t.fg('accent', t.bold(' Tickets ')) +
      t.fg('muted', `${doneCount}/${total} done  `) +
      (workerCount > 0 ? t.fg('warning', `${workerCount} running  `) : '') +
      t.fg('dim', '↑↓ nav  Enter view  q close'),
      width,
    ));

    // Tab row
    let tabRow = '';
    for (let i = 0; i < this.tabs.length; i++) {
      const tab = this.tabs[i];
      const isSelected = i === this.selectedIndex;
      const icon = statusIconChar(tab.status);
      const label = tab.identifier;
      const maxLen = tabWidth - 3;
      const truncated = label.length > maxLen ? label.slice(0, maxLen - 1) + '…' : label;

      let cell = isSelected
        ? t.bg('accent', t.fg('text', ` ${icon} ${truncated} `))
        : t.fg('dim', ` ${icon} ${truncated} `);

      // Pad to tabWidth
      const vw = visibleWidth(
        isSelected ? ` ${icon} ${truncated} ` : ` ${icon} ${truncated} `,
      );
      cell += ' '.repeat(Math.max(0, tabWidth - vw));
      tabRow += cell;
    }
    lines.push(truncateToWidth(tabRow, width));

    // Selected ticket info
    const selected = this.tabs[this.selectedIndex];
    if (selected) {
      const node = this.nodes.get(selected.identifier);
      lines.push(truncateToWidth(
        t.fg('muted', ' ') +
        t.bold(selected.title) +
        t.fg('dim', `  [${statusLabel(selected.status)}]`),
        width,
      ));

      if (node) {
        // Dependency line
        const deps = node.ticket.refs;
        const depStr = deps.length > 0
          ? deps.map((d) => {
              const dn = this.nodes.get(d);
              const icon = dn ? statusIconChar(dn.state.status) : '?';
              return `${icon}${d}`;
            }).join(' ')
          : 'none';
        lines.push(truncateToWidth(t.fg('dim', `  ref: ${depStr}`), width));

        // Status info
        const statusDetails: string[] = [];
        if (node.state.prUrl) statusDetails.push(t.fg('success', `PR: ${node.state.prUrl}`));
        if (node.state.error) statusDetails.push(t.fg('error', `Error: ${node.state.error}`));
        if (node.state.assignedPort !== null) statusDetails.push(t.fg('accent', `port:${node.state.assignedPort}`));
        if (node.state.status === 'running') statusDetails.push(t.fg('warning', '⏳ running...'));
        if (statusDetails.length > 0) {
          lines.push(truncateToWidth('  ' + statusDetails.join('  '), width));
        }
      }
    }

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  private renderDetail(width: number, t: Theme): string[] {
    const selected = this.tabs[this.selectedIndex];
    if (!selected) return [];

    const lines: string[] = [];
    const node = this.nodes.get(selected.identifier);

    lines.push(truncateToWidth(
      t.fg('accent', t.bold(` ${selected.identifier}: ${selected.title} `)) +
      t.fg('dim', `  [${statusLabel(selected.status)}]`),
      width,
    ));
    lines.push(t.fg('borderMuted', '─'.repeat(width)));

    // Show log lines from the scroll offset
    const maxVisible = 14;
    const start = Math.max(0, this.detailScrollOffset);
    const visibleLines = this.detailLogLines.slice(start, start + maxVisible);

    if (visibleLines.length === 0 && node?.state.status === 'running') {
      lines.push(truncateToWidth(t.fg('dim', '  (waiting for output...)'), width));
    } else if (visibleLines.length === 0) {
      lines.push(truncateToWidth(t.fg('dim', '  (no output yet)'), width));
    }

    for (const logLine of visibleLines) {
      // Truncate very long lines
      const display = logLine.length > width - 2 ? logLine.slice(0, width - 5) + '…' : logLine;
      lines.push(t.fg('dim', ` ${display}`));
    }

    // Scroll indicator
    if (this.detailLogLines.length > maxVisible) {
      const pct = Math.round((this.detailScrollOffset / Math.max(1, this.detailLogLines.length - maxVisible)) * 100);
      lines.push(truncateToWidth(
        t.fg('muted', `  ── ${this.detailScrollOffset + 1}-${Math.min(start + maxVisible, this.detailLogLines.length)}/${this.detailLogLines.length} (${pct}%)  ↑↓ scroll  q back ──`),
        width,
      ));
    } else {
      lines.push(t.fg('muted', '  q/Esc to go back  ↑↓ scroll'));
    }

    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function statusIconChar(status: TicketState['status']): string {
  switch (status) {
    case 'running': return '⏳';
    case 'pending': return '○';
    case 'blocked': return '🔒';
    case 'done': return '✓';
    case 'failed': return '✗';
  }
}

function statusLabel(status: TicketState['status']): string {
  switch (status) {
    case 'running': return 'RUNNING';
    case 'pending': return 'PENDING';
    case 'blocked': return 'BLOCKED';
    case 'done': return 'DONE';
    case 'failed': return 'FAILED';
  }
}

// ─── Extension Entry Point ──────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let widget: TicketWidget | null = null;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  const workers = new Map<string, ChildProcess>();
  let currentNodes: Map<string, GraphNode> | null = null;
  let currentExtraInstructions = '';

  function stopPolling(): void {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  pi.on('session_shutdown', async () => {
    stopPolling();
    if (currentNodes) {
      killAllWorkers(currentNodes);
      saveFullState(currentNodes);
    }
    widget = null;
  });

  function launchReadyWorkers(nodes: Map<string, GraphNode>): void {
    const config = getAgentConfig();
    const ready = readyTickets(nodes);
    for (const node of ready) {
      if (workers.has(node.ticket.identifier)) continue;
      if (workers.size >= config.maxAgents) break;

      patchNode(node, () => {
        workers.delete(node.ticket.identifier);
        saveFullState(nodes);
        widget?.updateNode(node);
        launchReadyWorkers(nodes);
      });

      const proc = spawnWorker(node, currentExtraInstructions);
      workers.set(node.ticket.identifier, proc);
      widget?.updateNode(node);
    }
  }

  // ─── /ticket command ──────────────────────────────────────────────

  pi.registerCommand('ticket', {
    description: 'Spawn parallel ticket workers. Usage: /ticket <TICKET_ID> [extra instructions]',
    handler: async (args, ctx) => {
      const trimmed = args?.trim() ?? '';
      if (!trimmed) {
        ctx.ui.notify('Usage: /ticket <TICKET_IDENTIFIER> [extra instructions...]', 'error');
        return;
      }

      const spaceIdx = trimmed.indexOf(' ');
      const ticketId = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
      const extraInstructions = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

      try {
        getRepoRoot();
      } catch {
        ctx.ui.notify('Not in a git repository. /ticket requires a git repo.', 'error');
        return;
      }

      ctx.ui.notify(`Loading ${ticketId} and dependency graph...`, 'info');

      try {
        const existingState = loadState();
        const { nodes } = await buildGraph(ticketId, existingState);

        currentNodes = nodes;
        currentExtraInstructions = extraInstructions;
        saveFullState(nodes);

        widget = new TicketWidget();
        widget.setData(nodes, workers);

        // Register the widget with pi's TUI
        ctx.ui.setWidget('ticket-dashboard', []);
        // We'll use a custom approach: periodically re-render via setWidget
        const renderWidget = () => {
          if (!widget || !widget.isVisible()) {
            ctx.ui.setWidget('ticket-dashboard', []);
            return;
          }
          const w = 80; // reasonable default width
          const lines = widget.render(w);
          ctx.ui.setWidget('ticket-dashboard', lines);
        };

        // Initial render
        renderWidget();

        // Launch workers
        launchReadyWorkers(nodes);

        // Start polling with widget refresh
        stopPolling();
        pollInterval = setInterval(() => {
          if (!currentNodes || !widget) return;

          for (const [identifier, proc] of workers) {
            if (proc.exitCode !== null) workers.delete(identifier);
          }

          const ready = readyTickets(currentNodes);
          const config = getAgentConfig();
          for (const node of ready) {
            if (workers.size >= config.maxAgents) break;
            if (!workers.has(node.ticket.identifier)) {
              patchNode(node, () => {
                workers.delete(node.ticket.identifier);
                saveFullState(currentNodes!);
                widget?.updateNode(node);
                launchReadyWorkers(currentNodes!);
              });
              const proc = spawnWorker(node, currentExtraInstructions);
              workers.set(node.ticket.identifier, proc);
            }
          }

          widget.setData(currentNodes, workers);
          widget.feedLiveLogs();
          renderWidget();

          const allDone = [...currentNodes.values()].every(
            (n) => n.state.status === 'done' || n.state.status === 'failed',
          );
          if (allDone && workers.size === 0) {
            stopPolling();
            renderWidget();
          }
        }, 1000);

        const extraMsg = extraInstructions ? ` (+ extra instructions)` : '';
        ctx.ui.notify(
          `Loaded ${nodes.size} tickets. ${workers.size} worker(s) started${extraMsg}. Use /ticket-stop to halt.`,
          'success',
        );

      } catch (err: any) {
        ctx.ui.notify(`Error: ${err.message}`, 'error');
      }
    },
  });

  // ─── /ticket-stop command ─────────────────────────────────────────

  pi.registerCommand('ticket-stop', {
    description: 'Stop all running ticket workers and hide the dashboard.',
    handler: async (_args, ctx) => {
      stopPolling();
      if (currentNodes) {
        killAllWorkers(currentNodes);
        saveFullState(currentNodes);
      }
      workers.clear();
      widget?.setVisible(false);
      ctx.ui.setWidget('ticket-dashboard', []);
      ctx.ui.notify('All ticket workers stopped.', 'info');
    },
  });

  // ─── /ticket-prompt command ───────────────────────────────────────

  pi.registerCommand('ticket-prompt', {
    description: 'Send a message to a specific worker. Usage: /ticket-prompt <IDENTIFIER> <message>',
    handler: async (args, ctx) => {
      const trimmed = args?.trim() ?? '';
      if (!trimmed) {
        ctx.ui.notify('Usage: /ticket-prompt <IDENTIFIER> <message>', 'error');
        return;
      }

      const spaceIdx = trimmed.indexOf(' ');
      if (spaceIdx === -1) {
        ctx.ui.notify('Usage: /ticket-prompt <IDENTIFIER> <message>', 'error');
        return;
      }

      const identifier = trimmed.slice(0, spaceIdx).trim();
      const message = trimmed.slice(spaceIdx + 1).trim();

      if (!currentNodes) {
        ctx.ui.notify('No active ticket session. Run /ticket first.', 'error');
        return;
      }

      const node = currentNodes.get(identifier);
      if (!node) {
        ctx.ui.notify(`Ticket ${identifier} not found in current graph.`, 'error');
        return;
      }

      try {
        ctx.ui.notify(`Sending prompt to ${identifier}...`, 'info');

        // Use orchestrator to send prompt and restart worker
        sendPromptToWorker(node, message, (n, perWorkerInstructions) => {
          const proc = spawnWorker(n, currentExtraInstructions, perWorkerInstructions);
          workers.set(n.ticket.identifier, proc);
          widget?.updateNode(n);
          return proc;
        });

        ctx.ui.notify(`Prompt sent to ${identifier}. Worker restarted with your message.`, 'success');
      } catch (err: any) {
        ctx.ui.notify(`Error: ${err.message}`, 'error');
      }
    },
  });

  // ─── /ticket-retry command ────────────────────────────────────────

  pi.registerCommand('ticket-retry', {
    description: 'Retry a failed ticket worker. Usage: /ticket-retry <IDENTIFIER>',
    handler: async (args, ctx) => {
      const identifier = args?.trim();
      if (!identifier) {
        ctx.ui.notify('Usage: /ticket-retry <IDENTIFIER>', 'error');
        return;
      }

      if (!currentNodes) {
        ctx.ui.notify('No active ticket session.', 'error');
        return;
      }

      const node = currentNodes.get(identifier);
      if (!node) {
        ctx.ui.notify(`Ticket ${identifier} not found.`, 'error');
        return;
      }

      node.state.status = 'pending';
      node.state.error = null;
      node.state.pid = null;
      node.state.finishedAt = null;
      saveFullState(currentNodes);
      launchReadyWorkers(currentNodes);
      ctx.ui.notify(`Retrying ${identifier}...`, 'info');
    },
  });
}
