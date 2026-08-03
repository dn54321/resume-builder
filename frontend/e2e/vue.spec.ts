import { test, expect } from '@playwright/test'

test('visits the app root url', async ({ page }) => {
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
