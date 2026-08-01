import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/features/auth/stores/auth'

// Mock fetch globally
const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
global.fetch = mockFetch

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
      expect(store.token).toBeNull()
    })

    it('restores token from localStorage', () => {
      localStorage.setItem('auth_token', 'test-token')
      // Re-create store after setting localStorage
      setActivePinia(createPinia())
      const store = useAuthStore()
      expect(store.token).toBe('test-token')
    })
  })

  describe('signup', () => {
    it('stores token and user on successful signup', async () => {
      const store = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          user: { id: '1', email: 'test@test.com' },
          token: 'signup-token',
        }),
      )

      await store.signup('test@test.com', 'Password1')

      expect(store.token).toBe('signup-token')
      expect(localStorage.getItem('auth_token')).toBe('signup-token')
      expect(store.user).toEqual({ id: '1', email: 'test@test.com' })
      expect(store.isAuthenticated).toBe(true)
    })

    it('posts resume data from localStorage and clears it', async () => {
      const resumeData = { layout: 'standard', name: 'My Resume' }
      localStorage.setItem('resume_data', JSON.stringify(resumeData))

      const store = useAuthStore()
      mockFetch
        .mockResolvedValueOnce(
          mockJsonResponse({
            user: { id: '1', email: 'test@test.com' },
            token: 'signup-token',
          }),
        )
        .mockResolvedValueOnce(mockJsonResponse({ id: 'res-1' }, 201))

      await store.signup('test@test.com', 'Password1')

      // Should have cleared resume_data
      expect(localStorage.getItem('resume_data')).toBeNull()

      // Should have POSTed resume data
      const resumeCall = mockFetch.mock.calls[1] as [string, RequestInit]
      expect(resumeCall[0]).toContain('/api/v1/resumes')
      expect(resumeCall[1].method).toBe('POST')
      expect(JSON.parse(resumeCall[1].body as string)).toEqual(resumeData)
    })
  })

  describe('login', () => {
    it('stores token and user on successful login', async () => {
      const store = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          user: { id: '1', email: 'test@test.com' },
          token: 'login-token',
        }),
      )

      await store.login('test@test.com', 'Password1')

      expect(store.token).toBe('login-token')
      expect(localStorage.getItem('auth_token')).toBe('login-token')
      expect(store.user).toEqual({ id: '1', email: 'test@test.com' })
      expect(store.isAuthenticated).toBe(true)
    })
  })

  describe('checkSession', () => {
    it('does nothing without a token', async () => {
      const store = useAuthStore()
      await store.checkSession()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('restores user session on valid token', async () => {
      localStorage.setItem('auth_token', 'valid-token')
      setActivePinia(createPinia())

      const store = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ user: { id: '1', email: 'test@test.com' } }),
      )

      await store.checkSession()

      expect(store.user).toEqual({ id: '1', email: 'test@test.com' })
      expect(store.isAuthenticated).toBe(true)
    })

    it('clears token on 401 response', async () => {
      localStorage.setItem('auth_token', 'expired-token')
      setActivePinia(createPinia())

      const store = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ message: 'Unauthorized' }, 401),
      )

      await store.checkSession()

      expect(store.user).toBeNull()
      expect(store.token).toBeNull()
      expect(localStorage.getItem('auth_token')).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })
  })

  describe('logout', () => {
    it('clears token and user', async () => {
      localStorage.setItem('auth_token', 'some-token')
      setActivePinia(createPinia())

      const store = useAuthStore()
      store.user = { id: '1', email: 'test@test.com' }
      mockFetch.mockResolvedValueOnce(mockJsonResponse({}, 204))

      await store.logout()

      expect(store.token).toBeNull()
      expect(store.user).toBeNull()
      expect(localStorage.getItem('auth_token')).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })

    it('clears token even when API call fails', async () => {
      localStorage.setItem('auth_token', 'some-token')
      setActivePinia(createPinia())

      const store = useAuthStore()
      store.user = { id: '1', email: 'test@test.com' }
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await store.logout()

      expect(store.token).toBeNull()
      expect(store.user).toBeNull()
      expect(localStorage.getItem('auth_token')).toBeNull()
    })
  })
})
