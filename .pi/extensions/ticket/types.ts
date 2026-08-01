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
  | 'running'
  | 'done'
  | 'failed';

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
}

export interface OrchestratorState {
  tickets: Record<string, TicketState>;
  startedAt: string;
  teamId: string;
  teamKey: string;
  usedPorts: number[];
}

export type QueuePriority = 'review' | 'conflict' | 'pending' | 'blocked';

export interface GraphNode {
  ticket: TicketInfo;
  state: TicketState;
  dependencies: GraphNode[];
  dependents: GraphNode[];
  _onComplete?: () => void;
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
