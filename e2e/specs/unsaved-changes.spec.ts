/**
 * Unsaved changes guard — critical path: data loss prevention.
 * If this fails, users lose work and trust is destroyed.
 *
 * Tests the full stack: browser → frontend → backend → database.
 */
import { test, expect } from '@playwright/test'
import { resetE2eDatabase } from '../helpers/db-reset'

const BACKEND_PORT = parseInt(process.env.AGENT_PORT || '3000', 10)
const API_BASE = `http://localhost:${BACKEND_PORT}/api/v1`

test.describe('Unsaved changes guard', () => {
  const email = `unsaved-${Date.now()}@test.com`
  const password = 'TestPass123!'

  test.beforeAll(async ({ request }) => {
    resetE2eDatabase()

    const res = await request.post(`${API_BASE}/auth/signup`, {
      data: { email, password },
    })
    expect(res.status()).toBe(201)
  })

  async function loginAndCreateResume(page: any): Promise<void> {
    await page.goto('/login')
    await page.fill('#login-email', email)
    await page.fill('#login-password', password)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })

    // Create a resume
    await page.getByRole('button', { name: 'Create New Resume' }).click()
    await page.waitForURL('**/builder/**', { timeout: 15_000 })

    // Set resume name and save
    const nameInput = page.locator('input[aria-label="Resume name"]')
    await nameInput.fill('Unsaved Test Resume')
    const saveBtn = page.locator('[data-testid="toolbar-save-btn"]')
    await saveBtn.click()
    await expect(page.locator('[data-testid="toolbar-saved-msg"]')).toBeVisible(
      { timeout: 10_000 },
    )
  }

  test('shows unsaved changes dialog when navigating away with dirty state', async ({
    page,
  }) => {
    await loginAndCreateResume(page)

    // Edit the resume name (but don't save) — this makes it dirty
    const nameInput = page.locator('input[aria-label="Resume name"]')
    await nameInput.fill('Changed But Not Saved')

    // Try to navigate away by clicking a nav link
    await page.getByRole('link', { name: 'My Resumes' }).click()

    // Unsaved changes modal should appear
    const modal = page.locator('[data-testid="unsaved-modal"]')
    await expect(modal).toBeVisible({ timeout: 5000 })
    await expect(modal).toContainText('Unsaved Changes')
  })

  test('clicking "Stay" keeps user on builder with edits intact', async ({
    page,
  }) => {
    await loginAndCreateResume(page)

    // Make a dirty edit
    const nameInput = page.locator('input[aria-label="Resume name"]')
    await nameInput.fill('Dirty Edit')
    // The name field triggers dirty state on input

    // Try to navigate away
    await page.getByRole('link', { name: 'My Resumes' }).click()

    // Modal appears
    const modal = page.locator('[data-testid="unsaved-modal"]')
    await expect(modal).toBeVisible({ timeout: 5000 })

    // Click "Stay"
    await modal.getByRole('button', { name: 'Stay' }).click()

    // Should still be on builder
    await expect(page.locator('input[aria-label="Resume name"]')).toHaveValue(
      'Dirty Edit',
    )
  })

  test('clicking "Leave" navigates away', async ({ page }) => {
    await loginAndCreateResume(page)

    // Make a dirty edit
    const nameInput = page.locator('input[aria-label="Resume name"]')
    await nameInput.fill('Leaving Edit')

    // Try to navigate away
    await page.getByRole('link', { name: 'My Resumes' }).click()

    // Modal appears
    const modal = page.locator('[data-testid="unsaved-modal"]')
    await expect(modal).toBeVisible({ timeout: 5000 })

    // Click "Leave"
    await modal.getByRole('button', { name: 'Leave' }).click()

    // Should navigate to dashboard
    await page.waitForURL('**/dashboard', { timeout: 10_000 })
    await expect(page.locator('h1').first()).toContainText('My Resumes')
  })

  test('no warning after save (clean state)', async ({ page }) => {
    await loginAndCreateResume(page)

    // Resume is already saved, so no dirty state
    // Navigate away should just work
    await page.getByRole('link', { name: 'My Resumes' }).click()

    // Should navigate to dashboard without modal
    await page.waitForURL('**/dashboard', { timeout: 10_000 })
    await expect(page.locator('h1').first()).toContainText('My Resumes')

    // Modal should NOT have appeared
    const modal = page.locator('[data-testid="unsaved-modal"]')
    await expect(modal).not.toBeVisible()
  })
})
