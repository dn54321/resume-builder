/**
 * tmux-controller.ts — Main controller pane for the agent tmux dashboard.
 *
 * Shows an epic/ticket picker, builds the dependency graph, manages the
 * priority queue, and dispatches work to worker panes via tmux send-keys.
 * Workers are interactive pi sessions that receive prompts through their stdin.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import * as cp from 'node:child_process';
import * as readline from 'node:readline';
import {
  buildGraph,
  loadState,
  saveFullState,
  killAllWorkers,
  getAgentConfig,
} from './orchestrator.js';
import { transitionTicket } from './linear.js';
import type { GraphNode, TicketState } from './types.js';
import { buildQueue, dequeueBatch } from './queue.js';
import {
  scanAllPRComments,
  findMergeConflicts,
  findBaseConflictPRs,
  isPRClean,
  isPRMerged,
  listOpenPRs,
} from './github-pr.js';
import { findIncompletePRs } from './pr-check.js';
import { startWebhookServer, stopWebhookServer, startNgrokTunnel } from './server.js';
import { registerWebhook, unregisterWebhooks } from './github-pr.js';

const maxAgents = parseInt(process.argv[2] ?? '3', 10);
const REPO_ROOT = process.cwd();
const TICKETS_DIR = `${REPO_ROOT}/.pi/tickets`;
const TMUX_SESSION = 'ticket-agents';

// Track which workers are busy (controller-kept state, not file-based)
const workerBusy = new Set<number>();

// ─── Linear API helpers ──────────────────────────────────────────────

function getLinearKey(): string {
  if (process.env.LINEAR_API_KEY) return process.env.LINEAR_API_KEY;
  throw new Error('LINEAR_API_KEY not set');
}

function linearQuery(query: string, variables?: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req = https.request({
      hostname: 'api.linear.app',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Authorization': getLinearKey(),
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const json = JSON.parse(data);
        if (json.errors) reject(new Error(JSON.stringify(json.errors)));
        else resolve(json.data);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Ticket picker ───────────────────────────────────────────────────

async function fetchActiveEpics(): Promise<Array<{ id: string; title: string; children: number }>> {
  const data = await linearQuery(`query {
    issues(first: 100, filter: { state: { type: { nin: ["completed","canceled"] } }, parent: { null: true } }, orderBy: updatedAt) {
      nodes { identifier title priority children { nodes { id } } }
    }
  }`);
  const issues = data.issues.nodes;
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  issues.sort((a: any, b: any) => {
    const aC = a.children.nodes.length > 0 ? 0 : 1;
    const bC = b.children.nodes.length > 0 ? 0 : 1;
    if (aC !== bC) return aC - bC;
    return (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
  });
  return issues.map((i: any) => ({
    id: i.identifier,
    title: i.title,
    children: i.children.nodes.length,
  }));
}

async function pickTicket(): Promise<string> {
  console.log('Fetching active epics and tickets from Linear...\n');
  const epics = await fetchActiveEpics();

  if (epics.length === 0) {
    console.log('No active epics or tickets found.');
    process.exit(0);
  }

  for (let i = 0; i < epics.length; i++) {
    const e = epics[i]!;
    const label = e.children > 0 ? `EPIC (${e.children} sub-tickets)` : 'TICKET';
    console.log(`  ${String(i + 1).padStart(2)}) ${e.id.padEnd(10)} ${label.padEnd(25)} ${e.title}`);
  }

  console.log('');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const choice = await new Promise<string>((resolve) => {
    rl.question(`Pick a number (1-${epics.length}): `, (answer) => {
      rl.close();
      const idx = parseInt(answer, 10) - 1;
      if (idx >= 0 && idx < epics.length) {
        resolve(epics[idx]!.id);
      } else {
        console.log('Invalid selection.');
        process.exit(1);
      }
    });
  });

  return choice;
}

// ─── Worker dispatch via tmux send-keys ─────────────────────────────

function tmuxSendKeys(paneIndex: number, keys: string): void {
  cp.execSync(`tmux send-keys -t ${TMUX_SESSION}:0.${paneIndex} '${keys.replace(/'/g, "'\\''")}'`, {
    cwd: REPO_ROOT,
    timeout: 3000,
  });
}

function tmuxSendEnter(paneIndex: number): void {
  cp.execSync(`tmux send-keys -t ${TMUX_SESSION}:0.${paneIndex} Enter`, {
    cwd: REPO_ROOT,
    timeout: 3000,
  });
}

/**
 * Dispatch a ticket to a worker pane by writing the prompt to a file,
 * then using tmux send-keys to tell the worker's pi session to read it.
 * The prompt is tokenized into chunks and sent line-by-line to avoid
 * send-keys issues with newlines and special characters.
 */
function dispatchWorker(workerNum: number, ticketId: string, worktreePath: string, prompt: string, context?: string): void {
  // Write the full prompt to a markdown file the worker can read
  const promptDir = `${TICKETS_DIR}/prompts`;
  fs.mkdirSync(promptDir, { recursive: true });
  const promptFile = `${promptDir}/worker-${workerNum}-${ticketId}.md`;
  let content = `# ${ticketId}\n\n**Worktree:** ${worktreePath}\n\n`;
  if (context) content += `${context}\n\n`;
  content += prompt;
  fs.writeFileSync(promptFile, content);

  // Tell the worker to cd to worktree and read the prompt file
  const cdCmd = `cd ${worktreePath}`;
  const piCmd = `@${promptFile}`;

  tmuxSendKeys(workerNum, cdCmd);
  tmuxSendEnter(workerNum);
  // Small delay to let cd complete
  cp.execSync('sleep 0.3');
  tmuxSendKeys(workerNum, piCmd);
  tmuxSendEnter(workerNum);

  workerBusy.add(workerNum);
  console.log(`  → Dispatched ${ticketId} to worker ${workerNum}`);
}

function isWorkerIdle(workerNum: number): boolean {
  return !workerBusy.has(workerNum);
}

/**
 * Poll workers to check if they've finished.
 * Uses tmux capture-pane to check if the pi process is still running
 * in the worker pane. If it exited (shows "exited with code"), mark idle.
 */
function pollWorkerStatus(): void {
  for (let w = 1; w <= maxAgents; w++) {
    if (!workerBusy.has(w)) continue;
    try {
      // Capture the last few lines of the worker pane
      const output = cp.execSync(
        `tmux capture-pane -t ${TMUX_SESSION}:0.${w} -p -S -10`,
        { timeout: 3000, encoding: 'utf-8' }
      );
      // If the pi process exited (shows exit code), the worker is done
      if (output.includes('exited with code')) {
        workerBusy.delete(w);
        console.log(`  Worker ${w} finished (detected exit in pane).`);
      }
    } catch {
      // Can't read pane — assume worker is still running
    }
  }

  // Also check: if a ticket is in_progress but no worker is busy for it,
  // reset the ticket status to pending so it can be re-dispatched
  if (!nodes) return;
  for (const [, node] of nodes) {
    if (node.state.status !== 'in_progress') continue;
    // Check if any busy worker is associated with this ticket
    const hasWorker = [...workerBusy].some(() => true); // any busy worker at all
    // More precise: we'd need a ticket→worker mapping. For now,
    // if no workers are busy, all in_progress tickets are stale.
    if (workerBusy.size === 0) {
      node.state.status = 'pending';
      node.state.pid = null;
      node.state.error = 'Worker became idle — ticket re-queued';
      console.log(`  ${node.ticket.identifier}: no workers busy → reset to pending`);
    }
  }
}

// ─── Graph + Queue management ────────────────────────────────────────

let nodes: Map<string, GraphNode> | null = null;
const reviewIds = new Set<string>();
const conflictIds = new Set<string>();

async function scanPRs(): Promise<void> {
  if (!nodes) return;
  try {
    const comments = await scanAllPRComments();
    for (const [id, prComments] of comments) {
      if (nodes.has(id)) {
        reviewIds.add(id);
        const node = nodes.get(id)!;
        node.context = `## PR Review Comments\n${prComments.map(c => `@${c.user}: ${c.body.slice(0, 200)}`).join('\n')}`;
        if (node.state.status === 'done') { node.state.status = 'pending'; node.state.error = null; }
      }
    }
  } catch {}

  try {
    const conflicts = await findMergeConflicts();
    for (const c of conflicts) {
      for (const pr of [c.pr1, c.pr2]) {
        if (pr.ticketIdentifier && nodes.has(pr.ticketIdentifier)) {
          conflictIds.add(pr.ticketIdentifier);
          const node = nodes.get(pr.ticketIdentifier)!;
          node.context = `## Merge Conflict\n${c.files.join(', ')}`;
          if (node.state.status === 'done') { node.state.status = 'pending'; node.state.error = null; }
        }
      }
    }
    const baseConflicts = await findBaseConflictPRs();
    for (const [id, msg] of baseConflicts) {
      if (nodes.has(id)) {
        conflictIds.add(id);
        const node = nodes.get(id)!;
        node.context = `## Base Conflict\n${msg}`;
        if (node.state.status === 'done') { node.state.status = 'pending'; node.state.error = null; }
      }
    }
  } catch {}

  // Skip merged/clean PRs
  if (nodes) {
    for (const [id, node] of nodes) {
      if (node.state.status === 'done' && node.state.prUrl) {
        try {
          if (await isPRMerged(id)) {
            node.state.status = 'merged';
            transitionTicket(node.ticket.id, 'Done').catch(() => {});
            console.log(`  ${id}: PR merged → marked Done in Linear`);
            continue;
          }
          if (await isPRClean(id)) continue;
          node.state.status = 'pending';
          node.state.error = null;
        } catch {}
      }
    }
  }

  // Check incomplete PR headers
  try {
    const incomplete = await findIncompletePRs();
    for (const issue of incomplete) {
      if (issue.ticketId && nodes?.has(issue.ticketId)) {
        const node = nodes.get(issue.ticketId)!;
        if (node.state.status === 'done') {
          node.state.status = 'pending';
          node.context = `## Incomplete PR\nMissing: ${issue.missingHeaders.join(', ')}`;
        }
      }
    }
  } catch {}
}

function dispatchNext(): void {
  if (!nodes) return;
  const queue = buildQueue(nodes, reviewIds, conflictIds);
  if (queue.length === 0) return;

  for (const entry of queue) {
    for (let w = 1; w <= maxAgents; w++) {
      if (isWorkerIdle(w)) {
        const node = entry.node;
        const prompt = `You are working on Linear ticket ${node.ticket.identifier}: "${node.ticket.title}"\n\n## Ticket Description\n${node.ticket.description}`;
        dispatchWorker(w, node.ticket.identifier, node.state.worktreePath, prompt, node.context);
        node.state.status = 'in_progress';
        break;
      }
    }
  }
  saveFullState(nodes);
}

// ─── Webhook handler ─────────────────────────────────────────────────

let webhookPort = 0;
function startWebhooks(): void {
  const config = getAgentConfig();
  const st = loadState();
  const used = new Set(st?.usedPorts ?? []);
  for (let p = config.portMin; p <= config.portMax; p++) {
    if (!used.has(p)) { webhookPort = p; used.add(p); break; }
  }
  if (webhookPort > 0) {
    startWebhookServer(webhookPort, async (event) => {
      if (event.type === 'pr_synchronize' || event.type === 'pr_opened') {
        await scanPRs();
        dispatchNext();
      }
      if (event.type === 'pr_comment' && event.ticketId) {
        reviewIds.add(event.ticketId);
        dispatchNext();
      }
    });
    startNgrokTunnel(webhookPort).then(url => {
      registerWebhook(url || `http://localhost:${webhookPort}`);
    }).catch(() => {});
  }
}

// ─── Main loop ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Ticket Agent Controller\n');

  const ticketId = await pickTicket();
  console.log(`\nLoading ${ticketId} and dependency graph...\n`);

  const existingState = loadState();
  const result = await buildGraph(ticketId, existingState);
  nodes = result.nodes;

  console.log(`Loaded ${nodes.size} tickets:`);
  for (const [id, node] of nodes) {
    console.log(`  ${id.padEnd(10)} ${node.state.status.padEnd(10)} ${node.ticket.title.slice(0, 50)}`);
  }

  // Start webhooks
  startWebhooks();

  // Initial PR scan
  console.log('\nScanning PRs for comments and conflicts...');
  await scanPRs();

  // Dispatch initial work
  dispatchNext();

  console.log('\nController running. Press Ctrl+C to stop.\n');
  console.log('Workers are in tmux panes 1-3 (interactive pi sessions).');
  console.log('Dispatched prompts appear in the worker pane as typed text.\n');

  // Poll worker status and dispatch new work
  setInterval(() => {
    pollWorkerStatus();
    dispatchNext();
  }, 5000);

  // Cleanup on exit
  const cleanup = async () => {
    console.log('\nShutting down...');
    stopWebhookServer();
    try { await unregisterWebhooks(); } catch {}
    if (nodes) { killAllWorkers(nodes); saveFullState(nodes); }
    // Kill the entire tmux session
    cp.execSync(`tmux kill-session -t ${TMUX_SESSION} 2>/dev/null`, { stdio: 'ignore' });
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
