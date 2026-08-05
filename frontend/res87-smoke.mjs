import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const email = readFileSync('/tmp/res87-email.txt', 'utf-8').trim()
const BASE = 'http://localhost:9101'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

// ── Login ───────────────────────────────────────────────
await page.goto(`${BASE}/login`)
await page.fill('#login-email', email)
await page.fill('#login-password', 'TestPass123!')
await page.click('button[type="submit"]')
await page.waitForURL('**/dashboard', { timeout: 15000 })
console.log('→ logged in, on /dashboard')

// ── Empty-state placeholder ─────────────────────────────
const placeholder = page.locator('[data-testid="preview-placeholder"]')
await placeholder.waitFor({ state: 'visible', timeout: 10000 })
console.log('✓ placeholder visible:', (await placeholder.textContent()).trim())
await page.screenshot({ path: '/tmp/res87-dashboard-empty.png' })

// ── Two panes ───────────────────────────────────────────
const listPane = page.locator('[data-testid="dashboard-list-pane"]')
const previewPane = page.locator('[data-testid="dashboard-preview-pane"]')
await listPane.waitFor({ state: 'visible' })
await previewPane.waitFor({ state: 'visible' })
const listBox = await listPane.boundingBox()
const previewBox = await previewPane.boundingBox()
console.log(`✓ panes: list ${Math.round(listBox.width)}px, preview ${Math.round(previewBox.width)}px, ratio ${(listBox.width / previewBox.width).toFixed(2)}`)
const h1 = await page.locator('h1').first().textContent()
console.log('✓ h1:', h1)
const cards = await page.locator('.resume-card:not(.resume-card--skeleton)').count()
console.log('✓ cards rendered:', cards)

// ── Click first card (standard layout) ──────────────────
await page.locator('.resume-card:not(.resume-card--skeleton)').first().click()
await page.locator('[data-testid="preview-body"]').waitFor({ state: 'visible', timeout: 10000 })
const stdLayout = await page.locator('.standard-layout').count()
console.log('✓ standard-layout rendered:', stdLayout)
await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/res87-dashboard-standard.png' })

// ── Scale check ─────────────────────────────────────────
const paper = page.locator('[data-testid="preview-paper"]')
const transform = await paper.evaluate((el) => el.style.transform)
console.log('✓ paper transform:', transform)
const body = await page.locator('[data-testid="preview-body"]').boundingBox()
const paperBox = await paper.boundingBox()
console.log(`✓ paper box: ${Math.round(paperBox.width)}x${Math.round(paperBox.height)} within body ${Math.round(body.width)}x${Math.round(body.height)}`)

// ── Click second card (two-column) ──────────────────────
await page.locator('.resume-card:not(.resume-card--skeleton)').nth(1).click()
await page.locator('[data-testid="preview-body"] .two-column-layout').waitFor({ state: 'visible', timeout: 10000 })
console.log('✓ two-column-layout rendered')
await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/res87-dashboard-twocolumn.png' })

// ── Selected card highlight ─────────────────────────────
const selected = await page.locator('.resume-card--selected').count()
console.log('✓ selected card count:', selected)

await browser.close()
console.log('DONE')
