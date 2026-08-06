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

    it('applies sub-item filtering to every section — section-level locks no longer shield content (RES-108)', async () => {
      const { tailorResume } = useTailor()
      const store = useResumeStore()
      store.initializeDefaults()

      // Flag the experience section locked at SECTION level — obsolete for
      // Tailor (RES-108): only sub-item/bullet locks (RES-97/RES-106) count.
      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      exp.locked = true

      const mockResponse: TailorResponse = {
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
          projects: [{ entryOrder: 0, bulletIndices: [0] }],
        },
        filteredHardSkills: ['react'],
        filteredSoftSkills: [],
      }

      mockApiPost.mockResolvedValue(mockResponse)

      await tailorResume('React developer')

      // The response's indices are recorded for the section-level locked
      // section too — its bullets are filtered normally.
      expect(store.filteredBulletIndices['experience']).toEqual([
        { entryOrder: 0, bulletIndices: [0] },
      ])
      expect(store.isBulletRelevant('experience', 0, 1)).toBe(false)
      expect(store.isBulletRelevant('experience', 0, 0)).toBe(true)

      // Other sections filter as before.
      expect(store.isBulletRelevant('projects', 0, 1)).toBe(false)

      // The inert section-level flag itself survives the tailor run.
      expect(exp.locked).toBe(true)
    })

    // ── RES-108: Tailor only toggles sub-items, never whole sections ──

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

    it('never flips a section eye off when its content is non-relevant — bullets are hidden instead', async () => {
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

      // RES-108: the section eye is user-only — neither section flips.
      expect(exp.enabled).toBe(true)
      expect(projects.enabled).toBe(true)
      // The irrelevant project bullet is hidden at sub-item level instead.
      expect(store.isBulletRelevant('projects', 0, 0)).toBe(false)
      expect(store.isBulletRelevant('experience', 0, 1)).toBe(false)
    })

    it('never flips a skill section eye when no skills are relevant', async () => {
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

      // The section stays visible; the non-matching skill is hidden.
      expect(hard.enabled).toBe(true)
      expect(store.isSkillRelevant('hard_skills', 'Python')).toBe(false)
    })

    it('resetFilter restores sub-item visibility and never touches section eyes', async () => {
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
      // Bullets are visible per the match; the user's eye choices survive.
      expect(store.isBulletRelevant('experience', 0, 0)).toBe(true)
      expect(store.isBulletRelevant('projects', 0, 0)).toBe(true)
      expect(projects.enabled).toBe(false)

      resetFilter()
      // Reset restores bullet visibility; the user's eye choice (projects
      // hidden) is untouched.
      expect(projects.enabled).toBe(false)
      expect(exp.enabled).toBe(true)
    })

    it('records filtered skills for a section flagged locked at section level (RES-108)', async () => {
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

      // Section-level locks are obsolete for Tailor (RES-108): the skill
      // list is recorded as the match decided.
      expect(store.isFiltered).toBe(true)
      expect(store.filteredHardSkills).toEqual(['react'])
      expect(store.isSkillRelevant('hard_skills', 'react')).toBe(true)
      expect(store.isSkillRelevant('hard_skills', 'Python')).toBe(false)
    })

    it('keeps the inert section-level lock flag after resetFilter', async () => {
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

      // Reset clears the filter but does not touch the inert section flag.
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
