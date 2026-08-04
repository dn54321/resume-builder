/**
 * State persistence and recovery.
 * Saves/loads OrchestratorState to/from state/atlas.json.
 * Handles merge, corruption recovery, and worktree-based recovery.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { OrchestratorState, TicketState } from './types';
import { hasMeaningfulWork } from '../git/operations';

// ─── Paths ──────────────────────────────────────────────────────────

let _stateDir: string | null = null;

export function setStateDir(dir: string): void {
  _stateDir = dir;
  fs.mkdirSync(dir, { recursive: true });
}

export function getStateDir(): string {
  if (!_stateDir) {
    _stateDir = path.join(process.cwd(), 'atlas', 'state');
    fs.mkdirSync(_stateDir, { recursive: true });
  }
  return _stateDir;
}

function statePath(): string {
  return path.join(getStateDir(), 'atlas.json');
}

// ─── Load ───────────────────────────────────────────────────────────

export function loadState(): OrchestratorState | null {
  try {
    const raw = fs.readFileSync(statePath(), 'utf-8');
    const state = JSON.parse(raw) as OrchestratorState;

    // Validate structure
    if (!state.tickets || typeof state.tickets !== 'object') {
      throw new Error('Invalid state: missing tickets');
    }

    return state;
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    console.error(`[State] Failed to load state: ${err.message}`);
    return null;
  }
}

// ─── Save ───────────────────────────────────────────────────────────

export function saveState(state: OrchestratorState): void {
  const dir = path.dirname(statePath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Save full state, optionally merging with existing state.
 * Merging is critical when multiple epics are loaded sequentially —
 * without it, each save wipes out previously-loaded epic state.
 */
export function saveFullState(
  tickets: Record<string, TicketState>,
  merge = true,
): void {
  const existing = loadState();
  const mergedTickets = merge ? { ...existing?.tickets, ...tickets } : tickets;

  saveState({
    tickets: mergedTickets,
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    teamId: existing?.teamId ?? '',
    teamKey: existing?.teamKey ?? '',
    usedPorts: existing?.usedPorts ?? [],
    epicRoots: existing?.epicRoots ?? [],
  });
}

/**
 * Save a snapshot of a single ticket's state.
 */
export function saveTicketState(
  identifier: string,
  ticketState: TicketState,
): void {
  const existing = loadState();
  const tickets = existing?.tickets ?? {};
  tickets[identifier] = { ...ticketState };

  saveState({
    tickets,
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    teamId: existing?.teamId ?? '',
    teamKey: existing?.teamKey ?? '',
    usedPorts: existing?.usedPorts ?? [],
    epicRoots: existing?.epicRoots ?? [],
  });
}

// ─── Recovery ───────────────────────────────────────────────────────

/**
 * Check if a ticket's worktree has committed work.
 * Used on restart when state is missing or the process is dead.
 */
export function recoverFromWorktree(
  identifier: string,
  worktreePath: string,
  baseBranch: string,
  defaultBranch: string,
): TicketState | null {
  if (!fs.existsSync(worktreePath)) return null;
  if (!hasMeaningfulWork(worktreePath, baseBranch)) return null;

  return {
    identifier,
    status: 'done',
    branch: `ticket/${identifier.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`,
    worktreePath,
    logPath: path.join(getStateDir(), 'logs', `${identifier}.log`),
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

// ─── Port Management ────────────────────────────────────────────────

export function allocatePort(
  state: OrchestratorState,
  portMin: number,
  portMax: number,
): number | null {
  const used = new Set(state.usedPorts ?? []);
  for (let port = portMin; port <= portMax; port++) {
    if (!used.has(port)) {
      state.usedPorts.push(port);
      return port;
    }
  }
  return null;
}

export function releasePort(state: OrchestratorState, port: number | null): void {
  if (port === null) return;
  state.usedPorts = (state.usedPorts ?? []).filter((p) => p !== port);
}
