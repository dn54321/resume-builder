/**
 * Atlas — Shared types for the multi-agent orchestration system.
 */

// ─── Agent Types ────────────────────────────────────────────────────

export type AgentType = 'boss' | 'worker' | 'reviewer' | 'pr_manager';

export type AgentSpawnTrigger = 'manual' | 'on_demand' | 'on_pr_opened' | 'schedule';

export type AgentStatus = 'spawning' | 'idle' | 'active' | 'stuck' | 'stopping';

export interface AgentDefinition {
  enabled: boolean;
  prompt_file: string;
  pre_script: string;
  post_script: string;
  spawn: AgentSpawnTrigger;
  max_instances: number;
  retry_limit?: number;
  task_timeout_minutes?: number;
  review_checklist?: string[];
  auto_merge_threshold_hours?: number;
  cleanup_stale_branches_days?: number;
}

export interface AgentInstance {
  id: string;
  name: string;
  type: AgentType;
  processPid: number | null;
  process: import('child_process').ChildProcess | null;  // for sending stdin commands
  status: AgentStatus;
  currentTask: string | null;
  port: number;
  paneId: string | null;
  logPath: string;
  spawnedAt: number;
  lastHeartbeat: number;
}

// ─── Ticket Types ───────────────────────────────────────────────────

export interface TicketInfo {
  identifier: string;
  id: string;
  title: string;
  description: string;
  parentId: string | null;
  refs: string[];
  url: string;
}

export type TicketStatus =
  | 'pending'
  | 'blocked'
  | 'in_progress'
  | 'done'
  | 'failed'
  | 'merged';

export interface TicketState {
  identifier: string;
  status: TicketStatus;
  branch: string;
  worktreePath: string;
  logPath: string;
  pid: number | null;
  prUrl: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  assignedPort: number | null;
  retryCount: number;
  workerName: string | null;
  /** Agent identity persisted so a restarted orchestrator can re-adopt the
   * live worker (its tmux pane keeps running across restarts). */
  agentId: string | null;
  paneId: string | null;
}

export interface GraphNode {
  ticket: TicketInfo;
  state: TicketState;
  dependencies: GraphNode[];
  dependents: GraphNode[];
  _onComplete?: (result: WorkerResult) => void;
}

export interface WorkerResult {
  exitCode: number;
  branchPushed: boolean;
  prUrl: string | null;
  prError: string | null;
}

// ─── Strategy Types ─────────────────────────────────────────────────

export type Strategy = 'pr' | 'direct' | 'review';

export interface StrategyBranchConfig {
  pr_target: string;
  review_target: string;
  direct_push: string;
  worktree_base: string;
}

export interface StrategyOverride {
  pattern: string;
  strategy: Strategy;
  pr_target?: string;
}

export interface StrategyConfig {
  default: Strategy;
  branches: StrategyBranchConfig;
  overrides: StrategyOverride[];
}

export interface ResolvedStrategy {
  type: Strategy;
  targetBranch: string;
}

export interface StrategyResult {
  success: boolean;
  prUrl?: string;
  error?: string;
}

// ─── Scheduler Types ────────────────────────────────────────────────

export interface SchedulerConfig {
  intervals: {
    status_sync: number;
    pr_scan: number;
    dashboard_refresh: number;
    agent_health: number;
    queue_process: number;
    scheduled_agents: number;
    webhook_timeout: number;
  };
}

// ─── Orchestrator State ─────────────────────────────────────────────

export interface OrchestratorState {
  tickets: Record<string, TicketState>;
  startedAt: string;
  teamId: string;
  teamKey: string;
  usedPorts: number[];
  epicRoots: string[];
}

// ─── Atlas Configuration ────────────────────────────────────────────

export interface AtlasConfig {
  version: string;
  agents: {
    max_concurrent: number;
    boss: AgentDefinition;
    worker: AgentDefinition;
    reviewer: AgentDefinition;
    pr_manager: AgentDefinition;
  };
  strategy: StrategyConfig;
  intervals: SchedulerConfig['intervals'];
  linear: {
    team_key: string;
    transitions: {
      on_start: string;
      on_done: string;
      on_failure: string;
      on_review: string;
    };
    cache_ttl_minutes: number;
    max_retries_on_rate_limit: number;
    retry_backoff_ms: number;
    auto_discover_epics: boolean;
  };
  github: {
    webhook_enabled: boolean;
    pr_labels: string[];
    pr_draft: boolean;
    merge_method: 'merge' | 'squash' | 'rebase';
    delete_branch_on_merge: boolean;
    required_approvals: number;
  };
  ports: {
    min: number;
    max: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    max_log_lines_per_agent: number;
    retain_logs_days: number;
  };
  testing: {
    mock_external_services: boolean;
    coverage_threshold: number;
    fixtures_dir: string;
  };
}

// ─── Intercom Protocol ──────────────────────────────────────────────

export interface IntercomMessage {
  type: 'command' | 'reply' | 'status' | 'task' | 'error';
  from: string;
  to: string;
  payload: string;
  timestamp: number;
  messageId: string;
}

export interface TaskAssignment {
  uuid: string;
  ticket: TicketInfo;
  worktreePath: string;
  strategy: ResolvedStrategy;
}

// ─── PR Types ───────────────────────────────────────────────────────

export interface PRInfo {
  number: number;
  url: string;
  title: string;
  branch: string;
  ticketIdentifier: string | null;
}

export interface PRComment {
  id: number;
  user: string;
  body: string;
  createdAt: string;
  prNumber: number;
}

// ─── GitHub Types ───────────────────────────────────────────────────

export interface GitHubRepo {
  owner: string;
  repo: string;
}
