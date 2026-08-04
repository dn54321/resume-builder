/**
 * Dark mode toggle — critical path: accessibility for users with light
 * sensitivity who rely on dark mode.
 *
 * Tests the full stack: browser → frontend → backend → database.
 */
import { test, expect } from '@playwright/test'
import { resetE2eDatabase } from '../helpers/db-reset'

test.describe('Dark mode', () => {
  test.beforeAll(() => {
    resetE2eDatabase()
  })

  test('dark mode toggle applies and persists across navigation', async ({
    page,
  }) => {
    await page.goto('/')

    // Initially, the html element should not have 'dark' class (system default)
    // unless the system prefers dark mode
    // Toggle dark mode via theme button
    const themeBtn = page.locator('[data-testid="theme-toggle"]')
    await themeBtn.click()

    // Select "Dark" from dropdown
    await page.locator('[data-testid="theme-dark"]').click()

    // Wait for the class to be applied
    await page.waitForTimeout(300)

    // Verify dark class is on html element
    const htmlClass = await page.locator('html').getAttribute('class')
    expect(htmlClass).toContain('dark')

    // Navigate to login page — dark mode should persist
    await page.goto('/login')
    await page.waitForTimeout(300)

    const loginHtmlClass = await page.locator('html').getAttribute('class')
    expect(loginHtmlClass).toContain('dark')

    // Navigate to builder — dark mode should persist
    await page.goto('/builder')
    await page.waitForTimeout(300)

    const builderHtmlClass = await page
      .locator('html')
      .getAttribute('class')
    expect(builderHtmlClass).toContain('dark')
  })

  test('dark mode persists after page reload', async ({ page }) => {
    await page.goto('/')

    // Enable dark mode
    const themeBtn = page.locator('[data-testid="theme-toggle"]')
    await themeBtn.click()
    await page.locator('[data-testid="theme-dark"]').click()
    await page.waitForTimeout(300)

    // Reload the page
    await page.reload()
    await page.waitForTimeout(300)

    // Dark mode should still be applied (stored in localStorage)
    const htmlClass = await page.locator('html').getAttribute('class')
    expect(htmlClass).toContain('dark')
  })

  test('can switch back to light mode', async ({ page }) => {
    await page.goto('/')

    // First enable dark mode
    const themeBtn = page.locator('[data-testid="theme-toggle"]')
    await themeBtn.click()
    await page.locator('[data-testid="theme-dark"]').click()
    await page.waitForTimeout(300)

    // Then switch to light
    await themeBtn.click()
    await page.locator('[data-testid="theme-light"]').click()
    await page.waitForTimeout(300)

    const htmlClass = await page.locator('html').getAttribute('class')
    // Light mode: 'dark' class should NOT be present
    expect(htmlClass === null || !htmlClass.includes('dark')).toBe(true)
  })
})
