/**
 * Authenticated resume builder flow — critical path: the primary workflow
 * for returning users: create, edit, persist resumes.
 *
 * Tests the full stack: browser → frontend → backend → database.
 */
import { test, expect } from '@playwright/test'
import { resetE2eDatabase } from '../helpers/db-reset'

const BACKEND_PORT = parseInt(process.env.AGENT_PORT || '3000', 10)
const API_BASE = `http://localhost:${BACKEND_PORT}/api/v1`

test.describe('Authenticated resume builder', () => {
  const email = `auth-builder-${Date.now()}@test.com`
  const password = 'TestPass123!'

  test.beforeAll(async ({ request }) => {
    resetE2eDatabase()

    // Create user and get session token
    const res = await request.post(`${API_BASE}/auth/signup`, {
      data: { email, password },
    })
    expect(res.status()).toBe(201)
  })

  /**
   * Helper: log in and set localStorage token.
   */
  async function loginAndGoToDashboard(page: any) {
    await page.goto('/login')
    await page.fill('#login-email', email)
    await page.fill('#login-password', password)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
  }

  test('create new resume → fill sections → save → reload → verify persisted', async ({
    page,
  }) => {
    // 1. Login and go to dashboard
    await loginAndGoToDashboard(page)
    await expect(page.locator('h1').first()).toContainText('My Resumes')

    // 2. Create a new resume
    await page.getByRole('button', { name: 'Create New Resume' }).click()

    // 3. Verify redirected to builder with an ID
    await page.waitForURL('**/builder/**', { timeout: 15_000 })

    // 4. Set resume name
    const nameInput = page.locator('input[aria-label="Resume name"]')
    await nameInput.fill('My Test Resume')

    // 5. Click Save
    const saveBtn = page.locator('[data-testid="toolbar-save-btn"]')
    await saveBtn.click()

    // 6. Wait for "Saved" confirmation
    await expect(page.locator('[data-testid="toolbar-saved-msg"]')).toBeVisible({
      timeout: 10_000,
    })

    // 7. Reload page
    await page.reload()
    await page.waitForURL('**/builder/**')

    // 8. Verify resume name is restored
    const nameInputAfter = page.locator('input[aria-label="Resume name"]')
    await expect(nameInputAfter).toHaveValue('My Test Resume', {
      timeout: 10_000,
    })

    // 9. Edit name and save again
    await nameInputAfter.fill('Updated Resume Name')
    await nameInputAfter.blur()
    // Blur triggers save
    await page.waitForTimeout(2000)

    // 10. Reload and verify update persisted
    await page.reload()
    await page.waitForURL('**/builder/**')
    const nameInputFinal = page.locator('input[aria-label="Resume name"]')
    await expect(nameInputFinal).toHaveValue(
      'Updated Resume Name',
      { timeout: 10_000 },
    )
  })

  test('dashboard shows created resume', async ({ page }) => {
    await loginAndGoToDashboard(page)

    // Create a resume first
    await page.getByRole('button', { name: 'Create New Resume' }).click()
    await page.waitForURL('**/builder/**', { timeout: 15_000 })

    const nameInput = page.locator('input[aria-label="Resume name"]')
    await nameInput.fill('Dashboard Test Resume')
    const saveBtn = page.locator('[data-testid="toolbar-save-btn"]')
    if (await saveBtn.isVisible()) {
      await saveBtn.click()
      await expect(
        page.locator('[data-testid="toolbar-saved-msg"]'),
      ).toBeVisible({ timeout: 10_000 })
    }

    // Go back to dashboard
    await page.goto('/dashboard')
    await page.waitForURL('**/dashboard')
    await expect(page.locator('h1').first()).toContainText('My Resumes')

    // Should see the created resume in the grid
    // The resume name appears in a card
    await expect(page.locator('.resume-card')).toHaveCount(1)
  })
})
