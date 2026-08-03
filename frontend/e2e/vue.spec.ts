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
