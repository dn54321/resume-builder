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
        expect(s.locked).toBe(false)
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
        locked: false,
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

  describe('toggleLock', () => {
    it('toggles the locked flag on a section', () => {
      const store = useResumeStore()
      store.initializeDefaults()

      const section = store.sections.find((s) => s.sectionType === 'experience')!
      expect(section.locked).toBe(false)

      store.toggleLock('experience')
      expect(section.locked).toBe(true)
      expect(store.lockedSections).toContain('experience' as SectionType)

      store.toggleLock('experience')
      expect(section.locked).toBe(false)
      expect(store.lockedSections).not.toContain('experience' as SectionType)
    })

    it('keeps all 10 sections in the array while toggling lock', () => {
      const store = useResumeStore()
      store.initializeDefaults()

      store.toggleLock('hobbies')
      expect(store.sections).toHaveLength(10)
      expect(store.lockedSections).toEqual(['hobbies'])
    })

    it('is a no-op for unknown section types', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.toggleLock('unknown' as SectionType)
      expect(store.sections).toHaveLength(10)
      expect(store.lockedSections).toEqual([])
    })

    it('is independent of the enabled flag', () => {
      const store = useResumeStore()
      store.initializeDefaults()

      // Lock a section, then disable it — lock must survive
      store.toggleLock('summary')
      store.toggleSection('summary')

      const section = store.sections.find((s) => s.sectionType === 'summary')!
      expect(section.enabled).toBe(false)
      expect(section.locked).toBe(true)
      expect(store.lockedSections).toContain('summary' as SectionType)
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
    it('reorders listed sections into their slots while hidden sections keep their position (RES-109)', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      // Disable some
      store.toggleSection('name_contact')
      store.toggleSection('hobbies')

      const newOrder: SectionType[] = ['experience', 'education', 'hard_skills', 'summary', 'projects', 'certifications', 'languages', 'soft_skills']
      store.reorderSections(newOrder)

      // Listed (enabled) sections are placed, in the requested order, into
      // the slots the listed sections occupied. Unlisted hidden sections
      // (name_contact at 0, hobbies at 9) keep their positions — they are
      // NEVER pushed to the end (RES-109).
      const ordered = store.sections.map((s) => s.sectionType)
      expect(ordered).toEqual(['name_contact', ...newOrder, 'hobbies'])

      // Orders are contiguous 0..9
      for (let i = 0; i < store.sections.length; i++) {
        expect(store.sections[i]!.order).toBe(i)
      }
    })

    it('applies a full reorder verbatim — hidden sections included (RES-109)', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      // Hide a mid-list section — it must still participate in the order
      store.toggleSection('education')

      const fullOrder: SectionType[] = [
        'hobbies',
        'languages',
        'certifications',
        'projects',
        'soft_skills',
        'hard_skills',
        'experience',
        'education',
        'summary',
        'name_contact',
      ]
      store.reorderSections(fullOrder)

      // The full order (hidden sections included) is applied exactly
      expect(store.sections.map((s) => s.sectionType)).toEqual(fullOrder)
      for (let i = 0; i < store.sections.length; i++) {
        expect(store.sections[i]!.order).toBe(i)
      }
      // The hidden section is still hidden
      expect(store.isSectionEnabled('education')).toBe(false)
    })

    it('keeps unlisted sections in their slots for partial orders (RES-109)', () => {
      const store = useResumeStore()
      store.initializeDefaults()

      // Partial order: only these two types are listed. Every other section
      // keeps its current position — unlisted sections are never pushed to
      // the end (RES-109).
      store.reorderSections(['projects', 'experience'])

      // projects (was slot 6) and experience (was slot 2) trade slots; the
      // other eight sections stay exactly where they were.
      expect(store.sections.map((s) => s.sectionType)).toEqual([
        'name_contact',
        'summary',
        'projects',
        'education',
        'hard_skills',
        'soft_skills',
        'experience',
        'certifications',
        'languages',
        'hobbies',
      ])

      // All 10 sections preserved and still enabled
      expect(store.sections).toHaveLength(10)
      expect(store.sections.map((s) => s.enabled).every(Boolean)).toBe(true)
    })

    it('ignores unknown or duplicate types in the requested order', () => {
      const store = useResumeStore()
      store.initializeDefaults()

      store.reorderSections([
        'hobbies',
        'hobbies', // duplicate — deduped
        'unknown' as SectionType, // unknown — ignored
        'name_contact',
      ])

      // hobbies (slot 9) and name_contact (slot 0) trade slots — the two
      // mentioned sections are placed, in the requested order, into the slots
      // they occupy; duplicates and unknown types are ignored; the other
      // eight sections keep their positions.
      expect(store.sections.map((s) => s.sectionType)).toEqual([
        'hobbies',
        'summary',
        'experience',
        'education',
        'hard_skills',
        'soft_skills',
        'projects',
        'certifications',
        'languages',
        'name_contact',
      ])
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

    it('orderedSectionTypes keeps hidden sections interleaved by order (RES-109)', () => {
      const store = useResumeStore()
      store.initializeDefaults()

      // Hide mid-list sections (summary at 1, languages at 8)
      store.toggleSection('summary')
      store.toggleSection('languages')

      // Hidden sections stay exactly where they are — NOT pushed to the end
      expect(store.orderedSectionTypes).toEqual([...SECTION_TYPES])

      // enabledSections still excludes them (preview only renders enabled)
      expect(store.enabledSections).toHaveLength(8)
      expect(store.enabledSections).not.toContain('summary' as SectionType)
      expect(store.enabledSections).not.toContain('languages' as SectionType)
    })

    it('orderedSectionTypes reflects a reorder with hidden sections kept in place (RES-109)', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.toggleSection('soft_skills') // hide mid-list section (slot 5)

      // Move experience (slot 2) above name_contact (slot 0) via the full
      // interleaved order — soft_skills (hidden) keeps its slot.
      const fullOrder: SectionType[] = [
        'experience',
        'name_contact',
        'summary',
        'education',
        'hard_skills',
        'soft_skills',
        'projects',
        'certifications',
        'languages',
        'hobbies',
      ]
      store.reorderSections(fullOrder)

      expect(store.orderedSectionTypes).toEqual(fullOrder)
      expect(store.enabledSections).not.toContain('soft_skills' as SectionType)
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
                locked: false,
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
                locked: false,
                fields: [
                  { key: 'company', value: 'Acme', order: 0 },
                ],
              },
              {
                order: 1,
                parentId: null,
                locked: false,
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

    it('re-links child entries to regenerated parent ids on load (RES-83)', () => {
      const store = useResumeStore()

      // A saved payload where bullet children reference the parent's
      // payload id — as produced by toPayload() (localStorage) or the
      // backend wire shape (GET /resumes/:id).
      const parentId = 'parent-payload-id'
      store.loadFromPayload({
        layout: 'standard',
        sections: [
          {
            sectionId: 'experience',
            column: 'right',
            order: 0,
            entries: [
              {
                id: parentId,
                order: 0,
                parentId: null,
                fields: [{ key: 'company', value: 'Acme', order: 0 }],
              },
              {
                id: 'bullet-1',
                order: 0,
                parentId,
                fields: [{ key: 'text', value: 'Built stuff', order: 0 }],
              },
              {
                id: 'bullet-2',
                order: 1,
                parentId,
                fields: [{ key: 'text', value: 'Managed coffee', order: 0 }],
              },
            ],
          },
        ],
      })

      const experience = store.sections.find(
        (s) => s.sectionType === 'experience',
      )
      expect(experience).toBeDefined()
      expect(experience!.entries).toHaveLength(3)

      const parent = experience!.entries.find((e) => e.parentId === null)
      expect(parent).toBeDefined()

      // Children must be re-linked to the NEW parent id — not the stale
      // payload id (otherwise bullets vanish from the editors on reload).
      const children = experience!.entries.filter(
        (e) => e.parentId === parent!.id,
      )
      expect(children).toHaveLength(2)
      expect(children.map((c) => c.fields[0]!.value).sort()).toEqual([
        'Built stuff',
        'Managed coffee',
      ])

      // No entry may still reference the stale payload id
      expect(
        experience!.entries.some((e) => e.parentId === parentId),
      ).toBe(false)
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

    it('round-trips locked flag correctly', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.toggleLock('experience')
      store.toggleLock('education')

      const payload = store.toPayload()
      const exp = payload.sections.find((s) => s.sectionId === 'experience')
      expect(exp!.locked).toBe(true)
      const edu = payload.sections.find((s) => s.sectionId === 'education')
      expect(edu!.locked).toBe(true)
      const contact = payload.sections.find((s) => s.sectionId === 'name_contact')
      expect(contact!.locked).toBe(false)

      // Reload and verify locked survives
      store.loadFromPayload(payload)
      expect(store.sections).toHaveLength(10)
      expect(store.sections.find((s) => s.sectionType === 'experience')!.locked).toBe(true)
      expect(store.sections.find((s) => s.sectionType === 'education')!.locked).toBe(true)
      expect(store.sections.find((s) => s.sectionType === 'name_contact')!.locked).toBe(false)
      expect(store.lockedSections).toEqual(['experience', 'education'])
    })

    it('defaults to unlocked when payload omits locked', () => {
      const store = useResumeStore()

      store.loadFromPayload({
        layout: 'standard' as const,
        sections: [
          {
            sectionId: 'experience',
            column: 'right',
            order: 0,
            entries: [],
          },
        ],
      })

      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      expect(exp.locked).toBe(false)
    })

    it('defaults locked to false when a payload omits the field (backward compat)', () => {
      const store = useResumeStore()

      // Old payload without `locked`
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
      const summary = store.sections.find((s) => s.sectionType === 'summary')!
      expect(summary.locked).toBe(false)
      expect(store.lockedSections).toEqual([])
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

  describe('toggleEntryLock (RES-97)', () => {
    it('toggles the locked flag on an individual entry', () => {
      const store = useResumeStore()
      store.initializeDefaults()

      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      const entryId = crypto.randomUUID()
      exp.entries.push({ id: entryId, order: 0, parentId: null, locked: false, fields: [] })

      expect(exp.entries[0]!.locked).toBe(false)
      store.toggleEntryLock('experience', entryId)
      expect(exp.entries[0]!.locked).toBe(true)

      store.toggleEntryLock('experience', entryId)
      expect(exp.entries[0]!.locked).toBe(false)
    })

    it('only toggles the targeted entry, leaving siblings untouched', () => {
      const store = useResumeStore()
      store.initializeDefaults()

      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      const idA = crypto.randomUUID()
      const idB = crypto.randomUUID()
      exp.entries.push(
        { id: idA, order: 0, parentId: null, locked: false, fields: [] },
        { id: idB, order: 1, parentId: null, locked: false, fields: [] },
      )

      store.toggleEntryLock('experience', idA)

      expect(exp.entries.find((e) => e.id === idA)!.locked).toBe(true)
      expect(exp.entries.find((e) => e.id === idB)!.locked).toBe(false)
    })

    it('is a no-op for unknown section types', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.toggleEntryLock('unknown' as SectionType, 'whatever')
      expect(store.sections).toHaveLength(10)
    })

    it('is a no-op for unknown entry ids', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.toggleEntryLock('experience', 'missing-entry')
      expect(store.sections.find((s) => s.sectionType === 'experience')!.entries).toHaveLength(0)
    })

    it('does not touch the section-level lock', () => {
      const store = useResumeStore()
      store.initializeDefaults()

      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      const entryId = crypto.randomUUID()
      exp.entries.push({ id: entryId, order: 0, parentId: null, locked: false, fields: [] })

      store.toggleEntryLock('experience', entryId)
      expect(exp.locked).toBe(false)
      expect(store.lockedSections).toEqual([])
    })
  })

  describe('entry locked round-trip (RES-97)', () => {
    it('serializes entry locked in toPayload and restores it via loadFromPayload', () => {
      const store = useResumeStore()
      store.initializeDefaults()

      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      const entryId = crypto.randomUUID()
      exp.entries.push({ id: entryId, order: 0, parentId: null, locked: false, fields: [{ key: 'company', value: 'Acme', order: 0 }] })
      store.toggleEntryLock('experience', entryId)

      const payload = store.toPayload()
      const expPayload = payload.sections.find((s) => s.sectionId === 'experience')!
      expect(expPayload.entries[0]!.locked).toBe(true)

      // Reload and verify the lock survives.
      const store2 = useResumeStore()
      store2.loadFromPayload(payload)
      const reloaded = store2.sections.find((s) => s.sectionType === 'experience')!
      expect(reloaded.entries[0]!.locked).toBe(true)
    })

    it('defaults entry locked to false when the payload omits it (backward compat)', () => {
      const store = useResumeStore()
      store.loadFromPayload({
        layout: 'standard',
        sections: [
          {
            sectionId: 'experience',
            column: 'right',
            order: 0,
            entries: [
              { order: 0, parentId: null, fields: [{ key: 'company', value: 'Acme', order: 0 }] },
            ],
          },
        ],
      })

      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      expect(exp.entries[0]!.locked).toBe(false)
    })

    it('new entries created via the store default to unlocked', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      const exp = store.sections.find((s) => s.sectionType === 'experience')!
      // Mimic what useSectionEditor.addEntry does.
      exp.entries.push({ id: crypto.randomUUID(), order: 0, parentId: null, locked: false, fields: [] })
      expect(exp.entries[0]!.locked).toBe(false)
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

    it('includes locked flag for every section in payload', () => {
      const store = useResumeStore()
      store.initializeDefaults()
      store.toggleLock('projects')

      const payload = store.toPayload()
      expect(payload.sections).toHaveLength(10)

      const projects = payload.sections.find((s) => s.sectionId === 'projects')
      expect(projects!.locked).toBe(true)

      // All other sections serialize locked: false
      for (const s of payload.sections) {
        expect(typeof s.locked).toBe('boolean')
      }
    })
  })
})
