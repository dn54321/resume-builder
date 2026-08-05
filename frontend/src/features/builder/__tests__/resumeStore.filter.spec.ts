import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useResumeStore } from '@/features/builder/stores/resume'
import type { TailorResponse } from '@/features/builder/models/tailor-response.model'

/**
 *
 * @param overrides
 */
function createMockTailorResponse(overrides: Partial<TailorResponse> = {}): TailorResponse {
  return {
    filteredBulletIndices: {
      experience: [
        { entryOrder: 0, bulletIndices: [0, 2] },
        { entryOrder: 1, bulletIndices: [0] },
      ],
      projects: [
        { entryOrder: 0, bulletIndices: [0] },
      ],
    },
    filteredHardSkills: ['react', 'typescript'],
    filteredSoftSkills: ['team leadership'],
    ...overrides,
  }
}

describe('useResumeStore - filter', () => {
  let store: ReturnType<typeof useResumeStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useResumeStore()
  })

  describe('initial filter state', () => {
    it('has isFiltered = false by default', () => {
      expect(store.isFiltered).toBe(false)
    })

    it('has empty jdText by default', () => {
      expect(store.jdText).toBe('')
    })

    it('has empty filtered collections by default', () => {
      expect(store.filteredBulletIndices).toEqual({})
      expect(store.filteredHardSkills).toEqual([])
      expect(store.filteredSoftSkills).toEqual([])
    })
  })

  describe('applyTailorFilter', () => {
    it('sets isFiltered to true', () => {
      store.applyTailorFilter(createMockTailorResponse())
      expect(store.isFiltered).toBe(true)
    })

    it('stores filtered bullet indices', () => {
      store.applyTailorFilter(createMockTailorResponse())
      expect(store.filteredBulletIndices['experience']).toHaveLength(2)
      expect(store.filteredBulletIndices['experience']![0]!.bulletIndices).toEqual([0, 2])
    })

    it('stores filtered hard skills', () => {
      store.applyTailorFilter(createMockTailorResponse())
      expect(store.filteredHardSkills).toEqual(['react', 'typescript'])
    })

    it('stores filtered soft skills', () => {
      store.applyTailorFilter(createMockTailorResponse())
      expect(store.filteredSoftSkills).toEqual(['team leadership'])
    })
  })

  describe('locked sections', () => {
    it('skips bullet indices for a locked section when applying filter', () => {
      store.initializeDefaults()
      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      exp.locked = true

      store.applyTailorFilter(createMockTailorResponse())

      // Locked section must not appear in the filtered indices, so all its
      // bullets stay visible.
      expect(store.filteredBulletIndices['experience']).toBeUndefined()
      // Unlocked sections are still filtered.
      expect(store.filteredBulletIndices['projects']).toHaveLength(1)
    })

    it('clears filtered hard skills when hard_skills is locked', () => {
      store.initializeDefaults()
      const hard = store.sections.find((s) => s.sectionType === 'hard_skills')!
      hard.locked = true

      store.applyTailorFilter(createMockTailorResponse())

      expect(store.filteredHardSkills).toEqual([])
    })

    it('clears filtered soft skills when soft_skills is locked', () => {
      store.initializeDefaults()
      const soft = store.sections.find((s) => s.sectionType === 'soft_skills')!
      soft.locked = true

      store.applyTailorFilter(createMockTailorResponse())

      expect(store.filteredSoftSkills).toEqual([])
    })

    it('keeps every bullet of a locked section relevant', () => {
      store.initializeDefaults()
      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      exp.locked = true

      store.applyTailorFilter(createMockTailorResponse())

      // Even though the response filters experience bullets to [0,2] and [0],
      // the locked section ignores the filter entirely.
      expect(store.isBulletRelevant('experience', 0, 1)).toBe(true)
      expect(store.isBulletRelevant('experience', 1, 0)).toBe(true)
      expect(store.isBulletRelevant('experience', 5, 0)).toBe(true)
    })

    it('keeps every skill of a locked skill section relevant', () => {
      store.initializeDefaults()
      const hard = store.sections.find((s) => s.sectionType === 'hard_skills')!
      hard.locked = true

      store.applyTailorFilter(createMockTailorResponse())

      expect(store.isSkillRelevant('hard_skills', 'Python')).toBe(true)
      expect(store.isSkillRelevant('hard_skills', 'anything')).toBe(true)
    })

    it('reports all bullets visible for a locked section', () => {
      store.initializeDefaults()
      const expSection = store.sections.find((s) => s.sectionType === 'experience')!
      expSection.locked = true
      const entryId = crypto.randomUUID()
      expSection.entries.push({ id: entryId, order: 0, parentId: null, locked: false, fields: [] })
      for (let i = 0; i < 3; i++) {
        expSection.entries.push({
          id: crypto.randomUUID(),
          order: i,
          parentId: entryId,
          locked: false,
          fields: [{ key: 'text', value: `Bullet ${i}`, order: 0 }],
        })
      }

      store.applyTailorFilter(createMockTailorResponse())

      const count = store.getFilteredBulletCount('experience')
      expect(count.total).toBe(3)
      expect(count.visible).toBe(3)
    })

    it('resetTailorFilter does not unlock sections', () => {
      store.initializeDefaults()
      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      exp.locked = true

      store.applyTailorFilter(createMockTailorResponse())
      store.resetTailorFilter()

      // Lock state persists after reset — only the filter state is cleared.
      expect(store.isFiltered).toBe(false)
      expect(exp.locked).toBe(true)
    })
  })

  describe('locked entries (RES-97)', () => {
    /**
     * Build an experience section with two entries, each with 3 bullets.
     * @returns {{ expSection: ReturnType<typeof useResumeStore>['sections'][number], entryA: string, entryB: string }}
     */
    function seedExperience() {
      store.initializeDefaults()
      const expSection = store.sections.find((s) => s.sectionType === 'experience')!
      const entryA = crypto.randomUUID()
      const entryB = crypto.randomUUID()
      expSection.entries.push(
        { id: entryA, order: 0, parentId: null, locked: false, fields: [] },
        { id: entryB, order: 1, parentId: null, locked: false, fields: [] },
      )
      for (let i = 0; i < 3; i++) {
        expSection.entries.push({
          id: crypto.randomUUID(),
          order: i,
          parentId: entryA,
          locked: false,
          fields: [{ key: 'text', value: `A${i}`, order: 0 }],
        })
        expSection.entries.push({
          id: crypto.randomUUID(),
          order: i,
          parentId: entryB,
          locked: false,
          fields: [{ key: 'text', value: `B${i}`, order: 0 }],
        })
      }
      return { expSection, entryA, entryB }
    }

    it('keeps every bullet of a locked parent entry relevant', () => {
      const { expSection, entryA } = seedExperience()
      expSection.entries.find((e) => e.id === entryA)!.locked = true

      store.applyTailorFilter(createMockTailorResponse())

      // Entry A is locked → all its bullets stay visible even though the
      // filter only kept bulletIndices [0, 2] for entry 0.
      expect(store.isBulletRelevant('experience', 0, 0)).toBe(true)
      expect(store.isBulletRelevant('experience', 0, 1)).toBe(true)
      expect(store.isBulletRelevant('experience', 0, 2)).toBe(true)
      // Unlocked entry B (index 1) is still filtered normally.
      expect(store.isBulletRelevant('experience', 1, 0)).toBe(true)
      expect(store.isBulletRelevant('experience', 1, 1)).toBe(false)
      expect(store.isBulletRelevant('experience', 1, 2)).toBe(false)
    })

    it('keeps a locked bullet child relevant inside an unlocked entry', () => {
      const { expSection, entryA } = seedExperience()
      const bulletsA = expSection.entries.filter((e) => e.parentId === entryA)
      bulletsA[1]!.locked = true

      store.applyTailorFilter(createMockTailorResponse())

      // The locked bullet stays visible even though index 1 is filtered out.
      expect(store.isBulletRelevant('experience', 0, 1)).toBe(true)
      // Sibling bullets still follow the filter.
      expect(store.isBulletRelevant('experience', 0, 0)).toBe(true)
      expect(store.isBulletRelevant('experience', 0, 2)).toBe(true)
      expect(store.isBulletRelevant('experience', 1, 1)).toBe(false)
    })

    it('keeps a locked skill entry relevant', () => {
      store.initializeDefaults()
      const soft = store.sections.find((s) => s.sectionType === 'soft_skills')!
      soft.entries.push(
        {
          id: crypto.randomUUID(),
          order: 0,
          parentId: null,
          locked: true,
          fields: [{ key: 'name', value: 'Leadership', order: 0 }],
        },
        {
          id: crypto.randomUUID(),
          order: 1,
          parentId: null,
          locked: false,
          fields: [{ key: 'name', value: 'Communication', order: 0 }],
        },
      )

      store.applyTailorFilter(createMockTailorResponse())

      // Locked skill stays relevant even though it's not in the filtered list.
      expect(store.isSkillRelevant('soft_skills', 'Leadership')).toBe(true)
      expect(store.isSkillRelevant('soft_skills', 'leadership')).toBe(true)
      // Unlocked non-matching skill is still filtered out.
      expect(store.isSkillRelevant('soft_skills', 'Communication')).toBe(false)
      // Matching unlocked skill stays relevant.
      expect(store.isSkillRelevant('soft_skills', 'Team Leadership')).toBe(true)
    })

    it('counts locked entry bullets as visible in getFilteredBulletCount', () => {
      const { expSection, entryA } = seedExperience()
      expSection.entries.find((e) => e.id === entryA)!.locked = true

      store.applyTailorFilter(createMockTailorResponse())

      // 6 bullets total: entry A (3, locked, always visible) + entry B (3,
      // filtered to bulletIndices [0] → 1 visible).
      const count = store.getFilteredBulletCount('experience')
      expect(count.total).toBe(6)
      expect(count.visible).toBe(4)
    })

    it('resetTailorFilter does not unlock entries', () => {
      const { expSection, entryA } = seedExperience()
      expSection.entries.find((e) => e.id === entryA)!.locked = true

      store.applyTailorFilter(createMockTailorResponse())
      store.resetTailorFilter()

      expect(store.isFiltered).toBe(false)
      expect(expSection.entries.find((e) => e.id === entryA)!.locked).toBe(true)
    })
  })

  describe('resetTailorFilter', () => {
    it('sets isFiltered to false', () => {
      store.applyTailorFilter(createMockTailorResponse())
      store.resetTailorFilter()
      expect(store.isFiltered).toBe(false)
    })

    it('clears filtered bullet indices', () => {
      store.applyTailorFilter(createMockTailorResponse())
      store.resetTailorFilter()
      expect(store.filteredBulletIndices).toEqual({})
    })

    it('clears filtered hard skills', () => {
      store.applyTailorFilter(createMockTailorResponse())
      store.resetTailorFilter()
      expect(store.filteredHardSkills).toEqual([])
    })

    it('clears filtered soft skills', () => {
      store.applyTailorFilter(createMockTailorResponse())
      store.resetTailorFilter()
      expect(store.filteredSoftSkills).toEqual([])
    })

    it('leaves jdText unchanged', () => {
      store.jdText = 'Test JD'
      store.applyTailorFilter(createMockTailorResponse())
      store.resetTailorFilter()
      expect(store.jdText).toBe('Test JD')
    })
  })

  describe('isBulletRelevant', () => {
    it('returns true when filter is not active', () => {
      expect(store.isBulletRelevant('experience', 0, 0)).toBe(true)
      expect(store.isBulletRelevant('experience', 0, 5)).toBe(true)
    })

    it('returns true for relevant bullet when filter is active', () => {
      store.applyTailorFilter(createMockTailorResponse())
      expect(store.isBulletRelevant('experience', 0, 0)).toBe(true)
      expect(store.isBulletRelevant('experience', 0, 2)).toBe(true)
      expect(store.isBulletRelevant('projects', 0, 0)).toBe(true)
    })

    it('returns false for non-relevant bullet when filter is active', () => {
      store.applyTailorFilter(createMockTailorResponse())
      expect(store.isBulletRelevant('experience', 0, 1)).toBe(false)
      expect(store.isBulletRelevant('experience', 0, 3)).toBe(false)
    })

    it('returns false when entry order has no match', () => {
      store.applyTailorFilter(createMockTailorResponse())
      expect(store.isBulletRelevant('experience', 5, 0)).toBe(false)
    })

    it('returns true for section not in filteredBulletIndices', () => {
      store.applyTailorFilter(createMockTailorResponse())
      expect(store.isBulletRelevant('education', 0, 0)).toBe(true)
    })

    it('returns true for empty bullet indices in filter', () => {
      store.applyTailorFilter(createMockTailorResponse({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [] }],
        },
      }))
      expect(store.isBulletRelevant('experience', 0, 0)).toBe(false)
    })
  })

  describe('isSkillRelevant', () => {
    it('returns true when filter is not active', () => {
      expect(store.isSkillRelevant('hard_skills', 'React')).toBe(true)
      expect(store.isSkillRelevant('soft_skills', 'Communication')).toBe(true)
    })

    it('matches hard skills case-insensitively', () => {
      store.applyTailorFilter(createMockTailorResponse())
      expect(store.isSkillRelevant('hard_skills', 'React')).toBe(true)
      expect(store.isSkillRelevant('hard_skills', 'REACT')).toBe(true)
      expect(store.isSkillRelevant('hard_skills', 'react')).toBe(true)
    })

    it('returns false for non-matching hard skill', () => {
      store.applyTailorFilter(createMockTailorResponse())
      expect(store.isSkillRelevant('hard_skills', 'Python')).toBe(false)
    })

    it('matches soft skills case-insensitively', () => {
      store.applyTailorFilter(createMockTailorResponse())
      expect(store.isSkillRelevant('soft_skills', 'Team Leadership')).toBe(true)
      expect(store.isSkillRelevant('soft_skills', 'team leadership')).toBe(true)
    })

    it('returns false for non-matching soft skill', () => {
      store.applyTailorFilter(createMockTailorResponse())
      expect(store.isSkillRelevant('soft_skills', 'Communication')).toBe(false)
    })

    it('returns true for non-skill sections', () => {
      store.applyTailorFilter(createMockTailorResponse())
      expect(store.isSkillRelevant('experience', 'anything')).toBe(true)
    })

    it('trims whitespace from skill names', () => {
      store.applyTailorFilter(createMockTailorResponse())
      expect(store.isSkillRelevant('hard_skills', '  React  ')).toBe(true)
    })
  })

  describe('getFilteredBulletCount', () => {
    it('returns total count when filter is not active', () => {
      store.initializeDefaults()
      const count = store.getFilteredBulletCount('experience')
      expect(count.visible).toBe(count.total)
      expect(count.total).toBe(0) // No entries by default
    })

    it('returns only filtered bullet count when filter is active', () => {
      store.applyTailorFilter(createMockTailorResponse())
      // With no entries, visible and total are both 0
      const count = store.getFilteredBulletCount('experience')
      expect(count.total).toBe(0)
      expect(count.visible).toBe(0)
    })

    it('returns correct counts when entries exist', () => {
      store.initializeDefaults()
      // Add an experience entry with 3 bullets
      const expSection = store.sections.find((s) => s.sectionType === 'experience')
      if (expSection) {
        const entryId = crypto.randomUUID()
        expSection.entries.push({
          id: entryId,
          order: 0,
          parentId: null,
          locked: false,
          fields: [],
        })
        // Add 3 bullet children
        for (let i = 0; i < 3; i++) {
          expSection.entries.push({
            id: crypto.randomUUID(),
            order: i,
            parentId: entryId,
            locked: false,
            fields: [{ key: 'text', value: `Bullet ${i}`, order: 0 }],
          })
        }
      }

      // Apply filter that only includes bullets 0 and 2
      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0, 2] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      const count = store.getFilteredBulletCount('experience')
      expect(count.total).toBe(3)
      expect(count.visible).toBe(2)
    })
  })
})
