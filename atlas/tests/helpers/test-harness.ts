/**
 * Atlas test harness.
 * Provides mock servers, test agent spawning, and state assertion utilities.
 */

import * as http from 'node:http';
import type { AtlasConfig, OrchestratorState, AgentType, AgentInstance } from '../../orchestrator/types';

// ─── Mock Linear Server ─────────────────────────────────────────────

export interface LinearFixture {
  queryPattern: RegExp;
  response: any;
}

export function createMockLinearServer(
  fixtures: LinearFixture[],
  port = 0,
): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const { query } = JSON.parse(body);
          const fixture = fixtures.find((f) => f.queryPattern.test(query));
          if (fixture) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ data: fixture.response }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ data: null }));
          }
        } catch {
          res.writeHead(400);
          res.end('invalid json');
        }
      });
    });

    server.listen(port, () => {
      const addr = server.address() as any;
      resolve({ server, url: `http://localhost:${addr.port}` });
    });

    server.on('error', reject);
  });
}

// ─── Mock GitHub Server ─────────────────────────────────────────────

export interface GitHubFixture {
  method: string;
  pathPattern: RegExp;
  response: any;
  status?: number;
}

export function createMockGitHubServer(
  fixtures: GitHubFixture[],
  port = 0,
): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const fixture = fixtures.find(
        (f) =>
          f.method === req.method &&
          f.pathPattern.test(req.url ?? ''),
      );
      if (fixture) {
        res.writeHead(fixture.status ?? 200, {
          'Content-Type': 'application/json',
        });
        res.end(JSON.stringify(fixture.response));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ message: 'Not found' }));
      }
    });

    server.listen(port, () => {
      const addr = server.address() as any;
      resolve({ server, url: `http://localhost:${addr.port}` });
    });

    server.on('error', reject);
  });
}

// ─── Test Agent ─────────────────────────────────────────────────────

export interface TestAgent {
  id: string;
  name: string;
  type: AgentType;
  messages: string[];
  send: (text: string) => void;
  receive: () => Promise<string>;
}

export function createTestAgent(
  type: AgentType,
  name: string,
): TestAgent {
  const messages: string[] = [];
  const resolvers: Array<(msg: string) => void> = [];

  return {
    id: `test-${Date.now().toString(36)}`,
    name,
    type,
    messages,
    send(text: string) {
      messages.push(text);
      const resolver = resolvers.shift();
      if (resolver) resolver(text);
    },
    receive(): Promise<string> {
      return new Promise((resolve) => {
        if (messages.length > 0) {
          resolve(messages.shift()!);
        } else {
          resolvers.push(resolve);
        }
      });
    },
  };
}

// ─── State Helpers ──────────────────────────────────────────────────

export function createEmptyState(): OrchestratorState {
  return {
    tickets: {},
    startedAt: new Date().toISOString(),
    teamId: '',
    teamKey: 'RES',
    usedPorts: [],
    epicRoots: [],
  };
}

export function createMockConfig(overrides: Partial<AtlasConfig> = {}): AtlasConfig {
  return {
    version: '2.0',
    agents: {
      max_concurrent: 3,
      boss: {
        enabled: true,
        prompt_file: 'agents/boss/prompt.md',
        pre_script: 'agents/boss/pre.sh',
        post_script: 'agents/boss/post.sh',
        spawn: 'manual',
        max_instances: 1,
      },
      worker: {
        enabled: true,
        prompt_file: 'agents/worker/prompt.md',
        pre_script: 'agents/worker/pre.sh',
        post_script: 'agents/worker/post.sh',
        spawn: 'on_demand',
        max_instances: 3,
        retry_limit: 2,
        task_timeout_minutes: 30,
      },
      reviewer: {
        enabled: false,
        prompt_file: 'agents/reviewer/prompt.md',
        pre_script: 'agents/reviewer/pre.sh',
        post_script: 'agents/reviewer/post.sh',
        spawn: 'on_pr_opened',
        max_instances: 1,
      },
      pr_manager: {
        enabled: false,
        prompt_file: 'agents/pr-manager/prompt.md',
        pre_script: 'agents/pr-manager/pre.sh',
        post_script: 'agents/pr-manager/post.sh',
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
      pr_labels: ['atlas'],
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
    ...overrides,
  };
}
