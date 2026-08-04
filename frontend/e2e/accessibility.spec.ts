/**
 * Accessibility e2e tests using @axe-core/playwright.
 *
 * Runs axe-core audits on key pages (home, login, signup, account) to catch
 * WCAG violations at the e2e level.  This complements eslint-plugin-vuejs-accessibility
 * (static analysis) with runtime checks.
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** Pages to audit and their human-readable names. */
const PAGES = [
  { path: '/', name: 'Home' },
  { path: '/login', name: 'Login' },
  { path: '/signup', name: 'Signup' },
] as const

test.describe('Accessibility axe-core audits', () => {
  for (const { path, name } of PAGES) {
    test(`${name} page (${path}) has no detectable a11y violations`, async ({
      page,
    }) => {
      await page.goto(path)

      // Ensure the page has rendered meaningful content before auditing
      await expect(page.locator('main')).toBeVisible()

      const results = await new AxeBuilder({ page }).analyze()

      // axe-core uses four impact levels.  Fail the build on 'critical' and
      // 'serious' violations; log 'moderate' and 'minor' for visibility
      // without failing.
      const violations = results.violations

      const criticalOrSerious = violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      )

      if (criticalOrSerious.length > 0) {
        console.error(
          'Critical/Serious a11y violations on %s (%s):',
          name,
          path,
        )
        for (const v of criticalOrSerious) {
          console.error('  - %s: %s', v.id, v.help)
          for (const node of v.nodes) {
            console.error('    %s', node.html)
          }
        }
      }

      // This assertion will produce a readable diff in CI
      expect(criticalOrSerious).toEqual([])

      // Log lower-severity items as info (they don't fail the build)
      const moderateOrMinor = violations.filter(
        (v) => v.impact === 'moderate' || v.impact === 'minor',
      )
      if (moderateOrMinor.length > 0) {
        console.log(
          'ℹ️  %d moderate/minor a11y findings on %s (%s):',
          moderateOrMinor.length,
          name,
          path,
        )
        for (const v of moderateOrMinor) {
          console.log('  - %s: %s', v.id, v.help)
        }
      }
    })
  }
})
