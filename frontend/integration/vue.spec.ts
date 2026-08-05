import { test, expect } from '@playwright/test'

test('renders the app shell with navbar and RouterView content', async ({ page }) => {
  await page.goto('/')

  // Navbar renders with brand
  await expect(page.locator('header')).toBeVisible()
  await expect(page.locator('header')).toContainText('Resume Builder')

  // Navbar has sticky positioning and border
  const header = page.locator('header')
  await expect(header).toHaveClass(/sticky/)
  await expect(header).toHaveClass(/border-b/)

  // Main content area renders RouterView content
  const main = page.locator('main')
  await expect(main).toBeVisible()
  await expect(main.locator('p').first()).toBeVisible()
})

test('shows guest nav links when unauthenticated', async ({ page }) => {
  await page.goto('/')

  // Guest state: Log in and Sign up buttons
  await expect(page.locator('header')).toContainText('Log in')
  await expect(page.locator('header')).toContainText('Sign up')
})

test('renders hero headline on landing page', async ({ page }) => {
  await page.goto('/')
  // Hero headline
  await expect(page.locator('h1')).toHaveText('Build a resume that gets you hired')
})

test('renders feature cards on the landing page', async ({ page }) => {
  await page.goto('/')
  const cards = page.locator('.feature-card')
  await expect(cards).toHaveCount(4)
})

test('shows guest CTAs when not authenticated', async ({ page }) => {
  await page.goto('/')
  // Scope to the hero section — nav also has "Log in" and "Sign up" links
  const hero = page.locator('main section')
  await expect(hero.getByRole('link', { name: 'Get Started' })).toBeVisible()
  await expect(hero.getByRole('link', { name: 'Log in' })).toBeVisible()
})

test('renders the footer', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('footer')).toContainText('Resume Builder')
})

test('applies the fade transition while navigating between routes', async ({ page }) => {
  await page.goto('/')

  // Arm a watcher that resolves true the moment the fade transition classes
  // (RES-82: .fade-enter-active / .fade-leave-active, 150ms out-in) appear
  // on the routed view inside <main> during navigation.
  const sawFade = page.evaluate(() => {
    return new Promise<boolean>((resolve) => {
      const main = document.querySelector('main')
      if (!main) {
        resolve(false)
        return
      }
      const observer = new MutationObserver(() => {
        if (main.querySelector('.fade-enter-active, .fade-leave-active')) {
          observer.disconnect()
          resolve(true)
        }
      })
      observer.observe(main, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class'],
      })
      // The out-in transition is ~300ms total; give it a generous timeout.
      setTimeout(() => {
        observer.disconnect()
        resolve(false)
      }, 3000)
    })
  })

  // Navigate home → login via the navbar link.
  await page.locator('header a', { hasText: 'Log in' }).click()

  await expect(page).toHaveURL(/\/login/)
  await expect(page.locator('main')).toContainText('Log in')
  await expect(sawFade).resolves.toBe(true)
})
