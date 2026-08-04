#!/usr/bin/env -S npx tsx
/**
 * Ticket CLI — standalone terminal dashboard for managing ticket agents.
 *
 * Usage:
 *   cd $(git rev-parse --show-toplevel)
 *   npx tsx .pi/extensions/ticket/cli.ts <TICKET_ID>
 */

import blessed from 'blessed';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cp from 'node:child_process';
import {
  buildGraph,
  readyTickets,
  spawnWorker,
  killAllWorkers,
  killSingleWorker,
  saveFullState,
  patchNode,
  loadState,
  getAgentConfig,
  logsDir,
} from './orchestrator.js';
import type { GraphNode, TicketState } from './types.js';
import { buildQueue, dequeueBatch, findPreemptibleAgents } from './queue.js';
import { scanAllPRComments, findMergeConflicts, findBaseConflictPRs, isPRClean, registerWebhook, unregisterWebhooks } from './github-pr.js';
import { startWebhookServer, stopWebhookServer, startNgrokTunnel, getNgrokUrl } from './server.js';
import { findIncompletePRs } from './pr-check.js';
import type { WebhookEvent } from './server.js';

// ─── Helpers ────────────────────────────────────────────────────────

const STATUS_ICONS: Record<TicketState['status'], string> = {
  pending: '○',
  blocked: '◆',
  running: '◉',
  done: '✓',
  failed: '✗',
};

const STATUS_COLORS: Record<TicketState['status'], string> = {
  pending: 'yellow',
  blocked: 'magenta',
  running: 'cyan',
  done: 'green',
  failed: 'red',
};

function formatAgentItem(node: GraphNode): string {
  const icon = STATUS_ICONS[node.state.status] ?? '?';
  const id = node.ticket.identifier.padEnd(10);
  const title = node.ticket.title.slice(0, 25).padEnd(25);
  return `${icon} ${id} ${title}`;
}

function formatAgentItemStyled(node: GraphNode): string {
  const color = STATUS_COLORS[node.state.status] ?? 'white';
  const icon = STATUS_ICONS[node.state.status] ?? '?';
  const id = node.ticket.identifier.padEnd(10);
  const title = node.ticket.title.slice(0, 25).padEnd(25);
  return `{${color}-fg}${icon} ${id}{/${color}-fg} ${title}`;
}

// ─── Live Log Tailer ────────────────────────────────────────────────

class LogTailer {
  private positions = new Map<string, number>();

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

  tailLines(logPath: string, lines: number): string {
    try {
      const content = fs.readFileSync(logPath, 'utf-8');
      return content.split('\n').slice(-lines).join('\n');
    } catch {
      return '';
    }
  }

  reset(logPath: string): void {
    this.positions.delete(logPath);
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const ticketId = process.argv[2];
  if (!ticketId) {
    console.error('Usage: ticket-cli <TICKET_ID>');
    process.exit(1);
  }

  // Build graph
  console.log(`Loading ${ticketId} and dependency graph...`);
  const existingState = loadState();
  const { nodes, root } = await buildGraph(ticketId, existingState);

  const agentIds = [...nodes.keys()];
  if (agentIds.length === 0) {
    console.error('No tickets found in graph.');
    process.exit(1);
  }

  // ─── Setup BLessed Screen ───────────────────────────────────

  const screen = blessed.screen({
    smartCSR: true,
    title: `Ticket Agents — ${ticketId}`,
    cursor: { shape: 'block', blink: true },
  });

  // Header
  const header = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ' Ticket Agents',
    style: { bg: 'blue', fg: 'white' },
    tags: true,
  });

  // Agent list panel
  const agentList = blessed.box({
    top: 1,
    left: 0,
    width: '25%',
    height: '100%-3',
    label: ' Agents ',
    border: { type: 'line' },
    scrollable: true,
    scrollbar: { ch: ' ', track: { bg: 'cyan' }, style: { inverse: true } },
    mouse: true,
    keys: true,
    vi: true,
    tags: true,
    style: { border: { fg: 'cyan' }, focus: { border: { fg: 'cyan' } } },
  });

  // Output panel — agent's work (commands, test results, PR)
  const outputBox = blessed.box({
    top: 1,
    left: '25%',
    width: '75%',
    height: '100%-6',
    label: ' Output ',
    border: { type: 'line' },
    scrollable: true,
    scrollbar: { ch: ' ', track: { bg: 'cyan' }, style: { inverse: true } },
    mouse: true,
    keys: true,
    content: 'Select an agent to see output',
    style: { border: { fg: 'green' }, focus: { border: { fg: 'green' } } },
  });

  // Thinking panel — shows agent-status.txt (what the agent is currently doing)
  const thinkingBox = blessed.box({
    bottom: 3,
    left: '25%',
    width: '75%',
    height: 3,
    label: ' Thinking ',
    border: { type: 'line' },
    tags: true,
    content: '',
    style: { border: { fg: 'yellow' } },
  });

  // Help bar
  const helpBar = blessed.box({
    bottom: 1,
    left: 0,
    width: '100%',
    height: 1,
    content: ' ↑↓:navigate  Tab:switch  Enter:view  p:prompt  r:retry  x:kill  m:merge-check  q:quit',
    style: { bg: 'blue', fg: 'white' },
    tags: true,
  });

  // Prompt input (hidden initially)
  const promptInput = blessed.textbox({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    label: ' Prompt ',
    border: { type: 'line' },
    hidden: true,
    keys: true,
    mouse: true,
    inputOnFocus: true,
    style: {
      border: { fg: 'yellow' },
      focus: { border: { fg: 'yellow' } },
    },
  });

  // Status line (bottom)
  const statusLine = blessed.box({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: '',
    style: { bg: 'black', fg: 'white' },
    tags: true,
  });

  screen.append(header);
  screen.append(agentList);
  screen.append(outputBox);
  screen.append(thinkingBox);
  screen.append(helpBar);
  screen.append(promptInput);
  screen.append(statusLine);

  // ─── State ───────────────────────────────────────────────────

  let selectedIdx = 0;
  let promptTarget: string | null = null;
  let isPrompting = false;
  let showCompleted = true;
  const logTailer = new LogTailer();
  const workers = new Map<string, cp.ChildProcess>();
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  // Sort agents by status priority: running > pending > blocked > failed > done
  function sortAgents(): string[] {
    const order: Record<string, number> = {
      running: 0, pending: 1, blocked: 2, failed: 3, done: 4,
    };
    let ids = [...nodes.keys()];
    if (!showCompleted) ids = ids.filter(id => nodes.get(id)!.state.status !== 'done');
    return ids.sort((a, b) => {
      const na = nodes.get(a)!;
      const nb = nodes.get(b)!;
      return (order[na.state.status] ?? 5) - (order[nb.state.status] ?? 5);
    });
  }

  function getSelectedNode(): GraphNode | undefined {
    const ids = sortAgents();
    const id = ids[selectedIdx];
    return id ? nodes.get(id) : undefined;
  }

  // ─── Rendering ───────────────────────────────────────────────

  function renderAgentList(): void {
    const ids = sortAgents();
    const lines = ids.map((id, i) => {
      const node = nodes.get(id)!;
      const prefix = i === selectedIdx ? '❯' : ' ';
      const icon = STATUS_ICONS[node.state.status] ?? '?';
      const color = STATUS_COLORS[node.state.status] ?? 'white';
      const idStr = node.ticket.identifier.padEnd(10);
      // Show agent status if available, otherwise ticket title
      let title = node.ticket.title.slice(0, 28);
      if (node.state.status === 'running' && node.state.worktreePath) {
        try {
          const sf = node.state.worktreePath + '/agent-status.txt';
          const s = fs.readFileSync(sf, 'utf-8').trim();
          if (s) title = s.slice(0, 28);
        } catch { /* no status yet */ }
      }
      const line = `{${color}-fg}${prefix} ${icon} ${idStr}{/${color}-fg} ${title}`;
      return line;
    });
    agentList.setContent(lines.join('\n'));
  }

  /** Watch a log file for changes and stream new lines to the output panel. */
  function watchAgentLog(logPath: string, ticketId: string): void {
    let lastSize = 0;
    try { lastSize = fs.statSync(logPath).size; } catch { return; }
    // Pre-load existing content
    try {
      const content = fs.readFileSync(logPath, 'utf-8');
      for (const line of content.split('\n')) {
        if (line) appendOutput(ticketId, line);
      }
    } catch {}

    try {
      const watcher = fs.watch(logPath, (eventType) => {
        if (eventType !== 'change') return;
        try {
          const stat = fs.statSync(logPath);
          if (stat.size <= lastSize) return;
          const fd = fs.openSync(logPath, 'r');
          const buf = Buffer.alloc(stat.size - lastSize);
          fs.readSync(fd, buf, 0, buf.length, lastSize);
          fs.closeSync(fd);
          lastSize = stat.size;
          const text = buf.toString('utf-8');
          for (const line of text.split('\n')) {
            if (line) appendOutput(ticketId, line);
          }
        } catch { /* file may be mid-write */ }
      });
      // Clean up watcher when worker finishes (checked in refresh loop)
      watchers.set(ticketId, watcher);
    } catch { /* fs.watch may not be available */ }
  }
  const watchers = new Map<string, fs.FSWatcher>();

  // Per-agent output buffer — lines accumulate and display on switch
  let viewedAgent = '';
  const agentOutput = new Map<string, string[]>();

  /** Hook into a spawned worker — watch its log file for output (reliable, no stream conflicts). */
  function pipeAgentOutput(proc: cp.ChildProcess, ticketId: string): void {
    appendOutput(ticketId, `Worker started for ${ticketId}`);
    const node = nodes.get(ticketId);
    if (node?.state.worktreePath) appendOutput(ticketId, `Worktree: ${node.state.worktreePath}`);

    // Watch the log file for changes — OS-level, no blessed/stream conflicts
    if (node?.state.logPath) {
      watchAgentLog(node.state.logPath, ticketId);
    }

    proc.on('close', (code) => {
      appendOutput(ticketId, code === 0 ? '✓ Worker finished' : `✗ Worker exited with code ${code}`);
      // Close the file watcher
      const w = watchers.get(ticketId);
      if (w) { w.close(); watchers.delete(ticketId); }
    });
  }

  function appendOutput(ticketId: string, line: string): void {
    const lines = agentOutput.get(ticketId) ?? [];
    lines.push(line);
    if (lines.length > 500) lines.shift();
    agentOutput.set(ticketId, lines);
    if (ticketId === viewedAgent) {
      outputBox.setContent(lines.slice(-200).join('\n'));
      outputBox.setScroll(999999);
      screen.render();
    }
  }

  function showAgentOutput(ticketId: string): void {
    viewedAgent = ticketId;
    const lines = agentOutput.get(ticketId) ?? [];
    outputBox.setContent(lines.join('\n') || '(no output yet)');
    outputBox.setScroll(999999);
    // Update thinking panel from agent-status.txt
    const node = nodes.get(ticketId);
    let status = '';
    if (node?.state.worktreePath) {
      try {
        status = fs.readFileSync(node.state.worktreePath + '/agent-status.txt', 'utf-8').trim();
      } catch { /* no status */ }
    }
    thinkingBox.setContent(status ? ` {cyan-fg}${status}{/cyan-fg}` : ` {yellow-fg}${node?.state.status || 'unknown'}{/yellow-fg}`);
    outputBox.setLabel(` Output — ${ticketId} `);
    screen.render();
  }

  function renderHeader(): void {
    const running = [...nodes.values()].filter(n => n.state.status === 'running').length;
    const done = [...nodes.values()].filter(n => n.state.status === 'done').length;
    const failed = [...nodes.values()].filter(n => n.state.status === 'failed').length;
    const total = nodes.size;
    const parts: string[] = [];
    parts.push(`{white-fg}${total}{/white-fg} tickets`);
    if (running > 0) parts.push(`{cyan-fg}${running} running{/cyan-fg}`);
    if (done > 0) parts.push(`{green-fg}${done} done{/green-fg}`);
    if (failed > 0) parts.push(`{red-fg}${failed} failed{/red-fg}`);
    header.setContent(` Ticket Agents — ${parts.join(' · ')}`);
  }

  function renderStatus(): void {
    const running = [...nodes.values()].filter(n => n.state.status === 'running').length;
    const allDone = [...nodes.values()].every(n => n.state.status === 'done');
    const allFinished = [...nodes.values()].every(
      n => n.state.status === 'done' || n.state.status === 'failed',
    );

    if (allDone) {
      statusLine.setContent(' {green-fg}All tickets completed!{/green-fg}  Press q to quit.');
    } else if (allFinished) {
      statusLine.setContent(' All tickets finished.  Press q to quit.');
    } else {
      statusLine.setContent(` {cyan-fg}${running}{/cyan-fg} worker(s) active.`);
    }
  }

  function renderAll(): void {
    renderHeader();
    renderAgentList();
    renderStatus();
    screen.render();
  }

  // ─── Queue state ─────────────────────────────────────────────

  const reviewTicketIds = new Set<string>();
  const conflictTicketIds = new Set<string>();
  let webhookPort = 0;
  let webhookServer: ReturnType<typeof startWebhookServer> | null = null;

  async function scanPRsAndConflicts(): Promise<void> {
    // Scan PR comments
    try {
      const comments = await scanAllPRComments();
      for (const [ticketId, prComments] of comments) {
        if (nodes.has(ticketId)) {
          reviewTicketIds.add(ticketId);
          const node = nodes.get(ticketId)!;
          const lines = prComments.map((c) => `@${c.user}: ${c.body.slice(0, 200)}`);
          node.context = `## PR Review Comments to Address\n${lines.join('\n')}`;
          // Reset done tickets so a worker picks them up
          if (node.state.status === 'done') {
            node.state.status = 'pending';
            node.state.error = null;
            node.state.pid = null;
            node.state.finishedAt = null;
          }
        }
      }
    } catch (err) {
      console.error('PR comment scan failed:', (err as Error).message);
    }

    // Scan merge conflicts (PR-to-PR and PR-to-base)
    try {
      const conflicts = await findMergeConflicts();
      for (const conflict of conflicts) {
        for (const pr of [conflict.pr1, conflict.pr2]) {
          if (pr.ticketIdentifier && nodes.has(pr.ticketIdentifier)) {
            conflictTicketIds.add(pr.ticketIdentifier);
            const node = nodes.get(pr.ticketIdentifier)!;
            const other = pr === conflict.pr1 ? conflict.pr2 : conflict.pr1;
            node.context = `## Merge Conflicts\nConflicts with ${other.ticketIdentifier ?? 'PR #' + other.number} in: ${conflict.files.join(', ')}`;
            if (node.state.status === 'done') {
              node.state.status = 'pending';
              node.state.error = null;
              node.state.pid = null;
              node.state.finishedAt = null;
            }
          }
        }
      }

      // Also check individual PRs for merge conflicts against base branch
      const baseConflicts = await findBaseConflictPRs();
      for (const [ticketId, msg] of baseConflicts) {
        if (nodes.has(ticketId)) {
          conflictTicketIds.add(ticketId);
          const node = nodes.get(ticketId)!;
          if (!node.context) node.context = '';
          node.context += `\n## Base Branch Conflict\n${msg}`;
          if (node.state.status === 'done') {
            node.state.status = 'pending';
            node.state.error = null;
            node.state.pid = null;
            node.state.finishedAt = null;
          }
        }
      }

      // Skip tickets with clean PRs (no comments, no conflicts)
      for (const [id, node] of nodes) {
        if (node.state.status === 'done' && node.state.prUrl) {
          try {
            if (await isPRClean(id)) continue; // Already clean, leave as done
            // PR has issues — reset to pending for agent to fix
            node.state.status = 'pending';
            node.state.error = null;
            node.state.pid = null;
            node.state.finishedAt = null;
          } catch { /* skip check */ }
        }
      }

      // Check for incomplete PR headers
      try {
        const incomplete = await findIncompletePRs();
        for (const issue of incomplete) {
          if (issue.ticketId && nodes.has(issue.ticketId)) {
            const node = nodes.get(issue.ticketId)!;
            if (node.state.status === 'done') {
              node.state.status = 'pending';
              node.state.pid = null;
              node.state.error = null;
              node.state.finishedAt = null;
              node.context = `## Incomplete PR\nPR #${issue.prNumber} is missing: ${issue.missingHeaders.join(', ')}\n\nUpdate the PR body to include all required sections.`;
            }
          }
        }
      } catch { /* best effort */ }
    } catch (err) {
      console.error('Merge conflict scan failed:', (err as Error).message);
    }
  }

  function launchFromQueue(): void {
    const config = getAgentConfig();
    const queue = buildQueue(nodes, reviewTicketIds, conflictTicketIds);
    const batch = dequeueBatch(queue, config.maxAgents - workers.size);

    for (const entry of batch) {
      if (workers.has(entry.node.ticket.identifier)) continue;
      if (workers.size >= config.maxAgents) break;

      patchNode(entry.node, () => {
        workers.delete(entry.node.ticket.identifier);
        saveFullState(nodes);
        launchFromQueue();
        renderAll();
      });

      const proc = spawnWorker(entry.node, undefined, entry.context);
      workers.set(entry.node.ticket.identifier, proc);
      // Pipe agent output directly to the live panel
      pipeAgentOutput(proc, entry.node.ticket.identifier);
      logTailer.reset(entry.node.state.logPath);
    }
  }

  function checkPreemption(): void {
    const queue = buildQueue(nodes, reviewTicketIds, conflictTicketIds);
    const toPreempt = findPreemptibleAgents(nodes, queue);

    for (const node of toPreempt) {
      killSingleWorker(node);
      workers.delete(node.ticket.identifier);
      // Append preemption note to log
      try {
        fs.appendFileSync(
          node.state.logPath,
          `\n[${new Date().toISOString()}] ⏸ Preempted — blocked by dependencies. Will resume.\n`,
        );
      } catch { /* ignore */ }
      saveFullState(nodes);
    }

    if (toPreempt.length > 0) {
      launchFromQueue();
      renderAll();
    }
  }

  function killWorker(node: GraphNode): void {
    if (node.state.status === 'running' && node.state.pid) {
      try { process.kill(node.state.pid, 'SIGTERM'); } catch { /* already dead */ }
    }
    node.state.status = 'failed';
    node.state.error = 'Killed by user';
    node.state.finishedAt = new Date().toISOString();
    node.state.pid = null;
    workers.delete(node.ticket.identifier);
    saveFullState(nodes);
  }

  function retryWorker(node: GraphNode): void {
    if (node.state.status !== 'failed') return;
    node.state.status = 'pending';
    node.state.error = null;
    node.state.pid = null;
    node.state.finishedAt = null;
    saveFullState(nodes);
    launchFromQueue();
  }

  function promptWorker(node: GraphNode): void {
    promptTarget = node.ticket.identifier;
    isPrompting = true;

    // Hide help bar, show prompt input
    helpBar.hide();
    promptInput.show();
    promptInput.setLabel(` Prompt → ${node.ticket.identifier} `);
    promptInput.clearValue();
    promptInput.focus();
    screen.render();
  }

  function sendPrompt(message: string): void {
    if (!promptTarget) return;
    const node = nodes.get(promptTarget);
    if (!node) return;

    // Kill running worker
    if (node.state.status === 'running' && node.state.pid) {
      try { process.kill(node.state.pid, 'SIGTERM'); } catch { /* ignore */ }
      workers.delete(node.ticket.identifier);
    }

    // Append user message to log
    try {
      fs.appendFileSync(node.state.logPath, `\n[${new Date().toISOString()}] 👤 User: ${message}\n`);
    } catch { /* ignore */ }

    // Reset state
    node.state.status = 'pending';
    node.state.pid = null;
    node.state.error = null;
    node.state.finishedAt = null;
    logTailer.reset(node.state.logPath);
    saveFullState(nodes);

    // Spawn with message as per-worker instructions
    const proc = spawnWorker(node, undefined, message);

    patchNode(node, () => {
      workers.delete(node.ticket.identifier);
      saveFullState(nodes);
      launchFromQueue();
      renderAll();
    });

    workers.set(node.ticket.identifier, proc);
    pipeAgentOutput(proc, node.ticket.identifier);

    // Hide prompt
    promptInput.hide();
    promptInput.clearValue();
    helpBar.show();
    isPrompting = false;
    promptTarget = null;

    // Switch output to this agent
    const ids = sortAgents();
    selectedIdx = ids.indexOf(node.ticket.identifier);
    if (selectedIdx < 0) selectedIdx = 0;
    showAgentOutput(node.ticket.identifier);
    renderAll();
  }

  // ─── Input Handling ──────────────────────────────────────────

  // Agent list keys (only when focused)
  agentList.key(['up'], () => {
    if (isPrompting) return;
    selectedIdx = Math.max(0, selectedIdx - 1);
    renderAll();
    const node = getSelectedNode();
    if (node) showAgentOutput(node.ticket.identifier);
  });

  agentList.key(['down'], () => {
    if (isPrompting) return;
    const ids = sortAgents();
    selectedIdx = Math.min(ids.length - 1, selectedIdx + 1);
    renderAll();
    const node = getSelectedNode();
    if (node) showAgentOutput(node.ticket.identifier);
  });

  agentList.key(['enter'], () => {
    // Do nothing on Enter — just view the agent list and output responds to Tab
  });

  // Global keys (work regardless of focus)
  screen.key(['p'], () => {
    if (isPrompting) return;
    const node = getSelectedNode();
    if (!node) return;
    promptWorker(node);
  });

  screen.key(['r'], () => {
    if (isPrompting) return;
    const node = getSelectedNode();
    if (!node || node.state.status !== 'failed') return;
    retryWorker(node);
    renderAll();
  });

  screen.key(['x'], () => {
    if (isPrompting) return;
    const node = getSelectedNode();
    if (!node || node.state.status !== 'running') return;
    killWorker(node);
    launchFromQueue();
    renderAll();
  });

  screen.key(['m'], () => {
    if (isPrompting) return;
    const node = getSelectedNode();
    if (!node) return;
    appendOutput(node.ticket.identifier, 'Checking merge conflicts...');
    import('./github-pr.js').then(({ checkPRMergeConflict, listOpenPRs }) => {
      listOpenPRs().then((prs) => {
        const pr = prs.find(p => p.ticketIdentifier === node.ticket.identifier);
        if (!pr) { appendOutput(node.ticket.identifier, 'No open PR found for ' + node.ticket.identifier); return; }
        checkPRMergeConflict(pr.number).then(({ hasConflict, state }) => {
          if (hasConflict) {
            conflictTicketIds.add(node.ticket.identifier);
            node.context = `## Base Branch Conflict\nPR #${pr.number} is ${state} — needs rebase against base branch`;
            if (node.state.status === 'done') { node.state.status = 'pending'; node.state.error = null; node.state.pid = null; node.state.finishedAt = null; }
            appendOutput(node.ticket.identifier, `✗ PR #${pr.number} is ${state} — needs rebase. Spinning up agent...`);
            launchFromQueue();
            renderAll();
          } else {
            appendOutput(node.ticket.identifier, `✓ PR #${pr.number} is clean (${state})`);
          }
        }).catch(() => appendOutput(node.ticket.identifier, '✗ Failed to check merge status'));
      }).catch(() => appendOutput(node.ticket.identifier, '✗ Failed to list PRs'));
    }).catch(() => appendOutput(node.ticket.identifier, '✗ Failed to load PR checker'));
  });

  screen.key(['tab'], () => {
    if (isPrompting) return;
    if (screen.focused === agentList) {
      outputBox.focus();
    } else {
      agentList.focus();
    }
    renderAll();
  });

  // Output box scroll keys (only when focused)
  outputBox.key(['up'], () => {
    outputBox.scroll(-1);
    screen.render();
  });

  outputBox.key(['down'], () => {
    outputBox.scroll(1);
    screen.render();
  });

  outputBox.key(['pageup'], () => {
    outputBox.scroll(-(outputBox.height as number));
    screen.render();
  });

  outputBox.key(['pagedown'], () => {
    outputBox.scroll(outputBox.height as number);
    screen.render();
  });

  // Prompt input submission
  promptInput.key(['enter'], () => {
    const message = promptInput.getValue()?.trim();
    if (message) {
      sendPrompt(message);
    } else {
      // Cancel empty prompt
      promptInput.hide();
      promptInput.clearValue();
      helpBar.show();
      isPrompting = false;
      promptTarget = null;
      agentList.focus();
      screen.render();
    }
  });

  promptInput.key(['escape'], () => {
    promptInput.hide();
    promptInput.clearValue();
    helpBar.show();
    isPrompting = false;
    promptTarget = null;
    agentList.focus();
    screen.render();
  });

  // ─── Webhook handler ─────────────────────────────────────────

  function handleWebhookEvent(event: WebhookEvent): void {
    switch (event.type) {
      case 'pr_opened':
      case 'pr_synchronize':
        // Re-scan conflicts (PR-to-PR and PR-to-base) when a PR is created or updated
        Promise.all([findMergeConflicts(), findBaseConflictPRs()]).then(([conflicts, baseConflicts]) => {
          for (const c of conflicts) {
            if (c.pr1.ticketIdentifier) conflictTicketIds.add(c.pr1.ticketIdentifier);
            if (c.pr2.ticketIdentifier) conflictTicketIds.add(c.pr2.ticketIdentifier);
          }
          for (const [ticketId] of baseConflicts) {
            conflictTicketIds.add(ticketId);
          }
          launchFromQueue();
          renderAll();
        }).catch(() => {});
        break;

      case 'pr_comment':
        // Re-scan comments on new PR comments
        if (event.ticketId) {
          reviewTicketIds.add(event.ticketId);
          launchFromQueue();
          renderAll();
        }
        break;

      case 'shutdown':
        break;
    }
  }

  // ─── Cleanup ─────────────────────────────────────────────────

  async function cleanup(): Promise<void> {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    stopWebhookServer();
    try { await unregisterWebhooks(); } catch { /* best effort */ }
    killAllWorkers(nodes);
    saveFullState(nodes);
  }

  process.on('SIGINT', () => {
    cleanup().then(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    cleanup().then(() => process.exit(0));
  });

  screen.on('destroy', () => {
    cleanup();
  });

  // Global quit handler updated for async cleanup
  screen.key(['h'], () => {
    if (isPrompting) return;
    showCompleted = !showCompleted;
    selectedIdx = 0;
    helpBar.setContent(` ↑↓:navigate  Tab:switch  p:prompt  r:retry  x:kill  m:merge-check  ${showCompleted ? 'h:hide-done' : 'h:show-all'}  q:quit`);
    renderAll();
  });

  screen.key(['q', 'C-c'], () => {
    cleanup().then(() => process.exit(0));
  });

  // ─── Startup ─────────────────────────────────────────────────

  // Focus the agent list by default
  agentList.focus();

  // Initial render
  renderAll();
  const firstNode = getSelectedNode();
  if (firstNode) showAgentOutput(firstNode.ticket.identifier);

  // Launch initial workers from the queue immediately
  launchFromQueue();
  renderAll();

  // Allocate a port for the webhook server from the agent pool
  const config = getAgentConfig();
  const st = loadState();
  const usedPorts = new Set(st?.usedPorts ?? []);
  for (let p = config.portMin; p <= config.portMax; p++) {
    if (!usedPorts.has(p)) {
      webhookPort = p;
      usedPorts.add(p);
      break;
    }
  }

  // Start webhook server + ngrok in background
  if (webhookPort > 0) {
    webhookServer = startWebhookServer(webhookPort, handleWebhookEvent);
    startNgrokTunnel(webhookPort).then((ngrokUrl) => {
      const baseUrl = ngrokUrl || `http://localhost:${webhookPort}`;
      return registerWebhook(baseUrl);
    }).then((msg) => {
      if (msg) {
        try {
          fs.appendFileSync(
            path.join(logsDir(), 'webhook.log'),
            `[${new Date().toISOString()}] ${msg}\n`,
          );
        } catch { /* ignore */ }
      }
    }).catch(() => {});
  }

  // Scan PRs and conflicts in the background (don't block worker launch)
  scanPRsAndConflicts().then(() => {
    launchFromQueue();
    renderAll();
  }).catch(() => {});

  // Periodic refresh — header/status + thinking panel from agent-status.txt
  refreshTimer = setInterval(() => {
    checkPreemption();
    renderHeader();
    renderAgentList();
    renderStatus();
    // Refresh thinking panel
    const node = getSelectedNode();
    if (node?.state.worktreePath) {
      try {
        const s = fs.readFileSync(node.state.worktreePath + '/agent-status.txt', 'utf-8').trim();
        if (s) thinkingBox.setContent(` {cyan-fg}${s}{/cyan-fg}`);
      } catch { /* no update */ }
    }
    screen.render();
  }, 2000);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
