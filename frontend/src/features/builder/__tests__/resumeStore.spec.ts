import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useResumeStore } from '@/features/builder/stores/resume'
import { SECTION_TYPES, type SectionType } from '@/features/builder/types/resume'

describe('useResumeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('initializeDefaults', () => {
    it('sets id, layout, name, and all 10 sections with defaults', () => {
      const store = useResumeStore()
      store.initializeDefaults()

      expect(store.id).toBeTruthy()
      expect(typeof store.id).toBe('string')
      expect(store.layout).toBe('standard')
      expect(store.name).toBe('')
      expect(store.sections).toHaveLength(10)

      // All 10 section types present
      const types = store.sections.map((s) => s.sectionType).sort()
      expect(types).toEqual([...SECTION_TYPES].sort())

      // Defaults: right column, order matches index
      for (let i = 0; i < store.sections.length; i++) {
        const s = store.sections[i]!
        expect(s.column).toBe('right')
        expect(s.order).toBe(i)
        expect(s.entries).toEqual([])
      }
    })

    it('generates unique IDs across calls', () => {
      const store1 = useResumeStore()
      store1.initializeDefaults()
      setActivePinia(createPinia())
      const store2 = useResumeStore()
      store2.initializeDefaults()

      expect(store1.id).not.toBe(store2.id)
    })
  })

  describe('setLayout', () => {
    it('changes layout', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.setLayout('column2-1')
      expect(store.layout).toBe('column2-1')
    })

    it('resets all sections to right column when switching to standard', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.setLayout('column2-1')
      store.setSectionColumn('experience', 'left')
      store.setSectionColumn('education', 'left')

      store.setLayout('standard')

      for (const section of store.sections) {
        expect(section.column).toBe('right')
      }
    })
  })

  describe('toggleSection', () => {
    it('removes an enabled section when toggled off', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      expect(store.isSectionEnabled('name_contact')).toBe(true)

      store.toggleSection('name_contact')
      expect(store.isSectionEnabled('name_contact')).toBe(false)
      expect(store.sections).toHaveLength(9)
    })

    it('adds a disabled section back with defaults when toggled on', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.toggleSection('name_contact') // remove

      store.toggleSection('name_contact') // add back

      expect(store.isSectionEnabled('name_contact')).toBe(true)
      expect(store.sections).toHaveLength(10)
      const added = store.sections.find((s) => s.sectionType === 'name_contact')
      expect(added).toBeDefined()
      expect(added!.column).toBe('right')
      expect(added!.entries).toEqual([])
    })

    it('adds unknown section type as a new section', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.toggleSection('unknown' as SectionType)
      // Unknown types get added (the toggle is remove-if-exists, add-if-not)
      expect(store.sections).toHaveLength(11)
    })
  })

  describe('setSectionColumn', () => {
    it('changes column assignment for an enabled section', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.setLayout('column2-1')

      store.setSectionColumn('name_contact', 'left')
      const contact = store.sections.find((s) => s.sectionType === 'name_contact')
      expect(contact!.column).toBe('left')
    })

    it('does nothing for unknown section', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.setSectionColumn('unknown' as SectionType, 'left')
      // No error thrown, state unchanged
      expect(store.sections).toHaveLength(10)
    })
  })

  describe('reorderSections', () => {
    it('reorders enabled sections to match provided order', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      // Disable some
      store.toggleSection('name_contact')
      store.toggleSection('hobbies')

      const newOrder: SectionType[] = ['experience', 'education', 'hard_skills', 'summary', 'projects', 'certifications', 'languages', 'soft_skills']
      store.reorderSections(newOrder)

      const ordered = store.sections.map((s) => s.sectionType)
      expect(ordered).toEqual(newOrder)

      // Orders updated
      for (let i = 0; i < store.sections.length; i++) {
        expect(store.sections[i]!.order).toBe(i)
      }
    })

    it('drops sections not in the new order list', () => {
      const store = useResumeStore()
      store.initializeDefaults()

      store.reorderSections(['hard_skills', 'projects'])

      expect(store.sections).toHaveLength(2)
      expect(store.sections[0]!.sectionType).toBe('hard_skills')
      expect(store.sections[1]!.sectionType).toBe('projects')
    })
  })

  describe('computed properties', () => {
    it('enabledSections returns section types of all active sections', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.toggleSection('hobbies')

      expect(store.enabledSections).toHaveLength(9)
      expect(store.enabledSections).not.toContain('hobbies' as SectionType)
    })

    it('leftColumnSections / rightColumnSections filter by column', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.setLayout('column2-1')
      store.setSectionColumn('name_contact', 'left')
      store.setSectionColumn('summary', 'left')

      expect(store.leftColumnSections).toHaveLength(2)
      expect(store.leftColumnSections.map((s) => s.sectionType)).toEqual(['name_contact', 'summary'])
      expect(store.rightColumnSections).toHaveLength(8)
      expect(store.rightColumnSections[0]!.sectionType).toBe('experience')
    })
  })

  describe('loadFromPayload / toPayload round-trip', () => {
    it('round-trips a complete payload', () => {
      const store = useResumeStore()

      const payload = {
        layout: 'column2-1' as const,
        name: 'My Resume',
        sections: [
          {
            sectionId: 'name_contact',
            column: 'left' as const,
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [
                  { key: 'fullName', value: 'John', order: 0 },
                  { key: 'email', value: 'john@example.com', order: 1 },
                ],
              },
            ],
          },
          {
            sectionId: 'experience',
            column: 'right' as const,
            order: 1,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [
                  { key: 'company', value: 'Acme', order: 0 },
                ],
              },
              {
                order: 1,
                parentId: null,
                fields: [
                  { key: 'company', value: 'Beta', order: 0 },
                ],
              },
            ],
          },
        ],
      }

      store.loadFromPayload(payload)
      expect(store.layout).toBe('column2-1')
      expect(store.name).toBe('My Resume')
      expect(store.sections).toHaveLength(2)

      const contactSection = store.sections.find((s) => s.sectionType === 'name_contact')
      expect(contactSection).toBeDefined()
      expect(contactSection!.column).toBe('left')
      expect(contactSection!.entries).toHaveLength(1)
      expect(contactSection!.entries[0]!.fields).toHaveLength(2)
      expect(contactSection!.entries[0]!.fields[0]!.value).toBe('John')

      const experienceSection = store.sections.find((s) => s.sectionType === 'experience')
      expect(experienceSection).toBeDefined()
      expect(experienceSection!.entries).toHaveLength(2)

      // Round-trip
      const output = store.toPayload()
      expect(output.layout).toBe('column2-1')
      expect(output.name).toBe('My Resume')
      expect(output.sections).toHaveLength(2)
      expect(output.sections[0]!.sectionId).toBe('name_contact')
      expect(output.sections[0]!.entries[0]!.fields[0]!.value).toBe('John')
      expect(output.sections[1]!.sectionId).toBe('experience')
    })
  })

  describe('toPayload', () => {
    it('produces empty payload for empty store', () => {
      const store = useResumeStore()
      const payload = store.toPayload()
      expect(payload.layout).toBe('standard')
      expect(payload.name).toBe('')
      expect(payload.sections).toEqual([])
    })

    it('excludes fields not in sections', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.toggleSection('name_contact')
      store.toggleSection('hobbies')

      const payload = store.toPayload()
      expect(payload.sections).toHaveLength(8)
      expect(payload.sections.map((s) => s.sectionId)).not.toContain('name_contact')
      expect(payload.sections.map((s) => s.sectionId)).not.toContain('hobbies')
    })
  })
})
