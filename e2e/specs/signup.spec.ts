/**
 * Sign Up flow — critical path: users must be able to create accounts.
 *
 * Tests the full stack: browser → frontend → backend → database.
 */
import { test, expect } from '@playwright/test'

test.describe('Sign Up flow', () => {
  const email = `signup-e2e-${Date.now()}@test.com`
  const password = 'TestPass123!'

  test('complete signup flow: form → redirect → session → DB', async ({
    page,
  }) => {
    // 1. Visit signup page
    await page.goto('/signup')
    await expect(page.locator('h1, h2').first()).toContainText('Sign')

    // 2. Fill the form
    await page.fill('#signup-email', email)
    await page.fill('#signup-password', password)
    await page.fill('#signup-confirm', password)

    // 3. Submit
    const submitBtn = page.locator('button[type="submit"]')
    await submitBtn.click()

    // 4. Verify redirect to dashboard
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await expect(page.locator('h1').first()).toContainText('My Resumes')

    // 5. Verify authenticated nav state — user email visible in dropdown
    await expect(page.locator('header')).toContainText(email)

    // 6. Verify Log in / Sign up buttons are gone
    await expect(page.locator('header')).not.toContainText('Log in')

    // 7. Verify session persists: reload page
    await page.reload()
    await page.waitForURL('**/dashboard')
    await expect(page.locator('h1').first()).toContainText('My Resumes')

    // 8. Verify /api/v1/auth/me returns the user
    const apiBase = process.env.VITE_API_BASE_URL || 'http://localhost:3000'
    const token = await page.evaluate(() =>
      localStorage.getItem('auth_token'),
    )
    expect(token).toBeTruthy()

    const meRes = await page.request.get(`${apiBase}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(meRes.status()).toBe(200)
    const meBody = await meRes.json()
    expect(meBody.user).toBeTruthy()
    expect(meBody.user.email).toBe(email)
  })

  test('signup validation: empty fields', async ({ page }) => {
    await page.goto('/signup')
    await page.click('button[type="submit"]')

    // Validation errors should appear
    await expect(page.locator('[role="alert"]')).toBeVisible()
    await expect(page.locator('[role="alert"]')).toContainText(
      'Email is required',
    )
    await expect(page.locator('[role="alert"]')).toContainText(
      'Password is required',
    )
  })

  test('signup validation: short password', async ({ page }) => {
    await page.goto('/signup')
    await page.fill('#signup-email', 'test@test.com')
    await page.fill('#signup-password', 'short')
    await page.fill('#signup-confirm', 'short')
    await page.click('button[type="submit"]')

    await expect(page.locator('[role="alert"]')).toContainText(
      'at least 8 characters',
    )
  })

  test('signup validation: passwords do not match', async ({ page }) => {
    await page.goto('/signup')
    await page.fill('#signup-email', 'test@test.com')
    await page.fill('#signup-password', 'password123')
    await page.fill('#signup-confirm', 'different')
    await page.click('button[type="submit"]')

    await expect(page.locator('[role="alert"]')).toContainText(
      'do not match',
    )
  })
})
