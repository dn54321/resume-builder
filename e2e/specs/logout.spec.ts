/**
 * Logout flow — critical path: session cleanup, security boundary
 * between users on shared devices.
 *
 * Tests the full stack: browser → frontend → backend → database.
 */
import { test, expect } from '@playwright/test'
import { resetE2eDatabase } from '../helpers/db-reset'

const BACKEND_PORT = parseInt(process.env.AGENT_PORT || '3000', 10)
const API_BASE = `http://localhost:${BACKEND_PORT}/api/v1`

test.describe('Logout', () => {
  const email = `logout-${Date.now()}@test.com`
  const password = 'TestPass123!'

  test.beforeAll(async ({ request }) => {
    resetE2eDatabase()

    const res = await request.post(`${API_BASE}/auth/signup`, {
      data: { email, password },
    })
    expect(res.status()).toBe(201)
  })

  test('logout clears session and redirects to home', async ({ page }) => {
    // 1. Login
    await page.goto('/login')
    await page.fill('#login-email', email)
    await page.fill('#login-password', password)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await expect(page.locator('h1').first()).toContainText('My Resumes')

    // 2. Open user dropdown (profile icon trigger)
    const userBtn = page.locator('header button', { has: page.locator('svg.lucide-user') })
    await userBtn.click()

    // 3. Click Log out
    await page.locator('[role="menuitem"]', { hasText: 'Log out' }).click()

    // 4. Verify redirect to /
    await page.waitForURL('**/', { timeout: 10_000 })

    // 5. Verify login/signup buttons are visible
    await expect(page.locator('header')).toContainText('Log in')
    await expect(page.locator('header')).toContainText('Sign up')

    // 6. Verify the session cookie was cleared by the logout API
    const cookies = await page.context().cookies()
    expect(cookies.find((c) => c.name === 'session_token')).toBeUndefined()

    // 7. Try to visit /dashboard — should redirect to /login
    await page.goto('/dashboard')
    await page.waitForURL('**/login**', { timeout: 10_000 })
  })

  test('logout from anywhere (e.g., builder page)', async ({ page }) => {
    // 1. Login
    await page.goto('/login')
    await page.fill('#login-email', email)
    await page.fill('#login-password', password)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })

    // 2. Create a resume and go to builder
    await page.getByRole('button', { name: 'Create New Resume' }).first().click()
    await page.waitForURL('**/builder/**', { timeout: 15_000 })
    await expect(page.locator('input[aria-label="Resume name"]')).toBeVisible()

    // 2b. Wait for the autosave to complete ("✓ Saved" indicator).
    // The SectionEditor components add default entries to empty sections on
    // mount, which marks the store dirty and schedules an autosave ~1.5s
    // later. With the RES-93-fixed contract that autosave PUT succeeds and
    // clears the dirty flag. Leaving the builder while still dirty would
    // trigger the Unsaved Changes guard, which is not what this test
    // (logout-from-anywhere) is about.
    await expect(
      page.locator('[data-testid="toolbar-saved-msg"]'),
    ).toBeVisible({ timeout: 10_000 })

    // 3. Logout from builder
    const userBtn = page.locator('header button', { has: page.locator('svg.lucide-user') })
    await userBtn.click()
    await page.locator('[role="menuitem"]', { hasText: 'Log out' }).click()

    // 4. Verify redirect to home
    await page.waitForURL('**/', { timeout: 10_000 })
    await expect(page.locator('header')).toContainText('Log in')
  })
})
