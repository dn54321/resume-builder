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
 * Reference data for the Section catalog (id → label). These rows are
 * REQUIRED by ResumeSection.sectionId's foreign key: the backend's
 * upsert/create flow re-creates ResumeSection rows that reference this
 * catalog, so if the catalog is empty every resume save fails with
 * SQLITE_CONSTRAINT: FOREIGN KEY (RES-95). The catalog is static
 * reference data (mirrors backend/prisma/seed.ts) — never treat it as
 * test data to wipe.
 */
const SECTION_CATALOG: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'name_contact', label: 'Name & Contact' },
  { id: 'summary', label: 'Summary' },
  { id: 'experience', label: 'Experience' },
  { id: 'education', label: 'Education' },
  { id: 'hard_skills', label: 'Hard Skills' },
  { id: 'soft_skills', label: 'Soft Skills' },
  { id: 'certifications', label: 'Certifications' },
  { id: 'projects', label: 'Projects' },
  { id: 'languages', label: 'Languages' },
  { id: 'hobbies', label: 'Hobbies' },
  { id: 'volunteer', label: 'Volunteer' },
]

/**
 * Reset the e2e test database to a clean state by deleting all rows
 * from every table, then re-seed the Section catalog (reference data).
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
  const seedStmts = SECTION_CATALOG.map(
    (s) =>
      `INSERT OR REPLACE INTO "Section" ("id", "label") VALUES ('${s.id}', '${s.label}');`,
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
      execSync(`sqlite3 "${E2E_DB_PATH}" "${stmts} ${seedStmts}"`, {
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
