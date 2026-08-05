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
 * Reset the e2e test database to a clean state by deleting all rows
 * from every table. Tables are deleted in foreign-key-safe order
 * (children before parents).
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

  execSync(`sqlite3 "${E2E_DB_PATH}" "${stmts}"`, {
    stdio: 'pipe',
    timeout: 5_000,
  })
}
