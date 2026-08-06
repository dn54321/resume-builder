/**
 * Autosave + immediate navigation (RES-105) — critical path: data loss prevention.
 *
 * The "Unsaved Changes" confirmation modal is INTENTIONALLY DISABLED (RES-105):
 * every field edit autosaves (1.5s debounce + immediate sessionStorage safety
 * net), so navigating away mid-edit must be immediate AND lossless.
 *
 * Each test uses a UNIQUE user (single resume per user) — the backend's
 * PUT /resumes upsert targets the user's oldest resume, so multi-resume
 * users would make the DB assertions non-deterministic.
 *
 * Tests the full stack: browser → frontend → backend → database.
 */
import { test, expect } from '@playwright/test'
import { resetE2eDatabase } from '../helpers/db-reset'

const BACKEND_PORT = parseInt(process.env.AGENT_PORT || '3000', 10)
const API_BASE = `http://localhost:${BACKEND_PORT}/api/v1`

const PASSWORD = 'TestPass123!'

test.describe('Autosave + immediate navigation (RES-105)', () => {
  test.beforeAll(async ({ request }) => {
    resetE2eDatabase()
  })

  /**
   * Sign up a fresh user and return their unique email — each test gets its
   * own account so resume persistence assertions stay deterministic.
   * @param request
   */
  async function createUser(request: import('@playwright/test').APIRequestContext) {
    const email = `autosave-nav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`
    const res = await request.post(`${API_BASE}/auth/signup`, {
      data: { email, password: PASSWORD },
    })
    expect(res.status()).toBe(201)
    return email
  }

  /**
   * Login and open the builder for the given user.
   * @param page
   * @param email
   */
  async function loginAndCreateResume(
    page: import('@playwright/test').Page,
    email: string,
  ): Promise<void> {
    await page.goto('/login')
    await page.fill('#login-email', email)
    await page.fill('#login-password', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })

    // Create a resume — dashboard renders two 'Create New Resume' buttons
    // (header + empty state); .first() avoids a strict-mode violation.
    // RES-103 deferred-create: click → /builder (no row yet); the uuid
    // appears only after the first edit saves.
    await page
      .getByRole('button', { name: 'Create New Resume' })
      .first()
      .click()
    await page.waitForURL('**/builder', { timeout: 15_000 })

    const nameInput = page.locator('input[aria-label="Resume name"]')
    await expect(nameInput).toBeVisible({ timeout: 10_000 })
  }

  test('navigating away mid-edit is immediate — no unsaved-changes modal (RES-105)', async ({
    page,
    request,
  }) => {
    const email = await createUser(request)
    await loginAndCreateResume(page, email)

    // Edit the resume name (mid-edit, dirty) — do NOT wait for autosave
    const nameInput = page.locator('input[aria-label="Resume name"]')
    await nameInput.fill('Mid-Edit Name')

    // Navigate away right away — if the old modal guard were still active
    // this click would be suspended and the URL would never reach /dashboard.
    await page.getByRole('link', { name: 'My Resumes' }).click()

    // Lands on the dashboard immediately — navigation was NOT blocked
    await page.waitForURL('**/dashboard', { timeout: 10_000 })
    await expect(page.locator('h1').first()).toContainText('My Resumes')

    // And no "Unsaved Changes" dialog was ever shown
    const modal = page.getByRole('dialog', { name: 'Unsaved Changes' })
    await expect(modal).toHaveCount(0)
  })

  test('mid-edit navigation does not lose data — autosave persists the edit (RES-105)', async ({
    page,
    request,
  }) => {
    const email = await createUser(request)
    await loginAndCreateResume(page, email)

    const nameInput = page.locator('input[aria-label="Resume name"]')
    await nameInput.fill('Persisted After Nav')

    // Navigate away immediately after the edit (before the debounce fires).
    // The blur-commit saves synchronously and the sessionStorage safety net
    // captured the state — but the URL must change WITHOUT any modal.
    await page.getByRole('link', { name: 'My Resumes' }).click()
    await page.waitForURL('**/dashboard', { timeout: 10_000 })

    // The edit must survive. Poll the database until the backend holds the
    // new name (the debounced PUT can still be in flight).
    await expect(async () => {
      const list = await page.request.get(`${API_BASE}/resumes`)
      const resumes = await list.json()
      expect(resumes[0]!.name).toBe('Persisted After Nav')
    }).toPass({ timeout: 15_000 })
  })

  test('navigating away with a clean state works without any modal', async ({
    page,
    request,
  }) => {
    const email = await createUser(request)
    await loginAndCreateResume(page, email)

    // Save the resume name — blur commits and triggers the autosave (the
    // sole save mechanism), which persists it immediately → clean state.
    const nameInput = page.locator('input[aria-label="Resume name"]')
    await nameInput.fill('Clean State Resume')
    await nameInput.blur()
    await expect(page.locator('[data-testid="toolbar-saved-msg"]')).toBeVisible(
      { timeout: 10_000 },
    )
    // First edit POSTed → URL now carries the uuid (refresh-safe)
    await page.waitForURL('**/builder/**', { timeout: 15_000 })
  }

    // Navigate away — should just work, no modal
    await page.getByRole('link', { name: 'My Resumes' }).click()
    await page.waitForURL('**/dashboard', { timeout: 10_000 })
    await expect(page.locator('h1').first()).toContainText('My Resumes')

    const modal = page.getByRole('dialog', { name: 'Unsaved Changes' })
    await expect(modal).toHaveCount(0)
  })
})
