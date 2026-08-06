import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useResumeStore } from '@/features/builder/stores/resume'
import type { TailorResponse } from '@/features/builder/models/tailor-response.model'
import type { SectionType } from '@/features/builder/types/resume'

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

  // ─── RES-98: eye-toggle feedback after tailoring ──────────────────
  //
  // Tailoring flips the section eye toggles (the `enabled` flag) to mirror
  // the matching result: sections with relevant content stay/ become
  // visible, sections whose content is entirely non-relevant get hidden.
  // Reset Filter restores the pre-tailor visibility. Locked sections are
  // never toggled (RES-92).
  describe('eye-toggle feedback (RES-98)', () => {
    /**
     * Add a top-level entry with N child bullets to a section.
     * @param sectionType
     * @param bulletCount
     */
    function addBulletsToSection(sectionType: SectionType, bulletCount: number) {
      const section = store.sections.find((s) => s.sectionType === sectionType)!
      const entryId = crypto.randomUUID()
      section.entries.push({ id: entryId, order: 0, parentId: null, locked: false, fields: [] })
      for (let i = 0; i < bulletCount; i++) {
        section.entries.push({
          id: crypto.randomUUID(),
          order: i,
          parentId: entryId,
          locked: false,
          fields: [{ key: 'text', value: `Bullet ${i}`, order: 0 }],
        })
      }
    }

    /**
     * Add skill entries (name fields) to a section.
     * @param sectionType
     * @param names
     */
    function addSkillsToSection(sectionType: SectionType, names: string[]) {
      const section = store.sections.find((s) => s.sectionType === sectionType)!
      names.forEach((name, i) => {
        section.entries.push({
          id: crypto.randomUUID(),
          order: i,
          parentId: null,
          locked: false,
          fields: [{ key: 'name', value: name, order: 0 }],
        })
      })
    }

    it('hides a bullet section whose content is entirely non-relevant', () => {
      store.initializeDefaults()
      addBulletsToSection('experience', 2)

      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      expect(exp.enabled).toBe(false)
    })

    it('keeps a bullet section visible when at least one bullet is relevant', () => {
      store.initializeDefaults()
      addBulletsToSection('experience', 2)

      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      expect(exp.enabled).toBe(true)
    })

    it('shows a skill section when at least one skill is relevant', () => {
      store.initializeDefaults()
      addSkillsToSection('hard_skills', ['react', 'python'])

      store.applyTailorFilter({
        filteredBulletIndices: {},
        filteredHardSkills: ['react'],
        filteredSoftSkills: [],
      })

      const hard = store.sections.find((s) => s.sectionType === 'hard_skills')!
      expect(hard.enabled).toBe(true)
    })

    it('hides a skill section when no skills are relevant', () => {
      store.initializeDefaults()
      addSkillsToSection('hard_skills', ['python', 'java'])

      store.applyTailorFilter({
        filteredBulletIndices: {},
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      const hard = store.sections.find((s) => s.sectionType === 'hard_skills')!
      expect(hard.enabled).toBe(false)
    })

    it('leaves empty sections untouched', () => {
      store.initializeDefaults()
      const education = store.sections.find((s) => s.sectionType === 'education')!
      education.enabled = false

      // Filter carries no info about education (no content)
      store.applyTailorFilter(createMockTailorResponse())

      // Disabled stays disabled, enabled empty sections stay enabled
      expect(education.enabled).toBe(false)
      const hobbies = store.sections.find((s) => s.sectionType === 'hobbies')!
      expect(hobbies.enabled).toBe(true)
    })

    it('leaves sections without bullet content untouched even when filtered', () => {
      store.initializeDefaults()
      // Summary has a text field but no parented bullets — no index info
      const summary = store.sections.find((s) => s.sectionType === 'summary')!
      summary.entries.push({
        id: crypto.randomUUID(),
        order: 0,
        parentId: null,
        locked: false,
        fields: [{ key: 'text', value: 'A summary', order: 0 }],
      })
      summary.enabled = false

      store.applyTailorFilter(createMockTailorResponse())

      expect(summary.enabled).toBe(false)
    })

    it('never toggles locked sections', () => {
      store.initializeDefaults()
      addBulletsToSection('experience', 2)
      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      exp.locked = true

      // Even though the filter says nothing survives, the locked section
      // keeps its eye state (RES-92).
      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      expect(exp.enabled).toBe(true)
    })

    it('re-enables a relevant section the user had disabled', () => {
      store.initializeDefaults()
      addBulletsToSection('experience', 1)
      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      exp.enabled = false

      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      // Relevant content → eye flips on, even though the user had it off.
      expect(exp.enabled).toBe(true)
    })

    it('resetTailorFilter restores the pre-tailor eye states', () => {
      store.initializeDefaults()
      addBulletsToSection('experience', 2)
      addSkillsToSection('hard_skills', ['python'])
      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      const hard = store.sections.find((s) => s.sectionType === 'hard_skills')!

      // User's pre-tailor choices: experience hidden, hard skills shown
      exp.enabled = false
      hard.enabled = true

      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      // After tailoring: experience relevant → on; hard skills irrelevant → off
      expect(exp.enabled).toBe(true)
      expect(hard.enabled).toBe(false)

      store.resetTailorFilter()

      // Reset restores the ORIGINAL visibility
      expect(exp.enabled).toBe(false)
      expect(hard.enabled).toBe(true)
    })

    it('a second tailor run does not overwrite the original snapshot', () => {
      store.initializeDefaults()
      addBulletsToSection('experience', 2)
      const exp = store.sections.find((s) => s.sectionType === 'experience')!

      // First run: nothing survives → experience hidden
      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })
      expect(exp.enabled).toBe(false)

      // Second run with a new JD: a bullet now survives → experience shown
      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })
      expect(exp.enabled).toBe(true)

      // Reset still restores the state before ANY tailoring of the session
      store.resetTailorFilter()
      expect(exp.enabled).toBe(true)
    })

    it('resetTailorFilter does not unlock sections', () => {
      store.initializeDefaults()
      addBulletsToSection('experience', 1)
      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      exp.locked = true

      store.applyTailorFilter(createMockTailorResponse())
      store.resetTailorFilter()

      expect(exp.locked).toBe(true)
    })

    it('does not serialize tailor-flipped eye states while filtered (ephemeral)', () => {
      store.initializeDefaults()
      addBulletsToSection('experience', 2)
      addSkillsToSection('hard_skills', ['python'])
      const hard = store.sections.find((s) => s.sectionType === 'hard_skills')!

      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      // Live state shows the tailored flips (hard skills eye off)...
      expect(hard.enabled).toBe(false)

      // ...but the payload still carries the user's pre-tailor choice
      // (all sections enabled by default), so save/reload never persists
      // hidden sections with no Reset path.
      const payload = store.toPayload()
      const hardPayload = payload.sections.find((s) => s.sectionId === 'hard_skills')!
      expect(hardPayload.enabled).toBe(true)
    })

    it('serializes a manual eye toggle made during a filter session', () => {
      store.initializeDefaults()
      addBulletsToSection('experience', 2)
      const exp = store.sections.find((s) => s.sectionType === 'experience')!

      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      // Tailor hides experience; the user manually re-enables it (eye on)
      expect(exp.enabled).toBe(false)
      store.toggleSection('experience')
      expect(exp.enabled).toBe(true)

      // The manual choice is the new persistent value
      const payload = store.toPayload()
      const expPayload = payload.sections.find((s) => s.sectionId === 'experience')!
      expect(expPayload.enabled).toBe(true)

      // Reset still restores to the snapshot the user overwrote (true)
      store.resetTailorFilter()
      expect(exp.enabled).toBe(true)
    })

    it('serializes live eye states again after reset', () => {
      store.initializeDefaults()
      addBulletsToSection('experience', 1)

      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })
      store.resetTailorFilter()

      // After reset the payload reflects the live (restored) state
      const payload = store.toPayload()
      const expPayload = payload.sections.find((s) => s.sectionId === 'experience')!
      expect(expPayload.enabled).toBe(true)
    })
  })
})
