/**
 * Login flow — critical path: users must be able to log in to access
 * saved resumes and account features.
 *
 * Tests the full stack: browser → frontend → backend → database.
 */
import { test, expect } from '@playwright/test'
import { resetE2eDatabase } from '../helpers/db-reset'

const BACKEND_PORT = parseInt(process.env.AGENT_PORT || '3000', 10)
const API_BASE = `http://localhost:${BACKEND_PORT}/api/v1`

test.describe('Login flow', () => {
  const email = `login-e2e-${Date.now()}@test.com`
  const password = 'TestPass123!'

  test.beforeAll(async ({ request }) => {
    resetE2eDatabase()

    // Create a user via API that we can log in with
    const res = await request.post(`${API_BASE}/auth/signup`, {
      data: { email, password },
    })
    expect(res.status()).toBe(201)
  })

  test('complete login flow: form → redirect → session → dashboard', async ({
    page,
  }) => {
    // 1. Visit login page
    await page.goto('/login')
    // The CardTitle renders as an <h3> (RES-82 era markup)
    await expect(page.locator('h1, h2, h3').first()).toContainText('Log')

    // 2. Fill credentials
    await page.fill('#login-email', email)
    await page.fill('#login-password', password)

    // 3. Submit
    await page.click('button[type="submit"]')

    // 4. Verify redirect to dashboard
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await expect(page.locator('h1').first()).toContainText('My Resumes')

    // 5. Verify authenticated nav state — profile icon shown instead of email
    await expect(page.locator('header button svg.lucide-user')).toBeVisible()
    await expect(page.getByRole('banner')).not.toContainText(email)

    // 6. Verify the httpOnly session cookie was set for the API origin
    // (auth is cookie-based — localStorage.auth_token is a legacy leftover)
    const cookies = await page.context().cookies(`http://localhost:${BACKEND_PORT}`)
    const sessionCookie = cookies.find((c) => c.name === 'session_token')
    expect(sessionCookie).toBeTruthy()

    // 7. Verify /api/v1/auth/me returns user (cookie is sent automatically)
    const meRes = await page.request.get(`${API_BASE}/auth/me`)
    expect(meRes.status()).toBe(200)
    const meBody = await meRes.json()
    expect(meBody.user.email).toBe(email)
  })

  test('login validation: empty fields', async ({ page }) => {
    await page.goto('/login')
    await page.click('button[type="submit"]')

    await expect(page.locator('[role="alert"]')).toBeVisible()
    await expect(page.locator('[role="alert"]')).toContainText(
      'Email is required',
    )
    await expect(page.locator('[role="alert"]')).toContainText(
      'Password is required',
    )
  })

  test('login: invalid credentials show error', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#login-email', 'wrong@test.com')
    await page.fill('#login-password', 'wrongpassword')
    await page.click('button[type="submit"]')

    // Should show error message
    await expect(page.locator('[role="alert"]')).toBeVisible()
  })

  test('login: redirects to requested page after auth', async ({ page }) => {
    // Try to visit dashboard without auth — should redirect to login
    await page.goto('/dashboard')
    // Vue Router serializes the redirect query un-encoded (redirect=/dashboard)
    await page.waitForURL('**/login?redirect=/dashboard', { timeout: 15_000 })

    // Now login
    await page.fill('#login-email', email)
    await page.fill('#login-password', password)
    await page.click('button[type="submit"]')

    // Should redirect back to dashboard
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await expect(page.locator('h1').first()).toContainText('My Resumes')
  })
})
