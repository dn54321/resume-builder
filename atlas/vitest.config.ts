import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Worker worktrees contain their own atlas/ copies (stale) — they must
      // NOT run as part of the main suite. A stale pool.test.ts in a worktree
      // failed against new behavior and blocked every push via pre-push.
      '**/state/worktrees/**',
      '**/.pi/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'orchestrator/**/*.ts',
        'integrations/**/*.ts',
        'git/**/*.ts',
        'tui/**/*.ts',
      ],
      exclude: [
        '**/__tests__/**',
        '**/node_modules/**',
        '**/*.d.ts',
        'orchestrator/index.ts',
      ],
      thresholds: {
        // Target: 90%. Starting point: enforce on core modules.
        // Integration modules (git, integrations/*, tui/*) need
        // external services — covered by integration tests (tests/integration/).
        branches: 60,
        functions: 60,
        lines: 60,
        statements: 60,
      },
    },
  },
});
