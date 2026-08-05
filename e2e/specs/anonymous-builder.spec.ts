/**
 * Anonymous resume builder flow — critical path: unauthenticated users
 * must be able to build a resume immediately without friction.
 *
 * Tests the full stack: browser → frontend → backend → database.
 */
import { test, expect } from '@playwright/test'
import { resetE2eDatabase } from '../helpers/db-reset'

test.describe('Anonymous resume builder', () => {
  test.beforeAll(() => {
    resetE2eDatabase()
  })

  test('landing page → Get Started → builder loads', async ({ page }) => {
    // 1. Visit home page
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('Build a resume')

    // 2. Click "Get Started" button
    await page.getByRole('link', { name: 'Get Started' }).click()

    // 3. Verify builder loads at /builder
    await page.waitForURL('**/builder')
    await expect(page.locator('input[aria-label="Resume name"]')).toBeVisible()

    // 4. Verify anonymous banner is shown (no auth)
    // Scope to the app navbar links — a bare 'header' locator is ambiguous
    // (the builder toolbar header also matches) and fails in strict mode.
    // exact: true distinguishes the navbar "Log in" from the builder
    // banner's "Log In".
    await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign up', exact: true })).toBeVisible()
  })

  test('fill personal info section', async ({ page }) => {
    await page.goto('/builder')

    // Select the name-contact section (first section) via its eye toggle
    const sections = page.locator('[data-testid="section-eye-toggle"]')
    const sectionCount = await sections.count()
    if (sectionCount > 0) {
      await sections.first().click()
    }

    // Fill the resume name
    const nameInput = page.locator('input[aria-label="Resume name"]')
    await nameInput.fill('My Anonymous Resume')

    // Verify the preview updates (name should appear somewhere)
    // The LivePreview may show the resume name
    await expect(nameInput).toHaveValue('My Anonymous Resume')
  })

  test('no save button for anonymous users — autosave is the only save mechanism', async ({
    page,
  }) => {
    await page.goto('/builder')

    // The manual "Save" button has been removed entirely — autosave is the
    // sole save mechanism, so there is nothing to hide for anonymous users.
    const saveBtn = page.locator('[data-testid="toolbar-save-btn"]')
    expect(await saveBtn.count()).toBe(0)
  })

  test('login and signup links available for anonymous users', async ({
    page,
  }) => {
    await page.goto('/builder')

    // Header should show Log in and Sign up
    await expect(page.getByRole('banner')).toContainText('Log in')
    await expect(page.getByRole('banner')).toContainText('Sign up')
  })
})
