/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️  set-db-provider.js — pick the Prisma datasource provider from DATABASE_URL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Prisma does NOT allow `provider = env("...")` in schema.prisma — the
 * provider must be a static string. To support BOTH SQLite (local dev,
 * tests) and PostgreSQL (production) from one codebase, this script reads
 * DATABASE_URL and rewrites the `provider = "..."` line in schema.prisma
 * before `prisma generate` runs:
 *
 *   file:./...  or  libsql://...   →  provider = "sqlite"   (LibSQL adapter)
 *   postgresql://...               →  provider = "postgresql" (pg adapter)
 *
 * It is idempotent and git-safe: schema.prisma is tracked, so the rewritten
 * provider is a WORKTREE-LOCAL change only — commit the canonical version
 * (sqlite) to git. Running generate with the wrong provider for the current
 * DATABASE_URL produces a client that fails at runtime with a confusing
 * adapter/schema mismatch, so always route through this script:
 *
 *   pnpm prisma:generate   (already wired: set-db-provider → generate → patch)
 *
 * DO NOT:
 *   - Edit the provider by hand and commit a postgresql provider to git
 *   - Run bare `prisma generate` instead of `pnpm prisma:generate`
 *   - Hardcode the provider in schema.prisma to match one environment only
 */
const fs = require('node:fs');
const path = require('node:path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const url = process.env.DATABASE_URL ?? 'file:./prisma/db/dev.db';

const provider = /^postgres(ql)?:\/\//.test(url) ? 'postgresql' : 'sqlite';

const schema = fs.readFileSync(schemaPath, 'utf8');
const updated = schema.replace(
  /^(\s*provider\s*=\s*)"[a-z]+"(\s*)$/m,
  (_, pre, post) => `${pre}"${provider}"${post}`,
);

if (updated === schema) {
  console.error(`[set-db-provider] schema already provider="${provider}" (no change)`);
} else {
  fs.writeFileSync(schemaPath, updated);
  console.log(`[set-db-provider] DATABASE_URL=${url.slice(0, 30)}… → provider="${provider}"`);
}
