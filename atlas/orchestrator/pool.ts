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

    // Spawn pi process inside 'script' to provide a pseudo-TTY.
    // pi requires a TTY to stay alive in interactive mode; without it
    // the process exits immediately even with stdio pipes open.
    const logPath = path.join(getStateDir(), 'logs', `${name}.log`);
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });

    // cwd must exist or spawn fails with ENOENT.
    // worktreePath may not exist yet (created later by assignTask).
    const spawnCwd = fs.existsSync(worktreePath) ? worktreePath : getRepoRoot();

    // Use script -q to give pi a PTY so it stays alive.
    // script -q: quiet mode, -c: command to run
    const piArgs = ['--system-prompt', `@${promptContent}`];
    const proc = cp.spawn('script', [
      '-q',
      '-c',
      `${PI_BIN} ${piArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`,
      '/dev/null',
    ], {
      cwd: spawnCwd,
      stdio: ['pipe', 'pipe', 'pipe'],
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
      process: proc,
      status: 'spawning',
      currentTask: null,
      port: port ?? 0,
      paneId: null,
      logPath,
      spawnedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    // Send registration commands via stdin so the worker auto-registers.
    // Workers have a PTY via script(1), so we can write to stdin.
    const uuid = instance.id;
    const orchNameForReg = `orchestrator-${process.pid}`;
    setTimeout(() => {
      if (proc.exitCode !== null) return; // already exited
      proc.stdin?.write(`/name ${name}\n`);
    }, 3000); // wait for pi to finish startup
    setTimeout(() => {
      if (proc.exitCode !== null) return;
      proc.stdin?.write(`intercom({ action: "send", to: "${orchNameForReg}", message: "REGISTER ${uuid} worker ${name}" })\n`);
    }, 5000);
    setTimeout(() => {
      if (proc.exitCode !== null) return;
      proc.stdin?.write(`intercom({ action: "send", to: "${orchNameForReg}", message: "IDLE ${uuid}" })\n`);
    }, 6000);

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
    // Increment lifetime counter (hard cap, never resets)
    SPAWN_LIFETIME_COUNT.set(type, (SPAWN_LIFETIME_COUNT.get(type) ?? 0) + 1);
    // Do NOT call recordSpawnSuccess here — the close handler decides success/failure.
    // Calling it here resets the failure counter on every spawn, defeating cooldowns.

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
