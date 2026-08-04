import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useResumeStore } from '@/features/builder/stores/resume'
import ExperienceEditor from '@/features/builder/components/editors/ExperienceEditor.vue'

/**
 * Helper: expand all collapsed entry panels by clicking their headers.
 * EntryList starts entries collapsed; we need to expand them to access fields.
 * @param {ReturnType<typeof mount>} wrapper - The mounted component wrapper.
 */
async function expandAllEntries(wrapper: ReturnType<typeof mount>): Promise<void> {
  const headers = wrapper.findAll('.bg-muted\\/20')
  for (const header of headers) {
    await header.trigger('click')
  }
  await flushPromises()
}

describe('ExperienceEditor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useResumeStore()
    store.initializeDefaults()
  })

  it('renders the heading and add button', () => {
    const wrapper = mount(ExperienceEditor)

    expect(wrapper.text()).toContain('Experience')
    expect(wrapper.text()).toContain('Add Job')
  })

  it('adds a job entry with default empty fields and auto-expands it', async () => {
    const wrapper = mount(ExperienceEditor)

    const addButton = wrapper.find('button')
    await addButton.trigger('click')
    await flushPromises()

    const store = useResumeStore()
    const section = store.sections.find((s) => s.sectionType === 'experience')
    expect(section).toBeDefined()
    expect(section!.entries.filter((e) => !e.parentId)).toHaveLength(1)

    const entry = section!.entries[0]!
    // Should have all 6 fields
    const fieldKeys = entry.fields.map((f) => f.key)
    expect(fieldKeys).toContain('company')
    expect(fieldKeys).toContain('title')
    expect(fieldKeys).toContain('startDate')
    expect(fieldKeys).toContain('endDate')
    expect(fieldKeys).toContain('location')
    expect(fieldKeys).toContain('isCurrent')
    // All values should be empty strings
    for (const f of entry.fields) {
      expect(f.value).toBe('')
    }

    // The entry should be auto-expanded (EntryList watches entry length)
    const entryPanel = wrapper.find('[data-entry-panel]')
    expect(entryPanel.exists()).toBe(true)
    // Fields should be rendered (we can find inputs)
    const textInputs = wrapper.findAll('input[type="text"]')
    expect(textInputs.length).toBeGreaterThanOrEqual(3) // company, title, location
  })

  it('displays the entry title as "(New Position)" when company is empty', async () => {
    const wrapper = mount(ExperienceEditor)

    const addButton = wrapper.find('button')
    await addButton.trigger('click')
    await flushPromises()

    // Entry title should show "(New Position)" when company is empty
    const entryTitle = wrapper.find('[data-entry-panel] .font-medium')
    expect(entryTitle.text()).toBe('(New Position)')
  })

  it('displays entry title as "title at company" when both are set', async () => {
    const store = useResumeStore()
    const section = store.sections.find((s) => s.sectionType === 'experience')!
    section.entries = [{
      id: 'exp-1',
      order: 0,
      parentId: null,
      fields: [
        { key: 'company', value: 'Acme Corp', order: 0 },
        { key: 'title', value: 'Senior Engineer', order: 1 },
        { key: 'startDate', value: '', order: 2 },
        { key: 'endDate', value: '', order: 3 },
        { key: 'location', value: '', order: 4 },
        { key: 'isCurrent', value: '', order: 5 },
      ],
    }]

    const wrapper = mount(ExperienceEditor)
    await flushPromises()

    const entryTitle = wrapper.find('[data-entry-panel] .font-medium')
    expect(entryTitle.text()).toBe('Senior Engineer at Acme Corp')
  })

  it('updates company field value on input', async () => {
    const store = useResumeStore()
    const section = store.sections.find((s) => s.sectionType === 'experience')!
    section.entries = [{
      id: 'exp-1',
      order: 0,
      parentId: null,
      fields: [
        { key: 'company', value: '', order: 0 },
        { key: 'title', value: '', order: 1 },
        { key: 'startDate', value: '', order: 2 },
        { key: 'endDate', value: '', order: 3 },
        { key: 'location', value: '', order: 4 },
        { key: 'isCurrent', value: '', order: 5 },
      ],
    }]

    const wrapper = mount(ExperienceEditor)
    await expandAllEntries(wrapper)

    // Find the company input (first text input)
    const textInputs = wrapper.findAll('input[type="text"]')
    const companyInput = textInputs[0]!
    await companyInput.setValue('Google')

    const companyField = section.entries[0]!.fields.find((f) => f.key === 'company')
    expect(companyField?.value).toBe('Google')
  })

  it('updates title field value on input', async () => {
    const store = useResumeStore()
    const section = store.sections.find((s) => s.sectionType === 'experience')!
    section.entries = [{
      id: 'exp-1',
      order: 0,
      parentId: null,
      fields: [
        { key: 'company', value: '', order: 0 },
        { key: 'title', value: '', order: 1 },
        { key: 'startDate', value: '', order: 2 },
        { key: 'endDate', value: '', order: 3 },
        { key: 'location', value: '', order: 4 },
        { key: 'isCurrent', value: '', order: 5 },
      ],
    }]

    const wrapper = mount(ExperienceEditor)
    await expandAllEntries(wrapper)

    const textInputs = wrapper.findAll('input[type="text"]')
    const titleInput = textInputs[1]!
    await titleInput.setValue('Staff Engineer')

    const titleField = section.entries[0]!.fields.find((f) => f.key === 'title')
    expect(titleField?.value).toBe('Staff Engineer')
  })

  it('updates location field value on input', async () => {
    const store = useResumeStore()
    const section = store.sections.find((s) => s.sectionType === 'experience')!
    section.entries = [{
      id: 'exp-1',
      order: 0,
      parentId: null,
      fields: [
        { key: 'company', value: '', order: 0 },
        { key: 'title', value: '', order: 1 },
        { key: 'startDate', value: '', order: 2 },
        { key: 'endDate', value: '', order: 3 },
        { key: 'location', value: '', order: 4 },
        { key: 'isCurrent', value: '', order: 5 },
      ],
    }]

    const wrapper = mount(ExperienceEditor)
    await expandAllEntries(wrapper)

    const textInputs = wrapper.findAll('input[type="text"]')
    // After company and title, the third text input should be location
    const locationInput = textInputs[2]!
    await locationInput.setValue('Mountain View, CA')

    const locationField = section.entries[0]!.fields.find((f) => f.key === 'location')
    expect(locationField?.value).toBe('Mountain View, CA')
  })

  it('renders date inputs as type="month"', async () => {
    const store = useResumeStore()
    const section = store.sections.find((s) => s.sectionType === 'experience')!
    section.entries = [{
      id: 'exp-1',
      order: 0,
      parentId: null,
      fields: [
        { key: 'company', value: '', order: 0 },
        { key: 'title', value: '', order: 1 },
        { key: 'startDate', value: '', order: 2 },
        { key: 'endDate', value: '', order: 3 },
        { key: 'location', value: '', order: 4 },
        { key: 'isCurrent', value: '', order: 5 },
      ],
    }]

    const wrapper = mount(ExperienceEditor)
    await expandAllEntries(wrapper)

    const dateInputs = wrapper.findAll('input[type="month"]')
    expect(dateInputs).toHaveLength(2) // startDate and endDate
  })

  it('updates startDate field on month input', async () => {
    const store = useResumeStore()
    const section = store.sections.find((s) => s.sectionType === 'experience')!
    section.entries = [{
      id: 'exp-1',
      order: 0,
      parentId: null,
      fields: [
        { key: 'company', value: '', order: 0 },
        { key: 'title', value: '', order: 1 },
        { key: 'startDate', value: '', order: 2 },
        { key: 'endDate', value: '', order: 3 },
        { key: 'location', value: '', order: 4 },
        { key: 'isCurrent', value: '', order: 5 },
      ],
    }]

    const wrapper = mount(ExperienceEditor)
    await expandAllEntries(wrapper)

    const dateInputs = wrapper.findAll('input[type="month"]')
    await dateInputs[0]!.setValue('2020-03')

    const startField = section.entries[0]!.fields.find((f) => f.key === 'startDate')
    expect(startField?.value).toBe('2020-03')
  })

  describe('current position toggle', () => {
    it('shows the "Current position" checkbox as checked when isCurrent is "true"', async () => {
      const store = useResumeStore()
      const section = store.sections.find((s) => s.sectionType === 'experience')!
      section.entries = [{
        id: 'exp-1',
        order: 0,
        parentId: null,
        fields: [
          { key: 'company', value: 'Startup Inc', order: 0 },
          { key: 'title', value: 'CTO', order: 1 },
          { key: 'startDate', value: '2023-01', order: 2 },
          { key: 'endDate', value: '', order: 3 },
          { key: 'location', value: '', order: 4 },
          { key: 'isCurrent', value: 'true', order: 5 },
        ],
      }]

      const wrapper = mount(ExperienceEditor)
      await expandAllEntries(wrapper)

      const checkbox = wrapper.find('input[type="checkbox"]')
      expect(checkbox.exists()).toBe(true)
      expect((checkbox.element as HTMLInputElement).checked).toBe(true)

      // endDate input should be disabled
      const dateInputs = wrapper.findAll('input[type="month"]')
      expect((dateInputs[1]!.element as HTMLInputElement).disabled).toBe(true)
    })

    it('toggles isCurrent to "true" and clears endDate when checked', async () => {
      const store = useResumeStore()
      const section = store.sections.find((s) => s.sectionType === 'experience')!
      section.entries = [{
        id: 'exp-1',
        order: 0,
        parentId: null,
        fields: [
          { key: 'company', value: 'Startup Inc', order: 0 },
          { key: 'title', value: 'CTO', order: 1 },
          { key: 'startDate', value: '2023-01', order: 2 },
          { key: 'endDate', value: '2024-06', order: 3 },
          { key: 'location', value: '', order: 4 },
          { key: 'isCurrent', value: 'false', order: 5 },
        ],
      }]

      const wrapper = mount(ExperienceEditor)
      await expandAllEntries(wrapper)

      const checkbox = wrapper.find('input[type="checkbox"]')
      expect((checkbox.element as HTMLInputElement).checked).toBe(false)

      await checkbox.setValue(true)

      // isCurrent should be 'true'
      const isCurrentField = section.entries[0]!.fields.find((f) => f.key === 'isCurrent')
      expect(isCurrentField?.value).toBe('true')
      // endDate should be cleared
      const endDateField = section.entries[0]!.fields.find((f) => f.key === 'endDate')
      expect(endDateField?.value).toBe('')
    })

    it('unchecks and sets isCurrent to "false"', async () => {
      const store = useResumeStore()
      const section = store.sections.find((s) => s.sectionType === 'experience')!
      section.entries = [{
        id: 'exp-1',
        order: 0,
        parentId: null,
        fields: [
          { key: 'company', value: 'Startup Inc', order: 0 },
          { key: 'title', value: 'CTO', order: 1 },
          { key: 'startDate', value: '2023-01', order: 2 },
          { key: 'endDate', value: '', order: 3 },
          { key: 'location', value: '', order: 4 },
          { key: 'isCurrent', value: 'true', order: 5 },
        ],
      }]

      const wrapper = mount(ExperienceEditor)
      await expandAllEntries(wrapper)

      const checkbox = wrapper.find('input[type="checkbox"]')
      await checkbox.setValue(false)

      const isCurrentField = section.entries[0]!.fields.find((f) => f.key === 'isCurrent')
      expect(isCurrentField?.value).toBe('false')
    })
  })

  describe('bullet points', () => {
    it('adds a bullet point when "Add bullet point" is clicked', async () => {
      const store = useResumeStore()
      const section = store.sections.find((s) => s.sectionType === 'experience')!
      const parentId = 'exp-1'
      section.entries = [{
        id: parentId,
        order: 0,
        parentId: null,
        fields: [
          { key: 'company', value: 'Acme Corp', order: 0 },
          { key: 'title', value: 'Engineer', order: 1 },
          { key: 'startDate', value: '', order: 2 },
          { key: 'endDate', value: '', order: 3 },
          { key: 'location', value: '', order: 4 },
          { key: 'isCurrent', value: '', order: 5 },
        ],
      }]

      const wrapper = mount(ExperienceEditor)
      await expandAllEntries(wrapper)

      // Find the "Add bullet point" button inside the expanded EntryList
      const buttons = wrapper.findAll('button')
      // The "Add bullet point" button should have text containing "Add bullet point"
      const addBulletButton = buttons.find((b) => b.text().includes('Add bullet point'))
      expect(addBulletButton).toBeDefined()
      await addBulletButton!.trigger('click')
      await flushPromises()

      const children = section.entries.filter((e) => e.parentId === parentId)
      expect(children).toHaveLength(1)
      expect(children[0]!.fields[0]!.key).toBe('text')
      expect(children[0]!.fields[0]!.value).toBe('')
    })

    it('updates bullet text on input', async () => {
      const store = useResumeStore()
      const section = store.sections.find((s) => s.sectionType === 'experience')!
      const parentId = 'exp-1'
      section.entries = [
        {
          id: parentId,
          order: 0,
          parentId: null,
          fields: [
            { key: 'company', value: 'Acme Corp', order: 0 },
            { key: 'title', value: 'Engineer', order: 1 },
            { key: 'startDate', value: '', order: 2 },
            { key: 'endDate', value: '', order: 3 },
            { key: 'location', value: '', order: 4 },
            { key: 'isCurrent', value: '', order: 5 },
          ],
        },
        {
          id: 'b1',
          order: 0,
          parentId,
          fields: [{ key: 'text', value: 'Built APIs', order: 0 }],
        },
      ]

      const wrapper = mount(ExperienceEditor)
      await expandAllEntries(wrapper)

      // The bullet text input is inside the expanded entry panel
      // Find all text inputs; the bullet one is the one after company/title/location
      const textInputs = wrapper.findAll('input[type="text"]')
      // company, title, location, then the bullet text input
      const bulletInput = textInputs[3]!
      await bulletInput.setValue('Built high-performance APIs')

      const updated = section.entries.find((e) => e.id === 'b1')
      expect(updated?.fields[0]?.value).toBe('Built high-performance APIs')
    })

    it('removes a bullet point', async () => {
      const store = useResumeStore()
      const section = store.sections.find((s) => s.sectionType === 'experience')!
      const parentId = 'exp-1'
      section.entries = [
        {
          id: parentId,
          order: 0,
          parentId: null,
          fields: [
            { key: 'company', value: 'Acme Corp', order: 0 },
            { key: 'title', value: 'Engineer', order: 1 },
            { key: 'startDate', value: '', order: 2 },
            { key: 'endDate', value: '', order: 3 },
            { key: 'location', value: '', order: 4 },
            { key: 'isCurrent', value: '', order: 5 },
          ],
        },
        {
          id: 'b1',
          order: 0,
          parentId,
          fields: [{ key: 'text', value: 'Built APIs', order: 0 }],
        },
      ]

      // @ts-expect-error - typescript doesn't know about window.confirm mock
      window.confirm = () => true

      const wrapper = mount(ExperienceEditor)
      await expandAllEntries(wrapper)

      // Click the remove bullet button (×)
      const removeButton = wrapper.find('button[aria-label="Remove bullet point"]')
      expect(removeButton.exists()).toBe(true)
      await removeButton.trigger('click')
      await flushPromises()

      const children = section.entries.filter((e) => e.parentId === parentId)
      expect(children).toHaveLength(0)
    })
  })

  describe('job removal', () => {
    it('removes a job and its child bullets', async () => {
      const store = useResumeStore()
      const section = store.sections.find((s) => s.sectionType === 'experience')!
      const parentId = 'exp-1'
      section.entries = [
        {
          id: parentId,
          order: 0,
          parentId: null,
          fields: [
            { key: 'company', value: 'Acme Corp', order: 0 },
            { key: 'title', value: 'Engineer', order: 1 },
            { key: 'startDate', value: '', order: 2 },
            { key: 'endDate', value: '', order: 3 },
            { key: 'location', value: '', order: 4 },
            { key: 'isCurrent', value: '', order: 5 },
          ],
        },
        {
          id: 'b1',
          order: 0,
          parentId,
          fields: [{ key: 'text', value: 'Built APIs', order: 0 }],
        },
      ]

      // @ts-expect-error - typescript doesn't know about window.confirm mock
      window.confirm = () => true

      const wrapper = mount(ExperienceEditor)
      await flushPromises()

      // Click remove entry button (on the collapsed header)
      const removeButton = wrapper.find('button[aria-label="Remove entry"]')
      expect(removeButton.exists()).toBe(true)
      await removeButton.trigger('click')
      await flushPromises()

      // Both parent and child should be gone
      expect(section.entries).toHaveLength(0)
    })
  })

  describe('multiple entries', () => {
    it('renders multiple job entries', async () => {
      const store = useResumeStore()
      const section = store.sections.find((s) => s.sectionType === 'experience')!
      section.entries = [
        {
          id: 'exp-1',
          order: 0,
          parentId: null,
          fields: [
            { key: 'company', value: 'Acme Corp', order: 0 },
            { key: 'title', value: 'Senior', order: 1 },
            { key: 'startDate', value: '', order: 2 },
            { key: 'endDate', value: '', order: 3 },
            { key: 'location', value: '', order: 4 },
            { key: 'isCurrent', value: '', order: 5 },
          ],
        },
        {
          id: 'exp-2',
          order: 1,
          parentId: null,
          fields: [
            { key: 'company', value: 'Beta Inc', order: 0 },
            { key: 'title', value: 'Junior', order: 1 },
            { key: 'startDate', value: '', order: 2 },
            { key: 'endDate', value: '', order: 3 },
            { key: 'location', value: '', order: 4 },
            { key: 'isCurrent', value: '', order: 5 },
          ],
        },
      ]

      const wrapper = mount(ExperienceEditor)
      await flushPromises()

      const panels = wrapper.findAll('[data-entry-panel]')
      expect(panels).toHaveLength(2)

      // Both entries collapsed — titles should still show in header
      const titles = panels.map((p) => p.find('.font-medium').text())
      expect(titles[0]).toBe('Senior at Acme Corp')
      expect(titles[1]).toBe('Junior at Beta Inc')
    })
  })

  describe('filter count display', () => {
    it('does not show filter count when not filtered', async () => {
      const store = useResumeStore()
      const section = store.sections.find((s) => s.sectionType === 'experience')!
      section.entries = [
        {
          id: 'exp-1',
          order: 0,
          parentId: null,
          fields: [
            { key: 'company', value: 'Acme Corp', order: 0 },
            { key: 'title', value: 'Engineer', order: 1 },
            { key: 'startDate', value: '', order: 2 },
            { key: 'endDate', value: '', order: 3 },
            { key: 'location', value: '', order: 4 },
            { key: 'isCurrent', value: '', order: 5 },
          ],
        },
      ]

      const wrapper = mount(ExperienceEditor)
      await flushPromises()

      expect(wrapper.text()).not.toContain('Showing')
    })

    it('shows filter count when isFiltered is true', async () => {
      const store = useResumeStore()
      store.isFiltered = true
      const section = store.sections.find((s) => s.sectionType === 'experience')!
      section.entries = [
        {
          id: 'exp-1',
          order: 0,
          parentId: null,
          fields: [
            { key: 'company', value: 'Acme Corp', order: 0 },
            { key: 'title', value: 'Engineer', order: 1 },
            { key: 'startDate', value: '', order: 2 },
            { key: 'endDate', value: '', order: 3 },
            { key: 'location', value: '', order: 4 },
            { key: 'isCurrent', value: '', order: 5 },
          ],
        },
        {
          id: 'b1',
          order: 0,
          parentId: 'exp-1',
          fields: [{ key: 'text', value: 'Bullet 1', order: 0 }],
        },
        {
          id: 'b2',
          order: 1,
          parentId: 'exp-1',
          fields: [{ key: 'text', value: 'Bullet 2', order: 0 }],
        },
      ]

      const wrapper = mount(ExperienceEditor)
      await flushPromises()

      // The filtered count display should appear
      expect(wrapper.text()).toContain('Showing')
    })
  })
})
