import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useResumeStore } from '@/features/builder/stores/resume'
import { useAuthStore } from '@/features/auth/stores/auth'
import { useResumeData } from '@/features/builder/composables/useResumeData'
import { SECTION_TYPES } from '@/features/builder/types/resume'

// Mock fetch
const mockFetch = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', mockFetch)

/**
 *
 * @param data
 * @param status
 */
function createFetchResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  } as unknown as Response
}

describe('useResumeData', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
    // Set VITE_API_BASE_URL for useApi
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000')
  })

  describe('loadResume (anonymous)', () => {
    it('loads from localStorage when data exists', async () => {
      const auth = useAuthStore()
      // Ensure not authenticated
      auth.logout()

      const localPayload = {
        layout: 'column2-1',
        sections: [
          {
            sectionId: 'name_contact',
            column: 'left' as const,
            order: 0,
            entries: [],
          },
        ],
      }
      localStorage.setItem('resume_data', JSON.stringify(localPayload))

      const store = useResumeStore()
      // Ensure store starts empty
      store.initializeDefaults()
      // Clear sections
      for (const t of SECTION_TYPES) {
        store.toggleSection(t)
      }
      expect(store.sections).toHaveLength(0)

      const { loadResume } = useResumeData()
      await loadResume()

      expect(store.layout).toBe('column2-1')
      expect(store.sections).toHaveLength(1)
      expect(store.sections[0]!.sectionType).toBe('name_contact')
      expect(store.sections[0]!.column).toBe('left')
    })

    it('loads defaults when localStorage is empty', async () => {
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      // Clear all sections
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))
      expect(store.sections).toHaveLength(0)

      const { loadResume } = useResumeData()
      await loadResume()

      // Defaults initialize all 10 sections
      expect(store.layout).toBe('standard')
      expect(store.sections).toHaveLength(10)
    })

    it('handles corrupted localStorage gracefully', async () => {
      const auth = useAuthStore()
      auth.logout()
      localStorage.setItem('resume_data', 'not-valid-json{{')

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume } = useResumeData()
      await loadResume()

      // Corrupted data is cleared, defaults loaded
      expect(localStorage.getItem('resume_data')).toBeNull()
      expect(store.sections).toHaveLength(10)
    })
  })

  describe('saveResume (anonymous)', () => {
    it('writes payload to localStorage', async () => {
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()
      store.setLayout('column2-1')
      store.toggleSection('hobbies') // disable one

      const { saveResume } = useResumeData()
      await saveResume()

      const stored = JSON.parse(localStorage.getItem('resume_data')!)
      expect(stored.layout).toBe('column2-1')
      expect(stored.sections).toHaveLength(9)
      expect(stored.sections.map((s: { sectionId: string }) => s.sectionId)).not.toContain('hobbies')
    })
  })

  describe('loadResume (authenticated)', () => {
    it('loads from API and calls loadFromPayload', async () => {
      const auth = useAuthStore()
      // Simulate authenticated user via login
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, token: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          id: 'resume-1',
          layout: 'column2-1',
          sections: [
            {
              sectionId: 'name_contact',
              column: 'left',
              order: 0,
              entries: [],
            },
          ],
        }),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume } = useResumeData()
      await loadResume()

      expect(store.layout).toBe('column2-1')
      expect(store.sections).toHaveLength(1)
      expect(store.sections[0]!.sectionType).toBe('name_contact')
    })

    it('falls back to defaults on 404', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, token: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ message: 'Not Found' }, 404),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume } = useResumeData()
      await loadResume()

      // Falls back to defaults
      expect(store.sections).toHaveLength(10)
      expect(store.layout).toBe('standard')
    })
  })

  describe('saveResume (authenticated)', () => {
    it('PUTs to API for authenticated user', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, token: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      // Reset mock to ignore login API calls
      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'resume-1', layout: 'standard', sections: [] }),
      )

      const store = useResumeStore()
      store.initializeDefaults()

      const { saveResume } = useResumeData()
      await saveResume()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const call = mockFetch.mock.calls[0]!
      expect(call[0]).toContain('/api/v1/resumes')
      expect(call[1]!.method).toBe('PUT')
    })

    it('POSTs on 404 (resume not yet created)', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, token: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      // Reset mock to ignore login API calls
      mockFetch.mockClear()
      // First call (PUT) fails with 404
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ message: 'Not Found' }, 404),
      )
      // Second call (POST) succeeds
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'resume-1', layout: 'standard', sections: [] }),
      )

      const store = useResumeStore()
      store.initializeDefaults()

      const { saveResume } = useResumeData()
      await saveResume()

      expect(mockFetch).toHaveBeenCalledTimes(2)
      // Second call is a POST
      const postCall = mockFetch.mock.calls[1]!
      expect(postCall[1]!.method).toBe('POST')
    })
  })
})
