import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useResumeStore } from '@/features/builder/stores/resume'
import { SECTION_TYPES, type SectionType } from '@/features/builder/types/resume'

describe('useResumeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('initializeDefaults', () => {
    it('sets id, layout, name to empty, and all 10 sections with defaults', () => {
      const store = useResumeStore()
      store.initializeDefaults()

      expect(store.id).toBeTruthy()
      expect(typeof store.id).toBe('string')
      expect(store.name).toBe('')
      expect(store.layout).toBe('standard')
      expect(store.sections).toHaveLength(10)

      // All 10 section types present
      const types = store.sections.map((s) => s.sectionType).sort()
      expect(types).toEqual([...SECTION_TYPES].sort())

      // Defaults: right column, enabled: true, order matches index
      for (let i = 0; i < store.sections.length; i++) {
        const s = store.sections[i]!
        expect(s.column).toBe('right')
        expect(s.order).toBe(i)
        expect(s.enabled).toBe(true)
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
    it('soft-toggles a section off — keeps all sections, flips enabled flag', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      expect(store.isSectionEnabled('name_contact')).toBe(true)

      store.toggleSection('name_contact')
      expect(store.isSectionEnabled('name_contact')).toBe(false)
      // All 10 sections still in the array
      expect(store.sections).toHaveLength(10)
      const section = store.sections.find((s) => s.sectionType === 'name_contact')
      expect(section).toBeDefined()
      expect(section!.enabled).toBe(false)
    })

    it('soft-toggles a section back on — preserves entries', () => {
      const store = useResumeStore()
      store.initializeDefaults()

      // Add some data to name_contact before toggling
      const contact = store.sections.find((s) => s.sectionType === 'name_contact')!
      contact.entries = [{
        id: 'nc-1',
        order: 0,
        parentId: null,
        fields: [
          { key: 'fullName', value: 'Jane Doe', order: 0 },
          { key: 'email', value: 'jane@example.com', order: 1 },
        ],
      }]

      store.toggleSection('name_contact') // disable
      expect(store.isSectionEnabled('name_contact')).toBe(false)
      expect(contact.enabled).toBe(false)
      // Data is still there
      expect(contact.entries).toHaveLength(1)
      expect(contact.entries[0]!.fields[0]!.value).toBe('Jane Doe')

      store.toggleSection('name_contact') // re-enable
      expect(store.isSectionEnabled('name_contact')).toBe(true)
      expect(contact.enabled).toBe(true)
      // Data preserved
      expect(contact.entries).toHaveLength(1)
      expect(contact.entries[0]!.fields[0]!.value).toBe('Jane Doe')
      expect(store.sections).toHaveLength(10)
    })

    it('is a no-op for unknown section types (not in the array)', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.toggleSection('unknown' as SectionType)
      // No change — unknown types are not in the sections array
      expect(store.sections).toHaveLength(10)
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
    it('reorders enabled sections and appends disabled at end', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      // Disable some
      store.toggleSection('name_contact')
      store.toggleSection('hobbies')

      const newOrder: SectionType[] = ['experience', 'education', 'hard_skills', 'summary', 'projects', 'certifications', 'languages', 'soft_skills']
      store.reorderSections(newOrder)

      // Enabled sections in requested order, disabled at end
      const ordered = store.sections.map((s) => s.sectionType)
      expect(ordered).toEqual([...newOrder, 'name_contact', 'hobbies'])

      // Orders updated: enabled have orders 0..7, disabled have 8..9
      for (let i = 0; i < store.sections.length; i++) {
        expect(store.sections[i]!.order).toBe(i)
      }
    })

    it('places unordered enabled sections after reordered ones', () => {
      const store = useResumeStore()
      store.initializeDefaults()

      store.reorderSections(['hard_skills', 'projects'])

      // All 10 sections preserved; hard_skills and projects first, rest follow
      expect(store.sections).toHaveLength(10)
      expect(store.sections[0]!.sectionType).toBe('hard_skills')
      expect(store.sections[1]!.sectionType).toBe('projects')
      // Rest are still enabled and appended after the reordered ones
      expect(store.sections.map((s) => s.enabled).every(Boolean)).toBe(true)
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
                  { key: 'firstName', value: 'John', order: 0 },
                  { key: 'lastName', value: 'Doe', order: 1 },
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
      // All 10 sections are present — saved ones keep their data,
      // missing ones are added as disabled defaults
      expect(store.sections).toHaveLength(10)

      const contactSection = store.sections.find((s) => s.sectionType === 'name_contact')
      expect(contactSection).toBeDefined()
      expect(contactSection!.column).toBe('left')
      expect(contactSection!.enabled).toBe(true)
      expect(contactSection!.entries).toHaveLength(1)
      expect(contactSection!.entries[0]!.fields).toHaveLength(2)
      expect(contactSection!.entries[0]!.fields[0]!.value).toBe('John')

      const experienceSection = store.sections.find((s) => s.sectionType === 'experience')
      expect(experienceSection).toBeDefined()
      expect(experienceSection!.enabled).toBe(true)
      expect(experienceSection!.entries).toHaveLength(2)

      // New sections not in the payload are disabled
      const summarySection = store.sections.find((s) => s.sectionType === 'summary')
      expect(summarySection).toBeDefined()
      expect(summarySection!.enabled).toBe(false)
      expect(summarySection!.entries).toHaveLength(0)

      // Round-trip
      const output = store.toPayload()
      expect(output.layout).toBe('column2-1')
      expect(output.sections).toHaveLength(10)
    })

    it('round-trips enabled flag correctly', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.toggleSection('hobbies') // disable

      const payload = store.toPayload()
      const hobbies = payload.sections.find((s) => s.sectionId === 'hobbies')
      expect(hobbies!.enabled).toBe(false)
      const experience = payload.sections.find((s) => s.sectionId === 'experience')
      expect(experience!.enabled).toBe(true)

      // Reload and verify
      store.loadFromPayload(payload)
      expect(store.sections).toHaveLength(10)
      const reloadedHobby = store.sections.find((s) => s.sectionType === 'hobbies')
      expect(reloadedHobby!.enabled).toBe(false)
      expect(store.isSectionEnabled('hobbies')).toBe(false)
    })

    it('fills in missing sections as disabled and keeps saved ones', () => {
      const store = useResumeStore()

      // Payload without `enabled` field and with only 1 of 10 sections
      const oldPayload = {
        layout: 'standard' as const,
        sections: [
          {
            sectionId: 'summary',
            column: 'right' as const,
            order: 0,
            entries: [{ order: 0, parentId: null, fields: [{ key: 'text', value: 'Hello', order: 0 }] }],
          },
        ],
      }

      store.loadFromPayload(oldPayload)
      // All 10 sections are present
      expect(store.sections).toHaveLength(10)

      // Saved section defaults enabled to true for backward compat
      const summary = store.sections.find((s) => s.sectionType === 'summary')
      expect(summary!.enabled).toBe(true)
      expect(store.isSectionEnabled('summary')).toBe(true)

      // Missing sections are disabled by default
      const experience = store.sections.find((s) => s.sectionType === 'experience')
      expect(experience!.enabled).toBe(false)
      expect(experience!.entries).toHaveLength(0)

      // Disabled sections can be toggled on
      store.toggleSection('experience')
      expect(experience!.enabled).toBe(true)
      expect(store.isSectionEnabled('experience')).toBe(true)
    })

    it('round-trips name field in payload', () => {
      const store = useResumeStore()

      const payload = {
        name: 'My Awesome Resume',
        layout: 'standard' as const,
        sections: [
          {
            sectionId: 'summary',
            column: 'right' as const,
            order: 0,
            entries: [{ order: 0, parentId: null, fields: [{ key: 'text', value: 'Hello', order: 0 }] }],
          },
        ],
      }

      store.loadFromPayload(payload)
      expect(store.name).toBe('My Awesome Resume')

      const output = store.toPayload()
      expect(output.name).toBe('My Awesome Resume')
    })

    it('handles null name in payload by defaulting to empty string', () => {
      const store = useResumeStore()

      const payload = {
        name: null,
        layout: 'standard' as const,
        sections: [
          {
            sectionId: 'summary',
            column: 'right' as const,
            order: 0,
            entries: [{ order: 0, parentId: null, fields: [{ key: 'text', value: 'Hello', order: 0 }] }],
          },
        ],
      }

      store.loadFromPayload(payload)
      expect(store.name).toBe('')
    })

    it('handles missing name field in payload (backward compat)', () => {
      const store = useResumeStore()

      // Old payload without name field
      const payload = {
        layout: 'standard' as const,
        sections: [
          {
            sectionId: 'summary',
            column: 'right' as const,
            order: 0,
            entries: [{ order: 0, parentId: null, fields: [{ key: 'text', value: 'Hello', order: 0 }] }],
          },
        ],
      }

      store.loadFromPayload(payload)
      expect(store.name).toBe('')

      const output = store.toPayload()
      // Empty name → null in payload (since '' || null = null)
      expect(output.name).toBeNull()
    })

    it('serializes empty name as null in toPayload', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.name = ''

      const payload = store.toPayload()
      expect(payload.name).toBeNull()
    })
  })

  describe('toPayload', () => {
    it('produces empty payload for empty store', () => {
      const store = useResumeStore()
      const payload = store.toPayload()
      expect(payload.layout).toBe('standard')
      expect(payload.sections).toEqual([])
    })

    it('includes all sections with enabled flag in payload', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.toggleSection('name_contact')
      store.toggleSection('hobbies')

      const payload = store.toPayload()
      // All 10 sections are serialized (soft-toggle keeps them)
      expect(payload.sections).toHaveLength(10)

      // Disabled sections have enabled: false
      const nc = payload.sections.find((s) => s.sectionId === 'name_contact')
      expect(nc).toBeDefined()
      expect(nc!.enabled).toBe(false)

      const h = payload.sections.find((s) => s.sectionId === 'hobbies')
      expect(h).toBeDefined()
      expect(h!.enabled).toBe(false)

      // Enabled sections have enabled: true
      const exp = payload.sections.find((s) => s.sectionId === 'experience')
      expect(exp).toBeDefined()
      expect(exp!.enabled).toBe(true)
    })
  })
})
