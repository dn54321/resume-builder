import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useResumeStore } from '@/features/builder/stores/resume'
import VolunteerEditor from '@/features/builder/components/editors/VolunteerEditor.vue'

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

/**
 * Build a volunteer section with one role entry pre-populated.
 */
function seedVolunteerEntry() {
  const store = useResumeStore()
  const section = store.sections.find((s) => s.sectionType === 'volunteer')!
  section.entries = [{
    id: 'v-1',
    order: 0,
    parentId: null,
    locked: false,
    fields: [
      { key: 'organization', value: '', order: 0 },
      { key: 'role', value: '', order: 1 },
      { key: 'startDate', value: '', order: 2 },
      { key: 'endDate', value: '', order: 3 },
      { key: 'location', value: '', order: 4 },
      { key: 'isCurrent', value: '', order: 5 },
    ],
  }]
  return { store, section }
}

describe('VolunteerEditor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useResumeStore()
    store.initializeDefaults()
  })

  it('renders the heading and add button', () => {
    const wrapper = mount(VolunteerEditor)

    expect(wrapper.text()).toContain('Volunteer')
    expect(wrapper.text()).toContain('Add Volunteer Role')
  })

  it('adds a role entry with default empty fields and auto-expands it', async () => {
    const wrapper = mount(VolunteerEditor)

    const addButton = wrapper.find('button')
    await addButton.trigger('click')
    await flushPromises()

    const store = useResumeStore()
    const section = store.sections.find((s) => s.sectionType === 'volunteer')
    expect(section).toBeDefined()
    expect(section!.entries.filter((e) => !e.parentId)).toHaveLength(1)

    const entry = section!.entries[0]!
    // Should have all 6 fields
    const fieldKeys = entry.fields.map((f) => f.key)
    expect(fieldKeys).toContain('organization')
    expect(fieldKeys).toContain('role')
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
    // Fields should be rendered (organization, role, location inputs)
    const textInputs = wrapper.findAll('input[type="text"]')
    expect(textInputs.length).toBeGreaterThanOrEqual(3)
  })

  it('displays the entry title as "(New Role)" when organization is empty', async () => {
    const wrapper = mount(VolunteerEditor)

    const addButton = wrapper.find('button')
    await addButton.trigger('click')
    await flushPromises()

    const entryTitle = wrapper.find('[data-entry-panel] .font-medium')
    expect(entryTitle.text()).toBe('(New Role)')
  })

  it('displays entry title as "role at organization" when both are set', async () => {
    const { section } = seedVolunteerEntry()
    section.entries[0]!.fields = [
      { key: 'organization', value: 'Habitat for Humanity', order: 0 },
      { key: 'role', value: 'Volunteer Coordinator', order: 1 },
      { key: 'startDate', value: '', order: 2 },
      { key: 'endDate', value: '', order: 3 },
      { key: 'location', value: '', order: 4 },
      { key: 'isCurrent', value: '', order: 5 },
    ]

    const wrapper = mount(VolunteerEditor)
    await flushPromises()

    const entryTitle = wrapper.find('[data-entry-panel] .font-medium')
    expect(entryTitle.text()).toBe('Volunteer Coordinator at Habitat for Humanity')
  })

  it('updates organization field value on input', async () => {
    const { section } = seedVolunteerEntry()
    const wrapper = mount(VolunteerEditor)
    await expandAllEntries(wrapper)

    // First text input is the organization field
    const textInputs = wrapper.findAll('input[type="text"]')
    await textInputs[0]!.setValue('Red Cross')

    const organizationField = section.entries[0]!.fields.find((f) => f.key === 'organization')
    expect(organizationField?.value).toBe('Red Cross')
  })

  it('updates role field value on input', async () => {
    const { section } = seedVolunteerEntry()
    const wrapper = mount(VolunteerEditor)
    await expandAllEntries(wrapper)

    const textInputs = wrapper.findAll('input[type="text"]')
    await textInputs[1]!.setValue('Disaster Relief Volunteer')

    const roleField = section.entries[0]!.fields.find((f) => f.key === 'role')
    expect(roleField?.value).toBe('Disaster Relief Volunteer')
  })

  it('updates location field value on input', async () => {
    const { section } = seedVolunteerEntry()
    const wrapper = mount(VolunteerEditor)
    await expandAllEntries(wrapper)

    // After organization and role, the third text input is location
    const textInputs = wrapper.findAll('input[type="text"]')
    await textInputs[2]!.setValue('Portland, OR')

    const locationField = section.entries[0]!.fields.find((f) => f.key === 'location')
    expect(locationField?.value).toBe('Portland, OR')
  })

  it('renders date inputs as type="month"', async () => {
    seedVolunteerEntry()
    const wrapper = mount(VolunteerEditor)
    await expandAllEntries(wrapper)

    const dateInputs = wrapper.findAll('input[type="month"]')
    expect(dateInputs).toHaveLength(2) // startDate and endDate
  })

  it('updates startDate field on month input', async () => {
    const { section } = seedVolunteerEntry()
    const wrapper = mount(VolunteerEditor)
    await expandAllEntries(wrapper)

    const dateInputs = wrapper.findAll('input[type="month"]')
    await dateInputs[0]!.setValue('2021-06')

    const startField = section.entries[0]!.fields.find((f) => f.key === 'startDate')
    expect(startField?.value).toBe('2021-06')
  })

  describe('current role toggle', () => {
    it('shows the "Current role" checkbox as checked when isCurrent is "true"', async () => {
      const { section } = seedVolunteerEntry()
      section.entries[0]!.fields = [
        { key: 'organization', value: 'Local Shelter', order: 0 },
        { key: 'role', value: 'Volunteer', order: 1 },
        { key: 'startDate', value: '2023-01', order: 2 },
        { key: 'endDate', value: '', order: 3 },
        { key: 'location', value: '', order: 4 },
        { key: 'isCurrent', value: 'true', order: 5 },
      ]

      const wrapper = mount(VolunteerEditor)
      await expandAllEntries(wrapper)

      const checkbox = wrapper.find('input[type="checkbox"]')
      expect(checkbox.exists()).toBe(true)
      expect((checkbox.element as HTMLInputElement).checked).toBe(true)

      // endDate input should be disabled
      const dateInputs = wrapper.findAll('input[type="month"]')
      expect((dateInputs[1]!.element as HTMLInputElement).disabled).toBe(true)
    })

    it('toggles isCurrent to "true" and clears endDate when checked', async () => {
      const { section } = seedVolunteerEntry()
      section.entries[0]!.fields = [
        { key: 'organization', value: 'Local Shelter', order: 0 },
        { key: 'role', value: 'Volunteer', order: 1 },
        { key: 'startDate', value: '2023-01', order: 2 },
        { key: 'endDate', value: '2024-06', order: 3 },
        { key: 'location', value: '', order: 4 },
        { key: 'isCurrent', value: 'false', order: 5 },
      ]

      const wrapper = mount(VolunteerEditor)
      await expandAllEntries(wrapper)

      const checkbox = wrapper.find('input[type="checkbox"]')
      expect((checkbox.element as HTMLInputElement).checked).toBe(false)

      await checkbox.setValue(true)

      const isCurrentField = section.entries[0]!.fields.find((f) => f.key === 'isCurrent')
      expect(isCurrentField?.value).toBe('true')
      const endDateField = section.entries[0]!.fields.find((f) => f.key === 'endDate')
      expect(endDateField?.value).toBe('')
    })
  })

  describe('bullet points', () => {
    it('adds a bullet point when "Add bullet point" is clicked', async () => {
      const { section } = seedVolunteerEntry()
      const parentId = 'v-1'
      const wrapper = mount(VolunteerEditor)
      await expandAllEntries(wrapper)

      const buttons = wrapper.findAll('button')
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
      const { section } = seedVolunteerEntry()
      const parentId = 'v-1'
      section.entries.push({
        id: 'b1',
        order: 0,
        parentId,
        locked: false,
        fields: [{ key: 'text', value: 'Organized donation drives', order: 0 }],
      })

      const wrapper = mount(VolunteerEditor)
      await expandAllEntries(wrapper)

      // organization, role, location, then the bullet text input
      const textInputs = wrapper.findAll('input[type="text"]')
      const bulletInput = textInputs[3]!
      await bulletInput.setValue('Organized city-wide donation drives')

      const updated = section.entries.find((e) => e.id === 'b1')
      expect(updated?.fields[0]?.value).toBe('Organized city-wide donation drives')
    })

    it('removes a bullet point', async () => {
      const { section } = seedVolunteerEntry()
      const parentId = 'v-1'
      section.entries.push({
        id: 'b1',
        order: 0,
        parentId,
        locked: false,
        fields: [{ key: 'text', value: 'Organized donation drives', order: 0 }],
      })

      // @ts-expect-error - typescript doesn't know about window.confirm mock
      window.confirm = () => true

      const wrapper = mount(VolunteerEditor)
      await expandAllEntries(wrapper)

      const removeButton = wrapper.find('button[aria-label="Remove bullet point"]')
      expect(removeButton.exists()).toBe(true)
      await removeButton.trigger('click')
      await flushPromises()

      const children = section.entries.filter((e) => e.parentId === parentId)
      expect(children).toHaveLength(0)
    })
  })

  describe('role removal', () => {
    it('removes a role and its child bullets', async () => {
      const { section } = seedVolunteerEntry()
      const parentId = 'v-1'
      section.entries.push({
        id: 'b1',
        order: 0,
        parentId,
        locked: false,
        fields: [{ key: 'text', value: 'Organized donation drives', order: 0 }],
      })

      // @ts-expect-error - typescript doesn't know about window.confirm mock
      window.confirm = () => true

      const wrapper = mount(VolunteerEditor)
      await flushPromises()

      const removeButton = wrapper.find('button[aria-label="Remove entry"]')
      expect(removeButton.exists()).toBe(true)
      await removeButton.trigger('click')
      await flushPromises()

      // Both parent and child should be gone
      expect(section.entries).toHaveLength(0)
    })
  })

  describe('filter count display', () => {
    it('shows filter count when isFiltered is true', async () => {
      const store = useResumeStore()
      store.isFiltered = true
      const section = store.sections.find((s) => s.sectionType === 'volunteer')!
      section.entries = [
        {
          id: 'v-1',
          order: 0,
          parentId: null,
          locked: false,
          fields: [
            { key: 'organization', value: 'Habitat', order: 0 },
            { key: 'role', value: 'Volunteer', order: 1 },
            { key: 'startDate', value: '', order: 2 },
            { key: 'endDate', value: '', order: 3 },
            { key: 'location', value: '', order: 4 },
            { key: 'isCurrent', value: '', order: 5 },
          ],
        },
        {
          id: 'b1',
          order: 0,
          parentId: 'v-1',
          locked: false,
          fields: [{ key: 'text', value: 'Bullet 1', order: 0 }],
        },
        {
          id: 'b2',
          order: 1,
          parentId: 'v-1',
          locked: false,
          fields: [{ key: 'text', value: 'Bullet 2', order: 0 }],
        },
      ]

      const wrapper = mount(VolunteerEditor)
      await flushPromises()

      // The filtered count display should appear
      expect(wrapper.text()).toContain('Showing')
    })
  })

  describe('bullet visibility/lock toggles (RES-106 refined)', () => {
    /**
     * Helper: mount the editor with one role that has two bullets.
     */
    function mountWithBullets() {
      const store = useResumeStore()
      const section = store.sections.find((s) => s.sectionType === 'volunteer')!
      section.entries = [
        {
          id: 'v-1',
          order: 0,
          parentId: null,
          locked: false,
          visible: true,
          fields: [
            { key: 'organization', value: 'Habitat', order: 0 },
            { key: 'role', value: 'Volunteer', order: 1 },
            { key: 'startDate', value: '', order: 2 },
            { key: 'endDate', value: '', order: 3 },
            { key: 'location', value: '', order: 4 },
            { key: 'isCurrent', value: '', order: 5 },
          ],
        },
        {
          id: 'b1',
          order: 0,
          parentId: 'v-1',
          locked: false,
          visible: true,
          fields: [{ key: 'text', value: 'Bullet 1', order: 0 }],
        },
        {
          id: 'b2',
          order: 1,
          parentId: 'v-1',
          locked: true,
          visible: false,
          fields: [{ key: 'text', value: 'Bullet 2', order: 0 }],
        },
      ]
      return { store, section }
    }

    it('shows eye+lock toggles on bullet rows', async () => {
      mountWithBullets()
      const wrapper = mount(VolunteerEditor)
      await expandAllEntries(wrapper)

      // Two bullets → two eye buttons + two lock buttons.
      expect(wrapper.findAll('[data-testid="bullet-eye-toggle"]')).toHaveLength(2)
      expect(wrapper.findAll('[data-testid="bullet-lock-toggle"]')).toHaveLength(2)
      // b1 visible → Eye icon; b2 hidden → EyeOff icon.
      expect(wrapper.findAll('svg.lucide-eye')).toHaveLength(1)
      expect(wrapper.findAll('svg.lucide-eye-off')).toHaveLength(1)
      // b2 locked → Lock icon; b1 unlocked → LockOpen icon.
      expect(wrapper.findAll('svg.lucide-lock')).toHaveLength(1)
      expect(wrapper.findAll('svg.lucide-lock-open')).toHaveLength(1)
    })

    it('does NOT render eye/lock toggles on the parent (organization) rows', async () => {
      mountWithBullets()
      const wrapper = mount(VolunteerEditor)
      await expandAllEntries(wrapper)

      // Parent rows hide the per-entry toggles entirely (refined spec:
      // bullet sections carry eye+lock on bullets, NOT the org row).
      expect(wrapper.findAll('[data-testid="entry-eye-toggle"]')).toHaveLength(0)
      expect(wrapper.findAll('[data-testid="entry-lock-toggle"]')).toHaveLength(0)
    })

    it('toggles a bullet visible flag when its eye button is clicked', async () => {
      const { section } = mountWithBullets()
      const wrapper = mount(VolunteerEditor)
      await expandAllEntries(wrapper)

      const eyeButtons = wrapper.findAll('[data-testid="bullet-eye-toggle"]')
      await eyeButtons[0]!.trigger('click')

      expect(section.entries.find((e) => e.id === 'b1')!.visible).toBe(false)
      expect(section.entries.find((e) => e.id === 'b2')!.visible).toBe(false)
    })

    it('toggles a bullet locked flag when its lock button is clicked', async () => {
      const { section } = mountWithBullets()
      const wrapper = mount(VolunteerEditor)
      await expandAllEntries(wrapper)

      const lockButtons = wrapper.findAll('[data-testid="bullet-lock-toggle"]')
      await lockButtons[0]!.trigger('click')

      expect(section.entries.find((e) => e.id === 'b1')!.locked).toBe(true)
      expect(section.entries.find((e) => e.id === 'b2')!.locked).toBe(true)
    })

    it('full round-trip: hiding a bullet in the editor removes it from the preview', async () => {
      const store = useResumeStore()
      const section = store.sections.find((s) => s.sectionType === 'volunteer')!
      section.entries = [
        {
          id: 'v-1',
          order: 0,
          parentId: null,
          locked: false,
          visible: true,
          fields: [
            { key: 'organization', value: 'Habitat', order: 0 },
            { key: 'role', value: 'Volunteer', order: 1 },
            { key: 'startDate', value: '', order: 2 },
            { key: 'endDate', value: '', order: 3 },
            { key: 'location', value: '', order: 4 },
            { key: 'isCurrent', value: '', order: 5 },
          ],
        },
        {
          id: 'b1',
          order: 0,
          parentId: 'v-1',
          locked: false,
          visible: true,
          fields: [{ key: 'text', value: 'Bullet 1', order: 0 }],
        },
        {
          id: 'b2',
          order: 1,
          parentId: 'v-1',
          locked: false,
          visible: true,
          fields: [{ key: 'text', value: 'Bullet 2', order: 0 }],
        },
      ]
      const wrapper = mount(VolunteerEditor)
      await expandAllEntries(wrapper)

      // Hide bullet b1 via the eye toggle in the editor (component → store).
      const eyeButtons = wrapper.findAll('[data-testid="bullet-eye-toggle"]')
      await eyeButtons[0]!.trigger('click')
      expect(section.entries.find((e) => e.id === 'b1')!.visible).toBe(false)

      // Render the actual preview component from the same store state
      // (store → component): the hidden bullet must not appear.
      const { default: StandardLayout } = await import(
        '@/features/builder/components/preview/StandardLayout.vue'
      )
      const preview = mount(StandardLayout, {
        props: { sections: store.sections },
      })
      const text = preview.text()
      expect(text).toContain('Habitat')
      expect(text).toContain('Bullet 2')
      expect(text).not.toContain('Bullet 1')
    })
  })
})
