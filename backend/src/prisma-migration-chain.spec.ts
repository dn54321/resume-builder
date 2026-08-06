/**
 * Migration-chain regression guard — RES-94.
 *
 * RES-94 broke fresh-DB bootstrap: `prisma migrate deploy` failed with
 * "table User already exists" because 20260801023955_add_users_and_sessions
 * re-created the User table that init already creates, and a later
 * migration (20260801045654_add_session, since deleted) re-created Session
 * WITHOUT the expiresAt column schema.prisma requires.
 *
 * FOUR separate workers rediscovered the breakage (RES-85, RES-89, and two
 * re-runs) because nothing tested the migration chain: CI only exercised
 * `prisma db push`, which silently rebuilds the schema from schema.prisma
 * and never touches the migrations folder. Fresh worktrees/CI/docker boot
 * failed every time.
 *
 * This spec applies the REAL migration chain to a throwaway SQLite file
 * and asserts:
 *   1. every migration applies cleanly (deploy exits 0),
 *   2. `migrate status` reports the schema is up to date,
 *   3. `migrate diff` reports ZERO drift between the deployed DB and
 *      schema.prisma (catches missing columns like Session.expiresAt).
 *
 * If anyone edits a migration in a way that breaks fresh bootstraps, this
 * test fails — no more four-worker rediscovery cycles.
 *
 * NOTE: deliberately uses `prisma migrate deploy` / `migrate status` /
 * `migrate diff` (read-only + fresh-DB only). Never `migrate dev` or
 * `db push` — those rewrite/ignore the migration chain.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

jest.setTimeout(120_000);

describe('Prisma migration chain (fresh DB bootstrap)', () => {
  const BACKEND_DIR = path.join(__dirname, '..');
  const dbPath = path.join(
    os.tmpdir(),
    `res94-migration-${process.pid}-${Date.now()}.db`,
  );
  const shadowPath = path.join(
    os.tmpdir(),
    `res94-shadow-${process.pid}-${Date.now()}.db`,
  );
  const databaseUrl = `file:${dbPath}`;

  /**
   * Run a Prisma CLI command against the throwaway database.
   * @param {string[]} args - Prisma CLI arguments, e.g. `['migrate', 'deploy']`.
   * @param {Record<string, string>} env - Extra environment variables to merge
   *   into the child process environment (e.g. SHADOW_DATABASE_URL).
   * @returns {import('node:child_process').SpawnSyncReturns<string>} The result
   *   of the spawned command.
   */
  function runPrisma(args: string[], env: Record<string, string> = {}) {
    return spawnSync('npx', ['prisma', ...args], {
      cwd: BACKEND_DIR,
      env: { ...process.env, DATABASE_URL: databaseUrl, ...env },
      encoding: 'utf-8',
      timeout: 60_000,
    });
  }

  afterAll(() => {
    for (const p of [dbPath, shadowPath]) {
      for (const suffix of ['', '-journal', '-wal', '-shm']) {
        try {
          fs.unlinkSync(p + suffix);
        } catch {
          // already gone — fine
        }
      }
    }
  });

  it('applies every migration cleanly to a fresh database', () => {
    const result = runPrisma(['migrate', 'deploy']);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain('All migrations have been successfully applied');
    // Every migration in the folder must run — if one is broken (duplicate
    // table, missing column), deploy fails before this line.
    expect(output).toContain('20260801023923_init');
    expect(output).toContain('20260801023955_add_users_and_sessions');
    expect(output).toContain('20260805210327_add_locked_to_resume_section');
    expect(output).toContain('20260806_add_iv_auth_tag_and_enabled');
  });

  it('reports the deployed schema is up to date', () => {
    const result = runPrisma(['migrate', 'status']);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain('Database schema is up to date!');
  });

  it('produces a database with zero drift vs schema.prisma', () => {
    // Applies the whole migration chain to a shadow DB and diffs it against
    // schema.prisma. Any column the schema requires but migrations omit
    // (e.g. Session.expiresAt pre-fix) shows up here as a diff.
    const result = runPrisma(
      [
        'migrate',
        'diff',
        '--from-migrations',
        'prisma/migrations',
        '--to-schema',
        'prisma/schema.prisma',
      ],
      { SHADOW_DATABASE_URL: `file:${shadowPath}` },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain('No difference detected');
  });
});
