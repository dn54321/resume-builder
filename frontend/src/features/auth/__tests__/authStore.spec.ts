import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/features/auth/stores/auth'

// Mock fetch globally
const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
global.fetch = mockFetch

/**
 *
 * @param data
 * @param status
 */
function mockJsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response
}

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockFetch.mockReset()
  })

  describe('initial state', () => {
    it('is not authenticated by default', () => {
      const store = useAuthStore()
      expect(store.isAuthenticated).toBe(false)
      expect(store.user).toBeNull()
    })

    it('no longer uses localStorage for auth token', () => {
      localStorage.setItem('auth_token', 'test-token')
      // Re-create store after setting localStorage
      setActivePinia(createPinia())
      const store = useAuthStore()
      // Token in localStorage should be ignored — auth is cookie-based
      expect(store.isAuthenticated).toBe(false)
    })
  })

  describe('signup', () => {
    it('stores user on successful signup (cookie handled by browser)', async () => {
      const store = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          user: { id: '1', email: 'test@test.com' },
        }),
      )

      await store.signup('test@test.com', 'Password1')

      expect(store.user).toEqual({ id: '1', email: 'test@test.com' })
      expect(store.isAuthenticated).toBe(true)
      // Token is no longer stored in localStorage
      expect(localStorage.getItem('auth_token')).toBeNull()
    })

    it('posts resume data from localStorage and clears it on success', async () => {
      const resumeData = { layout: 'standard', name: 'My Resume' }
      localStorage.setItem('resume_data', JSON.stringify(resumeData))

      const store = useAuthStore()
      mockFetch
        .mockResolvedValueOnce(
          mockJsonResponse({
            user: { id: '1', email: 'test@test.com' },
          }),
        )
        .mockResolvedValueOnce(mockJsonResponse({ id: 'res-1' }, 201))

      await store.signup('test@test.com', 'Password1')

      // Should have POSTed resume data
      const resumeCall = mockFetch.mock.calls[1] as [string, RequestInit]
      expect(resumeCall[0]).toContain('/api/v1/resumes')
      expect(resumeCall[1].method).toBe('POST')
      expect(JSON.parse(resumeCall[1].body as string)).toEqual(resumeData)

      // Should clear resume_data only after successful POST
      expect(localStorage.getItem('resume_data')).toBeNull()
    })

    it('keeps resume data in localStorage when POST fails', async () => {
      const resumeData = { layout: 'standard', name: 'My Resume' }
      localStorage.setItem('resume_data', JSON.stringify(resumeData))

      const store = useAuthStore()
      mockFetch
        .mockResolvedValueOnce(
          mockJsonResponse({
            user: { id: '1', email: 'test@test.com' },
          }),
        )
        .mockResolvedValueOnce(mockJsonResponse({ message: 'Server error' }, 500))

      // signup should succeed even if resume import fails
      await store.signup('test@test.com', 'Password1')

      // Should NOT have cleared resume_data on POST failure
      expect(localStorage.getItem('resume_data')).toBe(JSON.stringify(resumeData))
      expect(store.isAuthenticated).toBe(true)
    })
  })

  describe('login', () => {
    it('stores user on successful login (cookie handled by browser)', async () => {
      const store = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          user: { id: '1', email: 'test@test.com' },
        }),
      )

      await store.login('test@test.com', 'Password1')

      expect(store.user).toEqual({ id: '1', email: 'test@test.com' })
      expect(store.isAuthenticated).toBe(true)
      // Token is no longer stored in localStorage
      expect(localStorage.getItem('auth_token')).toBeNull()
    })
  })

  describe('checkSession', () => {
    it('always calls /me (session cookie is always sent automatically)', async () => {
      const store = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ user: { id: '1', email: 'test@test.com' } }),
      )

      await store.checkSession()

      expect(store.user).toEqual({ id: '1', email: 'test@test.com' })
      expect(store.isAuthenticated).toBe(true)
    })

    it('returns null user when no session cookie present (unauthenticated)', async () => {
      const store = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ user: null }),
      )

      await store.checkSession()

      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })

    it('clears user on 401 response', async () => {
      setActivePinia(createPinia())
      const store = useAuthStore()
      store.user = { id: '1', email: 'test@test.com' }
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ message: 'Unauthorized' }, 401),
      )

      await store.checkSession()

      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })
  })

  describe('logout', () => {
    it('clears user on logout', async () => {
      const store = useAuthStore()
      store.user = { id: '1', email: 'test@test.com' }
      mockFetch.mockResolvedValueOnce(mockJsonResponse({}, 204))

      await store.logout()

      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })

    it('clears user even when API call fails', async () => {
      const store = useAuthStore()
      store.user = { id: '1', email: 'test@test.com' }
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await store.logout()

      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })
  })
})
