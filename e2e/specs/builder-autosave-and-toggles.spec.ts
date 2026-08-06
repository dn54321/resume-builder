/**
 * Builder autosave + section eye/lock round-trips — RES-83.
 *
 * Covers:
 *   4. Autosave: edit the resume, watch the Saving…/✓ Saved indicator,
 *      reload, verify the name AND content persisted via the API (RES-90).
 *   5. Section eye/lock: toggling the eye updates the live preview and the
 *      state survives a reload; locking an entry persists the flag and
 *      protects it from Tailor keyword matching (RES-91 / RES-92; locks
 *      live on sub-item entries since RES-97).
 *
 * Full stack: browser → frontend → backend → database. Every mutation is
 * verified through the API afterwards and each test uses a unique user.
 */
import { test, expect } from '@playwright/test'
import { resetE2eDatabase } from '../helpers/db-reset'

const BACKEND_PORT = parseInt(process.env.AGENT_PORT || '3000', 10)
const API_BASE = `http://localhost:${BACKEND_PORT}/api/v1`

const PASSWORD = 'TestPass123!'

/** Builder-side row scoping: matches only SectionToggles rows (has the eye button). */
function sectionRow(page: import('@playwright/test').Page, label: string) {
  return page
    .locator('li')
    .filter({ has: page.locator('[data-testid="section-eye-toggle"]') })
    .filter({ hasText: label })
}

/**
 * Minimal resume payload with a summary and an experience entry whose two
 * bullets differ in keyword overlap — one matches the tailor JD, one does
 * not. Used to verify Tailor filtering respects the locked flag.
 */
function makeTailorResumePayload() {
  return {
    name: 'Tailor Seed',
    layout: 'standard',
    sections: [
      {
        sectionId: 'name_contact',
        column: 'right',
        order: 0,
        locked: false,
        enabled: true,
        entries: [
          {
            order: 0,
            fields: [{ key: 'fullName', value: 'Tailor Seed', order: 0 }],
          },
        ],
      },
      {
        sectionId: 'summary',
        column: 'right',
        order: 1,
        locked: false,
        enabled: true,
        entries: [
          {
            order: 0,
            fields: [
              { key: 'text', value: 'Resume summary for tailoring', order: 0 },
            ],
          },
        ],
      },
      {
        sectionId: 'experience',
        column: 'right',
        order: 2,
        locked: false,
        enabled: true,
        entries: [
          {
            order: 0,
            fields: [
              { key: 'company', value: 'Acme Corp', order: 0 },
              { key: 'title', value: 'Software Engineer', order: 1 },
            ],
            children: [
              {
                order: 0,
                fields: [
                  {
                    key: 'text',
                    value: 'Built React applications with TypeScript',
                    order: 0,
                  },
                ],
              },
              {
                order: 1,
                fields: [
                  {
                    key: 'text',
                    value: 'Managed coffee supply chain logistics',
                    order: 0,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
}

test.describe('Builder autosave (RES-90)', () => {
  const email = `autosave-${Date.now()}@test.com`

  test.beforeAll(async ({ request }) => {
    resetE2eDatabase()
    const res = await request.post(`${API_BASE}/auth/signup`, {
      data: { email, password: PASSWORD },
    })
    expect(res.status()).toBe(201)
  })

  test('edit name + content → Saving…/✓ Saved → reload → persisted via API', async ({
    page,
  }) => {
    // Login and create a fresh resume
    await page.goto('/login')
    await page.fill('#login-email', email)
    await page.fill('#login-password', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await page.getByRole('button', { name: 'Create New Resume' }).first().click()
    await page.waitForURL('**/builder', { timeout: 15_000 })

    const nameInput = page.locator('input[aria-label="Resume name"]')
    await expect(nameInput).toBeVisible({ timeout: 10_000 })

    // Slow the autosave PUT (RES-103: updates go to /resumes/:id, creations
    // to /resumes) so the "Saving…" indicator is deterministically visible
    // while the request is in flight (locally the PUT finishes in <100ms —
    // too fast for the indicator to be reliably caught).
    await page.route('**/api/v1/resumes**', async (route) => {
      if (route.request().method() === 'PUT') {
        await new Promise((resolve) => setTimeout(resolve, 1200))
      }
      await route.continue()
    })

    // 1. Set the resume name — blur commits it and saves immediately.
    //    First edit POSTs → URL gains the uuid.
    await nameInput.fill('Autosave Resume')
    await nameInput.blur()
    await expect(
      page.locator('[data-testid="toolbar-saved-msg"]'),
    ).toBeVisible({ timeout: 10_000 })
    await page.waitForURL('**/builder/**', { timeout: 15_000 })

    // 2. Edit the Summary section — this goes through the debounced autosave
    const summaryRow = sectionRow(page, 'Summary')
    await summaryRow.locator('label').first().click()

    const summaryInput = page.getByPlaceholder(
      'Write a brief professional summary...',
    )
    await expect(summaryInput).toBeVisible({ timeout: 10_000 })
    await summaryInput.fill(
      'Autosaved summary content that must survive a reload.',
    )

    // The Saving… indicator appears while the debounced autosave is in
    // flight, then the ✓ Saved confirmation.
    await expect(
      page.locator('[data-testid="autosave-indicator"]'),
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      page.locator('[data-testid="toolbar-saved-msg"]'),
    ).toBeVisible({ timeout: 15_000 })

    // 3. Database state: the full payload (name + summary) is persisted
    const list = await page.request.get(`${API_BASE}/resumes`)
    const resumes = await list.json()
    expect(resumes).toHaveLength(1)
    expect(resumes[0]!.name).toBe('Autosave Resume')
    const resumeId = resumes[0]!.id
    const full = await page.request.get(`${API_BASE}/resumes/${resumeId}`)
    const fullBody = await full.json()
    const summarySection = fullBody.sections.find(
      (s: { sectionId: string }) => s.sectionId === 'summary',
    )
    expect(summarySection.entries[0].fields[0].value).toContain(
      'Autosaved summary content',
    )

    // 4. Reload — the name and summary must be restored from the backend
    await page.reload()
    await page.waitForURL('**/builder/**')
    const nameAfter = page.locator('input[aria-label="Resume name"]')
    await expect(nameAfter).toHaveValue('Autosave Resume', {
      timeout: 10_000,
    })

    await summaryRow.locator('label').first().click()
    const summaryAfter = page.getByPlaceholder(
      'Write a brief professional summary...',
    )
    await expect(summaryAfter).toHaveValue(
      'Autosaved summary content that must survive a reload.',
      { timeout: 10_000 },
    )
  })
})

test.describe('Section eye/lock round-trips (RES-91 / RES-92)', () => {
  const eyeEmail = `eye-toggle-${Date.now()}@test.com`
  const lockEmail = `lock-tailor-${Date.now()}@test.com`

  test.beforeAll(async ({ request }) => {
    resetE2eDatabase()
    for (const email of [eyeEmail, lockEmail]) {
      const res = await request.post(`${API_BASE}/auth/signup`, {
        data: { email, password: PASSWORD },
      })
      expect(res.status()).toBe(201)
    }
  })

  test('eye toggle updates the live preview and persists across reload', async ({
    page,
  }) => {
    // Login + create resume
    await page.goto('/login')
    await page.fill('#login-email', eyeEmail)
    await page.fill('#login-password', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await page.getByRole('button', { name: 'Create New Resume' }).first().click()
    await page.waitForURL('**/builder', { timeout: 15_000 })

    // Add content to the Summary section so it renders in the preview
    const summaryRow = sectionRow(page, 'Summary')
    await summaryRow.locator('label').first().click()
    const summaryInput = page.getByPlaceholder(
      'Write a brief professional summary...',
    )
    await expect(summaryInput).toBeVisible({ timeout: 10_000 })
    await summaryInput.fill('Visible in preview until hidden.')

    // The preview renders the Summary heading with the content
    const previewHeading = page
      .locator('#resume-preview .preview-section__heading')
      .filter({ hasText: 'Summary' })
    await expect(previewHeading).toBeVisible({ timeout: 10_000 })

    // Toggle the eye OFF → the section leaves the preview and the row dims
    await summaryRow.locator('[data-testid="section-eye-toggle"]').click()
    await expect(summaryRow.locator('svg.lucide-eye-off')).toBeVisible()
    await expect(summaryRow).toHaveClass(/opacity-55/)
    await expect(previewHeading).toHaveCount(0)

    // Wait for the autosave to persist the hidden state
    await expect(
      page.locator('[data-testid="toolbar-saved-msg"]'),
    ).toBeVisible({ timeout: 15_000 })

    // Database state: summary section has enabled=false
    const list = await page.request.get(`${API_BASE}/resumes`)
    const resumes = await list.json()
    const resumeId = resumes[0]!.id
    const full = await page.request.get(`${API_BASE}/resumes/${resumeId}`)
    const fullBody = await full.json()
    const summarySection = fullBody.sections.find(
      (s: { sectionId: string }) => s.sectionId === 'summary',
    )
    expect(summarySection.enabled).toBe(false)

    // Reload → the hidden state is restored from the backend
    await page.reload()
    await page.waitForURL('**/builder/**')
    const summaryRowAfter = sectionRow(page, 'Summary')
    await expect(summaryRowAfter.locator('svg.lucide-eye-off')).toBeVisible({
      timeout: 10_000,
    })

    // Toggle the eye back ON → the section returns to the preview
    await summaryRowAfter.locator('[data-testid="section-eye-toggle"]').click()
    await expect(summaryRowAfter.locator('svg.lucide-eye')).toBeVisible()
    await expect(
      page
        .locator('#resume-preview .preview-section__heading')
        .filter({ hasText: 'Summary' }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('lock persists to the database and survives Tailor keyword matching', async ({
    page,
  }) => {
    // Login and seed a resume with two experience bullets (one JD match,
    // one non-match) via the API
    await page.goto('/login')
    await page.fill('#login-email', lockEmail)
    await page.fill('#login-password', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    const seedRes = await page.request.post(`${API_BASE}/resumes`, {
      data: makeTailorResumePayload(),
    })
    expect(seedRes.status()).toBe(201)
    const seededBody = await seedRes.json()
    const seededId = seededBody.id

    // Open the builder for THAT resume — RES-103: /builder (no id) starts
    // fresh, so editing an existing resume must go to /builder/:id.
    await page.goto(`/builder/${seededId}`)
    await page.waitForSelector('text=Name & Contact', { timeout: 10_000 })

    // Select Experience and confirm both bullets are loaded. Entry panels
    // load collapsed (auto-expand only fires when a NEW entry is added), so
    // expand the seeded job first to reveal its bullet inputs.
    const expRow = sectionRow(page, 'Experience')
    await expRow.locator('label').first().click()
    await page
      .getByRole('button', { name: 'Toggle Software Engineer at Acme Corp' })
      .click()
    const bullet1 = page.getByLabel('Bullet point 1')
    const bullet2 = page.getByLabel('Bullet point 2')
    await expect(bullet1).toHaveValue(
      'Built React applications with TypeScript',
      { timeout: 10_000 },
    )
    await expect(bullet2).toHaveValue(
      'Managed coffee supply chain logistics',
      { timeout: 10_000 },
    )

    const bullet1Row = bullet1.locator('xpath=..')
    const bullet2Row = bullet2.locator('xpath=..')

    // Lock the JOB ENTRY (RES-97: Tailor-protect locks live on sub-items,
    // not section rows) — the Experience editor's first entry panel holds
    // the lock toggle.
    const entryPanel = page.locator('[data-entry-panel]').first()
    const lockBtn = entryPanel.locator('[data-testid="entry-lock-toggle"]')
    await expect(lockBtn).toBeVisible()
    await lockBtn.click()
    await expect(entryPanel.locator('svg.lucide-lock')).toBeVisible()

    // Wait for the autosave, then verify the lock persisted via the API
    await expect(
      page.locator('[data-testid="toolbar-saved-msg"]'),
    ).toBeVisible({ timeout: 15_000 })
    const list = await page.request.get(`${API_BASE}/resumes`)
    const resumes = await list.json()
    const resumeId = resumes[0]!.id
    const full = await page.request.get(`${API_BASE}/resumes/${resumeId}`)
    const fullBody = await full.json()
    const expSection = fullBody.sections.find(
      (s: { sectionId: string }) => s.sectionId === 'experience',
    )
    const jobEntry = expSection.entries.find(
      (e: { parentId: string | null }) => e.parentId === null,
    )
    expect(jobEntry.locked).toBe(true)

    // Save a JD and run Tailor Resume — one step from the modal (RES-98)
    await page.locator('[data-testid="jd-toolbar-btn"]').click()
    await page
      .locator('[data-testid="jd-textarea"]')
      .fill('React developer with TypeScript experience')
    await page.locator('[data-testid="jd-modal-tailor"]').click()

    // Filtering became active…
    await expect(
      page.locator('[data-testid="filtered-badge"]'),
    ).toBeVisible({ timeout: 15_000 })

    // …but the LOCKED entry is untouched: even the non-matching bullet
    // stays fully visible (no dimming).
    await expect(bullet1Row).not.toHaveClass(/opacity-45/)
    await expect(bullet2Row).not.toHaveClass(/opacity-45/)

    // Unlock → re-run Tailor → the non-matching bullet IS now dimmed.
    // The toolbar button is gone (RES-107): re-run via the JD modal.
    await lockBtn.click()
    await expect(entryPanel.locator('svg.lucide-lock-open')).toBeVisible()
    await page.locator('[data-testid="jd-toolbar-btn"]').click()
    await page
      .locator('[data-testid="jd-textarea"]')
      .fill('React developer with TypeScript experience')
    await page.locator('[data-testid="jd-modal-tailor"]').click()
    await expect(bullet1Row).not.toHaveClass(/opacity-45/)
    await expect(bullet2Row).toHaveClass(/opacity-45/)

    // Wait for the autosave to persist the unlock — poll the database
    // until the locked flag flips (deterministic; the "✓ Saved" indicator
    // may already have come and gone during the assertions above).
    await expect(async () => {
      const fullAfter = await page.request.get(
        `${API_BASE}/resumes/${resumeId}`,
      )
      const fullAfterBody = await fullAfter.json()
      const expAfter = fullAfterBody.sections.find(
        (s: { sectionId: string }) => s.sectionId === 'experience',
      )
      const jobAfter = expAfter.entries.find(
        (e: { parentId: string | null }) => e.parentId === null,
      )
      expect(jobAfter.locked).toBe(false)
    }).toPass({ timeout: 15_000 })
  })
})

test.describe('Mobile fullscreen FAB (RES-81)', () => {
  const email = `fab-${Date.now()}@test.com`

  test.beforeAll(async ({ request }) => {
    resetE2eDatabase()
    const res = await request.post(`${API_BASE}/auth/signup`, {
      data: { email, password: PASSWORD },
    })
    expect(res.status()).toBe(201)
  })

  test('builder: mobile FAB opens the fullscreen preview (hidden on desktop)', async ({
    page,
  }) => {
    // Mobile viewport (RES-81: the FAB is shown only below 1024px).
    await page.setViewportSize({ width: 390, height: 844 })

    // Login and create a fresh resume
    await page.goto('/login')
    await page.fill('#login-email', email)
    await page.fill('#login-password', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await page
      .getByRole('button', { name: 'Create New Resume' })
      .first()
      .click()
    await page.waitForURL('**/builder', { timeout: 15_000 })

    // FAB is visible on mobile once the fresh builder has populated sections.
    const fab = page.getByTestId('fullscreen-fab')
    await expect(fab).toBeVisible({ timeout: 10_000 })

    // Click → the fullscreen preview dialog opens and renders the resume.
    await fab.click()
    const closeBtn = page.getByRole('button', {
      name: 'Close full screen preview',
    })
    await expect(closeBtn).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.fullscreen-preview__paper')).toBeVisible()

    // Close the dialog (Escape — the reka-ui dialog's standard dismissal).
    await page.keyboard.press('Escape')
    await expect(closeBtn).toHaveCount(0)

    // Back on a desktop viewport the FAB disappears (reactive matchMedia).
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(fab).toHaveCount(0)
  })
})
