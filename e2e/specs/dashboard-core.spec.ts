/**
 * Dashboard + resume-management core flows — RES-83.
 *
 * Covers the milestone's dashboard-critical paths end to end:
 *   1. Homepage "Create New Resume" → /builder (RES-103 deferred-create)
 *   2. Two-pane dashboard with live preview (RES-87)
 *   3. Resume card actions — rename / duplicate / delete via the ⋮
 *      dropdown (RES-89 / RES-84), including error states
 *   6. Profile icon in the navbar (RES-88)
 *
 * Full stack: browser → frontend → backend → database. Every mutation is
 * verified through the API afterwards (database state at rest), each test
 * uses a unique user, and resetE2eDatabase() keeps runs isolated.
 */
import { test, expect } from '@playwright/test'
import { resetE2eDatabase } from '../helpers/db-reset'

const BACKEND_PORT = parseInt(process.env.AGENT_PORT || '3000', 10)
const API_BASE = `http://localhost:${BACKEND_PORT}/api/v1`

const PASSWORD = 'TestPass123!'

/**
 * Build a full 10-section resume payload shaped exactly like the frontend
 * store's toPayload(): every SECTION_TYPES entry present with content in
 * name_contact, summary and experience so the dashboard preview renders
 * real content. Entries omit ids — the backend generates them.
 * @param name - Resume name
 * @returns Resume create/update payload
 */
function makeResumePayload(name: string) {
  const sectionIds = [
    'name_contact',
    'summary',
    'experience',
    'education',
    'hard_skills',
    'soft_skills',
    'projects',
    'certifications',
    'languages',
    'hobbies',
  ]

  const content: Record<string, { entries: unknown[] }> = {
    name_contact: {
      entries: [
        {
          order: 0,
          fields: [
            { key: 'fullName', value: 'Ada Lovelace', order: 0 },
            { key: 'email', value: 'ada@example.com', order: 1 },
          ],
        },
      ],
    },
    summary: {
      entries: [
        {
          order: 0,
          fields: [
            {
              key: 'text',
              value: 'Analytical engineer with a passion for computation.',
              order: 0,
            },
          ],
        },
      ],
    },
    experience: {
      entries: [
        {
          order: 0,
          fields: [
            { key: 'company', value: 'Analytical Engines', order: 0 },
            { key: 'title', value: 'Engineer', order: 1 },
          ],
          children: [
            {
              order: 0,
              fields: [
                {
                  key: 'text',
                  value: 'Built the first mechanical general-purpose computer',
                  order: 0,
                },
              ],
            },
            {
              order: 1,
              fields: [
                {
                  key: 'text',
                  value: 'Wrote the first algorithm intended for machine processing',
                  order: 0,
                },
              ],
            },
          ],
        },
      ],
    },
  }

  return {
    name,
    layout: 'standard',
    sections: sectionIds.map((sectionId, order) => ({
      sectionId,
      column: 'right',
      order,
      locked: false,
      enabled: true,
      entries: content[sectionId]?.entries ?? [],
    })),
  }
}

test.describe('Homepage → Create Resume (RES-80)', () => {
  const email = `home-create-${Date.now()}@test.com`

  test.beforeAll(async ({ request }) => {
    resetE2eDatabase()
    const res = await request.post(`${API_BASE}/auth/signup`, {
      data: { email, password: PASSWORD },
    })
    expect(res.status()).toBe(201)
  })

  test('authenticated homepage "Create New Resume" opens a fresh /builder and only persists after the first edit', async ({
    page,
  }) => {
    // Login via the UI (sets the session cookie in the browser context)
    await page.goto('/login')
    await page.fill('#login-email', email)
    await page.fill('#login-password', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })

    // Go to the homepage — the auth-aware CTA row should show both buttons
    await page.goto('/')
    await expect(
      page.locator('[data-testid="create-resume-button"]'),
    ).toBeVisible({ timeout: 10_000 })

    // Click "Create New Resume" → navigates to the fresh builder at /builder
    // (RES-103 deferred-create: no uuid, NO backend POST yet)
    await page.locator('[data-testid="create-resume-button"]').click()
    await page.waitForURL('**/builder', { timeout: 15_000 })

    // Builder actually loaded (resume name input present)
    await expect(
      page.locator('input[aria-label="Resume name"]'),
    ).toBeVisible({ timeout: 10_000 })

    // Database state: NO resume was created on navigation (deferred create)
    const list = await page.request.get(`${API_BASE}/resumes`)
    expect(list.status()).toBe(200)
    const resumes = await list.json()
    expect(resumes).toHaveLength(0)

    // First edit (name blur commits + autosaves) → POST creates the row and
    // the URL gains the uuid
    const nameInput = page.locator('input[aria-label="Resume name"]')
    await nameInput.fill('Deferred Create Resume')
    await nameInput.blur()
    await page.waitForURL('**/builder/**', { timeout: 15_000 })

    // Database state: exactly one resume was created, carrying the name
    const listAfter = await page.request.get(`${API_BASE}/resumes`)
    expect(listAfter.status()).toBe(200)
    const resumesAfter = await listAfter.json()
    expect(resumesAfter).toHaveLength(1)
    expect(resumesAfter[0]!.name).toBe('Deferred Create Resume')
  })
})

test.describe('Dashboard two-pane preview (RES-87)', () => {
  const email = `dash-preview-${Date.now()}@test.com`
  const FIRST = `Preview Alpha ${Date.now()}`
  const SECOND = `Preview Beta ${Date.now()}`

  test.beforeAll(async ({ request }) => {
    resetE2eDatabase()
    const res = await request.post(`${API_BASE}/auth/signup`, {
      data: { email, password: PASSWORD },
    })
    expect(res.status()).toBe(201)
  })

  async function loginAndSeedResumes(page: import('@playwright/test').Page) {
    await page.goto('/login')
    await page.fill('#login-email', email)
    await page.fill('#login-password', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })

    // Seed two resumes with content via the API — page.request shares the
    // browser context cookies, so these are authenticated.
    for (const name of [FIRST, SECOND]) {
      const res = await page.request.post(`${API_BASE}/resumes`, {
        data: makeResumePayload(name),
      })
      expect(res.status()).toBe(201)
    }
  }

  test('shows two panes; clicking a card renders its live preview', async ({
    page,
  }) => {
    await loginAndSeedResumes(page)
    await page.goto('/dashboard')
    await page.waitForURL('**/dashboard')

    // Two-pane layout: resume list (left) + preview pane (right)
    const listPane = page.locator('[data-testid="dashboard-list-pane"]')
    const previewPane = page.locator('[data-testid="dashboard-preview-pane"]')
    await expect(listPane).toBeVisible()
    await expect(previewPane).toBeVisible()

    // Both seeded resumes appear as cards
    await expect(page.locator('.resume-card')).toHaveCount(2, {
      timeout: 10_000,
    })

    // No selection yet → placeholder in the preview pane
    await expect(
      page.locator('[data-testid="preview-placeholder"]'),
    ).toBeVisible()

    // Click the first card → preview loads with the resume's real content
    const firstCard = page.locator('.resume-card', { hasText: FIRST }).first()
    await firstCard.click()

    await expect(
      page.locator('[data-testid="preview-body"]'),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.locator('[data-testid="preview-paper"] .standard-layout__name'),
    ).toHaveText('Ada Lovelace', { timeout: 10_000 })
    await expect(
      page
        .locator('[data-testid="preview-paper"] .preview-section__heading')
        .filter({ hasText: 'Summary' }),
    ).toBeVisible()

    // Selected card is highlighted
    await expect(firstCard).toHaveClass(/resume-card--selected/)

    // Click the second card → preview switches to the other resume
    const secondCard = page.locator('.resume-card', { hasText: SECOND }).first()
    await secondCard.click()
    await expect(
      page.locator('[data-testid="preview-body"]'),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.locator('[data-testid="preview-paper"] .standard-layout__name'),
    ).toHaveText('Ada Lovelace', { timeout: 10_000 })
    await expect(secondCard).toHaveClass(/resume-card--selected/)
    await expect(firstCard).not.toHaveClass(/resume-card--selected/)
  })
})

test.describe('Resume card actions (RES-89 / RES-84)', () => {
  const ORIGINAL_PREFIX = 'Card Original'

  /**
   * Each test gets its own user so seeded resumes never accumulate across
   * tests in this describe (the dashboard assertions expect exactly one).
   * Signing up via the API stores the session cookie in the shared browser
   * context, so the page is authenticated for the subsequent navigation.
   */
  async function signupAndSeedOneResume(
    page: import('@playwright/test').Page,
  ): Promise<{ resumeId: string; original: string }> {
    const email = `card-actions-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com`
    const original = `${ORIGINAL_PREFIX} ${Date.now()}`

    const signup = await page.request.post(`${API_BASE}/auth/signup`, {
      data: { email, password: PASSWORD },
    })
    expect(signup.status()).toBe(201)

    const res = await page.request.post(`${API_BASE}/resumes`, {
      data: makeResumePayload(original),
    })
    expect(res.status()).toBe(201)
    const body = await res.json()

    await page.goto('/dashboard')
    await expect(page.locator('.resume-card')).toHaveCount(1, {
      timeout: 10_000,
    })
    return { resumeId: body.id as string, original }
  }

  test('rename a resume via the ⋮ dropdown (persisted to the database)', async ({
    page,
  }) => {
    const { original } = await signupAndSeedOneResume(page)

    const card = page.locator('.resume-card', { hasText: original }).first()
    const renamed = `Renamed Resume ${Date.now()}`

    // Open the card's action dropdown
    await card.locator('[data-testid="resume-menu-trigger"]').click()
    await expect(page.locator('[data-testid="menu-rename"]')).toBeVisible()
    await page.locator('[data-testid="menu-rename"]').click()

    // Inline rename input appears, pre-filled with the current name
    const nameInput = page.locator('.resume-card__name-input').first()
    await expect(nameInput).toBeVisible({ timeout: 5_000 })
    await nameInput.fill(renamed)
    await nameInput.press('Enter')

    // Card now shows the new name
    await expect(
      page.locator('.resume-card__name', { hasText: renamed }),
    ).toBeVisible({ timeout: 10_000 })

    // Database state: the name is persisted
    const list = await page.request.get(`${API_BASE}/resumes`)
    const resumes = await list.json()
    expect(resumes).toHaveLength(1)
    expect(resumes[0]!.name).toBe(renamed)
  })

  test('duplicate a resume via the ⋮ dropdown (persisted to the database)', async ({
    page,
  }) => {
    const { original } = await signupAndSeedOneResume(page)

    const card = page.locator('.resume-card', { hasText: original }).first()
    await card.locator('[data-testid="resume-menu-trigger"]').click()
    await expect(page.locator('[data-testid="menu-duplicate"]')).toBeVisible()
    await page.locator('[data-testid="menu-duplicate"]').click()

    // Copy appears in the list ("Copy of <original>")
    await expect(page.locator('.resume-card')).toHaveCount(2, {
      timeout: 10_000,
    })
    await expect(
      page.locator('.resume-card__name', { hasText: `Copy of ${original}` }),
    ).toBeVisible()

    // Database state: two resumes, the copy preserves the source content
    const list = await page.request.get(`${API_BASE}/resumes`)
    const resumes = await list.json()
    expect(resumes).toHaveLength(2)
    const copy = resumes.find(
      (r: { name: string | null }) => r.name === `Copy of ${original}`,
    )
    expect(copy).toBeTruthy()
    const copyId = (copy as { id: string }).id
    const full = await page.request.get(`${API_BASE}/resumes/${copyId}`)
    const fullBody = await full.json()
    const experience = fullBody.sections.find(
      (s: { sectionId: string }) => s.sectionId === 'experience',
    )
    // The wire shape returns entries flat (children carry parentId) — the
    // copy must preserve the parent entry AND its two bullet children.
    const parent = experience.entries.find(
      (e: { parentId: string | null }) => e.parentId === null,
    )
    expect(parent.fields[0].value).toBe('Analytical Engines')
    expect(
      experience.entries.filter(
        (e: { parentId: string | null }) => e.parentId !== null,
      ),
    ).toHaveLength(2)
  })

  test('delete a resume via the ⋮ dropdown after confirmation (persisted)', async ({
    page,
  }) => {
    const { original } = await signupAndSeedOneResume(page)

    // Duplicate first so deletion removes one of two
    const card = page.locator('.resume-card', { hasText: original }).first()
    await card.locator('[data-testid="resume-menu-trigger"]').click()
    await page.locator('[data-testid="menu-duplicate"]').click()
    await expect(page.locator('.resume-card')).toHaveCount(2, {
      timeout: 10_000,
    })

    // Delete the copy
    const copyCard = page
      .locator('.resume-card', { hasText: `Copy of ${original}` })
      .first()
    await copyCard.locator('[data-testid="resume-menu-trigger"]').click()
    await page.locator('[data-testid="menu-delete"]').click()

    // Confirmation modal appears — cancel first keeps the resume
    const modal = page.locator('[data-testid="confirm-modal-cancel"]')
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await modal.click()
    await expect(page.locator('.resume-card')).toHaveCount(2)

    // Delete again, this time confirm
    await copyCard.locator('[data-testid="resume-menu-trigger"]').click()
    await page.locator('[data-testid="menu-delete"]').click()
    await page.locator('[data-testid="confirm-modal-confirm"]').click()

    // Only the original remains
    await expect(page.locator('.resume-card')).toHaveCount(1, {
      timeout: 10_000,
    })
    await expect(
      page.locator('.resume-card__name', { hasText: original }),
    ).toBeVisible()

    // Database state: one resume left
    const list = await page.request.get(`${API_BASE}/resumes`)
    const resumes = await list.json()
    expect(resumes).toHaveLength(1)
    expect(resumes[0]!.name).toBe(original)
  })

  test('edit a resume in the builder via the ⋮ dropdown (RES-100)', async ({
    page,
  }) => {
    const { original } = await signupAndSeedOneResume(page)

    const card = page.locator('.resume-card', { hasText: original }).first()

    // Single-click still previews — it must NOT navigate to the builder
    await card.click()
    await expect(page.locator('[data-testid="preview-body"]')).toBeVisible({
      timeout: 15_000,
    })
    expect(page.url()).toContain('/dashboard')

    // Open the card's action dropdown and choose Edit in Builder
    await card.locator('[data-testid="resume-menu-trigger"]').click()
    const editItem = page.locator('[data-testid="menu-edit-builder"]')
    await expect(editItem).toBeVisible({ timeout: 5_000 })
    await expect(editItem).toContainText('Edit in Builder')
    await editItem.click()

    // Navigates into the builder for THAT resume
    await page.waitForURL('**/builder/**', { timeout: 15_000 })
    const resumeId = page.url().split('/builder/')[1]
    expect(resumeId).toBeTruthy()
    await expect(
      page.locator('input[aria-label="Resume name"]'),
    ).toBeVisible({ timeout: 10_000 })

    // Database state: the resume still exists, nothing was duplicated/deleted
    const list = await page.request.get(`${API_BASE}/resumes`)
    const resumes = await list.json()
    expect(resumes).toHaveLength(1)
    expect(resumes[0]!.id).toBe(resumeId)
  })

  test('duplicate failure shows an inline error and keeps the list intact', async ({
    page,
  }) => {
    const { original } = await signupAndSeedOneResume(page)

    // Force the duplicate endpoint to fail — the UI must surface the error
    await page.route('**/api/v1/resumes/*/duplicate', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Duplicate failed' }),
      }),
    )

    const card = page.locator('.resume-card', { hasText: original }).first()
    await card.locator('[data-testid="resume-menu-trigger"]').click()
    await page.locator('[data-testid="menu-duplicate"]').click()

    // Error alert appears; no duplicate was added
    await expect(page.locator('[role="alert"]')).toContainText(
      'Duplicate failed',
      { timeout: 10_000 },
    )
    await expect(page.locator('.resume-card')).toHaveCount(1)

    // Database state unchanged
    const list = await page.request.get(`${API_BASE}/resumes`)
    const resumes = await list.json()
    expect(resumes).toHaveLength(1)
  })

  test('delete failure shows an inline error and keeps the resume', async ({
    page,
  }) => {
    const { original } = await signupAndSeedOneResume(page)

    // Force DELETE to fail — the resume must survive
    await page.route('**/api/v1/resumes/*', (route) => {
      if (route.request().method() === 'DELETE') {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Delete failed' }),
        })
      }
      return route.continue()
    })

    const card = page.locator('.resume-card', { hasText: original }).first()
    await card.locator('[data-testid="resume-menu-trigger"]').click()
    await page.locator('[data-testid="menu-delete"]').click()
    await page.locator('[data-testid="confirm-modal-confirm"]').click()

    // Error alert appears and the card stays
    await expect(page.locator('[role="alert"]')).toContainText('Delete failed', {
      timeout: 10_000,
    })
    await expect(page.locator('.resume-card')).toHaveCount(1)

    // Database state unchanged
    const list = await page.request.get(`${API_BASE}/resumes`)
    const resumes = await list.json()
    expect(resumes).toHaveLength(1)
  })
})

test.describe('Profile icon in the navbar (RES-88)', () => {
  const email = `profile-icon-${Date.now()}@test.com`

  test.beforeAll(async ({ request }) => {
    resetE2eDatabase()
    const res = await request.post(`${API_BASE}/auth/signup`, {
      data: { email, password: PASSWORD },
    })
    expect(res.status()).toBe(201)
  })

  test('User icon is shown for authenticated users and opens the account dropdown', async ({
    page,
  }) => {
    await page.goto('/login')
    await page.fill('#login-email', email)
    await page.fill('#login-password', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })

    // Navbar shows the User icon (not the raw email)
    const profileTrigger = page.locator('header button svg.lucide-user')
    await expect(profileTrigger).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('banner')).not.toContainText(email)

    // Click it → dropdown with Account settings + Log out
    await profileTrigger.click()
    await expect(
      page.getByRole('menuitem', { name: 'Account settings' }),
    ).toBeVisible({ timeout: 5_000 })
    await expect(
      page.getByRole('menuitem', { name: 'Log out' }),
    ).toBeVisible()

    // "Account settings" navigates to the account page
    await page.getByRole('menuitem', { name: 'Account settings' }).click()
    await page.waitForURL('**/account', { timeout: 10_000 })
    await expect(page.locator('h3, h1').first()).toContainText('Account')
  })
})
