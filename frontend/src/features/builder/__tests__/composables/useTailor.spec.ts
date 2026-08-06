import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTailor } from '@/features/builder/composables/useTailor'
import { useResumeStore } from '@/features/builder/stores/resume'
import type { TailorResponse } from '@/features/builder/models/tailor-response.model'

// Mock the useApi composable
const mockApiPost = vi.fn<() => Promise<unknown>>()

vi.mock('@/shared/composables/useApi', () => ({
  useApi: () => ({
    post: mockApiPost,
    get: vi.fn<() => Promise<unknown>>(),
    put: vi.fn<() => Promise<unknown>>(),
    del: vi.fn<() => Promise<unknown>>(),
  }),
  ApiRequestError: class ApiRequestError extends Error {
    status: number
    errors?: Record<string, string[]>
    constructor({
      status,
      message,
      errors,
    }: {
      status: number
      message: string
      errors?: Record<string, string[]>
    }) {
      super(message)
      this.name = 'ApiRequestError'
      this.status = status
      this.errors = errors
    }
  },
}))

describe('useTailor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiPost.mockReset()
  })

  describe('initial state', () => {
    it('has isTailoring = false', () => {
      const { isTailoring } = useTailor()
      expect(isTailoring.value).toBe(false)
    })

    it('has tailorError = null', () => {
      const { tailorError } = useTailor()
      expect(tailorError.value).toBeNull()
    })

    it('has isFiltered = false', () => {
      const store = useResumeStore()
      expect(store.isFiltered).toBe(false)
    })

    it('has bulletCap = 5', () => {
      const { bulletCap } = useTailor()
      expect(bulletCap.value).toBe(5)
    })
  })

  describe('tailorResume', () => {
    it('sets error when job description is empty', async () => {
      const { tailorResume, tailorError } = useTailor()

      await tailorResume('')

      expect(tailorError.value).toBe('Please enter a job description')
    })

    it('sets error when job description is whitespace only', async () => {
      const { tailorResume, tailorError } = useTailor()

      await tailorResume('   ')

      expect(tailorError.value).toBe('Please enter a job description')
    })

    it('saves JD text in store', async () => {
      const { tailorResume } = useTailor()
      const store = useResumeStore()
      store.initializeDefaults()

      mockApiPost.mockResolvedValue({
        filteredBulletIndices: {},
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      await tailorResume('React developer')

      expect(store.jdText).toBe('React developer')
    })

    it('sets isTailoring to true during request', async () => {
      const { isTailoring, tailorResume } = useTailor()
      const store = useResumeStore()
      store.initializeDefaults()

      mockApiPost.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  filteredBulletIndices: {},
                  filteredHardSkills: [],
                  filteredSoftSkills: [],
                }),
              10,
            ),
          ),
      )

      const promise = tailorResume('React developer')
      expect(isTailoring.value).toBe(true)

      await promise
      expect(isTailoring.value).toBe(false)
    })

    it('applies filter on success', async () => {
      const { tailorResume } = useTailor()
      const store = useResumeStore()
      store.initializeDefaults()

      const mockResponse: TailorResponse = {
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
        },
        filteredHardSkills: ['react'],
        filteredSoftSkills: [],
      }

      mockApiPost.mockResolvedValue(mockResponse)

      await tailorResume('React developer')

      expect(store.isFiltered).toBe(true)
      expect(store.filteredHardSkills).toEqual(['react'])
    })

    it('keeps locked sections fully visible while filtering unlocked ones', async () => {
      const { tailorResume } = useTailor()
      const store = useResumeStore()
      store.initializeDefaults()

      // Lock the experience section; leave projects unlocked.
      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      exp.locked = true

      const mockResponse: TailorResponse = {
        filteredBulletIndices: {
          // Response says only bullet [0] of entry 0 survives — must be ignored
          // for the locked experience section.
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
          projects: [{ entryOrder: 0, bulletIndices: [0] }],
        },
        filteredHardSkills: ['react'],
        filteredSoftSkills: [],
      }

      mockApiPost.mockResolvedValue(mockResponse)

      await tailorResume('React developer')

      // Locked section: every bullet stays visible, regardless of matches.
      expect(store.isBulletRelevant('experience', 0, 1)).toBe(true)
      expect(store.isBulletRelevant('experience', 5, 2)).toBe(true)
      expect(store.filteredBulletIndices['experience']).toBeUndefined()

      // Unlocked section: filter still applies as before.
      expect(store.isBulletRelevant('projects', 0, 0)).toBe(true)
      expect(store.isBulletRelevant('projects', 0, 1)).toBe(false)

      // Lock flag itself survives the tailor run.
      expect(exp.locked).toBe(true)
    })

    // ── RES-98: eye-toggle feedback through the full tailor round-trip ──

    /**
     * Add a top-level entry with N child bullets to a section.
     * @param store
     * @param sectionType
     * @param bulletCount
     */
    function addBullets(store: ReturnType<typeof useResumeStore>, sectionType: string, bulletCount: number) {
      const section = store.sections.find((s) => s.sectionType === sectionType)!
      const entryId = crypto.randomUUID()
      section.entries.push({ id: entryId, order: 0, parentId: null, fields: [] })
      for (let i = 0; i < bulletCount; i++) {
        section.entries.push({
          id: crypto.randomUUID(),
          order: i,
          parentId: entryId,
          fields: [{ key: 'text', value: `Bullet ${i}`, order: 0 }],
        })
      }
    }

    it('flips the eye off for sections with no relevant content after tailoring', async () => {
      const { tailorResume } = useTailor()
      const store = useResumeStore()
      store.initializeDefaults()
      addBullets(store, 'experience', 2)
      addBullets(store, 'projects', 1)

      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      const projects = store.sections.find((s) => s.sectionType === 'projects')!

      // JD only matches one experience bullet — projects has no matches.
      mockApiPost.mockResolvedValue({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
          projects: [{ entryOrder: 0, bulletIndices: [] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      await tailorResume('React developer')

      expect(exp.enabled).toBe(true) // relevant → eye on
      expect(projects.enabled).toBe(false) // irrelevant → eye off
    })

    it('flips the eye off for skill sections with no relevant skills', async () => {
      const { tailorResume } = useTailor()
      const store = useResumeStore()
      store.initializeDefaults()

      const hard = store.sections.find((s) => s.sectionType === 'hard_skills')!
      hard.entries.push({
        id: crypto.randomUUID(),
        order: 0,
        parentId: null,
        fields: [{ key: 'name', value: 'Python', order: 0 }],
      })

      mockApiPost.mockResolvedValue({
        filteredBulletIndices: {},
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      await tailorResume('React developer')

      expect(hard.enabled).toBe(false)
    })

    it('resetFilter restores the original eye states after tailoring', async () => {
      const { tailorResume, resetFilter } = useTailor()
      const store = useResumeStore()
      store.initializeDefaults()
      addBullets(store, 'experience', 1)
      addBullets(store, 'projects', 1)

      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      const projects = store.sections.find((s) => s.sectionType === 'projects')!

      // User hid projects before tailoring
      projects.enabled = false

      mockApiPost.mockResolvedValue({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
          projects: [{ entryOrder: 0, bulletIndices: [0] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      await tailorResume('React developer')
      // Both relevant → both visible after tailoring (projects re-enabled)
      expect(exp.enabled).toBe(true)
      expect(projects.enabled).toBe(true)

      resetFilter()
      // Reset restores the pre-tailor state: projects hidden again
      expect(projects.enabled).toBe(false)
      expect(exp.enabled).toBe(true)
    })

    it('keeps locked skill sections fully visible after tailoring', async () => {
      const { tailorResume } = useTailor()
      const store = useResumeStore()
      store.initializeDefaults()

      const hard = store.sections.find((s) => s.sectionType === 'hard_skills')!
      hard.locked = true

      const mockResponse: TailorResponse = {
        filteredBulletIndices: {},
        filteredHardSkills: ['react'],
        filteredSoftSkills: [],
      }

      mockApiPost.mockResolvedValue(mockResponse)

      await tailorResume('React developer')

      expect(store.isFiltered).toBe(true)
      expect(store.filteredHardSkills).toEqual([])
      expect(store.isSkillRelevant('hard_skills', 'Python')).toBe(true)
    })

    it('keeps lock state after resetFilter', async () => {
      const { tailorResume, resetFilter } = useTailor()
      const store = useResumeStore()
      store.initializeDefaults()

      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      exp.locked = true

      mockApiPost.mockResolvedValue({
        filteredBulletIndices: {},
        filteredHardSkills: ['react'],
        filteredSoftSkills: [],
      })

      await tailorResume('React developer')
      resetFilter()

      // Reset clears the filter but does NOT unlock sections.
      expect(store.isFiltered).toBe(false)
      expect(exp.locked).toBe(true)
    })

    it('sends the locked flag in the tailor request payload', async () => {
      const { tailorResume } = useTailor()
      const store = useResumeStore()
      store.initializeDefaults()

      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      exp.locked = true

      mockApiPost.mockResolvedValue({
        filteredBulletIndices: {},
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      await tailorResume('React developer')

      // The payload sent to the backend must carry the lock state so the
      // keyword engine can skip locked sections server-side.
      const sentPayload = mockApiPost.mock.calls[0]![1] as { resume: { sections: { sectionId: string; locked?: boolean }[] } }
      const sentExp = sentPayload.resume.sections.find(
        (s) => s.sectionId === 'experience',
      )!
      expect(sentExp.locked).toBe(true)
    })

    it('sets error on API failure', async () => {
      const { tailorResume, tailorError } = useTailor()
      const store = useResumeStore()
      store.initializeDefaults()

      mockApiPost.mockRejectedValue(new Error('Network error'))

      await tailorResume('React developer')

      expect(tailorError.value).toBe('Network error')
      expect(store.isFiltered).toBe(false)
    })
  })

  describe('resetFilter', () => {
    it('clears error and filter state', async () => {
      const { resetFilter, tailorError, tailorResume } = useTailor()
      const store = useResumeStore()
      store.initializeDefaults()

      mockApiPost.mockResolvedValue({
        filteredBulletIndices: {},
        filteredHardSkills: ['react'],
        filteredSoftSkills: [],
      })

      await tailorResume('React developer')
      expect(store.isFiltered).toBe(true)

      resetFilter()

      expect(tailorError.value).toBeNull()
      expect(store.isFiltered).toBe(false)
    })
  })
})
