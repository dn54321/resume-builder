import { test, expect } from '@playwright/test'

test('renders the app shell with navbar and RouterView content', async ({ page }) => {
  await page.goto('/')
<<<<<<< HEAD

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
=======
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
>>>>>>> ticket/res-31
})
