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

  execSync(`sqlite3 "${E2E_DB_PATH}" "${stmts} ${seedStmts}"`, {
    stdio: 'pipe',
    timeout: 5_000,
  })
}
