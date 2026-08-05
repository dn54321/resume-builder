import { execSync } from 'node:child_process'
import path from 'node:path'

/**
 * Path to the dedicated e2e test database.
 * Must match DATABASE_URL in playwright.config.ts webServer env.
 *
 * Overridable via E2E_DB_PATH (same pattern as AGENT_PORT) so two
 * playwright runs can use isolated databases instead of contending for
 * one SQLite file (a second worker in the same worktree would otherwise
 * cause "database is locked" failures).
 */
const E2E_DB_PATH = process.env.E2E_DB_PATH
  ? path.resolve(process.env.E2E_DB_PATH)
  : path.resolve(__dirname, '../../backend/prisma/test-e2e.db')

/**
 * The 10 canonical resume section types — a static lookup table seeded by
 * `backend/prisma/seed.ts` for the dev database. The e2e harness creates
 * test-e2e.db with `prisma db push` (no seed), so `resetE2eDatabase` must
 * re-insert these rows itself: `ResumeSection.sectionId` has an FK to
 * `Section.id`, and any authenticated save (autosave PUT /resumes,
 * POST /resumes with sections) fails with SQLITE_CONSTRAINT when the
 * table is empty.
 */
const SECTION_ROWS: ReadonlyArray<readonly [string, string]> = [
  ['name_contact', 'Name & Contact'],
  ['summary', 'Summary'],
  ['experience', 'Experience'],
  ['education', 'Education'],
  ['hard_skills', 'Hard Skills'],
  ['soft_skills', 'Soft Skills'],
  ['certifications', 'Certifications'],
  ['projects', 'Projects'],
  ['languages', 'Languages'],
  ['hobbies', 'Hobbies'],
]

/**
 * Reset the e2e test database to a clean state by deleting all rows
 * from every table, then restoring the static Section lookup rows.
 * Tables are deleted in foreign-key-safe order (children before parents).
 *
 * Uses sqlite3 CLI which handles the WAL journal mode automatically.
 */
export function resetE2eDatabase(): void {
  const tables = [
    'SectionField',
    'SectionEntry',
    'ResumeSection',
    'Session',
    'Resume',
    'Section',
    'User',
  ]

  const stmts = tables.map((t) => `DELETE FROM "${t}";`).join('\n')
  const sectionInserts = SECTION_ROWS.map(
    ([id, label]) =>
      `INSERT INTO "Section" ("id", "label") VALUES ('${id}', '${label}');`,
  ).join('\n')

  // The webServer (playwright.config.ts) creates test-e2e.db with
  // `prisma db push` right before the backend listens. On a FRESH run the
  // file may still be mid-write when the first beforeAll fires, so a bare
  // sqlite3 invocation can hit "no such table" / "database is locked".
  // Fail fast and retry briefly instead of failing the whole suite on a
  // one-off race. (No busy_timeout: sqlite3's default fail-fast behavior
  // combined with the retry loop settles faster than a long in-process
  // wait, which previously collided with execSync's own timeout.)
  let lastError: unknown = null
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      execSync(`sqlite3 "${E2E_DB_PATH}" "${stmts}${sectionInserts}"`, {
        stdio: 'pipe',
        timeout: 5_000,
      })
      return
    } catch (err) {
      lastError = err
      // Brief pause so the schema creation / WAL checkpoint can settle.
      execSync('sleep 0.5', { stdio: 'pipe' })
    }
  }
  throw lastError
}
