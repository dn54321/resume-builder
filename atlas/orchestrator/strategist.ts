/**
 * Branch strategy handler.
 * Determines how completed work reaches the target branch.
 * Supports pr, direct, and review strategies with glob-based overrides.
 */

import * as fs from 'node:fs';
import type { GraphNode, ResolvedStrategy, Strategy, StrategyResult } from './types';
import { getConfig } from './config';
import {
  commitAll,
  pushBranch,
  mergeToBranch,
  getDefaultBranch,
} from '../git/operations';
import { createPR } from '../integrations/github/client';
import { transitionTicket, addComment } from '../integrations/linear/client';

// ─── Strategy Resolution ────────────────────────────────────────────

/**
 * Match a glob pattern against a branch name.
 * Supports * wildcards (e.g., "hotfix/*" matches "hotfix/security-patch").
 */
function matchGlob(pattern: string, value: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
  );
  return regex.test(value);
}

export function resolveStrategy(branchName: string): ResolvedStrategy {
  const config = getConfig();
  const strat = config.strategy;

  // Check overrides
  for (const override of strat.overrides) {
    if (matchGlob(override.pattern, branchName)) {
      const type = override.strategy;
      // If override specifies a pr_target, use it.
      // Otherwise pick the target branch appropriate for the strategy type.
      const targetBranch = override.pr_target ?? getTargetForStrategy(type);
      return { type, targetBranch };
    }
  }

  // Use default
  return {
    type: strat.default,
    targetBranch: getTargetForStrategy(strat.default),
  };
}

function getTargetForStrategy(strategy: Strategy): string {
  const config = getConfig();
  const branches = config.strategy.branches;
  switch (strategy) {
    case 'pr': return branches.pr_target;
    case 'direct': return branches.direct_push;
    case 'review': return branches.review_target;
  }
}

// ─── Execution ──────────────────────────────────────────────────────

/**
 * Extract PR body from the agent's worktree.
 * Reads pr-body.md, falls back to completion-summary.md, then defaults.
 */
function extractPRBody(node: GraphNode): string {
  const wt = node.state.worktreePath;
  if (!wt || !fs.existsSync(wt)) {
    return `## ${node.ticket.title}\n\nCloses ${node.ticket.identifier}`;
  }

  // Try pr-body.md first
  const prBodyPath = `${wt}/pr-body.md`;
  if (fs.existsSync(prBodyPath)) {
    return fs.readFileSync(prBodyPath, 'utf-8').trim();
  }

  // Fallback: completion-summary.md
  const summaryPath = `${wt}/completion-summary.md`;
  if (fs.existsSync(summaryPath)) {
    return fs.readFileSync(summaryPath, 'utf-8').trim();
  }

  return `## ${node.ticket.title}\n\nCloses ${node.ticket.identifier}`;
}

export async function executeStrategy(node: GraphNode): Promise<StrategyResult> {
  const strategy = resolveStrategy(node.state.branch);

  switch (strategy.type) {
    case 'direct':
      return executeDirect(node, strategy.targetBranch);
    case 'pr':
      return executePR(node, strategy.targetBranch);
    case 'review':
      return executeReview(node, strategy.targetBranch);
    default:
      return { success: false, error: `Unknown strategy: ${strategy.type}` };
  }
}

async function executeDirect(
  node: GraphNode,
  targetBranch: string,
): Promise<StrategyResult> {
  const wt = node.state.worktreePath;
  if (!wt) return { success: false, error: 'No worktree path' };

  // Commit any remaining changes
  const commitMsg = `${node.ticket.title}\n\nCloses ${node.ticket.identifier}`;
  commitAll(wt, commitMsg);

  // Merge to target branch
  const mergeResult = mergeToBranch(wt, node.state.branch, targetBranch, commitMsg);
  if (mergeResult.exitCode !== 0) {
    const error = mergeResult.stderr || mergeResult.stdout || 'Merge failed';
    return { success: false, error };
  }

  // Transition Linear ticket to done
  const config = getConfig();
  await transitionTicket(node.ticket.id, config.linear.transitions.on_done);

  return { success: true };
}

async function executePR(
  node: GraphNode,
  baseBranch: string,
): Promise<StrategyResult> {
  const wt = node.state.worktreePath;
  if (!wt) return { success: false, error: 'No worktree path' };

  // Commit any remaining changes
  const commitMsg = `${node.ticket.title}\n\nCloses ${node.ticket.identifier}`;
  commitAll(wt, commitMsg);

  // Push branch
  const pushResult = pushBranch(wt, node.state.branch);
  if (pushResult.exitCode !== 0) {
    return { success: false, error: pushResult.stderr || 'Push failed' };
  }

  // Build PR body with dependency info
  const prBody = extractPRBody(node);
  const depIds = node.dependencies.map((d) => d.ticket.identifier);
  let depSection = '';
  if (depIds.length > 0) {
    depSection = depIds
      .map((id) => `- Depends on: ${id}`)
      .join('\n') + '\n\n';
  }
  const fullBody = depSection + prBody;

  // Create PR
  const prResult = await createPR(
    node.state.branch,
    node.ticket.title,
    fullBody,
    baseBranch,
  );

  if (prResult.url) {
    node.state.prUrl = prResult.url;
    // Transition Linear ticket to review
    const config = getConfig();
    await transitionTicket(node.ticket.id, config.linear.transitions.on_review);
    await addComment(node.ticket.id, `PR opened: ${prResult.url}`);
    return { success: true, prUrl: prResult.url };
  }

  return {
    success: false,
    error: prResult.error ?? 'PR creation failed',
  };
}

async function executeReview(
  node: GraphNode,
  baseBranch: string,
): Promise<StrategyResult> {
  // Review strategy: create PR against review target, add review labels
  const result = await executePR(node, baseBranch);
  if (result.success) {
    // Add a comment requesting review
    await addComment(
      node.ticket.id,
      `Ready for review. PR: ${result.prUrl}\n` +
      `Please check:\n` +
      (getConfig().agents.reviewer.review_checklist ?? [])
        .map((item) => `- [ ] ${item}`)
        .join('\n'),
    );
  }
  return result;
}
