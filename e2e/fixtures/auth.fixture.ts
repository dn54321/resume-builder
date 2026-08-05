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
 * Creates a user account via the backend API and plants the HttpOnly
 * `session_token` cookie in the browser context before navigating. This
 * avoids re-testing the signup flow in every authenticated test.
 *
 * NOTE: auth is cookie-based (HttpOnly `session_token`) — there is no
 * localStorage token anymore. The cookie is read from the signup
 * response's Set-Cookie header and added to the context directly.
 */
export const test = base.extend<AuthFixture>({
  authenticatedPage: async ({ page, request }, use) => {
    await use(async (email: string, password: string) => {
      // Sign up via API
      const signupRes = await request.post(`${API_BASE}/auth/signup`, {
        data: { email, password },
      })
      const setCookie = signupRes.headers()['set-cookie']
      if (!setCookie) {
        throw new Error('signup response did not set a session cookie')
      }
      const match = /session_token=([^;]+)/.exec(setCookie)
      if (!match) {
        throw new Error('session_token cookie not found in signup response')
      }
      const [, sessionToken] = match

      // Plant the HttpOnly cookie in the browser context (same origin as
      // the frontend dev server proxies to, path /, so /api/v1 requests
      // carry it automatically).
      await page.context().addCookies([
        {
          name: 'session_token',
          value: sessionToken,
          path: '/',
          domain: 'localhost',
        },
      ])

      return page
    })
  },
})

export { expect } from '@playwright/test'
