/**
 * Shared types for the /ticket extension.
 */

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
}

export interface OrchestratorState {
  tickets: Record<string, TicketState>;
  startedAt: string;
  teamId: string;
  teamKey: string;
  usedPorts: number[];
  epicRoots?: string[];  // identifiers of managed epic root tickets (multi-epic)
}

/** Per-epic metadata tracked alongside its graph. */
export interface EpicMeta {
  rootId: string;        // root ticket identifier (e.g. "RES-10")
  label: string;         // short display label (e.g. "Auth System")
  ticketCount: number;
  doneCount: number;
  runningCount: number;
  failedCount: number;
}

export type QueuePriority = 'review' | 'conflict' | 'pending' | 'blocked';

export interface WorkerResult {
  /** Exit code from the worker process */
  exitCode: number;
  /** Whether the branch was pushed to remote */
  branchPushed: boolean;
  /** PR URL if one was created, null otherwise */
  prUrl: string | null;
  /** Why PR creation failed, if applicable */
  prError: string | null;
}

export interface GraphNode {
  ticket: TicketInfo;
  state: TicketState;
  dependencies: GraphNode[];
  dependents: GraphNode[];
  _onComplete?: (result: WorkerResult) => void;
  priority?: QueuePriority;
  context?: string;
}

export interface PRInfo {
  number: number;
  url: string;
  title: string;
  branch: string;
  ticketIdentifier: string | null; // e.g. "RES-6" extracted from branch name
}

export interface PRComment {
  id: number;
  user: string;
  body: string;
  createdAt: string;
  prNumber: number;
}
