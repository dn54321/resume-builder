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

    // 2. Open user dropdown (profile icon trigger) — scope to the App navbar
    //    (role=banner): the dashboard/builder views render their own <header>
    //    too, so a bare 'header' locator is ambiguous in strict mode.
    const userBtn = page
      .getByRole('banner')
      .locator('button', { has: page.locator('svg.lucide-user') })
    await userBtn.click()

    // 3. Click Log out
    await page.locator('[role="menuitem"]', { hasText: 'Log out' }).click()

    // 4. Verify redirect to /
    await page.waitForURL('**/', { timeout: 10_000 })

    // 5. Verify login/signup buttons are visible (scope to the App navbar)
    await expect(page.getByRole('banner')).toContainText('Log in')
    await expect(page.getByRole('banner')).toContainText('Sign up')

    // 6. Verify the session cookie is gone (cookie-based auth — there is
    //    no localStorage auth_token)
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

    // 2. Create a resume and go to builder — dashboard renders two
    //    'Create New Resume' buttons (header + empty state); .first()
    //    avoids a strict-mode violation.
    await page
      .getByRole('button', { name: 'Create New Resume' })
      .first()
      .click()
    await page.waitForURL('**/builder', { timeout: 15_000 })
    await expect(page.locator('input[aria-label="Resume name"]')).toBeVisible()

    // 3. Logout from builder — scope to the App navbar (role=banner): the
    //    builder toolbar also renders a <header>.
    const userBtn = page
      .getByRole('banner')
      .locator('button', { has: page.locator('svg.lucide-user') })
    await userBtn.click()
    await page.locator('[role="menuitem"]', { hasText: 'Log out' }).click()

    // 4. Verify redirect to home
    await page.waitForURL('**/', { timeout: 10_000 })
    await expect(page.getByRole('banner')).toContainText('Log in')
  })
})
