/**
 * Agent pool manager.
 * Spawns, monitors, tasks, and kills agents.
 * Manages the persistent banner + worker pane layout (see § Tmux Pane Architecture).
 */

import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import type { AgentInstance, AgentType, GraphNode, TicketInfo } from './types';
import { getConfig } from './config';
import { getStateDir, allocatePort, releasePort } from './state';
import {
  ensureWorktree,
  getRepoRoot,
  getDefaultBranch,
} from '../git/operations';
import { resolveStrategy } from './strategist';
import { IntercomClient } from '../integrations/intercom/client';
import { transitionTicket } from '../integrations/linear/client';
import { PaneManager } from '../tui/pane-manager';

// ─── Pi binary resolution ─────────────────────────────────────────

/**
 * Find the pi binary using the same search logic as atlas.sh.
 * The orchestrator runs as a child of `npx tsx` which has a limited
 * PATH — `which pi` often fails. We must search known locations.
 */
function findPiBinary(): string {
  const candidates = [
    // nvm-managed node (most common for development)
    ...(process.env.HOME ? [
      path.join(process.env.HOME, '.local', 'share', 'nvm'),
    ] : []),
    // pnpm global
    path.join(homedir(), '.local', 'share', 'pnpm', 'bin'),
    // Standard user-local
    path.join(homedir(), '.local', 'bin'),
    // System
    '/usr/local/bin',
  ];

  // Try nvm first (most reliable, avoids PATH-dependent which) — find the latest node version's bin directory
  const nvmBase = path.join(homedir(), '.local', 'share', 'nvm');
  try {
    const versions = fs.readdirSync(nvmBase).filter(d => /^v\d/.test(d)).sort().reverse();
    for (const ver of versions) {
      const piPath = path.join(nvmBase, ver, 'bin', 'pi');
      try {
        fs.accessSync(piPath, fs.constants.X_OK);
        return piPath;
      } catch { /* try next version */ }
    }
  } catch { /* nvm not found */ }

  // Try static paths
  for (const dir of candidates) {
    const piPath = path.join(dir, 'pi');
    try {
      fs.accessSync(piPath, fs.constants.X_OK);
      return piPath;
    } catch { /* try next */ }
  }

  // Last resort
  return 'pi';
}

const PI_BIN = findPiBinary();

// ─── Spawn rate limiter ────────────────────────────────────────────
// Prevent crash-loops: if agents repeatedly fail to spawn or exit
// immediately, back off to avoid thousands of processes.
// Two independent limits:
//  1. Consecutive failure cooldown (soft, resets on success)
//  2. Lifetime spawn cap per agent type (hard, never resets)

const SPAWN_COOLDOWNS = new Map<string, number>(); // agentType → cooldownUntil timestamp
const SPAWN_FAILURES = new Map<string, number>();   // agentType → consecutive failure count
const SPAWN_LIFETIME_COUNT = new Map<string, number>(); // agentType → total spawns this session
const MAX_CONSECUTIVE_FAILURES = 5;
const BASE_COOLDOWN_MS = 1000;  // 1 second base, doubles each failure
const MAX_LIFETIME_SPAWNS: Record<string, number> = {
  worker: 20,       // Hard cap: will not spawn more than 20 workers total per session
  reviewer: 5,
  pr_manager: 5,
};

function canSpawnNow(type: string): boolean {
  // Hard cap: lifetime spawn limit
  const lifetimeMax = MAX_LIFETIME_SPAWNS[type] ?? 10;
  const lifetimeCount = SPAWN_LIFETIME_COUNT.get(type) ?? 0;
  if (lifetimeCount >= lifetimeMax) {
    console.error(`[Pool] ${type} lifetime spawn cap (${lifetimeMax}) reached — refusing to spawn more`);
    return false;
  }
  // Soft cap: cooldown from repeated failures
  const cooldown = SPAWN_COOLDOWNS.get(type);
  if (cooldown && Date.now() < cooldown) return false;
  return true;
}

function recordSpawnFailure(type: string): void {
  const count = (SPAWN_FAILURES.get(type) ?? 0) + 1;
  SPAWN_FAILURES.set(type, count);
  if (count >= MAX_CONSECUTIVE_FAILURES) {
    const backoff = BASE_COOLDOWN_MS * Math.pow(2, Math.min(count - MAX_CONSECUTIVE_FAILURES, 5));
    SPAWN_COOLDOWNS.set(type, Date.now() + backoff);
    console.error(`[Pool] ${type} spawn failing repeatedly — backing off for ${backoff}ms`);
  }
}

function recordSpawnSuccess(type: string): void {
  SPAWN_FAILURES.delete(type);
  SPAWN_COOLDOWNS.delete(type);
}

// ─── Agent Pool ─────────────────────────────────────────────────────

export class AgentPool {
  private agents: Map<string, AgentInstance> = new Map();
  private intercom: IntercomClient;
  private paneManager: PaneManager;
  private nextId = 1;

  constructor(intercom: IntercomClient, paneManager: PaneManager) {
    this.intercom = intercom;
    this.paneManager = paneManager;
  }

  // ─── Spawn ────────────────────────────────────────────────────────

  /**
   * Spawn an agent. When `node` is given (one-shot worker), the task is
   * embedded into the prompt and pi runs in non-interactive `-p` mode:
   * it processes the task, reports completion via intercom (IDLE message),
   * and exits. The pane dies with it (`; exit`), so healthCheck cleans the
   * agent up and the next ready ticket gets a fresh worker.
   */
  async spawn(type: AgentType, node?: GraphNode): Promise<AgentInstance | null> {
    // Rate limit: if spawns are failing, back off
    if (!canSpawnNow(type)) {
      console.log(`[Pool] Spawn cooldown active for ${type} — skipping`);
      return null;
    }

    const config = getConfig();
    const agentDef = config.agents[type];
    if (!agentDef?.enabled) {
      console.log(`[Pool] Agent type "${type}" is disabled`);
      return null;
    }

    // Count existing agents of this type
    const existing = this.getByType(type);
    if (existing.length >= agentDef.max_instances) {
      console.log(`[Pool] Max instances (${agentDef.max_instances}) reached for ${type}`);
      return null;
    }

    // Count total agents
    if (this.agents.size >= config.agents.max_concurrent) {
      console.log(`[Pool] Max concurrent agents (${config.agents.max_concurrent}) reached`);
      return null;
    }

    // Generate name
    const name = `${type}-${this.nextId++}`;

    // Allocate port
    const ports = config.ports;
    // We need state for port allocation — simplified here
    const port = this.findFreePort(ports.min, ports.max);
    if (port === null && type === 'worker') {
      console.log(`[Pool] No free ports for ${name}`);
      return null;
    }

    // Run pre.sh
    let worktreePath = path.join(getStateDir(), 'worktrees', name);

    // One-shot worker: use the ticket's worktree (not the agent's own dir)
    // and mark the ticket in_progress immediately — there is no separate
    // assignTask handoff.
    let currentTask: string | null = null;
    if (node && type === 'worker') {
      const baseBranch = config.strategy.branches.worktree_base;
      const worktreesDir = path.join(getStateDir(), 'worktrees');
      const ensured = ensureWorktree(
        getRepoRoot(),
        node.ticket.identifier,
        baseBranch,
        worktreesDir,
      );
      worktreePath = ensured.worktreePath;
      currentTask = node.ticket.identifier;
      node.state.worktreePath = worktreePath;
      node.state.workerName = name;
      node.state.assignedPort = port ?? 0;
      node.state.status = 'in_progress';
      node.state.startedAt = new Date().toISOString();
    }

    this.runLifecycleScript(agentDef.pre_script, name, type, port ?? 0, worktreePath);

    // Build prompt (includes the TASK block when node is given). The uuid
    // must be generated FIRST and shared: the TASK block's uuid is what the
    // worker echoes back in its IDLE message, and the orchestrator matches
    // it against agent.id. If they differ (two generateUUID() calls), the
    // worker's completion message never matches and the ticket stays
    // in_progress forever.
    const uuid = this.generateUUID();
    const promptContent = this.buildPrompt(type, name, port ?? 0, worktreePath, node, uuid);

    // Launch pi inside a tmux worker pane (created by the pane manager by
    // splitting the banner). The pane gives the worker a real TTY and lets
    // the operator read its output. With a task node, pi runs in
    // non-interactive `-p` mode: it processes the embedded TASK, reports
    // completion via intercom, and exits. `; exit` makes the pane die with
    // pi so healthCheck removes the agent and frees the slot.
    const paneId = this.paneManager.createWorkerPane(name, currentTask ?? '');
    if (!paneId) {
      console.error(`[Pool] ${name} failed to create tmux pane — spawn aborted`);
      recordSpawnFailure(type);
      return null;
    }

    // cwd must exist or the pane shell errors on cd.
    const spawnCwd = fs.existsSync(worktreePath) ? worktreePath : getRepoRoot();

    // The pane runs a fresh bash shell — set env inline so the tmux session
    // env is not polluted. PI_* session vars must be unset to prevent
    // intercom/session clash with the boss.
    const workerEnv = {
      ATLAS_AGENT_NAME: name,
      ATLAS_AGENT_TYPE: type,
      ATLAS_AGENT_PORT: String(port ?? ''),
      ATLAS_WORKTREE: worktreePath,
      ATLAS_CONFIG: path.join(process.cwd(), 'atlas.config.yaml'),
      ATLAS_STATE_DIR: getStateDir(),
    };
    const envAssignments = Object.entries(workerEnv)
      .map(([k, v]) => `${k}='${v}'`)
      .join(' ');

    // Type a command line into the pane's shell, then press Enter.
    // sq() shell-quotes for the orchestrator's bash; tmux then types the
    // literal characters into the pane's bash, which parses them itself.
    const sendKeys = (keys: string): void => {
      const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
      try {
        cp.execSync(`tmux send-keys -t ${sq(paneId)} ${sq(keys)} Enter`, {
          timeout: 5000,
        });
      } catch (err: any) {
        console.error(`[Pool] send-keys to ${paneId} failed: ${err.message}`);
      }
    };

    sendKeys('unset PI_INTERCOM_SESSION_ID PI_SESSION_ID PI_SESSION_FILE');
    sendKeys(`cd '${spawnCwd}'`);
    sendKeys(`export ${envAssignments}`);
    // pi's shebang is `#!/usr/bin/env node` — it resolves `node` from the
    // pane's PATH. Tmux panes inherit the launcher shell's env (often conda
    // base with an old node), while pi's bundled undici needs the same node
    // the orchestrator runs under. Prepend the orchestrator's node bin dir
    // so pi boots; without this it crashes with
    // `webidl.util.markAsUncloneable is not a function`.
    sendKeys(`export PATH='${path.dirname(process.execPath)}':$PATH`);
    // Non-interactive one-shot: -p processes the prompt (which embeds the
    // TASK) and exits when done. The message argument is REQUIRED — with no
    // message, `pi -p --system-prompt @file` processes nothing and exits
    // immediately (verified empirically). `; exit` kills the pane's bash
    // with pi so the pane goes dead and the pool slot frees up.
    //
    // --stream=all + -e stream-output: the worker's worktree carries a
    // committed .pi (with only the linear extension), so project-local
    // auto-discovery would MISS the stream-output extension — it must be
    // loaded explicitly from the main repo. Streamed output (thinking/text/
    // tools) goes to stderr, visible live in the worker's tmux pane.
    const streamExt = path.join(
      getRepoRoot(),
      '.pi',
      'extensions',
      'stream-output',
      'index.ts',
    );
    sendKeys(
      `${PI_BIN} -p -e "${streamExt}" --stream=all --system-prompt "@${promptContent}" "Begin work on your assigned TASK now. Implement it fully, then report completion and exit."; exit`,
    );

    // Worker output is now visible live in the tmux pane (capture with
    // `tmux capture-pane`). Keep a log file for API compatibility.
    const logPath = path.join(getStateDir(), 'logs', `${name}.log`);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(
      logPath,
      `[${new Date().toISOString()}] ${name} launched in pane ${paneId} (type=${type}, port=${port})\n`,
      'utf-8',
    );

    const instance: AgentInstance = {
      id: uuid,
      name,
      type,
      // pi runs inside the tmux pane — there is no direct child process.
      processPid: null,
      process: null,
      status: node ? 'active' : 'spawning',
      currentTask,
      port: port ?? 0,
      paneId,
      logPath,
      spawnedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    this.agents.set(instance.id, instance);
    // Increment lifetime counter (hard cap, never resets)
    SPAWN_LIFETIME_COUNT.set(type, (SPAWN_LIFETIME_COUNT.get(type) ?? 0) + 1);
    // No close handler exists for tmux panes — a successful pane creation +
    // send-keys sequence counts as a successful spawn. Failures (no banner,
    // tmux error) are caught above via recordSpawnFailure.
    recordSpawnSuccess(type);

    // Transition Linear ticket to in_progress for one-shot workers
    if (node && type === 'worker') {
      transitionTicket(node.ticket.id, config.linear.transitions.on_start).catch(() => {});
    }

    return instance;
  }

  // ─── Task Assignment (legacy — non-worker agents) ──────────────────

  /**
   * LEGACY interactive TASK handoff, kept for reviewer/pr_manager agents
   * that still use the interactive TASK protocol. One-shot workers bypass
   * this — the task is embedded in the prompt at spawn time.
   */
  async assignTask(agent: AgentInstance, node: GraphNode): Promise<void> {
    const config = getConfig();
    const baseBranch = config.strategy.branches.worktree_base;
    const worktreesDir = path.join(getStateDir(), 'worktrees');

    const { worktreePath } = ensureWorktree(
      getRepoRoot(),
      node.ticket.identifier,
      baseBranch,
      worktreesDir,
    );

    node.state.worktreePath = worktreePath;
    node.state.workerName = agent.name;
    node.state.assignedPort = agent.port;

    const strategy = resolveStrategy(node.state.branch);
    const task = {
      uuid: agent.id,
      ticket: node.ticket,
      worktreePath,
      strategy,
    };

    try {
      await this.intercom.send(agent.name, `TASK ${agent.id} ${JSON.stringify(task)}`);
      agent.status = 'active';
      agent.currentTask = node.ticket.identifier;
      agent.lastHeartbeat = Date.now();

      node.state.status = 'in_progress';
      node.state.startedAt = new Date().toISOString();

      transitionTicket(node.ticket.id, config.linear.transitions.on_start).catch(() => {});
    } catch (err) {
      console.error(`[Pool] Failed to send TASK to ${agent.name}:`, err);
    }
  }

  // ─── Stop ─────────────────────────────────────────────────────────

  async stop(agent: AgentInstance): Promise<void> {
    console.log(`[Pool] Stopping ${agent.name}...`);

    try {
      await this.intercom.send(agent.name, `STOP ${agent.id}`);
    } catch { /* ignore */ }

    // Wait for graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Kill the worker's tmux pane — this terminates pi and closes the pane.
    // The banner pane is never touched (see PaneManager invariant).
    this.paneManager.killWorkerPane(agent.name);

    agent.status = 'stopping';

    // Run post.sh
    const config = getConfig();
    const agentDef = config.agents[agent.type];
    if (agentDef) {
      this.runLifecycleScript(
        agentDef.post_script,
        agent.name,
        agent.type,
        agent.port,
        agent.currentTask
          ? path.join(getStateDir(), 'worktrees', agent.currentTask)
          : getRepoRoot(),
      );
    }

    this.agents.delete(agent.id);
  }

  async stopAll(type?: AgentType): Promise<void> {
    const targets = type
      ? this.getByType(type)
      : [...this.agents.values()];

    for (const agent of targets) {
      await this.stop(agent);
    }
  }

  // ─── Health ───────────────────────────────────────────────────────

  async healthCheck(): Promise<void> {
    for (const [id, agent] of this.agents) {
      // Workers now run inside tmux panes — verify the pane is still alive
      // (there is no direct child process to signal). An alive pane refreshes
      // the heartbeat, mirroring the old process-alive check.
      if (agent.paneId) {
        if (!this.paneManager.isPaneAlive(agent.paneId)) {
          console.log(`[Pool] ${agent.name} pane dead — cleaning up`);
          await this.handleAgentExit(agent, -1);
          continue;
        }
        agent.lastHeartbeat = Date.now();
      } else if (agent.processPid) {
        // Legacy path (AgentInstances created without a pane)
        try {
          process.kill(agent.processPid, 0);
          agent.lastHeartbeat = Date.now();
        } catch {
          console.log(`[Pool] ${agent.name} process dead — cleaning up`);
          await this.handleAgentExit(agent, -1);
          continue;
        }
      }

      // Check heartbeat recency (5 minute timeout)
      if (Date.now() - agent.lastHeartbeat > 300_000) {
        console.log(`[Pool] ${agent.name} heartbeat timeout — stopping`);
        await this.stop(agent);
      }
    }
  }

  // ─── Queries ──────────────────────────────────────────────────────

  getByType(type: AgentType): AgentInstance[] {
    return [...this.agents.values()].filter((a) => a.type === type);
  }

  getIdle(type: AgentType): AgentInstance[] {
    return this.getByType(type).filter((a) => a.status === 'idle');
  }

  getActive(): AgentInstance[] {
    return [...this.agents.values()].filter((a) => a.status === 'active');
  }

  getAgent(id: string): AgentInstance | undefined {
    return this.agents.get(id);
  }

  /**
   * Remove an agent from the pool immediately (e.g. a one-shot worker that
   * reported IDLE). Frees its max_instances slot so launchReady can spawn a
   * replacement without waiting for healthCheck to notice the dead pane.
   */
  async removeAgent(id: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) return;

    const config = getConfig();
    const agentDef = config.agents[agent.type];
    if (agentDef) {
      this.runLifecycleScript(
        agentDef.post_script,
        agent.name,
        agent.type,
        agent.port,
        agent.currentTask
          ? path.join(getStateDir(), 'worktrees', agent.currentTask)
          : getRepoRoot(),
      );
    }

    // The pane will die on its own (pi exits after the task); killing it
    // early is also fine since the work is done.
    if (agent.paneId) {
      this.paneManager.killWorkerPane(agent.name);
    }
    this.agents.delete(id);
  }

  count(): number {
    return this.agents.size;
  }

  // ─── Internal ─────────────────────────────────────────────────────

  private async handleAgentExit(agent: AgentInstance, exitCode: number): Promise<void> {
    const config = getConfig();
    const agentDef = config.agents[agent.type];

    // Run post.sh
    if (agentDef) {
      this.runLifecycleScript(
        agentDef.post_script,
        agent.name,
        agent.type,
        agent.port,
        agent.currentTask
          ? path.join(getStateDir(), 'worktrees', agent.currentTask)
          : getRepoRoot(),
      );
    }

    // If agent had an active task, handle the result
    if (agent.currentTask && agent.status === 'active') {
      const logPath = agent.logPath;
      console.log(`[Pool] ${agent.name} exited (code ${exitCode}) while working on ${agent.currentTask}`);
      // The orchestrator's main loop will detect and handle this
    }

    this.agents.delete(agent.id);
    console.log(`[Pool] ${agent.name} removed from pool`);
  }

  private buildPrompt(
    type: AgentType,
    name: string,
    port: number,
    worktreePath: string,
    node?: GraphNode,
    agentUuid?: string,
  ): string {
    const config = getConfig();
    const agentDef = config.agents[type];
    const promptFile = agentDef.prompt_file;

    // Write a temporary prompt file with variables substituted
    let content: string;
    try {
      content = fs.readFileSync(promptFile, 'utf-8');
    } catch {
      content = `# ${name} — ${type} Agent\n\nYou are an Atlas ${type} agent.`;
    }

    // Replace template variables
    const strategy = config.strategy;
    content = content
      .replace(/\{\{AGENT_NAME\}\}/g, name)
      .replace(/\{\{AGENT_TYPE\}\}/g, type)
      .replace(/\{\{AGENT_PORT\}\}/g, String(port))
      .replace(/\{\{WORKTREE_PATH\}\}/g, worktreePath)
      .replace(/\{\{STRATEGY\}\}/g, strategy.default)
      .replace(/\{\{PR_TARGET\}\}/g, strategy.branches.pr_target)
      .replace(/\{\{ORCHESTRATOR_NAME\}\}/g, `orchestrator-${process.pid}`);

    // One-shot worker: append the task so pi -p has everything it needs
    // without an interactive intercom TASK handoff. The uuid MUST be the
    // agent's own id (passed from spawn) — the worker echoes it in its
    // IDLE message and the orchestrator matches against agent.id.
    if (node && type === 'worker') {
      const task = {
        uuid: agentUuid ?? this.generateUUID(),
        ticket: node.ticket,
        worktreePath,
        strategy,
      };
      content += `\n\n## Your Task\n\n` +
        `TASK ${task.uuid} ${JSON.stringify(task)}\n\n` +
        `You are spawned non-interactively for this ONE task. Implement it fully,\n` +
        `then report completion (IDLE <uuid> to {{ORCHESTRATOR_NAME}}) and exit.\n`;
    }

    // Write to a temp file that pi can read
    const tmpPromptPath = path.join(getStateDir(), 'prompts', `${name}-prompt.md`);
    fs.mkdirSync(path.dirname(tmpPromptPath), { recursive: true });
    fs.writeFileSync(tmpPromptPath, content, 'utf-8');

    return tmpPromptPath;
  }

  private runLifecycleScript(
    scriptPath: string,
    name: string,
    type: string,
    port: number,
    worktreePath: string,
  ): void {
    if (!scriptPath || !fs.existsSync(scriptPath)) return;

    try {
      cp.spawnSync('bash', [scriptPath], {
        env: {
          ...process.env,
          ATLAS_AGENT_NAME: name,
          ATLAS_AGENT_TYPE: type,
          ATLAS_AGENT_PORT: String(port),
          ATLAS_WORKTREE: worktreePath,
          ATLAS_CONFIG: path.join(process.cwd(), 'atlas.config.yaml'),
          ATLAS_STATE_DIR: getStateDir(),
        },
        timeout: 30_000,
      });
    } catch (err) {
      console.error(`[Pool] Lifecycle script ${scriptPath} failed:`, err);
    }
  }

  private findFreePort(min: number, max: number): number | null {
    const used = new Set(
      [...this.agents.values()].map((a) => a.port).filter((p) => p > 0),
    );
    for (let port = min; port <= max; port++) {
      if (!used.has(port)) return port;
    }
    return null;
  }

  private generateUUID(): string {
    return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
