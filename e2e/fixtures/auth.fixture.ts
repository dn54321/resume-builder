import { test as base, Page } from '@playwright/test'
import { resetE2eDatabase } from '../helpers/db-reset'

const BACKEND_PORT = parseInt(process.env.AGENT_PORT || '3000', 10)
const API_BASE = `http://localhost:${BACKEND_PORT}/api/v1`

export { resetE2eDatabase }

interface AuthFixture {
  /** Create a new account via API and return an authenticated page. */
  authenticatedPage: (email: string, password: string) => Promise<Page>
}

/**
 * Authenticated page fixture for e2e tests.
 *
 * Creates a user account via the backend API and sets the session token
 * in localStorage before navigating. This avoids re-testing the signup
 * flow in every authenticated test.
 */
export const test = base.extend<AuthFixture>({
  authenticatedPage: async ({ page, request }, use) => {
    await use(async (email: string, password: string) => {
      // Sign up via API
      const signupRes = await request.post(`${API_BASE}/auth/signup`, {
        data: { email, password },
      })
      const { sessionToken } = await signupRes.json()

      // Set auth token in localStorage
      await page.goto('/')
      await page.evaluate(
        (token) => localStorage.setItem('auth_token', token),
        sessionToken,
      )

      return page
    })
  },
})

export { expect } from '@playwright/test'
