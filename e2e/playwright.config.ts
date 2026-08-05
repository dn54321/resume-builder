import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const BACKEND_PORT = parseInt(process.env.AGENT_PORT || '3000', 10)
const FRONTEND_PORT = BACKEND_PORT + 1
const BASE_URL = `http://localhost:${FRONTEND_PORT}`

/**
 * True end-to-end test configuration.
 *
 * Starts backend (NestJS on AGENT_PORT) and frontend (Vite on AGENT_PORT+1)
 * before running tests. Uses a dedicated test database separate from
 * unit/integration test databases.
 */
export default defineConfig({
  testDir: './specs',
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    actionTimeout: 0,
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // Headless by default (no Chrome popups). Opt into headed mode with
    // PW_HEADED=1 (e.g. when debugging interactively).
    headless: process.env.PW_HEADED ? false : true,
    // Allow self-signed certs in dev
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `pnpm prisma:generate && pnpm prisma:push --skip-generate && pnpm start`,
      cwd: '../backend',
      port: BACKEND_PORT,
      reuseExistingServer: false,
      timeout: 60 * 1000,
      env: {
        NODE_ENV: 'development',
        PORT: String(BACKEND_PORT),
        DATABASE_URL: 'file:./prisma/test-e2e.db',
        FRONTEND_URL: BASE_URL,
        MATCHING_ENGINE: 'keyword',
        BULLET_CAP: '5',
        RESUME_FIELD_ENCRYPTION_KEY:
          'e2e-test-key-00123456789abcdef0123456789abcdef0123456789abcdef01',
        SESSION_ENCRYPTION_KEY:
          'e2e-test-sess-0123456789abcdef0123456789abcdef0123456789abcdef01',
      },
    },
    {
      command: `pnpm dev --port ${FRONTEND_PORT} --strictPort`,
      cwd: '../frontend',
      port: FRONTEND_PORT,
      reuseExistingServer: false,
      timeout: 60 * 1000,
      env: {
        VITE_API_BASE_URL: `http://localhost:${BACKEND_PORT}`,
      },
    },
  ],
})
