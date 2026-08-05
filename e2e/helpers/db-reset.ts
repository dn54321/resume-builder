import { execSync } from 'node:child_process'
import path from 'node:path'

/**
 * Path to the dedicated e2e test database.
 * Must match DATABASE_URL in playwright.config.ts webServer env.
 */
const E2E_DB_PATH = path.resolve(
  __dirname,
  '../../backend/prisma/test-e2e.db',
)

/**
 * Backend dir (for running the seed script).
 */
const BACKEND_DIR = path.resolve(__dirname, '../../backend')

/**
 * Reset the e2e test database to a clean state by deleting all rows from
 * every user-data table. Tables are deleted in foreign-key-safe order
 * (children before parents).
 *
 * The canonical Section reference rows are NOT user data — they are FK
 * targets for ResumeSection.sectionId. Deleting them makes every save fail
 * with SQLITE_CONSTRAINT FOREIGN KEY (RES-93), so they are never deleted
 * here; on a fresh database (first run after prisma:push) they are seeded
 * via the canonical idempotent seed script (prisma/seed.ts).
 *
 * Uses sqlite3 CLI which handles the WAL journal mode automatically.
 * PRAGMA busy_timeout makes the CLI wait (up to 10s) for the backend's
 * write locks instead of failing immediately with SQLITE_BUSY(5) — the
 * webServer holds the DB open for the whole run, so a reset racing a
 * backend write used to cascade-fail every subsequent spec.
 */
export function resetE2eDatabase(): void {
  const tables = [
    'SectionField',
    'SectionEntry',
    'ResumeSection',
    'Session',
    'Resume',
    'User',
  ]

  const stmts = tables.map((t) => `DELETE FROM "${t}";`).join('\n')

  execSync(`sqlite3 "${E2E_DB_PATH}" "PRAGMA busy_timeout=10000; ${stmts}"`, {
    stdio: 'pipe',
    timeout: 30_000,
  })

  const sectionCount = execSync(
    `sqlite3 "${E2E_DB_PATH}" "SELECT COUNT(*) FROM Section;"`,
    { stdio: 'pipe', timeout: 5_000 },
  )
    .toString()
    .trim()

  if (Number(sectionCount) === 0) {
    // Fresh e2e DB (prisma:push created empty tables) — restore the 10
    // canonical Section rows. DATABASE_URL must point at the e2e DB — the
    // seed's own dotenv config would otherwise resolve to backend/.env
    // (dev.db).
    execSync('npx tsx prisma/seed.ts', {
      cwd: BACKEND_DIR,
      env: { ...process.env, DATABASE_URL: 'file:./prisma/test-e2e.db' },
      stdio: 'pipe',
      timeout: 30_000,
    })
  }
}
