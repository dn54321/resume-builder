/**
 * Tailor Resume + locked sections — RES-92.
 *
 * When Tailor Resume runs keyword matching it must skip any section where
 * `locked === true`: locked sections keep their current visibility (eye)
 * state regardless of keyword matches. Unlocked sections are still filtered
 * as before, and the lock itself survives both Tailor and Reset Filter.
 *
 * This spec covers the FULL round-trip the unit tests can't:
 * browser → frontend → backend keyword engine → store → UI (dimmed state).
 *
 * RES-91 shipped the eye/lock toggles; this spec verifies the Tailor side.
 */
import { test, expect } from '@playwright/test'
import { resetE2eDatabase } from '../helpers/db-reset'

test.describe('Tailor Resume skips locked sections', () => {
  test.beforeAll(() => {
    resetE2eDatabase()
  })

  test('locked section keeps every bullet visible; unlocked sections still filtered; lock survives reset', async ({
    page,
  }) => {
    await page.goto('/builder')
    await page.waitForSelector('text=Name & Contact', { timeout: 10_000 })

    // ── 1. Select Experience and add one job with two bullets ──────────
    // Scope to the SectionToggles row via the lock-toggle testid so the
    // preview pane's <li> elements can't match.
    const expRow = page
      .locator('li')
      .filter({ has: page.locator('[data-testid="section-lock-toggle"]') })
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

    // ── 2. Lock the Experience section ─────────────────────────────────
    await expRow.locator('[data-testid="section-lock-toggle"]').click()
    await expect(expRow.locator('svg.lucide-lock')).toBeVisible()

    // ── 3. Save a JD and run Tailor Resume ─────────────────────────────
    await page.locator('[data-testid="jd-toolbar-btn"]').click()
    await page
      .locator('[data-testid="jd-textarea"]')
      .fill('React developer with TypeScript experience')
    await page.locator('[data-testid="jd-modal-tailor"]').click()
    await page.locator('[data-testid="toolbar-tailor-btn"]').click()

    // Filter became active…
    await expect(page.locator('[data-testid="filtered-badge"]')).toBeVisible()

    // …but the LOCKED section is untouched: both bullets stay visible,
    // including the one with zero JD overlap (coffee).
    await expect(bullet1Row).not.toHaveClass(/opacity-45/)
    await expect(bullet2Row).not.toHaveClass(/opacity-45/)

    // ── 4. Unlock → re-run Tailor → non-matching bullet IS now dimmed ──
    await expRow.locator('[data-testid="section-lock-toggle"]').click()
    await expect(expRow.locator('svg.lucide-lock-open')).toBeVisible()
    await page.locator('[data-testid="toolbar-tailor-btn"]').click()

    // Unlocked section: keyword matching applies as before.
    await expect(bullet1Row).not.toHaveClass(/opacity-45/)
    await expect(bullet2Row).toHaveClass(/opacity-45/)

    // ── 5. Lock again → Reset Filter → everything restored, lock persists ──
    await expRow.locator('[data-testid="section-lock-toggle"]').click()
    await expect(expRow.locator('svg.lucide-lock')).toBeVisible()

    await page.locator('[data-testid="toolbar-reset-btn"]').click()
    await expect(page.locator('[data-testid="filtered-badge"]')).toHaveCount(0)
    await expect(bullet1Row).not.toHaveClass(/opacity-45/)
    await expect(bullet2Row).not.toHaveClass(/opacity-45/)

    // Reset Filter clears visibility state but does NOT unlock the section.
    await expect(expRow.locator('svg.lucide-lock')).toBeVisible()
  })
})
