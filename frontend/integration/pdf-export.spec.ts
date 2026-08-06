/**
 * PDF export e2e tests (RES-111).
 *
 * Tailwind v4 emits oklch(...) colors by default (e.g. neutral-700 →
 * oklch(0.371 0 none)). html2canvas 1.x threw "Attempting to parse an
 * unsupported color function \"oklch\"" during capture, breaking the
 * Download PDF button. The fix swaps in html2canvas-pro (CSS Color 4
 * aware). These tests pin the acceptance criteria in a real browser:
 *
 *   - "Download PDF" produces a valid PDF (no oklch error)
 *   - Colors render correctly in the exported PDF
 *   - Works in light + dark mode
 *
 * The preview only renders real content once a resume is loaded, so each
 * test seeds an anonymous resume through the localStorage restore path
 * (resume_data_last_id → resume_data_<id>) before reloading /builder.
 */
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'

/** A small but populated resume payload (mirrors the anonymous wire shape). */
const SEED_RESUME = {
  name: 'Ada Lovelace',
  layout: 'standard',
  sections: [
    {
      sectionId: 'name_contact',
      column: 'right',
      order: 0,
      enabled: true,
      entries: [
        {
          order: 0,
          parentId: null,
          visible: true,
          fields: [
            { key: 'fullName', value: 'Ada Lovelace', order: 0 },
            { key: 'email', value: 'ada@example.com', order: 1 },
            { key: 'phone', value: '+1 555 0100', order: 2 },
            { key: 'location', value: 'London, UK', order: 3 },
          ],
        },
      ],
    },
    {
      sectionId: 'summary',
      column: 'right',
      order: 1,
      enabled: true,
      entries: [
        {
          order: 0,
          parentId: null,
          visible: true,
          fields: [
            {
              key: 'text',
              value:
                'Mathematician and the first computer programmer, author ' +
                'of the first algorithm intended for a machine.',
              order: 0,
            },
          ],
        },
      ],
    },
    {
      sectionId: 'experience',
      column: 'right',
      order: 2,
      enabled: true,
      entries: [
        {
          order: 0,
          parentId: null,
          visible: true,
          fields: [
            { key: 'company', value: 'Analytical Engines Ltd', order: 0 },
            { key: 'title', value: 'Senior Programmer', order: 1 },
            { key: 'location', value: 'London', order: 2 },
            { key: 'startDate', value: '1842', order: 3 },
            { key: 'endDate', value: '1852', order: 4 },
          ],
        },
      ],
    },
    {
      sectionId: 'education',
      column: 'right',
      order: 3,
      enabled: true,
      entries: [
        {
          order: 0,
          parentId: null,
          visible: true,
          fields: [
            { key: 'school', value: 'University of London', order: 0 },
            { key: 'degree', value: 'BSc Mathematics', order: 1 },
            { key: 'startDate', value: '1834', order: 2 },
            { key: 'endDate', value: '1838', order: 3 },
          ],
        },
      ],
    },
  ],
}

/**
 * Seed the anonymous resume and (optionally) the persisted theme.
 * @param {Page} page - The Playwright page.
 * @param {'light' | 'dark'} theme - Which theme-mode to persist.
 */
async function seedResume(
  page: Page,
  theme: 'light' | 'dark',
): Promise<void> {
  // Navigate once so the origin exists before writing localStorage.
  await page.goto('/builder', { waitUntil: 'domcontentloaded' })
  await page.evaluate((seed) => {
    localStorage.setItem('resume_data_seed-1', JSON.stringify(seed))
    localStorage.setItem('resume_data_last_id', 'seed-1')
    localStorage.setItem('theme-mode', 'light')
  }, SEED_RESUME)
  if (theme === 'dark') {
    await page.evaluate(() => localStorage.setItem('theme-mode', 'dark'))
  }
  await page.reload({ waitUntil: 'networkidle' })
}

/**
 * Wait until the preview shows the seeded content, then return its color facts.
 * @param {Page} page - The Playwright page.
 * @returns {Promise<{ oklchElements: number; textLength: number }>} oklch element count + text length.
 */
async function previewIsReady(page: Page): Promise<{
  oklchElements: number
  textLength: number
}> {
  await page.locator('#resume-preview').waitFor()
  await page.waitForFunction(() => {
    const el = document.getElementById('resume-preview')
    return (
      el &&
      el.textContent.includes('Ada Lovelace') &&
      el.textContent.includes('Analytical Engines')
    )
  })

  return page.evaluate(() => {
    const el = document.getElementById('resume-preview')
    const walker = document.createTreeWalker(
      el as Element,
      NodeFilter.SHOW_ELEMENT,
    )
    let oklchElements = 0
    let node: Node | null
    while ((node = walker.nextNode())) {
      const cs = getComputedStyle(node as Element)
      if (
        cs.color.includes('oklch') ||
        cs.backgroundColor.includes('oklch')
      ) {
        oklchElements += 1
      }
    }
    return { oklchElements, textLength: (el as Element).textContent.trim().length }
  })
}

/**
 * Click Download PDF, wait for the download, and validate the PDF bytes.
 * @param {Page} page - The Playwright page.
 */
async function exportAndValidatePdf(page: Page): Promise<void> {
  const downloadPromise = page.waitForEvent('download', { timeout: 20000 })
  await page.getByRole('button', { name: 'Download PDF' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('resume.pdf')

  const pdfPath = await download.path()
  const buf = fs.readFileSync(pdfPath)
  // A valid, non-trivial PDF: %PDF header, EOF marker, real content size
  expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  expect(buf.subarray(-16).toString('latin1')).toContain('%%EOF')
  expect(buf.length).toBeGreaterThan(10_000)
}

test.describe('PDF Export (RES-111 oklch fix)', () => {
  test('light mode: exports a valid PDF without the oklch error', async ({
    page,
  }) => {
    await seedResume(page, 'light')
    const facts = await previewIsReady(page)

    // The test must actually exercise the oklch path — Tailwind v4 grays
    // (e.g. neutral-700 dates) compute to oklch() in Chromium.
    expect(facts.oklchElements).toBeGreaterThan(0)
    expect(facts.textLength).toBeGreaterThan(0)

    await exportAndValidatePdf(page)

    // No error alert — the exact regression from RES-111
    await expect(page.locator('[role="alert"]')).toHaveCount(0)
  })

  test('dark mode: exports a valid PDF without the oklch error', async ({
    page,
  }) => {
    await seedResume(page, 'dark')

    // Confirm the dark palette is actually applied
    expect(
      await page.evaluate(() =>
        document.documentElement.classList.contains('dark'),
      ),
    ).toBe(true)

    const facts = await previewIsReady(page)
    expect(facts.oklchElements).toBeGreaterThan(0)

    await exportAndValidatePdf(page)
    await expect(page.locator('[role="alert"]')).toHaveCount(0)
  })
})
