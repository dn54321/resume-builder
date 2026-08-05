/**
 * Section toggle flow — critical path: core builder feature for controlling
 * what appears on the resume. Broken toggle means wrong content on export.
 *
 * The old checkbox/switch toggle was replaced with an eye icon
 * (visibility) per section row. The Tailor-protect lock lives on the
 * individual sub-items (entries) inside the editors — the eye stays on
 * sections, the lock lives on entries.
 *
 * Tests the full stack: browser → frontend → backend → database.
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
  })

  test('every section row shows an eye icon and no lock icon (RES-97)', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForSelector('text=Name & Contact', { timeout: 10_000 })

    const rows = page
      .locator('li')
      .filter({ has: page.locator('[data-testid="section-eye-toggle"]') })
    await expect(rows).toHaveCount(10)

    for (let i = 0; i < 10; i++) {
      const row = rows.nth(i)
      await expect(row.locator('[data-testid="section-eye-toggle"]')).toBeVisible()
      // The lock toggle no longer exists on section rows.
      await expect(row.locator('[data-testid="section-lock-toggle"]')).toHaveCount(0)
      await expect(row.locator('svg.lucide-lock, svg.lucide-lock-open')).toHaveCount(0)
    }
  })

  test('eye icon toggles a section off and on', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForSelector('text=Summary', { timeout: 10_000 })

    const summaryRow = page.locator('li').filter({ hasText: 'Summary' })

    // Enabled by default: open Eye icon shown, row at full opacity
    await expect(summaryRow.locator('svg.lucide-eye')).toBeVisible()
    await expect(summaryRow.locator('svg.lucide-eye-off')).toHaveCount(0)

    // Click the eye → section becomes disabled: slashed EyeOff icon + dimmed row
    await summaryRow.locator('[data-testid="section-eye-toggle"]').click()
    await expect(summaryRow.locator('svg.lucide-eye-off')).toBeVisible()
    await expect(summaryRow.locator('svg.lucide-eye')).toHaveCount(0)
    await expect(summaryRow).toHaveClass(/opacity-55/)

    // Click the eye again → re-enabled
    await summaryRow.locator('[data-testid="section-eye-toggle"]').click()
    await expect(summaryRow.locator('svg.lucide-eye')).toBeVisible()
    await expect(summaryRow.locator('svg.lucide-eye-off')).toHaveCount(0)
    await expect(summaryRow).not.toHaveClass(/opacity-55/)
  })

  test('entry lock toggle protects a sub-item inside the editor (RES-97)', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForSelector('text=Experience', { timeout: 10_000 })

    // Open the Experience editor (it is enabled by default; select it).
    const experienceRow = page.locator('li').filter({ hasText: 'Experience' })
    await experienceRow.locator('label').first().click()

    // Add a job entry so there is a sub-item to lock.
    const addBtn = page.locator('button', { hasText: '+ Add Job' })
    await addBtn.click()

    const entryPanel = page.locator('[data-entry-panel]').first()
    const lockBtn = entryPanel.locator('[data-testid="entry-lock-toggle"]')
    await expect(lockBtn).toBeVisible()

    // Unlocked by default: open LockOpen icon.
    await expect(entryPanel.locator('svg.lucide-lock-open')).toBeVisible()
    await expect(entryPanel.locator('svg.lucide-lock')).toHaveCount(0)

    // Click the lock → locked: closed Lock icon.
    await lockBtn.click()
    await expect(entryPanel.locator('svg.lucide-lock')).toBeVisible()
    await expect(entryPanel.locator('svg.lucide-lock-open')).toHaveCount(0)

    // Click again → unlocked.
    await lockBtn.click()
    await expect(entryPanel.locator('svg.lucide-lock-open')).toBeVisible()
    await expect(entryPanel.locator('svg.lucide-lock')).toHaveCount(0)
  })

  test('label click selects the section in the editor', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForSelector('text=Experience', { timeout: 10_000 })

    const experienceRow = page.locator('li').filter({ hasText: 'Experience' })

    // Click the label text (not the icons) — selects + highlights the section
    await experienceRow.locator('label').first().click()
    await expect(experienceRow.locator('label span').first()).toHaveClass(/text-primary/)
  })

  test('disabled section is not draggable', async ({ page }) => {
    await page.goto('/builder')
    await page.waitForSelector('text=Hobbies', { timeout: 10_000 })

    const hobbiesRow = page.locator('li').filter({ hasText: 'Hobbies' })

    // Enabled by default → draggable
    await expect(hobbiesRow).toHaveAttribute('draggable', 'true')

    // Disable it via the eye icon → no longer draggable
    await hobbiesRow.locator('[data-testid="section-eye-toggle"]').click()
    await expect(hobbiesRow).toHaveAttribute('draggable', 'false')
    await expect(hobbiesRow).toHaveClass(/opacity-55/)
  })
})
