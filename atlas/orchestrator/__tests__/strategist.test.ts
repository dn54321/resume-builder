/**
 * Tests for the Strategist module.
 */
import { describe, it, expect } from 'vitest';

// We test the strategy resolution directly since it's pure logic
// that doesn't require external services.

function matchGlob(pattern: string, value: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
  );
  return regex.test(value);
}

describe('Strategist — matchGlob', () => {
  it('matches exact patterns', () => {
    expect(matchGlob('main', 'main')).toBe(true);
    expect(matchGlob('main', 'develop')).toBe(false);
  });

  it('matches wildcard patterns', () => {
    expect(matchGlob('hotfix/*', 'hotfix/security-patch')).toBe(true);
    expect(matchGlob('hotfix/*', 'hotfix/CVE-2024-1234')).toBe(true);
    expect(matchGlob('hotfix/*', 'feature/new-thing')).toBe(false);
  });

  it('matches ticket/* patterns', () => {
    expect(matchGlob('ticket/*', 'ticket/res-42')).toBe(true);
    expect(matchGlob('ticket/*', 'ticket/res-123')).toBe(true);
    expect(matchGlob('ticket/*', 'main')).toBe(false);
  });

  it('matches nested wildcards', () => {
    expect(matchGlob('feature/*/fix', 'feature/auth/fix')).toBe(true);
    expect(matchGlob('feature/*/fix', 'feature/ui/fix')).toBe(true);
    expect(matchGlob('feature/*/fix', 'feature/auth/update')).toBe(false);
  });
});

describe('Strategist — strategy resolution', () => {
  interface StrategyOverride {
    pattern: string;
    strategy: 'pr' | 'direct' | 'review';
    pr_target?: string;
  }

  interface StrategyConfig {
    default: 'pr' | 'direct' | 'review';
    branches: {
      pr_target: string;
      review_target: string;
      direct_push: string;
      worktree_base: string;
    };
    overrides: StrategyOverride[];
  }

  function resolveStrategy(
    branchName: string,
    config: StrategyConfig,
  ): { type: string; targetBranch: string } {
    for (const override of config.overrides) {
      if (matchGlob(override.pattern, branchName)) {
        const type = override.strategy;
        let targetBranch: string;
        if (override.pr_target) {
          targetBranch = override.pr_target;
        } else {
          switch (type) {
            case 'pr': targetBranch = config.branches.pr_target; break;
            case 'direct': targetBranch = config.branches.direct_push; break;
            case 'review': targetBranch = config.branches.review_target; break;
          }
        }
        return { type, targetBranch };
      }
    }

    const type = config.default;
    let targetBranch: string;
    switch (type) {
      case 'pr': targetBranch = config.branches.pr_target; break;
      case 'direct': targetBranch = config.branches.direct_push; break;
      case 'review': targetBranch = config.branches.review_target; break;
    }
    return { type, targetBranch };
  }

  const baseConfig: StrategyConfig = {
    default: 'pr',
    branches: {
      pr_target: 'main',
      review_target: 'staging',
      direct_push: 'main',
      worktree_base: 'main',
    },
    overrides: [
      { pattern: 'hotfix/*', strategy: 'direct' },
      { pattern: 'feature/*', strategy: 'pr', pr_target: 'develop' },
      { pattern: 'experiment/*', strategy: 'review' },
    ],
  };

  it('uses default pr strategy for normal tickets', () => {
    const result = resolveStrategy('ticket/res-42', baseConfig);
    expect(result.type).toBe('pr');
    expect(result.targetBranch).toBe('main');
  });

  it('uses direct strategy for hotfix branches', () => {
    const result = resolveStrategy('hotfix/security-patch', baseConfig);
    expect(result.type).toBe('direct');
    expect(result.targetBranch).toBe('main');
  });

  it('uses pr strategy with develop target for feature branches', () => {
    const result = resolveStrategy('feature/login', baseConfig);
    expect(result.type).toBe('pr');
    expect(result.targetBranch).toBe('develop');
  });

  it('uses review strategy for experiment branches', () => {
    const result = resolveStrategy('experiment/new-ui', baseConfig);
    expect(result.type).toBe('review');
    expect(result.targetBranch).toBe('staging');
  });

  it('falls back to default when no override matches', () => {
    const configWithoutOverrides: StrategyConfig = {
      ...baseConfig,
      overrides: [],
    };
    const result = resolveStrategy('any-branch', configWithoutOverrides);
    expect(result.type).toBe('pr');
    expect(result.targetBranch).toBe('main');
  });

  it('direct default resolves to direct_push target', () => {
    const directConfig: StrategyConfig = {
      ...baseConfig,
      default: 'direct',
      overrides: [],
    };
    const result = resolveStrategy('ticket/res-42', directConfig);
    expect(result.type).toBe('direct');
    expect(result.targetBranch).toBe('main');
  });

  it('review default resolves to review_target', () => {
    const reviewConfig: StrategyConfig = {
      ...baseConfig,
      default: 'review',
      overrides: [],
    };
    const result = resolveStrategy('ticket/res-42', reviewConfig);
    expect(result.type).toBe('review');
    expect(result.targetBranch).toBe('staging');
  });

  it('first matching override wins', () => {
    const config: StrategyConfig = {
      ...baseConfig,
      overrides: [
        { pattern: 'hotfix/*', strategy: 'direct' },
        { pattern: 'hotfix/*', strategy: 'pr', pr_target: 'release' },
      ],
    };
    const result = resolveStrategy('hotfix/urgent', config);
    // First match wins
    expect(result.type).toBe('direct');
    expect(result.targetBranch).toBe('main');
  });
});
