/**
 * Tailor Resume + locked entries — RES-92/RES-97.
 *
 * RES-97 moved the Tailor-protect lock from section rows onto individual
 * sub-items (entries) inside the editors. When Tailor Resume runs keyword
 * matching it must skip any entry where `locked === true`: locked entries
 * keep every bullet visible regardless of keyword matches. Unlocked
 * entries are still filtered as before, and the lock itself survives both
 * Tailor and Reset Filter.
 *
 * This spec covers the FULL round-trip the unit tests can't:
 * browser → frontend → backend keyword engine → store → UI (dimmed state).
 */
import { test, expect } from '@playwright/test'
import { resetE2eDatabase } from '../helpers/db-reset'

test.describe('Tailor Resume skips locked entries', () => {
  test.beforeAll(() => {
    resetE2eDatabase()
  })

  test('locked entry keeps every bullet visible; unlocked entries still filtered; lock survives reset', async ({
    page,
  }) => {
    await page.goto('/builder')
    await page.waitForSelector('text=Name & Contact', { timeout: 10_000 })

    // ── 1. Select Experience and add one job with two bullets ──────────
    // Scope to the SectionToggles row via the eye-toggle testid so the
    // preview pane's <li> elements can't match.
    const expRow = page
      .locator('li')
      .filter({ has: page.locator('[data-testid="section-eye-toggle"]') })
      .filter({ hasText: 'Experience' })
    await expRow.locator('label').first().click()

    // All editors render stacked; wait for the Experience editor's add button.
    await page.getByRole('button', { name: '+ Add Job' }).waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: '+ Add Job' }).click()
    await page.getByPlaceholder('Acme Corp').fill('Acme Corp')
    await page.getByPlaceholder('Software Engineer').fill('Software Engineer')

    // Two bullets: one that matches the JD, one that does not.
    await page.getByRole('button', { name: '+ Add bullet point' }).first().click()
    await page.getByRole('button', { name: '+ Add bullet point' }).first().click()
    await page
      .getByLabel('Bullet point 1')
      .fill('Built React applications with TypeScript')
    await page
      .getByLabel('Bullet point 2')
      .fill('Managed coffee supply chain logistics')

    const bullet1Row = page.getByLabel('Bullet point 1').locator('xpath=..')
    const bullet2Row = page.getByLabel('Bullet point 2').locator('xpath=..')

    // ── 2. Lock the JOB ENTRY (RES-97: locks live on sub-items) ────────
    // The Experience editor's first entry panel holds the lock toggle.
    const entryPanel = page.locator('[data-entry-panel]').first()
    const lockBtn = entryPanel.locator('[data-testid="entry-lock-toggle"]')
    await expect(lockBtn).toBeVisible()
    await lockBtn.click()
    await expect(entryPanel.locator('svg.lucide-lock')).toBeVisible()

    // ── 3. Save a JD and run Tailor Resume (one-step from the modal) ───
    await page.locator('[data-testid="jd-toolbar-btn"]').click()
    await page
      .locator('[data-testid="jd-textarea"]')
      .fill('React developer with TypeScript experience')
    await page.locator('[data-testid="jd-modal-tailor"]').click()

    // Filter became active…
    await expect(page.locator('[data-testid="filtered-badge"]')).toBeVisible()

    // …but the LOCKED entry is untouched: both bullets stay visible,
    // including the one with zero JD overlap (coffee).
    await expect(bullet1Row).not.toHaveClass(/opacity-45/)
    await expect(bullet2Row).not.toHaveClass(/opacity-45/)

    // ── 4. Unlock → re-run Tailor → non-matching bullet IS now dimmed ──
    // The toolbar button is gone (RES-107): re-run tailoring via the JD modal.
    await lockBtn.click()
    await expect(entryPanel.locator('svg.lucide-lock-open')).toBeVisible()
    await page.locator('[data-testid="jd-toolbar-btn"]').click()
    await page
      .locator('[data-testid="jd-textarea"]')
      .fill('React developer with TypeScript experience')
    await page.locator('[data-testid="jd-modal-tailor"]').click()

    // Unlocked entry: keyword matching applies as before.
    await expect(bullet1Row).not.toHaveClass(/opacity-45/)
    await expect(bullet2Row).toHaveClass(/opacity-45/)

    // ── 5. Lock again → Reset Filter → everything restored, lock persists ──
    await lockBtn.click()
    await expect(entryPanel.locator('svg.lucide-lock')).toBeVisible()

    await page.locator('[data-testid="toolbar-reset-btn"]').click()
    await expect(page.locator('[data-testid="filtered-badge"]')).toHaveCount(0)
    await expect(bullet1Row).not.toHaveClass(/opacity-45/)
    await expect(bullet2Row).not.toHaveClass(/opacity-45/)

    // Reset Filter clears visibility state but does NOT unlock the entry.
    await expect(entryPanel.locator('svg.lucide-lock')).toBeVisible()
  })
})
