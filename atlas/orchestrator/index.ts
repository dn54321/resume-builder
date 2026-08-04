/**
 * Atlas orchestrator — entry point.
 *
 * Usage:
 *   npx tsx orchestrator/index.ts
 */

export { startOrchestrator } from './server';
export { Scheduler } from './scheduler';
export { AgentPool } from './pool';
export { buildGraph, readyTickets } from './graph';
export { resolveStrategy, executeStrategy } from './strategist';
export { loadState, saveState, saveFullState } from './state';
export { loadConfig, getConfig, reloadConfig } from './config';
export * from './types';

// Auto-start when run directly
import { startOrchestrator } from './server';
if (require.main === module) {
  startOrchestrator().catch((err) => {
    console.error('Orchestrator fatal error:', err);
    process.exit(1);
  });
}
