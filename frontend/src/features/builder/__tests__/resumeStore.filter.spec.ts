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

  describe('section-level lock is obsolete for Tailor (RES-108)', () => {
    it('records filter indices even for a section flagged locked at section level', () => {
      store.initializeDefaults()
      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      exp.locked = true

      store.applyTailorFilter(createMockTailorResponse())

      // RES-108: Tailor operates at sub-item level only — a legacy
      // section-level lock no longer shields the section's bullets.
      expect(store.filteredBulletIndices['experience']).toHaveLength(2)
      expect(store.filteredBulletIndices['projects']).toHaveLength(1)
    })

    it('records filtered skills even for a locked skill section', () => {
      store.initializeDefaults()
      const hard = store.sections.find((s) => s.sectionType === 'hard_skills')!
      hard.locked = true

      store.applyTailorFilter(createMockTailorResponse())

      expect(store.filteredHardSkills).toEqual(['react', 'typescript'])
    })

    it('filters bullets inside a section flagged locked at section level', () => {
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

      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      // Sub-item/bullet locks (RES-97/RES-106) still protect content; a
      // section-level lock does not.
      const count = store.getFilteredBulletCount('experience')
      expect(count.total).toBe(3)
      expect(count.visible).toBe(1)
      expect(store.isBulletRelevant('experience', 0, 1)).toBe(false)
    })

    it('resetTailorFilter leaves the inert section-level locked flag untouched', () => {
      store.initializeDefaults()
      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      exp.locked = true

      store.applyTailorFilter(createMockTailorResponse())
      store.resetTailorFilter()

      // The field is inert data (kept for saved-resume compat) — reset only
      // clears filter state.
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

  // ─── RES-108: Tailor never toggles whole sections ─────────────────
  //
  // Tailor operates at sub-item/bullet level ONLY. It never sets
  // `section.enabled` — the section eye toggle is exclusively the user's
  // choice. Sections whose content is entirely non-relevant keep their eye
  // state; their bullets are hidden instead. Reset Filter clears the
  // sub-item filter state, which restores bullet visibility; section eyes
  // are never touched and need no restoring.
  describe('section eye is never toggled by Tailor (RES-108)', () => {
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

    it('never hides a section whose content is entirely non-relevant — hides its bullets instead', () => {
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

      // The section stays visible (user-only eye choice)...
      expect(exp.enabled).toBe(true)
      // ...but every non-relevant bullet is hidden.
      expect(store.isBulletRelevant('experience', 0, 0)).toBe(false)
      expect(store.isBulletRelevant('experience', 0, 1)).toBe(false)
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
      expect(store.isBulletRelevant('experience', 0, 0)).toBe(true)
      expect(store.isBulletRelevant('experience', 0, 1)).toBe(false)
    })

    it('never flips a skill section eye — non-matching skills are hidden instead', () => {
      store.initializeDefaults()
      addSkillsToSection('hard_skills', ['react', 'python'])
      const hard = store.sections.find((s) => s.sectionType === 'hard_skills')!

      store.applyTailorFilter({
        filteredBulletIndices: {},
        filteredHardSkills: ['react'],
        filteredSoftSkills: [],
      })

      // Eye untouched even though only one of two skills survived...
      expect(hard.enabled).toBe(true)
      expect(store.isSkillRelevant('hard_skills', 'react')).toBe(true)
      expect(store.isSkillRelevant('hard_skills', 'python')).toBe(false)
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

    it('never toggles the eye of a section flagged locked at section level either', () => {
      store.initializeDefaults()
      addBulletsToSection('experience', 2)
      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      exp.locked = true

      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      // No section ever gets its eye toggled by Tailor (RES-108).
      expect(exp.enabled).toBe(true)
    })

    it('user section eye choices survive a Tailor run untouched', () => {
      store.initializeDefaults()
      addBulletsToSection('experience', 2)
      addSkillsToSection('hard_skills', ['python'])
      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      const hard = store.sections.find((s) => s.sectionType === 'hard_skills')!

      // User's choices: experience hidden, hard skills shown
      exp.enabled = false
      hard.enabled = true

      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      // Tailor never re-enables a hidden section or hides a shown one.
      expect(exp.enabled).toBe(false)
      expect(hard.enabled).toBe(true)
    })

    it('resetTailorFilter leaves eye states untouched and restores bullet visibility', () => {
      store.initializeDefaults()
      addBulletsToSection('experience', 2)
      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      exp.enabled = false

      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      // Sub-items filtered; eye stays exactly as the user left it.
      expect(store.isBulletRelevant('experience', 0, 1)).toBe(false)
      expect(exp.enabled).toBe(false)

      store.resetTailorFilter()

      // Reset restores sub-item visibility; the eye is untouched throughout.
      expect(store.isBulletRelevant('experience', 0, 1)).toBe(true)
      expect(exp.enabled).toBe(false)
    })

    it('a second tailor run never touches the section eye', () => {
      store.initializeDefaults()
      addBulletsToSection('experience', 2)
      const exp = store.sections.find((s) => s.sectionType === 'experience')!

      // First run: nothing survives → all bullets hidden, eye stays on
      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })
      expect(exp.enabled).toBe(true)
      expect(store.isBulletRelevant('experience', 0, 0)).toBe(false)

      // Second run with a new JD: a bullet now survives
      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })
      expect(store.isBulletRelevant('experience', 0, 0)).toBe(true)
      expect(exp.enabled).toBe(true)
    })

    it('serializes live eye states unchanged while filtered', () => {
      store.initializeDefaults()
      addBulletsToSection('experience', 2)
      addSkillsToSection('hard_skills', ['python'])
      const hard = store.sections.find((s) => s.sectionType === 'hard_skills')!
      hard.enabled = false

      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      // Tailor never flips eyes, so the payload always carries the live
      // (user-chosen) enabled flags — no ephemeral-state juggling needed.
      const payload = store.toPayload()
      const hardPayload = payload.sections.find((s) => s.sectionId === 'hard_skills')!
      expect(hardPayload.enabled).toBe(false)
      const expPayload = payload.sections.find((s) => s.sectionId === 'experience')!
      expect(expPayload.enabled).toBe(true)
    })

    it('serializes a manual eye toggle made during a filter session', () => {
      store.initializeDefaults()
      addBulletsToSection('experience', 2)
      const exp = store.sections.find((s) => s.sectionType === 'experience')!

      store.applyTailorFilter({
        filteredBulletIndices: {
          experience: [{ entryOrder: 0, bulletIndices: [0] }],
        },
        filteredHardSkills: [],
        filteredSoftSkills: [],
      })

      // The user manually hides the section mid-session — their choice is
      // the persistent value (no tailor snapshot to overwrite).
      store.toggleSection('experience')
      expect(exp.enabled).toBe(false)

      const payload = store.toPayload()
      const expPayload = payload.sections.find((s) => s.sectionId === 'experience')!
      expect(expPayload.enabled).toBe(false)

      // Reset restores bullet visibility but never re-enables the section.
      store.resetTailorFilter()
      expect(store.isBulletRelevant('experience', 0, 1)).toBe(true)
      expect(exp.enabled).toBe(false)
    })
  })
})
