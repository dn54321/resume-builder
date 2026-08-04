import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCREENSHOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots')

test.describe('Auth Screenshots', () => {
  test('LoginView — Normal (empty form)', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h3')).toContainText('Log in')
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'login-normal.png'), fullPage: true })
  })

  test('LoginView — Error: empty fields submitted', async ({ page }) => {
    await page.goto('/login')
    await page.click('button[type="submit"]')
    await expect(page.locator('[role="alert"]')).toBeVisible()
    await expect(page.locator('[role="alert"]')).toContainText('Email is required')
    await expect(page.locator('[role="alert"]')).toContainText('Password is required')
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'login-empty-fields.png'), fullPage: true })
  })

  test('SignupView — Normal (empty form)', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.locator('h3')).toContainText('Sign up')
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'signup-normal.png'), fullPage: true })
  })

  test('SignupView — Error: empty fields submitted', async ({ page }) => {
    await page.goto('/signup')
    await page.click('button[type="submit"]')
    await expect(page.locator('[role="alert"]')).toBeVisible()
    await expect(page.locator('[role="alert"]')).toContainText('Email is required')
    await expect(page.locator('[role="alert"]')).toContainText('Password is required')
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'signup-empty-fields.png'), fullPage: true })
  })

  test('SignupView — Error: passwords do not match', async ({ page }) => {
    await page.goto('/signup')
    await page.fill('#signup-email', 'test@example.com')
    await page.fill('#signup-password', 'password123')
    await page.fill('#signup-confirm', 'different')
    await page.click('button[type="submit"]')
    await expect(page.locator('[role="alert"]')).toBeVisible()
    await expect(page.locator('[role="alert"]')).toContainText('Passwords do not match')
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'signup-password-mismatch.png'), fullPage: true })
  })

  test('SignupView — Error: short password', async ({ page }) => {
    await page.goto('/signup')
    await page.fill('#signup-email', 'test@example.com')
    await page.fill('#signup-password', 'short')
    await page.fill('#signup-confirm', 'short')
    await page.click('button[type="submit"]')
    await expect(page.locator('[role="alert"]')).toBeVisible()
    await expect(page.locator('[role="alert"]')).toContainText('Password must be at least 8 characters')
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'signup-short-password.png'), fullPage: true })
  })
})
