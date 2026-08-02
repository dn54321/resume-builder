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
          fields: [],
        })
        // Add 3 bullet children
        for (let i = 0; i < 3; i++) {
          expSection.entries.push({
            id: crypto.randomUUID(),
            order: i,
            parentId: entryId,
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
