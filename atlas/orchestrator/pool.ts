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

  // First try `which pi`
  try {
    const result = cp.spawnSync('which', ['pi'], { encoding: 'utf-8', timeout: 3000 });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch { /* ignore */ }

  // Try nvm: find the latest node version's bin directory
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

const SPAWN_COOLDOWNS = new Map<string, number>(); // agentType → cooldownUntil timestamp
const SPAWN_FAILURES = new Map<string, number>();   // agentType → consecutive failure count
const MAX_CONSECUTIVE_FAILURES = 5;
const BASE_COOLDOWN_MS = 1000;  // 1 second base, doubles each failure

function canSpawnNow(type: string): boolean {
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
  private nextId = 1;

  constructor(intercom: IntercomClient) {
    this.intercom = intercom;
  }

  // ─── Spawn ────────────────────────────────────────────────────────

  async spawn(type: AgentType): Promise<AgentInstance | null> {
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
    const worktreePath = path.join(getStateDir(), 'worktrees', name);
    this.runLifecycleScript(agentDef.pre_script, name, type, port ?? 0, worktreePath);

    // Build prompt
    const promptContent = this.buildPrompt(type, name, port ?? 0, worktreePath);

    // Spawn pi process
    const logPath = path.join(getStateDir(), 'logs', `${name}.log`);
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });

    const proc = cp.spawn(PI_BIN, ['-s', '--append-system-prompt', `@${promptContent}`], {
      cwd: worktreePath || getRepoRoot(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ATLAS_AGENT_NAME: name,
        ATLAS_AGENT_TYPE: type,
        ATLAS_AGENT_PORT: String(port ?? ''),
        ATLAS_WORKTREE: worktreePath,
        ATLAS_CONFIG: path.join(process.cwd(), 'atlas.config.yaml'),
        ATLAS_STATE_DIR: getStateDir(),
      },
    });

    proc.stdout?.pipe(logStream);
    proc.stderr?.pipe(logStream);

    const instance: AgentInstance = {
      id: this.generateUUID(),
      name,
      type,
      processPid: proc.pid ?? null,
      status: 'spawning',
      currentTask: null,
      port: port ?? 0,
      paneId: null,
      logPath,
      spawnedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    proc.on('close', (code) => {
      logStream.end();
      // Track whether the agent actually ran or crashed immediately
      if (Date.now() - instance.spawnedAt < 5000 && code !== 0) {
        recordSpawnFailure(type);
      } else {
        recordSpawnSuccess(type);
      }
      this.handleAgentExit(instance, code ?? 1);
    });

    proc.on('error', (err) => {
      logStream.end();
      recordSpawnFailure(type);
      console.error(`[Pool] ${name} spawn error: ${err.message}`);
      instance.status = 'stopping';
    });

    this.agents.set(instance.id, instance);
    recordSpawnSuccess(type); // Mark initial spawn as successful (process started)

    logStream.write(`[${new Date().toISOString()}] ${name} spawned (type=${type}, port=${port})\n`);

    // Create worker pane (split from banner) — handled by pane manager

    return instance;
  }

  // ─── Task Assignment ──────────────────────────────────────────────

  async assignTask(agent: AgentInstance, node: GraphNode): Promise<void> {
    const config = getConfig();
    const baseBranch = config.strategy.branches.worktree_base;
    const worktreesDir = path.join(getStateDir(), 'worktrees');

    // Ensure worktree
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

    // Build task assignment
    const task = {
      uuid: agent.id,
      ticket: node.ticket,
      worktreePath,
      strategy,
    };

    // Send TASK via intercom
    try {
      await this.intercom.send(agent.name, `TASK ${agent.id} ${JSON.stringify(task)}`);
      agent.status = 'active';
      agent.currentTask = node.ticket.identifier;
      agent.lastHeartbeat = Date.now();

      node.state.status = 'in_progress';
      node.state.startedAt = new Date().toISOString();

      // Transition Linear ticket
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

    // Force kill if still alive
    if (agent.processPid) {
      try {
        process.kill(agent.processPid, 'SIGTERM');
      } catch { /* already dead */ }
    }

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
      // Check process alive
      if (agent.processPid) {
        try {
          process.kill(agent.processPid, 0);
          agent.lastHeartbeat = Date.now();
        } catch {
          console.log(`[Pool] ${agent.name} process dead — cleaning up`);
          await this.handleAgentExit(agent, -1);
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
      .replace(/\{\{PR_TARGET\}\}/g, strategy.branches.pr_target);

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
