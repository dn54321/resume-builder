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
    mockFetch.mockReset()
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
      store.name = 'Local Resume'
      store.setLayout('column2-1')
      store.toggleSection('hobbies') // disable one

      const { saveResume } = useResumeData()
      await saveResume()

      const stored = JSON.parse(localStorage.getItem('resume_data')!)
      expect(stored.name).toBe('Local Resume')
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

    it('clears sessionStorage after successful API save', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'resume-1', layout: 'standard', sections: [] }),
      )

      // Pre-populate sessionStorage with pending changes
      sessionStorage.setItem('resume_pending_changes', JSON.stringify({ layout: 'column2-1', sections: [] }))

      const store = useResumeStore()
      store.initializeDefaults()

      const { saveResume } = useResumeData()
      await saveResume()

      // After successful save, sessionStorage should be cleared
      expect(sessionStorage.getItem('resume_pending_changes')).toBeNull()
    })

    it('clears dirty flag after successful authenticated save', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      mockFetch.mockClear()
      // Mock: loadResume GET returns empty sections (falls back to defaults)
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'resume-1', layout: 'standard', sections: [] }),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, saveResume, dirty } = useResumeData()
      await loadResume()

      // Mutate to make dirty
      store.setLayout('column2-1')
      await nextTick()
      expect(dirty.value).toBe(true)

      // Mock: saveResume PUT succeeds
      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'resume-1', layout: 'standard', sections: [] }),
      )

      // Save should clear dirty
      await saveResume()
      expect(dirty.value).toBe(false)
    })

    it('clears dirty flag after 404 → POST fallback save', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      mockFetch.mockClear()
      // Mock: loadResume GET returns empty sections (falls back to defaults)
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'resume-1', layout: 'standard', sections: [] }),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, saveResume, dirty } = useResumeData()
      await loadResume()

      store.setLayout('column2-1')
      await nextTick()
      expect(dirty.value).toBe(true)

      // Mocks: PUT returns 404 — triggers POST fallback
      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ message: 'Not Found' }, 404),
      )
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'resume-1', layout: 'standard', sections: [] }),
      )

      // Save (PUT 404 → POST succeeds) should clear dirty
      await saveResume()
      expect(dirty.value).toBe(false)
    })

    it('keeps dirty true when save fails with non-404 error', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      mockFetch.mockClear()
      // Mock: loadResume GET returns empty sections (falls back to defaults)
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'resume-1', layout: 'standard', sections: [] }),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, saveResume, dirty } = useResumeData()
      await loadResume()

      store.setLayout('column2-1')
      await nextTick()
      expect(dirty.value).toBe(true)

      // Mock: PUT fails with 500 (server error) — NOT a 404, so it propagates
      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ message: 'Server Error' }, 500),
      )

      // Save fails — dirty should stay true
      await expect(saveResume()).rejects.toThrow()
      expect(dirty.value).toBe(true)
    })

    it('allows dirty watcher to fire again after failed save (isSaving guard resets)', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      mockFetch.mockClear()
      // Mock: loadResume GET returns empty sections (falls back to defaults)
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'resume-1', layout: 'standard', sections: [] }),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, saveResume, dirty } = useResumeData()
      await loadResume()
      expect(dirty.value).toBe(false)

      // Make an edit
      store.setLayout('column2-1')
      await nextTick()
      expect(dirty.value).toBe(true)

      // Mock: PUT fails with 500
      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ message: 'Server Error' }, 500),
      )

      // Save fails
      await expect(saveResume()).rejects.toThrow()
      expect(dirty.value).toBe(true)

      // After the failed save, the isSaving guard should be reset.
      // Further store mutations should still mark dirty (though it's already true).
      // Verify: set dirty to false manually, then mutate — should mark dirty again.
      dirty.value = false
      store.setLayout('standard')
      await nextTick()
      expect(dirty.value).toBe(true)
    })
  })

  describe('sessionStorage persistence (authenticated)', () => {
    it('writes to sessionStorage on auto-save watch when authenticated', async () => {
      vi.useFakeTimers()
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      // Mock API response for auto-save
      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'resume-1', layout: 'standard', sections: [] }),
      )

      // Load resume first (should hit 404 and fall to defaults)
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ message: 'Not Found' }, 404),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, setupAutoSave, teardownAutoSave } = useResumeData()
      await loadResume()
      setupAutoSave()

      // Mutate the store — sessionStorage should be written immediately
      store.setLayout('column2-1')
      await nextTick()

      const stored = sessionStorage.getItem('resume_pending_changes')
      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed.layout).toBe('column2-1')

      teardownAutoSave()
      vi.useRealTimers()
    })

    it('does not write to sessionStorage when anonymous', async () => {
      vi.useFakeTimers()
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, setupAutoSave, teardownAutoSave } = useResumeData()
      await loadResume()
      setupAutoSave()

      // Mutate the store
      store.setLayout('column2-1')
      await nextTick()

      // sessionStorage should NOT be written for anonymous users
      expect(sessionStorage.getItem('resume_pending_changes')).toBeNull()

      teardownAutoSave()
      vi.useRealTimers()
    })

    it('loads pending changes from sessionStorage on reload when authenticated', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      // Pre-populate sessionStorage with pending changes (simulating a refresh before auto-save)
      sessionStorage.setItem(
        'resume_pending_changes',
        JSON.stringify({
          layout: 'column2-1',
          sections: [
            {
              sectionId: 'summary',
              column: 'right',
              order: 0,
              entries: [],
            },
          ],
        }),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, dirty } = useResumeData()
      await loadResume()

      // Should load from sessionStorage, not from API defaults
      expect(store.layout).toBe('column2-1')
      expect(store.sections).toHaveLength(1)
      expect(store.sections[0]!.sectionType).toBe('summary')
      // Should be marked dirty because changes are pending
      expect(dirty.value).toBe(true)
    })

    it('falls back to API when sessionStorage is empty for authenticated user', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      // No sessionStorage data — should load from API
      sessionStorage.clear()

      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          id: 'resume-1',
          layout: 'standard',
          sections: [
            {
              sectionId: 'experience',
              column: 'right',
              order: 0,
              entries: [],
            },
          ],
        }),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, dirty } = useResumeData()
      await loadResume()

      expect(store.layout).toBe('standard')
      expect(store.sections).toHaveLength(1)
      expect(store.sections[0]!.sectionType).toBe('experience')
      expect(dirty.value).toBe(false)
    })

    it('handles corrupted sessionStorage gracefully for authenticated user', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      // Corrupted sessionStorage — should fall back to API
      sessionStorage.setItem('resume_pending_changes', 'not-valid-json{{')

      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          id: 'resume-1',
          layout: 'standard',
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

      // Corrupted data is cleared, falls back to API
      expect(sessionStorage.getItem('resume_pending_changes')).toBeNull()
      expect(store.sections).toHaveLength(1)
      expect(store.sections[0]!.sectionType).toBe('name_contact')
    })
  })
})
