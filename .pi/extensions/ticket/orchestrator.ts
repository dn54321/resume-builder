/*
 * ⚠️ WARNING — State merge and worktree recovery are critical.
 *
 * Two bugs caused catastrophic restart loops (tickets re-spawned
 * indefinitely despite being complete):
 *
 * 1. saveFullState was REPLACING the entire tickets object instead of
 *    MERGING with existing state. When multiple epics are loaded
 *    sequentially, each addEpic() call's saveAllState() would wipe out
 *    state from previously-loaded epics, causing already-done tickets
 *    to revert to 'pending' and re-spawn.
 *    Fix: saveFullState now merges with existing tickets when called
 *    with merge=true (see saveAllState in server-daemon.ts).
 *    Commits: 19826dd, 432710d, 6dc5b82, 028b819
 *
 * 2. When a server restarts and encounters tickets with dead PIDs,
 *    or when the state file has no record for a ticket at all, the
 *    code would default to 'pending' without checking whether the
 *    worktree already has committed work. This caused already-complete
 *    tickets to be re-spawned on every server restart.
 *    Fix: hasExistingWork() checks git rev-list on the worktree branch.
 *    If commits exist beyond the base branch, the ticket is marked
 *    'done' regardless of saved state.
 *
 * DO NOT remove the hasExistingWork checks or the merge parameter
 * without understanding the above failure modes.
 */

/**
 * Orchestrator: manages the dependency graph, spawns workers,
 * monitors completion, and advances the pipeline.
 */

import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  TicketInfo,
  TicketState,
  OrchestratorState,
  GraphNode,
} from './types';
import { fetchTicketByIdentifier, fetchChildren, transitionTicket } from './linear';
import { cacheTicket, getCachedTicket, getCachedChildren } from './ticket-cache';
import {
  getRepoRoot,
  getDefaultBranch,
  ensureWorktree,
  syncWorktree,
  commitAll,
  pushBranch,
  createPR,
  createPRViaApi,
  hasGhCLI,
  branchName,
  getGitHubRepo,
  removeWorktree,
} from './git';

// ─── Worker Prompt Template ──────────────────────────────────────────

let WORKER_PROMPT_TEMPLATE: string | null = null;

function getWorkerPromptTemplate(): string {
  if (WORKER_PROMPT_TEMPLATE) return WORKER_PROMPT_TEMPLATE;
  WORKER_PROMPT_TEMPLATE = fs.readFileSync(
    path.join(getRepoRoot(), '.pi', 'extensions', 'ticket', 'worker-prompt.md'),
    'utf-8',
  );
  return WORKER_PROMPT_TEMPLATE;
}

// ─── Agent Config (.env.agent) ──────────────────────────────────────

function loadAgentConfig(): { maxAgents: number; maxRetries: number; portMin: number; portMax: number; githubToken: string | null } {
  const defaults = { maxAgents: 3, maxRetries: 2, portMin: 9000, portMax: 9099, githubToken: null as string | null };
  try {
    const envPath = path.join(getRepoRoot(), '.env.agent');
    if (!fs.existsSync(envPath)) return defaults;
    const raw = fs.readFileSync(envPath, 'utf-8');
    const config: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      config[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
    const maxAgents = parseInt(config['MAX_SPAWN_AGENTS'] ?? '', 10) || defaults.maxAgents;
    const maxRetries = parseInt(config['MAX_AGENT_RETRIES'] ?? '', 10) || defaults.maxRetries;
    const portMin = parseInt(config['AGENT_PORT_MIN'] ?? '', 10) || defaults.portMin;
    const portMax = parseInt(config['AGENT_PORT_MAX'] ?? '', 10) || defaults.portMax;
    const githubToken = config['GITHUB_PAT_KEY']?.trim() || null;
    if (portMax <= portMin) {
      console.error(`AGENT_PORT_MAX (${portMax}) must be greater than AGENT_PORT_MIN (${portMin}). Using defaults.`);
      return defaults;
    }
    return { maxAgents, maxRetries, portMin, portMax, githubToken };
  } catch {
    return defaults;
  }
}

export function getAgentConfig() {
  return loadAgentConfig();
}

// ─── Port Management ────────────────────────────────────────────────

function allocatePort(state: OrchestratorState): number | null {
  const config = loadAgentConfig();
  const used = new Set(state.usedPorts ?? []);
  for (let port = config.portMin; port <= config.portMax; port++) {
    if (!used.has(port)) {
      state.usedPorts.push(port);
      return port;
    }
  }
  return null; // No ports available
}

function releasePort(state: OrchestratorState, port: number | null): void {
  if (port === null) return;
  state.usedPorts = (state.usedPorts ?? []).filter((p) => p !== port);
}

/** Directory for all ticket state. */
function ticketDir(): string {
  const dir = path.join(getRepoRoot(), '.pi', 'tickets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function worktreesDir(): string {
  const dir = path.join(getRepoRoot(), '.pi', 'tickets', 'worktrees');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function logsDir(): string {
  const dir = path.join(getRepoRoot(), '.pi', 'tickets', 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function statePath(): string {
  return path.join(ticketDir(), 'state.json');
}

export function loadState(): OrchestratorState | null {
  try {
    const raw = fs.readFileSync(statePath(), 'utf-8');
    return JSON.parse(raw) as OrchestratorState;
  } catch {
    return null;
  }
}

function saveState(state: OrchestratorState): void {
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf-8');
}

/** Build the full dependency graph starting from a ticket identifier. */
export async function buildGraph(
  rootIdentifier: string,
  existingState: OrchestratorState | null,
): Promise<{ nodes: Map<string, GraphNode>; root: GraphNode }> {
  const fetched = new Map<string, TicketInfo>();

  async function fetchRecursive(identifier: string): Promise<TicketInfo> {
    if (fetched.has(identifier)) return fetched.get(identifier)!;

    // Try Linear API first, fall back to ticket cache
    let ticket: TicketInfo | null = null;
    let fromCache = false;
    try {
      ticket = await fetchTicketByIdentifier(identifier);
    } catch (err: any) {
      // Rate limited or network error — try cache
      if (err.message?.includes('Rate limit') || err.message?.includes('429') || err.message?.includes('fetch failed')) {
        ticket = getCachedTicket(identifier);
        fromCache = ticket !== null;
      }
      if (!ticket) throw err; // Re-throw if no cache fallback
    }

    if (!ticket) throw new Error(`Ticket not found: ${identifier}`);
    fetched.set(identifier, ticket);

    // Cache successfully fetched tickets for future restarts
    if (!fromCache) {
      cacheTicket(ticket);
    }

    // Discover dependencies via ref: lines
    for (const ref of ticket.refs) {
      await fetchRecursive(ref);
    }

    // Discover children (issues parented under this one)
    let children: TicketInfo[] = [];
    if (fromCache) {
      // Use cached children mapping
      const childIds = getCachedChildren(ticket.id);
      for (const childId of childIds) {
        const cached = getCachedTicket(childId);
        if (cached && !fetched.has(childId)) {
          children.push(cached);
        }
      }
    } else {
      try {
        children = await fetchChildren(ticket.id);
        // Cache children for future use
        for (const child of children) {
          cacheTicket(child);
        }
      } catch {
        // Fall back to cache
        const childIds = getCachedChildren(ticket.id);
        for (const childId of childIds) {
          const cached = getCachedTicket(childId);
          if (cached && !fetched.has(childId)) {
            children.push(cached);
          }
        }
      }
    }

    for (const child of children) {
      if (!fetched.has(child.identifier)) {
        fetched.set(child.identifier, child);
        // Recurse into children's refs
        for (const ref of child.refs) {
          await fetchRecursive(ref);
        }
      }
    }

    return ticket;
  }

  await fetchRecursive(rootIdentifier);

  // Build graph nodes
  const nodes = new Map<string, GraphNode>();

  for (const [, ticket] of fetched) {
    let existing = existingState?.tickets[ticket.identifier];
    // If no saved state exists, check if the worktree already has commits.
    // This handles the case where state was wiped (e.g., by a previous bug)
    // but the worker had already completed the work.
    if (!existing) {
      const candidateWorktree = path.join(worktreesDir(), ticket.identifier);
      if (fs.existsSync(candidateWorktree) && hasExistingWork(candidateWorktree, getDefaultBranch())) {
        existing = {
          identifier: ticket.identifier,
          status: 'done',
          branch: branchName(ticket.identifier),
          worktreePath: candidateWorktree,
          logPath: path.join(logsDir(), `${ticket.identifier}.log`),
          pid: null,
          prUrl: null,
          startedAt: null,
          finishedAt: new Date().toISOString(),
          error: 'Recovered from worktree — work was already committed',
          assignedPort: null,
          retryCount: 0,
          workerName: null,
        };
      }
    }
    const state: TicketState = existing ?? {
      identifier: ticket.identifier,
      status: 'pending',
      branch: branchName(ticket.identifier),
      worktreePath: '',
      logPath: path.join(logsDir(), `${ticket.identifier}.log`),
      pid: null,
      prUrl: null,
      startedAt: null,
      finishedAt: null,
      error: null,
      assignedPort: null,
      retryCount: 0,
      workerName: null,
    };
    nodes.set(ticket.identifier, { ticket, state, dependencies: [], dependents: [] });
  }

  // Wire dependencies
  for (const [, node] of nodes) {
    for (const ref of node.ticket.refs) {
      const dep = nodes.get(ref);
      if (dep) {
        node.dependencies.push(dep);
        dep.dependents.push(node);
      }
    }
  }

  // Set initial statuses
  const config = loadAgentConfig();
  for (const [, node] of nodes) {
    // Retry failed tickets that still have attempts left
    if (node.state.status === 'in_progress') {
      // Check if the process is still alive
      if (node.state.pid) {
        try {
          process.kill(node.state.pid, 0); // signal 0 = check existence
        } catch {
          // Process not running — check if work was already done
          if (node.state.worktreePath && hasExistingWork(node.state.worktreePath, getDefaultBranch())) {
            // Worktree has commits — the worker finished but the server
            // died before marking it 'done'. Treat as done.
            node.state.status = 'done';
            node.state.pid = null;
            node.state.error = 'Worker process died but work exists — marking done';
            pruneWorktree(node);
          } else {
            node.state.status = 'failed';
            node.state.pid = null;
            node.state.error = 'Worker process died unexpectedly';
          }
        }
      } else {
        // No pid recorded — check if work was already committed
        if (node.state.worktreePath && hasExistingWork(node.state.worktreePath, getDefaultBranch())) {
          node.state.status = 'done';
          node.state.error = 'Orphaned assignment but work exists — marking done';
          pruneWorktree(node);
        } else {
          node.state.status = 'pending';
          node.state.pid = null;
          node.state.workerName = null;
          node.state.startedAt = null;
        }
      }
    }
    if (node.state.status === 'failed' && node.state.retryCount <= config.maxRetries) {
      // If the worktree already has commits, the work was done and the
      // failure is spurious (e.g., server shutdown). Don't retry.
      if (node.state.worktreePath && hasExistingWork(node.state.worktreePath, getDefaultBranch())) {
        node.state.status = 'done';
        node.state.error = 'Work exists despite failed status — marking done';
        pruneWorktree(node);
      } else {
        node.state.status = 'pending';
        node.state.error = null;
        node.state.pid = null;
        node.state.finishedAt = null;
        // retryCount is NOT incremented here — it's incremented in spawnWorker
        // so we can track per-spawn-attempt, not per-buildGraph-call.
      }
    }
    if (node.state.status === 'pending' || node.state.status === 'blocked') {
      const allDepsDone = node.dependencies.every(
        (d) => d.state.status === 'done',
      );
      node.state.status = allDepsDone ? 'pending' : 'blocked';
    }
  }

  const root = nodes.get(rootIdentifier);
  if (!root) throw new Error(`Root ticket not found: ${rootIdentifier}`);

  return { nodes, root };
}

/** Determine which tickets are ready to start (all deps done, not already running/done/failed). */
export function readyTickets(nodes: Map<string, GraphNode>): GraphNode[] {
  const ready: GraphNode[] = [];
  // Build set of ticket IDs that are parents (epics with children in the graph)
  const parentIds = new Set<string>();
  for (const [, node] of nodes) {
    if (node.ticket.parentId) {
      parentIds.add(node.ticket.parentId);
    }
  }
  for (const [, node] of nodes) {
    // Skip parent epics — they have no implementation work
    if (parentIds.has(node.ticket.id)) continue;
    if (node.state.status === 'pending' || node.state.status === 'blocked') {
      const allDepsDone = node.dependencies.every(
        (d) => d.state.status === 'done',
      );
      if (allDepsDone) {
        node.state.status = 'pending';
        ready.push(node);
      } else {
        node.state.status = 'blocked';
      }
    }
  }
  return ready;
}

/** Spawn a worker pi process for a single ticket.
 * @param headless - If true, runs standalone: no intercom skill, just execute task and exit.
 *                   agentName is still used for tracking.
 */
export function spawnWorker(
  node: GraphNode,
  extraInstructions?: string,
  perWorkerInstructions?: string,
  agentName?: string,
  headless?: boolean,
): cp.ChildProcess {
  const identifier = node.ticket.identifier;
  const repoRoot = getRepoRoot();
  const baseBranch = getDefaultBranch();
  const wd = worktreesDir();

  // Ensure worktree exists
  const { worktreePath, created } = ensureWorktree(repoRoot, identifier, baseBranch, wd);
  node.state.worktreePath = worktreePath;
  node.state.logPath = path.join(logsDir(), `${identifier}.log`);

  // Allocate a port for this worker
  const existingState = loadState();
  const config = getAgentConfig();
  const portState: OrchestratorState = existingState ?? { tickets: {}, startedAt: new Date().toISOString(), teamId: '', teamKey: '', usedPorts: [] };
  const assignedPort = allocatePort(portState);
  saveState(portState);
  node.state.assignedPort = assignedPort;

  // Ensure log file
  const logStream = fs.createWriteStream(node.state.logPath, { flags: 'a' });

  // Sync worktree (skip on retry — preserve partial work from failed attempt)
  const isRetry = node.state.retryCount > 0;
  if (!created && !isRetry) {
    syncWorktree(worktreePath, baseBranch);
  }

  // If this is a retry, append the previous agent's log as context
  let retryContext = '';
  if (isRetry) {
    try {
      const prevLog = fs.readFileSync(node.state.logPath, 'utf-8');
      // Extract the agent's actual output (skip orchestrator bookkeeping lines)
      const agentOutput = prevLog.split('\n')
        .filter(l => !l.startsWith('[20')) // skip timestamp lines
        .slice(-40).join('\n');
      retryContext = `\n\n## Previous Attempt (retry #${node.state.retryCount})\nThe previous agent failed. Its output is below.\nFix the issue that caused the failure before proceeding with the ticket.\n\n<previous-agent-output>\n${agentOutput}\n</previous-agent-output>\n`;
    } catch { /* ignore */ }
  }
  node.state.retryCount += 1;

  // Build the worker prompt
  let prompt = buildWorkerPrompt(node, assignedPort, config, extraInstructions, perWorkerInstructions) + retryContext;
  if (agentName && !headless) {
    prompt = `You are ${agentName}. /name ${agentName}. Use the worker-intercom skill.

` + prompt;
  } else if (headless) {
    // Headless workers just execute and exit — no intercom needed.
    // They get their task in the prompt and state is tracked via process exit code.
    prompt = `You are a headless worker. Execute the task below, then exit 0 on success or 1 on failure.
Do NOT use intercom, register, or wait for tasks — just implement the ticket and exit.

` + prompt;
  }

  // Spawn pi process. cwd is set via cp.spawn options, not a CLI flag.
  const piArgs: string[] = [
    '-p',
    '--no-session',
    prompt,
  ];

  const invocation = getPiInvocation(piArgs);
  const workerEnv: Record<string, string> = { ...process.env as Record<string, string> };
  if (assignedPort !== null) {
    workerEnv['AGENT_PORT'] = String(assignedPort);
    workerEnv['AGENT_PORT_MIN'] = String(config.portMin);
    workerEnv['AGENT_PORT_MAX'] = String(config.portMax);
  }

  const proc = cp.spawn(invocation.command, invocation.args, {
    cwd: worktreePath,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: workerEnv,
  });

  node.state.status = 'in_progress';
  node.state.pid = proc.pid ?? null;
  node.state.startedAt = new Date().toISOString();
  node.state.finishedAt = null;
  node.state.error = null;

  // Transition Linear ticket to "In Progress" (fire-and-forget)
  transitionTicket(node.ticket.id, 'In Progress').catch(() => {});

  // Pipe output to log file
  if (proc.stdout) {
    proc.stdout.pipe(logStream);
  }
  if (proc.stderr) {
    proc.stderr.pipe(logStream);
  }

  // Handle completion — unpipe, end the log stream, wait for it to flush.
  proc.on('close', async (exitCode) => {
    proc.stdout?.unpipe(logStream);
    proc.stderr?.unpipe(logStream);
    logStream.end();
    await new Promise<void>((resolve) => {
      if (logStream.writableFinished) {
        resolve();
      } else {
        logStream.on('finish', resolve);
      }
    });
    await onWorkerComplete(node, worktreePath, exitCode ?? 1);
  });

  proc.on('error', async (err) => {
    logStream.end();
    node.state.error = err.message;
    node.state.status = 'failed';
    node.state.finishedAt = new Date().toISOString();
    saveStateSnapshot(node);
  });

  logStream.write(`[${new Date().toISOString()}] Worker started for ${identifier}\n`);
  logStream.write(`[${new Date().toISOString()}] Worktree: ${worktreePath}\n`);
  logStream.write(`[${new Date().toISOString()}] Cmd: ${invocation.command} ${invocation.args[0] ?? ''} ${invocation.args[1] ?? ''}\n\n`);

  return proc;
}

function findPiBinary(): string | null {
  // Try common locations for 'pi'
  const candidates = [
    'pi',
    `${process.env.HOME ?? ''}/.local/share/pnpm/bin/pi`,
    `${process.env.HOME ?? ''}/.local/bin/pi`,
    '/usr/local/bin/pi',
  ];
  for (const candidate of candidates) {
    try {
      const result = cp.spawnSync(candidate, ['--version'], { encoding: 'utf-8', timeout: 3000 });
      if (result.status === 0) return candidate;
    } catch { /* try next */ }
  }
  // Fallback: try npx
  return 'npx';
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  // Always use the pi binary for workers, never re-invoke the server.
  const pi = findPiBinary();
  if (pi === 'npx') {
    return { command: 'npx', args: ['pi', ...args] };
  }
  return { command: pi, args: args };
}

/** Build a context section showing the worker's current git state. */
function buildStateContext(node: GraphNode): string {
  const wt = node.state.worktreePath;
  if (!wt || !fs.existsSync(wt)) return '';

  const lines: string[] = [];
  lines.push('\n## Current Workspace State');

  try {
    // Branch
    const branch = cp.spawnSync('git', ['branch', '--show-current'], {
      cwd: wt, encoding: 'utf-8', timeout: 3000,
    });
    if (branch.stdout?.trim()) {
      lines.push(`- **Branch:** \`${branch.stdout.trim()}\``);
    }
  } catch { /* ignore */ }

  try {
    // Worktree path relative to repo
    lines.push(`- **Worktree:** ${wt}`);
  } catch { /* ignore */ }

  try {
    // Git status summary
    const status = cp.spawnSync('git', ['status', '--short'], {
      cwd: wt, encoding: 'utf-8', timeout: 3000,
    });
    const statusLines = status.stdout?.trim().split('\n').filter(Boolean) ?? [];
    if (statusLines.length > 0) {
      const maxShow = 30;
      const shown = statusLines.slice(0, maxShow);
      const suffix = statusLines.length > maxShow ? `\n  ... and ${statusLines.length - maxShow} more files` : '';
      lines.push(`- **Files changed (${statusLines.length}):**`);
      lines.push('```');
      lines.push(shown.join('\n') + suffix);
      lines.push('```');
    } else {
      lines.push('- **Files changed:** (none — clean working directory)');
    }
  } catch { /* ignore */ }

  try {
    // Last commit
    const log = cp.spawnSync('git', ['log', '-1', '--oneline', '--decorate'], {
      cwd: wt, encoding: 'utf-8', timeout: 3000,
    });
    if (log.stdout?.trim()) {
      lines.push(`- **Last commit:** \`${log.stdout.trim()}\``);
    }
  } catch { /* ignore */ }

  try {
    // Staged changes
    const staged = cp.spawnSync('git', ['diff', '--cached', '--stat'], {
      cwd: wt, encoding: 'utf-8', timeout: 3000,
    });
    if (staged.stdout?.trim()) {
      lines.push(`- **Staged for commit:**\n\`\`\`\n${staged.stdout.trim()}\n\`\`\``);
    }
  } catch { /* ignore */ }

  if (node.state.prUrl) {
    lines.push(`- **Pull Request:** ${node.state.prUrl}`);
  }

  // Previous worker error/status (on retries)
  if (node.state.error) {
    lines.push(`- **Previous attempt:** ${node.state.error}`);
  }

  return lines.join('\n') + '\n';
}

function buildWorkerPrompt(
  node: GraphNode,
  assignedPort: number | null,
  config: { maxAgents: number; portMin: number; portMax: number },
  extraInstructions?: string,
  perWorkerInstructions?: string,
): string {
  const ticket = node.ticket;
  const depIds = ticket.refs.length > 0 ? ticket.refs.join(', ') : 'none';

  let portSection = '';
  if (assignedPort !== null) {
    portSection = `
## Assigned Port: ${assignedPort}

You have been assigned port **${assignedPort}** from the agent port pool (range: ${config.portMin}–${config.portMax}).
Use this port when you need to spin up a server, run e2e tests against a specific port, or bind any local service.

The environment variable \`AGENT_PORT=${assignedPort}\` is already set in your shell. You can reference it directly.

### Using Docker Compose

You can use docker compose with environment variable substitution to spin up services on your assigned port.
Example \`docker-compose.yml\`:

\`\`\`yaml
services:
  server:
    build: .
    ports:
      - "\${AGENT_PORT:-9000}:\${AGENT_PORT:-9000}"
    environment:
      - PORT=\${AGENT_PORT:-9000}
\`\`\`

Run with:
\`\`\`bash
AGENT_PORT=\${AGENT_PORT} docker compose up -d
\`\`\`

When you are finished with any services you started on this port, shut them down:
\`\`\`bash
docker compose down
\`\`\`
`;
  }

  let extraSection = '';
  if (extraInstructions) {
    extraSection = `
## Additional Instructions from User

${extraInstructions}
`;
  }

  let perWorkerSection = '';
  if (perWorkerInstructions) {
    perWorkerSection = `
## Follow-up Instructions for This Ticket

${perWorkerInstructions}
`;
  }

  return `You are working on Linear ticket ${ticket.identifier}: "${ticket.title}"

Dependencies: ${depIds}
${portSection}${perWorkerSection}${buildStateContext(node)}
## Ticket Description
${ticket.description}

${getWorkerPromptTemplate()}${extraSection}`;
}

/** Extract the PR summary from the agent's log output, delimited by HTML comment markers. */
function extractPRSummary(logPath: string, ticket: TicketInfo): string {
  // Read PR body from pr-body.md in the worktree (agent writes it directly)
  const worktreePath = logPath.replace('/logs/', '/worktrees/').replace(/\.log$/, '');
  const prFile = `${worktreePath}/pr-body.md`;
  try {
    if (fs.existsSync(prFile)) {
      const content = fs.readFileSync(prFile, 'utf-8').trim();
      if (content.length > 50) return content;
    }
  } catch { /* not found or empty */ }

  // Fallback: try extracting from log (old agents that don't know about pr-body.md)
  try {
    const content = fs.readFileSync(logPath, 'utf-8');
    const start = content.lastIndexOf('<!-- PR_SUMMARY_START -->');
    const end = content.lastIndexOf('<!-- PR_SUMMARY_END -->');
    if (start !== -1 && end !== -1 && end > start) {
      const raw = content.slice(start + '<!-- PR_SUMMARY_START -->'.length, end).trim();
      if (raw.length > 50) return raw;
    }
  } catch { /* fall through */ }

  return `## ${ticket.title}\n\nCloses ${ticket.identifier}\n\n**Note:** No PR body found in agent output.`;
}

/** Find an existing PR for a branch and update its body. */
async function updateExistingPR(
  node: GraphNode,
  body: string,
): Promise<string | null> {
  try {
    const config = loadAgentConfig();
    if (!config.githubToken) return null;
    const repo = getGitHubRepo();
    if (!repo) return null;
    const resp = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/pulls?head=${repo.owner}:${node.state.branch}&state=open`,
      { headers: { Authorization: `Bearer ${config.githubToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } },
    );
    if (!resp.ok) return null;
    const prs = await resp.json() as any[];
    if (!prs || prs.length === 0) return null;
    const updateResp = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/pulls/${prs[0].number}`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${config.githubToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) },
    );
    if (updateResp.ok) return prs[0].html_url as string;
  } catch { /* ignore */ }
  return null;
}

async function onWorkerComplete(
  node: GraphNode,
  worktreePath: string,
  exitCode: number,
): Promise<void> {
  const identifier = node.ticket.identifier;

  if (exitCode === 0) {
    // Commit changes
    const hasChanges = !isCleanCheck(worktreePath);
    if (hasChanges) {
      const commitMsg = `${node.ticket.title}\n\nCloses ${identifier}`;
      commitAll(worktreePath, commitMsg);
      pushBranch(worktreePath, node.state.branch);

      // Build PR body with dependency info
      const prBody = extractPRSummary(node.state.logPath, node.ticket);
      let prUrl: string | null = null;
      const depIds = node.dependencies.map(d => d.ticket.identifier);
      // Fetch PR URLs for each dependency
      let depSection = '';
      if (depIds.length > 0) {
        const depLinks: string[] = [];
        for (const dep of node.dependencies) {
          const url = dep.state.prUrl;
          depLinks.push(url
            ? `- [${dep.ticket.identifier}](${url}) — ${dep.ticket.title}`
            : `- ${dep.ticket.identifier} — ${dep.ticket.title}`);
        }
        depSection = `\n## Dependencies\n${depLinks.join('')}\n\n**Do not merge before:** ${depIds.join(', ')}\n`;
      }
      const fullPrBody = depSection + prBody;

      // Create PR: try gh CLI first, fall back to GitHub API
      const baseBranch = getDefaultBranch();
      if (hasGhCLI()) {
        const pr = createPR(worktreePath, node.state.branch, node.ticket.title, fullPrBody, baseBranch);
        prUrl = pr.url;
      } else {
        const config = getAgentConfig();
        if (config.githubToken) {
          const pr = await createPRViaApi(worktreePath, node.state.branch, node.ticket.title, fullPrBody, baseBranch, config.githubToken);
          prUrl = pr.url;
          if (!prUrl) {
            // PR creation failed — maybe it already exists, try updating
            try {
              prUrl = await updateExistingPR(node, fullPrBody);
              if (prUrl) {
                const ls = fs.createWriteStream(node.state.logPath, { flags: 'a' });
                ls.write(`\n[${new Date().toISOString()}] PR updated: ${prUrl}\n`);
                ls.end();
              }
            } catch { /* ignore */ }
            if (!prUrl) {
              const logStream = fs.createWriteStream(node.state.logPath, { flags: 'a' });
              logStream.write(`\n[${new Date().toISOString()}] PR creation failed: ${pr.error}\n`);
              logStream.end();
            }
          }
        }
      }
      if (prUrl) {
        node.state.prUrl = prUrl;
      }
    }

    // Update Linear ticket with discoveries/blockers from the log
    try {
      const logContent = fs.readFileSync(node.state.logPath, 'utf-8');
      const lastLines = logContent.split('\n').slice(-30).join('\n');
      updateLinearTicket(node.ticket.id, lastLines);
    } catch {
      // best effort
    }

    // Transition Linear ticket to "Done"
    transitionTicket(node.ticket.id, 'Done').catch(() => {});

    node.state.status = 'done';
    node.state.finishedAt = new Date().toISOString();
    node.state.pid = null;

    // Prune the worktree now that the ticket is complete
    pruneWorktree(node);

    // Release the assigned port
    if (node.state.assignedPort !== null) {
      const st = loadState();
      if (st) {
        releasePort(st, node.state.assignedPort);
        saveState(st);
      }
    }
  } else if (exitCode === 143 || exitCode === 137) {
    // Killed externally (SIGTERM/SIGKILL) — don't count as failure, just reset
    node.state.status = 'pending';
    node.state.pid = null;
    node.state.finishedAt = null;
    node.state.error = `Worker killed (signal ${exitCode - 128}) — will resume`;
  } else {
    const config = getAgentConfig();
    // If the worktree already has commits on this branch, the worker
    // likely completed its work but hit a non-fatal issue (e.g., PR
    // already exists). Don't retry — mark as done.
    if (hasExistingWork(worktreePath, getDefaultBranch())) {
      node.state.status = 'done';
      node.state.finishedAt = new Date().toISOString();
      node.state.pid = null;
      node.state.error = `Worker exited with code ${exitCode} but work exists — marking done`;
      pruneWorktree(node);
      if (node.state.assignedPort !== null) {
        const st = loadState();
        if (st) {
          releasePort(st, node.state.assignedPort);
          saveState(st);
        }
      }
    } else if (node.state.retryCount <= config.maxRetries) {
      node.state.status = 'pending';
      node.state.pid = null;
      node.state.finishedAt = null;
      node.state.error = `Worker exited with code ${exitCode} (retry ${node.state.retryCount}/${config.maxRetries})`;
    } else {
      let logTail = '';
      try {
        const logContent = fs.readFileSync(node.state.logPath, 'utf-8');
        logTail = '\n--- Agent output (last 20 lines) ---\n' +
          logContent.split('\n').slice(-20).join('\n');
      } catch { /* log may not exist yet */ }
      node.state.status = 'failed';
      node.state.finishedAt = new Date().toISOString();
      node.state.pid = null;
      node.state.error = `Worker exited with code ${exitCode} (exhausted ${config.maxRetries} retries)${logTail}`;

      updateLinearTicket(
        node.ticket.id,
        `❌ Worker failed after ${config.maxRetries + 1} attempts.\n\n**Error:** ${node.state.error}`,
      ).catch(() => {});

      // Release port on final failure
      if (node.state.assignedPort !== null) {
        const st = loadState();
        if (st) {
          releasePort(st, node.state.assignedPort);
          saveState(st);
        }
      }
    }
  }

  // Append completion note to log
  const logStream = fs.createWriteStream(node.state.logPath, { flags: 'a' });
  logStream.write(`\n[${new Date().toISOString()}] Worker finished. Status: ${node.state.status}\n`);
  if (node.state.prUrl) {
    logStream.write(`[${new Date().toISOString()}] PR: ${node.state.prUrl}\n`);
  }
  logStream.end();

  saveStateSnapshot(node);
  node._onComplete?.();
}

function isCleanCheck(worktreePath: string): boolean {
  try {
    const result = cp.spawnSync('git', ['status', '--porcelain'], {
      cwd: worktreePath,
      encoding: 'utf-8',
      timeout: 5000,
    });
    return result.stdout?.trim() === '';
  } catch {
    return true;
  }
}

/** Check if the worktree branch has commits not on the base branch.
 *  Returns true if meaningful work has been committed. */
function hasExistingWork(worktreePath: string, baseBranch: string): boolean {
  try {
    const result = cp.spawnSync(
      'git',
      ['rev-list', '--count', `${baseBranch}..HEAD`],
      { cwd: worktreePath, encoding: 'utf-8', timeout: 5000 },
    );
    const count = parseInt(result.stdout?.trim() ?? '0', 10);
    return !isNaN(count) && count > 0;
  } catch {
    return false;
  }
}

/** Prune a worktree after the ticket is complete. Best-effort, never throws. */
function pruneWorktree(node: GraphNode): void {
  const wt = node.state.worktreePath;
  if (!wt || !fs.existsSync(wt)) return;
  try {
    const repoRoot = getRepoRoot();
    removeWorktree(repoRoot, wt, node.state.branch);
  } catch {
    // Best effort — worktree cleanup is not critical
  }
}

async function updateLinearTicket(issueId: string, summary: string): Promise<void> {
  try {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) return;

    await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `mutation CreateComment($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`,
        variables: {
          input: {
            issueId,
            body: `## Worker Summary\n\n${summary}`,
          },
        },
      }),
    });
  } catch {
    // best effort
  }
}

/** Save a snapshot of a single node's state. */
function saveStateSnapshot(node: GraphNode): void {
  const existing = loadState();
  const tickets: Record<string, TicketState> = existing?.tickets ?? {};
  tickets[node.ticket.identifier] = { ...node.state };
  saveState({
    tickets,
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    teamId: existing?.teamId ?? '',
    teamKey: existing?.teamKey ?? '',
    usedPorts: existing?.usedPorts ?? [],
  });
}

/** Save full state from the graph. */
export function saveFullState(nodes: Map<string, GraphNode>, merge?: boolean): void {
  const tickets: Record<string, TicketState> = {};
  for (const [, node] of nodes) {
    tickets[node.ticket.identifier] = { ...node.state };
  }
  const existing = loadState();
  // Merge with existing tickets so state from previously-processed epics
  // is preserved when epics are loaded sequentially (avoids wipe-and-respawn).
  const mergedTickets = merge ? { ...existing?.tickets, ...tickets } : tickets;
  saveState({
    tickets: mergedTickets,
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    teamId: existing?.teamId ?? '',
    teamKey: existing?.teamKey ?? '',
    usedPorts: existing?.usedPorts ?? [],
  });
}

/** Kill a single running worker without marking it failed (for preemption). */
export function killSingleWorker(node: GraphNode): void {
  if (node.state.status === 'in_progress' && node.state.pid) {
    try { process.kill(node.state.pid, 'SIGTERM'); } catch { /* already dead */ }
    node.state.status = 'blocked';
    node.state.pid = null;
    node.state.error = 'Preempted — will resume when unblocked';
    node.state.finishedAt = null;
  }
}

/** Kill all running workers. */
export function killAllWorkers(nodes: Map<string, GraphNode>): void {
  for (const [, node] of nodes) {
    if (node.state.status === 'in_progress' && node.state.pid) {
      try {
        process.kill(node.state.pid, 'SIGTERM');
      } catch {
        // already dead
      }
      node.state.status = 'failed';
      node.state.error = 'Killed by orchestrator shutdown';
    }
  }
}

/** Attach an onComplete callback to the graph node. Used for orchestrator notifications. */
export function patchNode(node: GraphNode, onComplete: () => void): void {
  node._onComplete = onComplete;
}

/**
 * Send a user prompt to a specific worker.
 * If the worker is running, it kills it and restarts with the new prompt.
 * Appends the prompt to the worker's log and resets its state to pending.
 */
export function sendPromptToWorker(
  node: GraphNode,
  message: string,
  spawnFn: (node: GraphNode, perWorkerInstructions: string) => cp.ChildProcess,
): void {
  // Kill running worker
  if (node.state.status === 'in_progress' && node.state.pid) {
    try { process.kill(node.state.pid, 'SIGTERM'); } catch { /* ignore */ }
  }

  // Append user message to log
  const logStream = fs.createWriteStream(node.state.logPath, { flags: 'a' });
  logStream.write(`\n[${new Date().toISOString()}] 👤 User: ${message}\n`);
  logStream.end();

  // Reset state
  node.state.status = 'pending';
  node.state.pid = null;
  node.state.error = null;
  node.state.finishedAt = null;

  // Spawn with the message as per-worker instructions
  spawnFn(node, message);
}
