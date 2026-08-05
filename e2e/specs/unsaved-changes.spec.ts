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
    await page.getByRole('button', { name: 'Create New Resume' }).first().click()
    await page.waitForURL('**/builder/**', { timeout: 15_000 })

    // Set resume name — blur commits the name and triggers the autosave
    // (the sole save mechanism), which persists it immediately.
    const nameInput = page.locator('input[aria-label="Resume name"]')
    await nameInput.fill('Unsaved Test Resume')
    await nameInput.blur()
    await expect(page.locator('[data-testid="toolbar-saved-msg"]')).toBeVisible(
      { timeout: 10_000 },
    )

    // The section editors are lazy-loaded async components. On mount,
    // NameContact/Summary add a default entry to empty sections, which
    // marks the store dirty again and schedules a second autosave ~1.5s
    // later. Wait for the editor to mount (default entry rendered) AND
    // for that post-mount autosave to complete (✓ Saved reappears), so
    // callers start from a genuinely clean store — otherwise a caller
    // that navigates away immediately (e.g. the clean-state test) can
    // race the second autosave and trip the Unsaved Changes guard.
    await expect(page.locator('#nc-full-name')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="toolbar-saved-msg"]')).toBeVisible(
      { timeout: 10_000 },
    )
  }

  test('shows unsaved changes dialog when navigating away with dirty state', async ({
    page,
  }) => {
    await loginAndCreateResume(page)

    // Edit a section field (commits to the store on input). The name input
    // is NOT used because name edits are autosaved on blur (RES-90/93), so
    // they are never "dirty" — a section field edit inside the 1.5s autosave
    // debounce window is a genuine unsaved change.
    const fullName = page.locator('#nc-full-name')
    await fullName.fill('Changed But Not Saved')

    // Try to navigate away by clicking a nav link
    await page.getByRole('link', { name: 'My Resumes' }).click()

    // Unsaved changes modal should appear. The modal is a reka-ui dialog
    // (ConfirmModal) — the data-testid on <ConfirmModal> is NOT forwarded
    // to the DOM, so locate it by its accessible role + name.
    const modal = page.getByRole('dialog', { name: 'Unsaved Changes' })
    await expect(modal).toBeVisible({ timeout: 5000 })
    await expect(modal).toContainText('Unsaved Changes')
  })

  test('clicking "Stay" keeps user on builder with edits intact', async ({
    page,
  }) => {
    await loginAndCreateResume(page)

    // Make a dirty edit on a section field (commits on input, inside the
    // autosave debounce window)
    const fullName = page.locator('#nc-full-name')
    await fullName.fill('Dirty Edit')

    // Try to navigate away
    await page.getByRole('link', { name: 'My Resumes' }).click()

    // Modal appears (reka-ui dialog — locate by role/name, see above)
    const modal = page.getByRole('dialog', { name: 'Unsaved Changes' })
    await expect(modal).toBeVisible({ timeout: 5000 })

    // Click "Stay"
    await modal.getByRole('button', { name: 'Stay' }).click()

    // Should still be on builder with the edit intact
    await expect(page.locator('#nc-full-name')).toHaveValue('Dirty Edit')
  })

  test('clicking "Leave" navigates away', async ({ page }) => {
    await loginAndCreateResume(page)

    // Make a dirty edit on a section field (commits on input, inside the
    // autosave debounce window)
    const fullName = page.locator('#nc-full-name')
    await fullName.fill('Leaving Edit')

    // Try to navigate away
    await page.getByRole('link', { name: 'My Resumes' }).click()

    // Modal appears (reka-ui dialog — locate by role/name, see above)
    const modal = page.getByRole('dialog', { name: 'Unsaved Changes' })
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
    const modal = page.getByRole('dialog', { name: 'Unsaved Changes' })
    await expect(modal).not.toBeVisible()
  })
})
