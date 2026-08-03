import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
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
      // Ensure store has sections initialized (all disabled via toggle)
      store.initializeDefaults()
      // Soft-toggle: disable all sections (they all stay in the array)
      for (const t of SECTION_TYPES) {
        store.toggleSection(t)
      }
      expect(store.sections).toHaveLength(10)
      expect(store.sections.every((s) => !s.enabled)).toBe(true)

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
      // Soft-toggle: disable all sections
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))
      expect(store.sections).toHaveLength(10)
      expect(store.sections.every((s) => !s.enabled)).toBe(true)

      const { loadResume } = useResumeData()
      await loadResume()

      // Defaults initialize all 10 sections (enabled)
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

      const { loadResume, dirty } = useResumeData()
      await loadResume()

      // Corrupted data is cleared, defaults loaded
      expect(localStorage.getItem('resume_data')).toBeNull()
      expect(store.sections).toHaveLength(10)
      // After load, dirty should be false
      expect(dirty.value).toBe(false)
    })

    it('is not dirty after loadResume completes', async () => {
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, dirty } = useResumeData()
      await loadResume()

      expect(dirty.value).toBe(false)
    })

    it('becomes dirty when store is mutated after load', async () => {
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, dirty } = useResumeData()
      await loadResume()
      expect(dirty.value).toBe(false)

      // Mutate the store
      store.setLayout('column2-1')
      await nextTick()
      expect(dirty.value).toBe(true)
    })

    it('clears dirty after explicit saveResume', async () => {
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, saveResume, dirty } = useResumeData()
      await loadResume()

      // Mutate to make dirty
      store.setLayout('column2-1')
      await nextTick()
      expect(dirty.value).toBe(true)

      // Save should clear dirty
      await saveResume()
      expect(dirty.value).toBe(false)
    })

    it('clears dirty when auto-save fires', async () => {
      vi.useFakeTimers()
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, setupAutoSave, teardownAutoSave, dirty } = useResumeData()
      await loadResume()
      setupAutoSave()
      expect(dirty.value).toBe(false)

      // Mutate store — dirty goes true
      store.setLayout('column2-1')
      await nextTick()
      expect(dirty.value).toBe(true)

      // Advance timer past debounce — auto-save fires and clears dirty
      await vi.advanceTimersByTimeAsync(2000)
      expect(dirty.value).toBe(false)

      teardownAutoSave()
      vi.useRealTimers()
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
      // All 10 sections serialized; hobbies is disabled
      expect(stored.sections).toHaveLength(10)
      const hobbies = stored.sections.find((s: { sectionId: string }) => s.sectionId === 'hobbies')
      expect(hobbies).toBeDefined()
      expect(hobbies.enabled).toBe(false)
    })
  })

  describe('loadResume (authenticated)', () => {
    it('loads from API and calls loadFromPayload', async () => {
      const auth = useAuthStore()
      // Simulate authenticated user via login
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
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
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
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
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
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
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
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
