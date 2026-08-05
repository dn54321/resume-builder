/**
 * Section toggle flow — critical path: core builder feature for controlling
 * what appears on the resume. Broken toggle means wrong content on export.
 *
 * Tests the full stack: browser → frontend → backend → database.
 *
 * NOTE (RES-93 rebase): RES-91 replaced the old toggle-switch checkbox UI
 * with eye/lock icon buttons in SectionToggles.vue. This spec was left
 * testing the removed checkbox DOM (`input[type="checkbox"]`, switch
 * `span`), so it was red on master. It now targets the current
 * `data-testid="section-eye-toggle"` button.
 */
import { test, expect } from '@playwright/test'
import { resetE2eDatabase } from '../helpers/db-reset'

test.describe('Section toggle', () => {
  test.beforeAll(() => {
    resetE2eDatabase()
  })

  test('sections are visible by default', async ({ page }) => {
    await page.goto('/builder')

    // Wait for section list to render
    await page.waitForSelector('text=Name & Contact', { timeout: 10_000 })

    // All sections should be visible in the sidebar
    const sectionLabels = [
      'Name & Contact',
      'Summary',
      'Experience',
      'Education',
      'Hard Skills',
      'Soft Skills',
      'Projects',
      'Certifications',
      'Languages',
      'Hobbies',
    ]

    for (const label of sectionLabels) {
      await expect(page.locator('text=' + label).first()).toBeVisible()
    }

    // Every row has an eye toggle, and it is "pressed" (section enabled)
    const eyeToggles = page.getByTestId('section-eye-toggle')
    expect(await eyeToggles.count()).toBe(10)
    for (let i = 0; i < 10; i++) {
      await expect(eyeToggles.nth(i)).toHaveAttribute('aria-pressed', 'true')
    }
  })

  test('can toggle a section off and on', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForSelector('text=Summary', { timeout: 10_000 })

    // Find the "Summary" section item
    const summaryLi = page.locator('li').filter({ hasText: 'Summary' })

    // The eye toggle button starts pressed (section visible)
    const eyeToggle = summaryLi.getByTestId('section-eye-toggle')
    await expect(eyeToggle).toHaveAttribute('aria-pressed', 'true')

    // Toggle it off — aria-pressed flips and the row gets reduced opacity
    await eyeToggle.click()
    await expect(eyeToggle).toHaveAttribute('aria-pressed', 'false')
    await expect(summaryLi).toHaveClass(/opacity-55/)

    // Toggle it back on
    await eyeToggle.click()
    await expect(eyeToggle).toHaveAttribute('aria-pressed', 'true')
    await expect(summaryLi).not.toHaveClass(/opacity-55/)
  })

  test('disabled section has reduced opacity', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForSelector('text=Hobbies', { timeout: 10_000 })

    const hobbiesLi = page.locator('li').filter({ hasText: 'Hobbies' })

    // The row is fully opaque while enabled
    await expect(hobbiesLi).not.toHaveClass(/opacity-55/)

    // Toggle it off via the eye button
    await hobbiesLi.getByTestId('section-eye-toggle').click()
    await expect(hobbiesLi).toHaveClass(/opacity-55/)
  })
})
