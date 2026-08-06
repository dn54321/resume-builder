/**
 * Tailor Resume UX — RES-108.
 *
 * Tailor must ONLY toggle section sub-items (and bullet points) — it must
 * NEVER toggle whole sections. Hiding/showing a section is exclusively the
 * user's choice via the section eye toggle. After a tailor run:
 *   - the section eyes are untouched (relevant OR irrelevant sections keep
 *     their user-chosen visibility),
 *   - non-matching bullets are dimmed at sub-item level,
 *   - Reset Filter restores every bullet's pre-tailor visibility without
 *     touching the section eyes.
 *
 * Locked entries are covered by tailor-locked-sections.spec.ts (RES-97).
 */
import { test, expect } from '@playwright/test'
import { resetE2eDatabase } from '../helpers/db-reset'

test.describe('Tailor Resume hides sub-items only, never whole sections', () => {
  test.beforeAll(() => {
    resetE2eDatabase()
  })

  test('tailor dims non-matching bullets but leaves every section eye untouched; reset restores bullets', async ({
    page,
  }) => {
    await page.goto('/builder')
    await page.waitForSelector('text=Name & Contact', { timeout: 10_000 })

    // All editors render stacked, so bullet locators are scoped to the
    // section block (header button + editor content) to stay unambiguous.

    // ── 1. Experience: one matching bullet + one non-matching ─────────
    const expRow = page
      .locator('li')
      .filter({ has: page.locator('[data-testid="section-eye-toggle"]') })
      .filter({ hasText: 'Experience' })
    await expRow.locator('label').first().click()

    const expBlock = page
      .locator('div.border-b')
      .filter({ has: page.locator('button[aria-label="Toggle Experience section"]') })

    await page.getByRole('button', { name: '+ Add Job' }).waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: '+ Add Job' }).click()
    await page.getByPlaceholder('Acme Corp').fill('Acme Corp')
    await page.getByPlaceholder('Software Engineer').fill('Software Engineer')

    await expBlock.getByRole('button', { name: '+ Add bullet point' }).first().click()
    await expBlock.getByRole('button', { name: '+ Add bullet point' }).first().click()
    await expBlock.getByLabel('Bullet point 1').fill('Built React applications with TypeScript')
    await expBlock.getByLabel('Bullet point 2').fill('Managed coffee supply chain logistics')

    // ── 2. Projects: only a non-matching bullet ────────────────────────
    const projectsRow = page
      .locator('li')
      .filter({ has: page.locator('[data-testid="section-eye-toggle"]') })
      .filter({ hasText: 'Projects' })
    await projectsRow.locator('label').first().click()

    const projectsBlock = page
      .locator('div.border-b')
      .filter({ has: page.locator('button[aria-label="Toggle Projects section"]') })

    await projectsBlock.getByRole('button', { name: '+ Add Project' }).waitFor({ timeout: 10_000 })
    await projectsBlock.getByRole('button', { name: '+ Add Project' }).click()
    await projectsBlock.getByPlaceholder('My Awesome Project').fill('Garden Irrigation')
    await projectsBlock.getByRole('button', { name: '+ Add bullet point' }).first().click()
    await projectsBlock
      .getByLabel('Bullet point 1')
      .fill('Designed a community garden irrigation system')

    // ── 3. Slow the tailor request so the overlay is observable ────────
    await page.route('**/api/v1/resumes/tailor', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600))
      await route.continue()
    })

    // ── 4. One-step: paste JD → click "Tailor Resume" in the modal ────
    await page.locator('[data-testid="jd-toolbar-btn"]').click()
    await page
      .locator('[data-testid="jd-textarea"]')
      .fill('React developer with TypeScript experience')

    // The primary modal button says "Tailor Resume", not "Save".
    const tailorBtn = page.locator('[data-testid="jd-modal-tailor"]')
    await expect(tailorBtn).toHaveText(/Tailor Resume/)

    await tailorBtn.click()

    // Modal closes immediately — the run happens in the builder, not the modal.
    await expect(page.locator('[data-testid="jd-textarea"]')).toHaveCount(0)

    // Overlay animation plays while the (delayed) request is in flight…
    const overlay = page.locator('[data-testid="tailoring-overlay"]')
    await expect(overlay).toBeVisible()
    await expect(page.locator('[data-testid="tailoring-label"]')).toHaveText(
      /Tailoring your resume/,
    )

    // …and disappears once the match completes.
    await expect(overlay).toHaveCount(0)
    await expect(page.locator('[data-testid="filtered-badge"]')).toBeVisible()

    // ── 5. Section eyes are UNTOUCHED (RES-108) ────────────────────────
    // Experience has a surviving bullet → still visible (eye stays on).
    await expect(expRow.locator('[data-testid="section-eye-toggle"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // Projects has ZERO surviving bullets → the section is NOT hidden —
    // Tailor never toggles whole sections; only its bullets are dimmed.
    await expect(projectsRow.locator('[data-testid="section-eye-toggle"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // Sub-item level: the non-matching bullet inside Experience is dimmed.
    const bullet2Row = expBlock.getByLabel('Bullet point 2').locator('xpath=..')
    await expect(bullet2Row).toHaveClass(/opacity-45/)
    // The non-matching project bullet is dimmed too.
    const projectBulletRow = projectsBlock.getByLabel('Bullet point 1').locator('xpath=..')
    await expect(projectBulletRow).toHaveClass(/opacity-45/)

    // ── 6. Reset Filter restores bullet visibility, eyes stay untouched ─
    await page.locator('[data-testid="toolbar-reset-btn"]').click()
    await expect(page.locator('[data-testid="filtered-badge"]')).toHaveCount(0)
    await expect(expRow.locator('[data-testid="section-eye-toggle"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(projectsRow.locator('[data-testid="section-eye-toggle"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(bullet2Row).not.toHaveClass(/opacity-45/)
    await expect(projectBulletRow).not.toHaveClass(/opacity-45/)
  })
})
