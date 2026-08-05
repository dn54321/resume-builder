/**
 * Tests for the AgentPool — tmux pane wiring.
 * The pane manager is stubbed (its own behavior is covered by
 * tui/__tests__/pane-manager.test.ts); external services and tmux are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AgentPool } from '../pool';
import { setStateDir } from '../state';
import type { AgentInstance, AtlasConfig } from '../types';
import type { PaneManager } from '../../tui/pane-manager';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => ''),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

vi.mock('../../git/operations', () => ({
  ensureWorktree: vi.fn(() => ({ worktreePath: '/tmp/worktrees/RES-99' })),
  getRepoRoot: vi.fn(() => '/tmp/repo-root'),
  getDefaultBranch: vi.fn(() => 'main'),
}));

vi.mock('../../integrations/linear/client', () => ({
  transitionTicket: vi.fn(),
}));

vi.mock('../../integrations/intercom/client', () => ({
  IntercomClient: vi.fn(),
}));

vi.mock('../config', () => ({
  getConfig: vi.fn(),
}));

import { getConfig } from '../config';
import type { Mock } from 'vitest';

function testConfig(): AtlasConfig {
  return {
    version: '2.0',
    agents: {
      max_concurrent: 4,
      boss: {
        enabled: false,
        prompt_file: '/nonexistent/boss.md',
        pre_script: '',
        post_script: '',
        spawn: 'manual',
        max_instances: 1,
      },
      worker: {
        enabled: true,
        prompt_file: '/nonexistent/worker.md',
        pre_script: '',
        post_script: '',
        spawn: 'on_demand',
        max_instances: 3,
        retry_limit: 2,
        task_timeout_minutes: 30,
      },
      reviewer: {
        enabled: false,
        prompt_file: '/nonexistent/reviewer.md',
        pre_script: '',
        post_script: '',
        spawn: 'on_pr_opened',
        max_instances: 1,
      },
      pr_manager: {
        enabled: false,
        prompt_file: '/nonexistent/pr-manager.md',
        pre_script: '',
        post_script: '',
        spawn: 'schedule',
        max_instances: 1,
      },
    },
    strategy: {
      default: 'pr',
      branches: {
        pr_target: 'main',
        review_target: 'staging',
        direct_push: 'main',
        worktree_base: 'main',
      },
      overrides: [],
    },
    intervals: {
      status_sync: 10,
      pr_scan: 10,
      dashboard_refresh: 2,
      agent_health: 15,
      queue_process: 5,
      scheduled_agents: 300,
      webhook_timeout: 30,
    },
    linear: {
      team_key: 'RES',
      transitions: {
        on_start: 'In Progress',
        on_done: 'Done',
        on_failure: 'Todo',
        on_review: 'In Review',
      },
      cache_ttl_minutes: 15,
      max_retries_on_rate_limit: 3,
      retry_backoff_ms: 1000,
      auto_discover_epics: true,
    },
    github: {
      webhook_enabled: false,
      pr_labels: [],
      pr_draft: false,
      merge_method: 'squash',
      delete_branch_on_merge: true,
      required_approvals: 1,
    },
    ports: { min: 9000, max: 9099 },
    logging: {
      level: 'info',
      max_log_lines_per_agent: 5000,
      retain_logs_days: 30,
    },
    testing: {
      mock_external_services: true,
      coverage_threshold: 90,
      fixtures_dir: 'tests/fixtures',
    },
  };
}

describe('AgentPool — tmux pane wiring', () => {
  let tmpDir: string;
  let pool: AgentPool;
  let paneManager: {
    createWorkerPane: Mock<[], string | null>;
    killWorkerPane: Mock<[], void>;
    isPaneAlive: Mock<[], boolean>;
  };
  let intercom: { send: Mock<[], Promise<void>> };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-pool-test-'));
    setStateDir(tmpDir);

    paneManager = {
      createWorkerPane: vi.fn() as unknown as Mock<[], string | null>,
      killWorkerPane: vi.fn() as unknown as Mock<[], void>,
      isPaneAlive: vi.fn() as unknown as Mock<[], boolean>,
    };
    paneManager.createWorkerPane.mockReturnValue('%3');
    paneManager.isPaneAlive.mockReturnValue(true);
    intercom = {
      send: vi.fn().mockResolvedValue(undefined) as unknown as Mock<[], Promise<void>>,
    };

    vi.mocked(getConfig).mockReturnValue(testConfig());
    vi.mocked(cp.execSync).mockClear();

    pool = new AgentPool(intercom as never, paneManager as unknown as PaneManager);
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('spawn', () => {
    it('creates a worker pane and returns an instance bound to it', async () => {
      const agent = await pool.spawn('worker');
      expect(agent).not.toBeNull();
      expect(paneManager.createWorkerPane).toHaveBeenCalledWith('worker-1', '');
      expect(agent!.paneId).toBe('%3');
      // pi runs inside the pane — no direct child process
      expect(agent!.processPid).toBeNull();
      expect(agent!.process).toBeNull();
      expect(agent!.name).toBe('worker-1');
      expect(agent!.status).toBe('spawning');
    });

    it('launches pi via tmux send-keys with registration commands', async () => {
      await pool.spawn('worker');

      const sent = vi
        .mocked(cp.execSync)
        .mock.calls.map((c) => String(c[0]))
        .filter((c) => c.includes('tmux send-keys'));
      expect(sent.length).toBeGreaterThanOrEqual(7);

      const joined = sent.join('\n');
      // Keys are shell-quoted for the orchestrator's bash (single quotes
      // inside appear escaped as '\''), so assert on the parts that matter.
      expect(joined).toContain('-t \'%3\'');
      expect(joined).toContain('unset PI_INTERCOM_SESSION_ID PI_SESSION_ID PI_SESSION_FILE');
      expect(joined).toContain('cd ');
      expect(joined).toContain('/tmp/repo-root'); // worktree missing → repo root
      expect(joined).toContain('export ATLAS_AGENT_NAME=');
      expect(joined).toContain('ATLAS_AGENT_TYPE=');
      expect(joined).toContain('ATLAS_AGENT_PORT=');
      expect(joined).toContain('ATLAS_WORKTREE=');
      expect(joined).toContain('ATLAS_STATE_DIR=');
      expect(joined).toContain('--system-prompt "@');
      expect(joined).toContain('/name worker-1');
      expect(joined).toContain('REGISTER');
      expect(joined).toContain('IDLE');
      expect(joined).toContain('orchestrator-');
    });

    it('records a spawn failure and returns null when the pane cannot be created', async () => {
      paneManager.createWorkerPane.mockReturnValue(null);
      const agent = await pool.spawn('worker');
      expect(agent).toBeNull();
      // No send-keys should be attempted
      expect(
        vi.mocked(cp.execSync).mock.calls.filter((c) =>
          String(c[0]).includes('tmux send-keys'),
        ),
      ).toHaveLength(0);
      expect(pool.count()).toBe(0);
    });

    it('does not spawn disabled agent types', async () => {
      const agent = await pool.spawn('reviewer');
      expect(agent).toBeNull();
      expect(paneManager.createWorkerPane).not.toHaveBeenCalled();
    });

    it('respects max_instances per agent type', async () => {
      const config = testConfig();
      config.agents.worker.max_instances = 1;
      vi.mocked(getConfig).mockReturnValue(config);

      const first = await pool.spawn('worker');
      expect(first).not.toBeNull();
      const second = await pool.spawn('worker');
      expect(second).toBeNull();
    });

    it('keeps a log file for the agent', async () => {
      await pool.spawn('worker');
      const logPath = path.join(tmpDir, 'logs', 'worker-1.log');
      expect(fs.existsSync(logPath)).toBe(true);
      expect(fs.readFileSync(logPath, 'utf-8')).toContain('worker-1 launched in pane %3');
    });
  });

  describe('stop', () => {
    it('kills the worker pane and removes the agent from the pool', async () => {
      const agent = await pool.spawn('worker');
      expect(agent).not.toBeNull();

      vi.useFakeTimers();
      const stopPromise = pool.stop(agent as AgentInstance);
      await vi.advanceTimersByTimeAsync(5000);
      await stopPromise;
      vi.useRealTimers();

      expect(paneManager.killWorkerPane).toHaveBeenCalledWith('worker-1');
      expect(pool.getAgent((agent as AgentInstance).id)).toBeUndefined();
    });

    it('sends STOP via intercom before killing the pane', async () => {
      const agent = await pool.spawn('worker');
      vi.useFakeTimers();
      const stopPromise = pool.stop(agent as AgentInstance);
      await vi.advanceTimersByTimeAsync(5000);
      await stopPromise;
      vi.useRealTimers();

      expect(intercom.send).toHaveBeenCalledWith(
        'worker-1',
        expect.stringContaining('STOP'),
      );
    });
  });

  describe('healthCheck', () => {
    it('removes agents whose pane died', async () => {
      const agent = await pool.spawn('worker');
      paneManager.isPaneAlive.mockReturnValue(false);

      await pool.healthCheck();

      expect(pool.getAgent((agent as AgentInstance).id)).toBeUndefined();
    });

    it('keeps agents whose pane is alive and refreshes the heartbeat', async () => {
      const agent = await pool.spawn('worker');
      const stale = (agent as AgentInstance).lastHeartbeat;
      (agent as AgentInstance).lastHeartbeat = stale - 60_000;

      await pool.healthCheck();

      expect(pool.getAgent((agent as AgentInstance).id)).toBeDefined();
      expect((agent as AgentInstance).lastHeartbeat).toBeGreaterThan(stale - 60_000);
    });
  });
});
