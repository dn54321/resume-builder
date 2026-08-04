/**
 * Session persistence across reloads — critical path: users must stay
 * logged in. Broken sessions force re-login mid-workflow.
 *
 * Tests the full stack: browser → frontend → backend → database.
 */
import { test, expect } from '@playwright/test'
import { resetE2eDatabase } from '../helpers/db-reset'

const BACKEND_PORT = parseInt(process.env.AGENT_PORT || '3000', 10)
const API_BASE = `http://localhost:${BACKEND_PORT}/api/v1`

test.describe('Session persistence', () => {
  const email = `session-${Date.now()}@test.com`
  const password = 'TestPass123!'

  test.beforeAll(async ({ request }) => {
    resetE2eDatabase()

    const res = await request.post(`${API_BASE}/auth/signup`, {
      data: { email, password },
    })
    expect(res.status()).toBe(201)
  })

  test('session persists across page reloads', async ({ page }) => {
    // 1. Login
    await page.goto('/login')
    await page.fill('#login-email', email)
    await page.fill('#login-password', password)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await expect(page.locator('h1').first()).toContainText('My Resumes')

    // 2. Reload page
    await page.reload()
    await page.waitForURL('**/dashboard')

    // 3. Verify still authenticated (no redirect to /login)
    await expect(page.locator('h1').first()).toContainText('My Resumes')
    await expect(page.locator('header')).toContainText(email)

    // 4. Verify /api/v1/auth/me returns user
    const token = await page.evaluate(() =>
      localStorage.getItem('auth_token'),
    )
    expect(token).toBeTruthy()

    const meRes = await page.request.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(meRes.status()).toBe(200)
    const body = await meRes.json()
    expect(body.user.email).toBe(email)
  })

  test('authenticated user can navigate to builder after reload', async ({
    page,
  }) => {
    // 1. Login
    await page.goto('/login')
    await page.fill('#login-email', email)
    await page.fill('#login-password', password)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })

    // 2. Reload
    await page.reload()
    await page.waitForURL('**/dashboard')

    // 3. Navigate to builder
    await page.getByRole('button', { name: 'Create New Resume' }).click()
    await page.waitForURL('**/builder/**', { timeout: 15_000 })

    // 4. Verify still authenticated on builder
    await expect(page.locator('header')).toContainText(email)
  })

  test('unauthenticated user cannot access dashboard', async ({ page }) => {
    // Clear localStorage
    await page.goto('/')
    await page.evaluate(() => localStorage.removeItem('auth_token'))

    // Try to visit dashboard
    await page.goto('/dashboard')

    // Should redirect to login
    await page.waitForURL('**/login**', { timeout: 10_000 })
  })
})
