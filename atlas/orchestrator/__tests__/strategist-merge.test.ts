/**
 * Tests for the Strategist's executeStrategy direct-merge path.
 * Specifically: when the worktree branch is ALREADY merged into the
 * target (work delivered in a previous pass), executeDirect must complete
 * as a no-op instead of committing an empty commit and re-pushing (which
 * re-runs the full pre-push suite for zero diff and loops the ticket —
 * observed: RES-81/85/88/89 'strategy retry 2/2' with no changes).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { executeStrategy } from '../strategist';
import { getConfig } from '../config';
import { setStateDir } from '../state';
import type { GraphNode } from '../types';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => ''),
  spawn: vi.fn(() => ({ unref: vi.fn(), on: vi.fn(), pid: 4242 })),
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

vi.mock('../../git/operations', () => ({
  commitAll: vi.fn(() => ({ exitCode: 0 })),
  pushBranch: vi.fn(() => ({ exitCode: 0 })),
  mergeToBranch: vi.fn(() => ({ exitCode: 0 })),
  getDefaultBranch: vi.fn(() => 'main'),
  isBranchMergedTo: vi.fn(() => false),
}));

vi.mock('../config', () => ({
  getConfig: vi.fn(),
}));

vi.mock('../../integrations/linear/client', () => ({
  transitionTicket: vi.fn().mockResolvedValue(undefined),
  addComment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../integrations/github/client', () => ({
  createPR: vi.fn().mockResolvedValue({ url: 'https://github.com/pr/1' }),
}));

import { commitAll, isBranchMergedTo, mergeToBranch } from '../../git/operations';
import { transitionTicket } from '../../integrations/linear/client';
import type { Mock } from 'vitest';

function testConfig() {
  return {
    version: '2.0',
    agents: {
      max_concurrent: 4,
      boss: { enabled: true, prompt_file: '', pre_script: '', post_script: '', spawn: 'manual' as const, max_instances: 1 },
      worker: { enabled: true, prompt_file: '', pre_script: '', post_script: '', spawn: 'on_demand' as const, max_instances: 3, retry_limit: 2, task_timeout_minutes: 30 },
      reviewer: { enabled: false, prompt_file: '', pre_script: '', post_script: '', spawn: 'on_pr_opened' as const, max_instances: 1 },
      pr_manager: { enabled: false, prompt_file: '', pre_script: '', post_script: '', spawn: 'schedule' as const, max_instances: 1 },
    },
    strategy: {
      default: 'direct' as const,
      branches: { pr_target: 'main', review_target: 'staging', direct_push: 'main', worktree_base: 'main' },
      overrides: [],
    },
    intervals: { status_sync: 10, pr_scan: 10, dashboard_refresh: 2, agent_health: 15, queue_process: 5, scheduled_agents: 300, webhook_timeout: 30 },
    linear: {
      team_key: 'RES',
      transitions: { on_start: 'In Progress', on_done: 'Done', on_failure: 'Todo', on_review: 'In Review' },
      cache_ttl_minutes: 15,
      max_retries_on_rate_limit: 3,
      retry_backoff_ms: 1000,
      auto_discover_epics: true,
    },
    github: { webhook_enabled: false, pr_labels: [], pr_draft: false, merge_method: 'squash' as const, delete_branch_on_merge: true, required_approvals: 1 },
    ports: { min: 9000, max: 9099 },
    logging: { level: 'info', max_log_lines_per_agent: 5000, retain_logs_days: 30 },
    testing: { mock_external_services: true, coverage_threshold: 90, fixtures_dir: 'tests/fixtures' },
  };
}

function makeNode(): GraphNode {
  return {
    ticket: {
      id: 't1',
      identifier: 'RES-99',
      title: 'Test ticket',
      description: '',
      parentId: null,
      refs: [],
      url: '',
    },
    state: {
      identifier: 'RES-99',
      status: 'in_progress',
      branch: 'ticket/res-99',
      worktreePath: '/tmp/wt/RES-99',
      logPath: '/tmp/wt/RES-99.log',
      workerName: 'worker-1',
      assignedPort: 9000,
      startedAt: null,
      finishedAt: null,
      pid: null,
      prUrl: null,
      error: null,
      retryCount: 0,
      agentId: null,
      paneId: null,
    },
    dependencies: [],
    dependents: [],
  };
}

describe('Strategist — executeDirect already-merged fast path', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-strat-test-'));
    setStateDir(tmpDir);
    vi.mocked(getConfig).mockReturnValue(testConfig() as never);
    vi.mocked(commitAll).mockClear();
    vi.mocked(isBranchMergedTo).mockClear();
    vi.mocked(transitionTicket).mockClear();
  });

  it('marks done without commitAll/push when branch is already merged', async () => {
    vi.mocked(isBranchMergedTo).mockReturnValue(true);

    const node = makeNode();
    const result = await executeStrategy(node);

    expect(result.success).toBe(true);
    expect(result.alreadyMerged).toBe(true);
    // No empty commit + full-suite push for zero diff
    expect(commitAll).not.toHaveBeenCalled();
    // Linear is still transitioned to Done
    expect(transitionTicket).toHaveBeenCalledWith('t1', 'Done');
  });

  it('commits and merges normally when the branch is NOT yet merged', async () => {
    vi.mocked(isBranchMergedTo).mockReturnValue(false);

    const node = makeNode();
    const result = await executeStrategy(node);

    expect(result.success).toBe(true);
    expect(result.alreadyMerged).toBeUndefined();
    expect(commitAll).toHaveBeenCalled();
  });
});

describe('Strategist — merge throw resilience', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-strat-throw-'));
    setStateDir(tmpDir);
    vi.mocked(getConfig).mockReturnValue(testConfig() as never);
    vi.mocked(commitAll).mockClear();
    vi.mocked(isBranchMergedTo).mockReturnValue(false);
  });

  it('returns a retryable error when mergeToBranch THROWS (repo state) instead of crashing', async () => {
    // getRepoRoot throws when the main repo is bare — this previously
    // propagated through executeDirect and killed the orchestrator (02:33).
    vi.mocked(mergeToBranch).mockImplementation(() => {
      throw new Error('Not in a git repository');
    });

    const node = makeNode();
    const result = await executeStrategy(node);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Merge threw');
    expect(result.error).toContain('Not in a git repository');
  });
});
