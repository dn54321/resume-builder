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

// ─── Mock vue-router ──────────────────────────────────────────────
// useResumeData reads the route param (loadResume fallback) and performs
// the deferred-create navigation (router.replace). Tests control the route
// via mockRoute.params and assert navigation via mockReplace.
const { mockRoute, mockReplace } = vi.hoisted(() => ({
  mockRoute: { params: {} as Record<string, string | undefined> },
  mockReplace: vi.fn<() => Promise<unknown>>(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ replace: mockReplace }),
}))

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
    mockRoute.params = {}
    mockReplace.mockReset()
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
      // RES-102 per-resume isolation: fresh /builder restores the LAST
      // anonymous resume via the resume_data_last_id pointer.
      localStorage.setItem('resume_data_anon-last', JSON.stringify(localPayload))
      localStorage.setItem('resume_data_last_id', 'anon-last')

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
      // loadFromPayload fills missing sections to 10 — saved one is enabled
      expect(store.sections).toHaveLength(10)
      const nc = store.sections.find((s) => s.sectionType === 'name_contact')
      expect(nc).toBeDefined()
      expect(nc!.enabled).toBe(true)
      expect(nc!.column).toBe('left')
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
      // Corrupt the LAST-anonymous-resume blob (per-resume key)
      localStorage.setItem('resume_data_anon-last', 'not-valid-json{{')
      localStorage.setItem('resume_data_last_id', 'anon-last')

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, dirty } = useResumeData()
      await loadResume()

      // Corrupted data is cleared, defaults loaded
      expect(localStorage.getItem('resume_data_anon-last')).toBeNull()
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

    it('becomes dirty when a real edit is made after load', async () => {
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, dirty } = useResumeData()
      await loadResume()
      expect(dirty.value).toBe(false)

      // A real edit (user content) marks the builder dirty
      store.name = 'Edited Name'
      await nextTick()
      expect(dirty.value).toBe(true)
    })

    it('does NOT mark dirty for empty-template mutations on a fresh builder (RES-103)', async () => {
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()

      const { loadResume, dirty } = useResumeData()
      await loadResume()
      expect(dirty.value).toBe(false)

      // Scaffolding mutations — layout switch, section toggles, empty
      // template entries — carry no user content and must NOT dirty a fresh
      // builder (otherwise the autosave would POST and create a DB row
      // before the user types anything).
      store.setLayout('column2-1')
      await nextTick()
      expect(dirty.value).toBe(false)

      store.toggleSection('hobbies')
      await nextTick()
      expect(dirty.value).toBe(false)
    })

    it('clears dirty after explicit saveResume', async () => {
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, saveResume, dirty } = useResumeData()
      await loadResume()

      // Real edit to make dirty
      store.name = 'Edited Name'
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

      // Real edit — dirty goes true
      store.name = 'Edited Name'
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

      // RES-102/RES-103: anonymous first-save assigns a local id and stores
      // under resume_data_<id> (per-resume isolation).
      expect(store.id).not.toBeNull()
      const stored = JSON.parse(localStorage.getItem(`resume_data_${store.id}`)!)
      expect(stored.name).toBe('Local Resume')
      expect(stored.layout).toBe('column2-1')
      // All 10 sections serialized; hobbies is disabled
      expect(stored.sections).toHaveLength(10)
      const hobbies = stored.sections.find((s: { sectionId: string }) => s.sectionId === 'hobbies')
      expect(hobbies).toBeDefined()
      expect(hobbies.enabled).toBe(false)
    })

    it('never navigates (anonymous saves stay at /builder)', async () => {
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()

      const { saveResume } = useResumeData()
      await saveResume()

      expect(mockReplace).not.toHaveBeenCalled()
    })
  })

  describe('loadResume (authenticated) — RES-103 deferred-create', () => {
    it('loads the resume targeted by /builder/:id via GET /resumes/:id', async () => {
      const auth = useAuthStore()
      // Simulate authenticated user via login
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      // GET /api/v1/resumes/resume-1 → full tree (RES-103: load by ROUTE id,
      // not the first item of the list)
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
      await loadResume('resume-1')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/resumes/resume-1',
        expect.anything(),
      )
      // The store claims the server id so later saves PUT /resumes/resume-1
      expect(store.id).toBe('resume-1')
      expect(store.layout).toBe('column2-1')
      // loadFromPayload fills missing sections — the saved one is enabled, rest are disabled
      expect(store.sections).toHaveLength(10)
      const nc = store.sections.find((s) => s.sectionType === 'name_contact')
      expect(nc!.enabled).toBe(true)
    })

    it('uses the current route param when no explicit id is given', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      mockRoute.params = { id: 'route-resume-9' }

      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          id: 'route-resume-9',
          layout: 'standard',
          sections: [],
        }),
      )

      const store = useResumeStore()
      const { loadResume } = useResumeData()
      await loadResume()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/resumes/route-resume-9',
        expect.anything(),
      )
      expect(store.id).toBe('route-resume-9')
    })

    it('fresh /builder (no id) loads defaults with NO API call (no DB row)', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      // Clear the login call — nothing else should be fetched
      mockFetch.mockClear()

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, dirty } = useResumeData()
      await loadResume()

      // No GET /resumes call at all — the fresh builder is pure local state
      expect(mockFetch).not.toHaveBeenCalled()
      expect(store.sections).toHaveLength(10)
      expect(store.layout).toBe('standard')
      // No server id yet — the first edit's autosave will POST
      expect(store.id).toBeNull()
      expect(dirty.value).toBe(false)
    })

    it('fresh /builder stays fresh across reloads (does not restore localStorage)', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      // Stale anonymous draft in localStorage must NOT leak into an
      // authenticated fresh builder.
      localStorage.setItem(
        'resume_data',
        JSON.stringify({ layout: 'column2-1', sections: [{ sectionId: 'summary', column: 'right', order: 0, entries: [] }] }),
      )

      const store = useResumeStore()
      const { loadResume } = useResumeData()
      await loadResume()

      expect(store.layout).toBe('standard')
      expect(store.sections).toHaveLength(10)
      expect(store.sections.every((s) => s.enabled)).toBe(true)
      expect(store.id).toBeNull()
    })

    it('forwards the resume name from the API to loadFromPayload (RES-83)', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          user: { id: 'user-1', email: 'test@test.com' },
          sessionToken: 'fake-token',
        }),
      )
      await auth.login('test@test.com', 'password')

      // Full tree INCLUDES the name — it must survive the reload
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          id: 'resume-1',
          name: 'Saved Name',
          layout: 'standard',
          sections: [
            {
              sectionId: 'summary',
              column: 'right',
              order: 0,
              entries: [
                {
                  order: 0,
                  parentId: null,
                  fields: [{ key: 'text', value: 'Hello', order: 0 }],
                },
              ],
            },
          ],
        }),
      )

      const store = useResumeStore()
      const { loadResume } = useResumeData()
      await loadResume('resume-1')

      // The saved name is restored instead of reset to ''
      expect(store.name).toBe('Saved Name')
    })

    it('skips the GET when the store already holds the targeted resume (post-create remount)', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      mockFetch.mockClear()

      const store = useResumeStore()
      store.initializeDefaults()
      store.id = 'resume-1'
      store.name = 'Just Saved'

      const { loadResume, dirty } = useResumeData()
      await loadResume('resume-1')

      // The local state is authoritative — no redundant GET that could race
      // and wipe concurrent edits.
      expect(mockFetch).not.toHaveBeenCalled()
      expect(store.name).toBe('Just Saved')
      expect(dirty.value).toBe(false)
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
      await loadResume('deleted-resume')

      // Falls back to defaults (fresh, no server id)
      expect(store.sections).toHaveLength(10)
      expect(store.layout).toBe('standard')
      expect(store.id).toBeNull()
    })
  })

  describe('saveResume (authenticated) — RES-103 deferred-create', () => {
    it('PUTs to /resumes/:id for an existing resume', async () => {
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
      store.id = 'resume-1' // resume already exists server-side

      const { saveResume } = useResumeData()
      await saveResume()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const call = mockFetch.mock.calls[0]!
      expect(call[0]).toBe('http://localhost:3000/api/v1/resumes/resume-1')
      expect(call[1]!.method).toBe('PUT')
    })

    it('POSTs to create on the FIRST edit of a fresh /builder and claims the id', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      // Reset mock to ignore login API calls
      mockFetch.mockClear()
      // POST /api/v1/resumes → returns the created resume id
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'new-resume-1', layout: 'standard', sections: [] }, 201),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      // Fresh builder: no server id yet
      expect(store.id).toBeNull()
      store.name = 'First Edit'

      const { saveResume, dirty } = useResumeData()
      await saveResume()

      // Created via POST (not PUT — there is no row to update yet)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const call = mockFetch.mock.calls[0]!
      expect(call[0]).toBe('http://localhost:3000/api/v1/resumes')
      expect(call[1]!.method).toBe('POST')

      // The server id is claimed so subsequent saves PUT /resumes/:id
      expect(store.id).toBe('new-resume-1')
      // URL replaced with /builder/:id so a refresh keeps the uuid
      expect(mockReplace).toHaveBeenCalledWith('/builder/new-resume-1')
      expect(dirty.value).toBe(false)
    })

    it('does not navigate when no router is available', async () => {
      const auth = useAuthStore()
      auth.logout() // anonymous path — localStorage only
      const store = useResumeStore()
      store.initializeDefaults()

      const { saveResume } = useResumeData()
      await saveResume()
      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('does NOT POST when a fresh builder has no real content (RES-103)', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      // Reset mock to ignore login API calls
      mockFetch.mockClear()

      const store = useResumeStore()
      store.initializeDefaults()
      // Simulate the editors' auto-added EMPTY template entries (name_contact
      // row with empty fields) — scaffolding, not user edits.
      const nc = store.sections.find((s) => s.sectionType === 'name_contact')!
      nc.entries.push({
        id: 'template-entry',
        order: 0,
        parentId: null,
        locked: false,
        fields: [
          { key: 'fullName', value: '', order: 0 },
          { key: 'email', value: '', order: 1 },
        ],
      })

      const { saveResume, dirty } = useResumeData()
      await saveResume()

      // No POST — the empty builder must never create a DB row
      expect(mockFetch).not.toHaveBeenCalled()
      expect(mockReplace).not.toHaveBeenCalled()
      expect(store.id).toBeNull()
      expect(dirty.value).toBe(false)
    })

    it('POSTs once the first real content exists (RES-103)', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'new-resume-1', layout: 'standard', sections: [] }, 201),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      // First edit: type the resume name
      store.name = 'My First Resume'

      const { saveResume, dirty } = useResumeData()
      await saveResume()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch.mock.calls[0]![1]!.method).toBe('POST')
      expect(store.id).toBe('new-resume-1')
      expect(mockReplace).toHaveBeenCalledWith('/builder/new-resume-1')
      expect(dirty.value).toBe(false)
    })

    it('PUT 404 falls back to POST, claims the new id, and navigates', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      mockFetch.mockClear()
      // PUT /resumes/resume-1 → 404 (row deleted elsewhere)
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ message: 'Not Found' }, 404),
      )
      // POST → recreates with a NEW id
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'recreated-2', layout: 'standard', sections: [] }, 201),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      store.id = 'resume-1'

      const { saveResume, dirty } = useResumeData()
      await saveResume()

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch.mock.calls[0]![1]!.method).toBe('PUT')
      expect(mockFetch.mock.calls[1]![1]!.method).toBe('POST')
      expect(store.id).toBe('recreated-2')
      expect(mockReplace).toHaveBeenCalledWith('/builder/recreated-2')
      expect(dirty.value).toBe(false)
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
      sessionStorage.setItem('resume_pending_changes_resume-1', JSON.stringify({ layout: 'column2-1', sections: [] }))

      const store = useResumeStore()
      store.initializeDefaults()
      store.id = 'resume-1'

      const { saveResume } = useResumeData()
      await saveResume()

      // After successful save, sessionStorage should be cleared (per-resume key)
      expect(sessionStorage.getItem('resume_pending_changes_resume-1')).toBeNull()
    })

    it('clears dirty flag after successful authenticated save', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      mockFetch.mockClear()
      // Mock: loadResume('resume-1') GET returns the resume
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'resume-1', layout: 'standard', sections: [] }),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, saveResume, dirty } = useResumeData()
      await loadResume('resume-1')
      expect(store.id).toBe('resume-1')

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
      // Mock: loadResume('resume-1') GET returns the resume
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'resume-1', layout: 'standard', sections: [] }),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, saveResume, dirty } = useResumeData()
      await loadResume('resume-1')

      store.setLayout('column2-1')
      await nextTick()
      expect(dirty.value).toBe(true)

      // Mocks: PUT returns 404 — triggers POST fallback
      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ message: 'Not Found' }, 404),
      )
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'resume-2', layout: 'standard', sections: [] }, 201),
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
      // Mock: loadResume('resume-1') GET returns the resume
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'resume-1', layout: 'standard', sections: [] }),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, saveResume, dirty } = useResumeData()
      await loadResume('resume-1')

      store.setLayout('column2-1')
      await nextTick()
      expect(dirty.value).toBe(true)

      // Mock: PUT fails with 500 (server error) — NOT a 404, so it propagates
      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ message: 'Server Error' }, 500),
      )

      // Save fails — dirty should stay true
      await expect(saveResume()).rejects.toThrow('Server Error')
      expect(dirty.value).toBe(true)
    })

    it('allows dirty watcher to fire again after failed save (isSaving guard resets)', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      mockFetch.mockClear()
      // Mock: loadResume('resume-1') GET returns the resume
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'resume-1', layout: 'standard', sections: [] }),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, saveResume, dirty } = useResumeData()
      await loadResume('resume-1')
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
      await expect(saveResume()).rejects.toThrow('Server Error')
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
      await loadResume('resume-1')
      setupAutoSave()

      // Real edit — sessionStorage should be written immediately (per-resume key)
      store.name = 'Edited Name'
      await nextTick()

      const stored = sessionStorage.getItem('resume_pending_changes_resume-1')
      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed.name).toBe('Edited Name')

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

      // Real edit
      store.name = 'Edited Name'
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
      // Per-resume key (RES-102): resume_pending_changes_<id>
      sessionStorage.setItem(
        'resume_pending_changes_route-resume-5',
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

      // Editing /builder/route-resume-5 — the route supplies the id
      mockRoute.params = { id: 'route-resume-5' }

      const { loadResume, dirty } = useResumeData()
      await loadResume()

      // Should load from sessionStorage, not from API defaults
      expect(store.layout).toBe('column2-1')
      // loadFromPayload fills missing sections to 10 — saved one is enabled
      expect(store.sections).toHaveLength(10)
      const summ = store.sections.find((s) => s.sectionType === 'summary')
      expect(summ!.enabled).toBe(true)
      // Should be marked dirty because changes are pending
      expect(dirty.value).toBe(true)
      // The route id survives the restore so the next autosave PUTs /resumes/:id
      expect(store.id).toBe('route-resume-5')
    })

    it('keeps the resume id when pending changes restore on /builder/:id', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      sessionStorage.setItem(
        'resume_pending_changes_resume-7',
        JSON.stringify({
          layout: 'column2-1',
          sections: [{ sectionId: 'summary', column: 'right', order: 0, entries: [] }],
        }),
      )

      const store = useResumeStore()
      const { loadResume } = useResumeData()
      await loadResume('resume-7')

      // The route id survives the pending-changes restore so the next
      // autosave PUTs /resumes/resume-7 instead of re-creating.
      expect(store.id).toBe('resume-7')
      expect(store.layout).toBe('column2-1')
    })

    it('falls back to API when sessionStorage is empty for authenticated user', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      // No sessionStorage data — should load the targeted resume from the API
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
      await loadResume('resume-1')

      expect(store.layout).toBe('standard')
      // loadFromPayload fills missing sections to 10 — saved one is enabled
      expect(store.sections).toHaveLength(10)
      const exp = store.sections.find((s) => s.sectionType === 'experience')
      expect(exp!.enabled).toBe(true)
      expect(dirty.value).toBe(false)
    })

    it('handles corrupted sessionStorage gracefully for authenticated user', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      // Corrupted sessionStorage — should fall back to API (per-resume key)
      sessionStorage.setItem('resume_pending_changes_resume-1', 'not-valid-json{{')

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
      await loadResume('resume-1')

      // Corrupted data is cleared, falls back to API
      expect(sessionStorage.getItem('resume_pending_changes_resume-1')).toBeNull()
      // loadFromPayload fills missing sections to 10 — saved one is enabled
      expect(store.sections).toHaveLength(10)
      const nc = store.sections.find((s) => s.sectionType === 'name_contact')
      expect(nc!.enabled).toBe(true)
    })
  })

  describe('isSaving indicator', () => {
    it('is false initially', async () => {
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()

      const { isSaving } = useResumeData()
      expect(isSaving.value).toBe(false)
    })

    it('is true while saveResume is in flight and false after it resolves', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      // Hanging PUT so we can inspect isSaving mid-flight
      let resolvePut!: (value: Response) => void
      mockFetch.mockClear()
      mockFetch.mockImplementationOnce(
        () => new Promise<Response>((resolve) => { resolvePut = resolve }),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      store.id = 'resume-1'

      const { saveResume, isSaving } = useResumeData()
      expect(isSaving.value).toBe(false)

      const savePromise = saveResume()
      // Runs synchronously until the first await — isSaving flips immediately
      expect(isSaving.value).toBe(true)

      // Complete the PUT
      resolvePut(createFetchResponse({ id: 'resume-1', layout: 'standard', sections: [] }))
      await savePromise

      expect(isSaving.value).toBe(false)
    })

    it('wraps the debounced autosave call', async () => {
      vi.useFakeTimers()
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, setupAutoSave, teardownAutoSave, dirty, isSaving } = useResumeData()
      await loadResume()
      setupAutoSave()
      expect(isSaving.value).toBe(false)

      // Real edit → autosave scheduled (1.5s debounce), not saving yet
      store.name = 'Edited Name'
      await nextTick()
      expect(dirty.value).toBe(true)
      expect(isSaving.value).toBe(false)

      // Fire the debounce — the anonymous save completes synchronously,
      // so isSaving returns to false by the time the timer resolves.
      await vi.advanceTimersByTimeAsync(2000)
      expect(isSaving.value).toBe(false)
      expect(dirty.value).toBe(false)

      teardownAutoSave()
      vi.useRealTimers()
    })

    it('resets to false when the save fails', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ message: 'Server Error' }, 500),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      store.id = 'resume-1'

      const { saveResume, isSaving } = useResumeData()
      await expect(saveResume()).rejects.toThrow('Server Error')
      expect(isSaving.value).toBe(false)
    })
  })

  describe('loadResume (per-resume isolation, RES-102)', () => {
    it('loads the resume matching the route id — never the first one', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          user: { id: 'user-1', email: 'test@test.com' },
          sessionToken: 'fake-token',
        }),
      )
      await auth.login('test@test.com', 'password')

      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          id: 'resume-2',
          name: 'Second Resume',
          layout: 'standard',
          sections: [
            {
              sectionId: 'summary',
              column: 'right',
              order: 0,
              entries: [
                {
                  order: 0,
                  parentId: null,
                  fields: [{ key: 'text', value: 'Second resume summary', order: 0 }],
                },
              ],
            },
          ],
        }),
      )

      const store = useResumeStore()
      const { loadResume } = useResumeData()
      await loadResume('resume-2')

      // Only the id-scoped GET is issued — the list endpoint is never hit
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/resumes/resume-2',
        expect.anything(),
      )
      expect(mockFetch).not.toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/resumes',
        expect.anything(),
      )
      expect(store.id).toBe('resume-2')
      expect(store.name).toBe('Second Resume')
      const summ = store.sections.find((s) => s.sectionType === 'summary')
      expect(summ!.enabled).toBe(true)
    })

    it('two resumes never show each other\u2019s data', async () => {
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          user: { id: 'user-1', email: 'test@test.com' },
          sessionToken: 'fake-token',
        }),
      )
      await auth.login('test@test.com', 'password')

      mockFetch.mockClear()
      // Resume A
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          id: 'resume-a',
          name: 'Resume A',
          layout: 'standard',
          sections: [
            {
              sectionId: 'summary',
              column: 'right',
              order: 0,
              entries: [
                {
                  order: 0,
                  parentId: null,
                  fields: [{ key: 'text', value: 'A data', order: 0 }],
                },
              ],
            },
          ],
        }),
      )
      // Resume B
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          id: 'resume-b',
          name: 'Resume B',
          layout: 'column2-1',
          sections: [
            {
              sectionId: 'education',
              column: 'left',
              order: 0,
              entries: [
                {
                  order: 0,
                  parentId: null,
                  fields: [{ key: 'school', value: 'B school', order: 0 }],
                },
              ],
            },
          ],
        }),
      )

      const store = useResumeStore()
      const { loadResume } = useResumeData()

      await loadResume('resume-a')
      expect(store.name).toBe('Resume A')
      const summaryA = store.sections.find((s) => s.sectionType === 'summary')
      expect(summaryA!.enabled).toBe(true)
      expect(store.sections.find((s) => s.sectionType === 'education')!.enabled).toBe(false)

      await loadResume('resume-b')
      expect(store.name).toBe('Resume B')
      expect(store.layout).toBe('column2-1')
      const educationB = store.sections.find((s) => s.sectionType === 'education')
      expect(educationB!.enabled).toBe(true)
      expect(store.sections.find((s) => s.sectionType === 'summary')!.enabled).toBe(false)
      expect(store.id).toBe('resume-b')
    })

    it('anonymous resumes are isolated per-resume in localStorage', async () => {
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()

      const { saveResume, loadResume } = useResumeData()

      // Save resume A (id anon-A)
      store.id = 'anon-A'
      store.name = 'Resume A'
      await saveResume()

      // Save resume B (id anon-B) — must NOT clobber A
      store.id = 'anon-B'
      store.name = 'Resume B'
      await saveResume()

      expect(localStorage.getItem('resume_data_anon-A')).not.toBeNull()
      expect(localStorage.getItem('resume_data_anon-B')).not.toBeNull()
      expect(localStorage.getItem('resume_data_last_id')).toBe('anon-B')

      // Reopen A → A's data, reopen B → B's data
      await loadResume('anon-A')
      expect(store.id).toBe('anon-A')
      expect(store.name).toBe('Resume A')

      await loadResume('anon-B')
      expect(store.id).toBe('anon-B')
      expect(store.name).toBe('Resume B')
    })

    it('/builder (no id) starts fresh — never loads a saved resume', async () => {
      const auth = useAuthStore()
      auth.logout()

      // Old shared key AND a per-resume key both exist — neither may be loaded
      localStorage.setItem(
        'resume_data',
        JSON.stringify({
          layout: 'column2-1',
          sections: [{ sectionId: 'summary', column: 'right', order: 0, entries: [] }],
        }),
      )
      localStorage.setItem(
        'resume_data_some-old-id',
        JSON.stringify({
          layout: 'column2-1',
          sections: [{ sectionId: 'summary', column: 'right', order: 0, entries: [] }],
        }),
      )

      const store = useResumeStore()
      const { loadResume } = useResumeData()
      await loadResume()

      // Fresh defaults — all 10 sections enabled, standard layout
      expect(store.layout).toBe('standard')
      expect(store.sections).toHaveLength(10)
      expect(store.sections.every((s) => s.enabled)).toBe(true)
      expect(store.name).toBe('')
    })
  })


  describe('autosave coverage (RES-105)', () => {
    // The "Unsaved Changes" modal is disabled (RES-105) — autosave is the
    // ONLY persistence path, so it must fire on every store mutation:
    // name edits, section content edits, visibility toggles, column
    // assignments, and layout changes. These tests assert the debounced
    // autosave persists each kind of edit for anonymous users, and that
    // rapid edits collapse into a single backend save for authenticated
    // users.

    it('fires autosave on resume name edits', async () => {
      vi.useFakeTimers()
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, setupAutoSave, teardownAutoSave } = useResumeData()
      await loadResume()
      setupAutoSave()

      // Name edit → store mutation → autosave scheduled (1.5s debounce)
      store.name = 'Autosaved Name'
      await nextTick()
      expect(localStorage.getItem(`resume_data_${store.id}`)).toBeNull() // not saved yet

      await vi.advanceTimersByTimeAsync(2000)
      const stored = JSON.parse(localStorage.getItem(`resume_data_${store.id}`)!)
      expect(stored.name).toBe('Autosaved Name')

      teardownAutoSave()
      vi.useRealTimers()
    })

    it('fires autosave on section content edits (entry field value)', async () => {
      vi.useFakeTimers()
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, setupAutoSave, teardownAutoSave } = useResumeData()
      await loadResume()
      setupAutoSave()

      // Add an entry with a field value directly to the summary section
      // (mirrors what useSectionEditor.addEntry + the field editors do).
      const summary = store.sections.find((s) => s.sectionType === 'summary')!
      summary.entries.push({
        id: 'entry-1',
        order: 0,
        parentId: null,
        locked: false,
        // RES-106: SectionEntryState.visible is required — the fixture must
        // match the type (entry is visible by default).
        visible: true,
        fields: [{ key: 'text', value: 'Hello world', order: 0 }],
      })
      await nextTick()

      await vi.advanceTimersByTimeAsync(2000)
      const stored = JSON.parse(localStorage.getItem(`resume_data_${store.id}`)!)
      const storedSummary = stored.sections.find(
        (s: { sectionId: string }) => s.sectionId === 'summary',
      )
      expect(storedSummary.entries[0].fields[0].value).toBe('Hello world')

      teardownAutoSave()
      vi.useRealTimers()
    })

    it('fires autosave on visibility (eye) toggles', async () => {
      vi.useFakeTimers()
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, setupAutoSave, teardownAutoSave } = useResumeData()
      await loadResume()
      setupAutoSave()

      // Toggle a section off — the enabled flag must be persisted
      store.toggleSection('hobbies')
      await nextTick()

      await vi.advanceTimersByTimeAsync(2000)
      const stored = JSON.parse(localStorage.getItem(`resume_data_${store.id}`)!)
      const hobbies = stored.sections.find(
        (s: { sectionId: string }) => s.sectionId === 'hobbies',
      )
      expect(hobbies.enabled).toBe(false)

      teardownAutoSave()
      vi.useRealTimers()
    })

    it('fires autosave on column assignment changes', async () => {
      vi.useFakeTimers()
      const auth = useAuthStore()
      auth.logout()

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, setupAutoSave, teardownAutoSave } = useResumeData()
      await loadResume()
      setupAutoSave()

      store.setSectionColumn('summary', 'left')
      await nextTick()

      await vi.advanceTimersByTimeAsync(2000)
      const stored = JSON.parse(localStorage.getItem(`resume_data_${store.id}`)!)
      const summary = stored.sections.find(
        (s: { sectionId: string }) => s.sectionId === 'summary',
      )
      expect(summary.column).toBe('left')

      teardownAutoSave()
      vi.useRealTimers()
    })

    it('debounces rapid edits into a single autosave', async () => {
      vi.useFakeTimers()
      const auth = useAuthStore()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ user: { id: 'user-1', email: 'test@test.com' }, sessionToken: 'fake-token' }),
      )
      await auth.login('test@test.com', 'password')

      // loadResume: GET /resumes list → 404 → falls back to defaults
      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ message: 'Not Found' }, 404),
      )
      // The single debounced autosave PUT
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ id: 'resume-1', layout: 'standard', sections: [] }),
      )

      const store = useResumeStore()
      store.initializeDefaults()
      SECTION_TYPES.forEach((t) => store.toggleSection(t))

      const { loadResume, setupAutoSave, teardownAutoSave, dirty } = useResumeData()
      await loadResume()
      // Editing an existing resume — the debounced autosave PUTs by id
      store.id = 'resume-1'
      setupAutoSave()

      // Three rapid mutations inside the 1.5s debounce window
      store.setLayout('column2-1')
      await nextTick()
      await vi.advanceTimersByTimeAsync(500)
      store.name = 'Rapid edit'
      await nextTick()
      await vi.advanceTimersByTimeAsync(500)
      store.toggleSection('hobbies')
      await nextTick()
      await vi.advanceTimersByTimeAsync(500)
      expect(dirty.value).toBe(true)

      // No PUT has fired yet — the debounce keeps resetting
      const putCallsBefore = mockFetch.mock.calls.filter(
        (c) => c[1]?.method === 'PUT',
      ).length
      expect(putCallsBefore).toBe(0)

      // Once the window finally elapses, exactly ONE save fires
      await vi.advanceTimersByTimeAsync(2000)
      const putCallsAfter = mockFetch.mock.calls.filter(
        (c) => c[1]?.method === 'PUT',
      ).length
      expect(putCallsAfter).toBe(1)
      expect(dirty.value).toBe(false)

      teardownAutoSave()
      vi.useRealTimers()
    })
  })

})
