import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import SectionToggles from '@/features/builder/components/SectionToggles.vue'
import { SECTION_TYPES, type SectionType } from '@/features/builder/types/resume'

describe('SectionToggles', () => {
  const allEnabled = SECTION_TYPES as unknown as SectionType[]
  const noAssignments = Object.fromEntries(
    SECTION_TYPES.map((t) => [t, 'right' as const]),
  ) as Record<SectionType, 'left' | 'right'>

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders all 10 section types', () => {
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: allEnabled,
        columnAssignments: noAssignments,
      },
    })

    const items = wrapper.findAll('li')
    expect(items).toHaveLength(10)
  })

  it('shows checkboxes checked for enabled sections', () => {
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: allEnabled,
        columnAssignments: noAssignments,
      },
    })

    const checkboxes = wrapper.findAll<HTMLInputElement>('input[type="checkbox"]')
    expect(checkboxes).toHaveLength(10)
    for (const cb of checkboxes) {
      expect(cb.element.checked).toBe(true)
    }
  })

  it('shows checkboxes unchecked for disabled sections', () => {
    const enabled: SectionType[] = ['name_contact', 'summary']
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: enabled,
        columnAssignments: noAssignments,
      },
    })

    const checkboxes = wrapper.findAll<HTMLInputElement>('input[type="checkbox"]')
    // experience should be unchecked (not in enabled list)
    const experienceCheckbox = checkboxes.find((_cb, idx) => {
      const items = wrapper.findAll('li')
      const item = items[idx]
      return item?.text().includes('Experience')
    })
    expect(experienceCheckbox?.element.checked).toBe(false)
  })

  it('emits toggle when a checkbox is changed', async () => {
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: allEnabled,
        columnAssignments: noAssignments,
      },
    })

    // Toggle off "name_contact" — find its checkbox
    const items = wrapper.findAll('li')
    const contactItem = items.find((item) =>
      item.text().includes('Contact'),
    )
    const checkbox = contactItem!.find<HTMLInputElement>('input[type="checkbox"]')
    await checkbox.setValue(false)

    expect(wrapper.emitted('toggle')).toBeTruthy()
    expect(wrapper.emitted('toggle')![0]).toEqual(['name_contact' as SectionType])
  })

  it('shows column select only for 2:1 layout with enabled sections', () => {
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'column2-1',
        enabledSections: allEnabled,
        columnAssignments: noAssignments,
      },
    })

    const selects = wrapper.findAll('select')
    expect(selects).toHaveLength(10)
  })

  it('hides column select for standard layout', () => {
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: allEnabled,
        columnAssignments: noAssignments,
      },
    })

    const selects = wrapper.findAll('select')
    expect(selects).toHaveLength(0)
  })

  it('hides column select for disabled sections even in 2:1 layout', () => {
    const enabled: SectionType[] = ['name_contact']
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'column2-1',
        enabledSections: enabled,
        columnAssignments: noAssignments,
      },
    })

    const selects = wrapper.findAll('select')
    expect(selects).toHaveLength(1) // only contact
  })

  it('emits setColumn when column select changes', async () => {
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'column2-1',
        enabledSections: allEnabled,
        columnAssignments: noAssignments,
      },
    })

    const items = wrapper.findAll('li')
    const contactItem = items.find((item) =>
      item.text().includes('Contact'),
    )
    const select = contactItem!.find('select')
    await select.setValue('left')

    expect(wrapper.emitted('setColumn')).toBeTruthy()
    expect(wrapper.emitted('setColumn')![0]).toEqual(['name_contact' as SectionType, 'left'])
  })

  it('shows move buttons for enabled sections', () => {
    const enabled: SectionType[] = ['name_contact', 'summary', 'experience']
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: enabled,
        columnAssignments: noAssignments,
      },
    })

    const moveButtons = wrapper.findAll('button[title="Drag to reorder"]')
    expect(moveButtons).toHaveLength(3)
  })

  it('hides move buttons for disabled sections', () => {
    const enabled: SectionType[] = ['name_contact']
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: enabled,
        columnAssignments: noAssignments,
      },
    })

    const moveButtons = wrapper.findAll('button[title="Drag to reorder"]')
    expect(moveButtons).toHaveLength(1)
  })

  it('maintains fixed SECTION_TYPES order regardless of enabled state', () => {
    const enabled: SectionType[] = ['experience', 'name_contact']
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: enabled,
        columnAssignments: noAssignments,
      },
    })

    const items = wrapper.findAll('li')
    const labelTexts = items.map((el) => el.text())

    // All 10 sections in fixed SECTION_TYPES order, regardless of enabled state
    expect(labelTexts[0]).toContain('Name & Contact')
    expect(labelTexts[1]).toContain('Summary')
    expect(labelTexts[2]).toContain('Experience')
    expect(labelTexts).toHaveLength(10)
  })

  it('emits select when clicking an enabled section label', async () => {
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: allEnabled,
        columnAssignments: noAssignments,
      },
    })

    const items = wrapper.findAll('li')
    const contactItem = items.find((item) =>
      item.text().includes('Contact'),
    )
    const label = contactItem!.find('label')
    await label.trigger('click')

    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual(['name_contact' as SectionType])
  })

  it('emits toggle then select when clicking a disabled section label', async () => {
    const enabled: SectionType[] = ['name_contact']
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: enabled,
        columnAssignments: noAssignments,
      },
    })

    // 'summary' is disabled — find its label and click it
    const items = wrapper.findAll('li')
    const summaryItem = items.find((item) =>
      item.text().includes('Summary'),
    )
    const label = summaryItem!.find('label')
    await label.trigger('click')

    // Should emit both toggle and select for summary
    expect(wrapper.emitted('toggle')).toBeTruthy()
    expect(wrapper.emitted('toggle')![0]).toEqual(['summary' as SectionType])
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual(['summary' as SectionType])
  })

  it('does not emit toggle when clicking an enabled section label', async () => {
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: allEnabled,
        columnAssignments: noAssignments,
      },
    })

    // Clear any existing events by remounting is handled by the factory above.
    // Record current toggle call count
    const items = wrapper.findAll('li')
    const contactItem = items.find((item) =>
      item.text().includes('Contact'),
    )
    const label = contactItem!.find('label')

    // Capture toggle events before clicking
    const toggleBefore = (wrapper.emitted('toggle') || []).length

    await label.trigger('click')

    // Should emit select
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual(['name_contact' as SectionType])

    // Should NOT emit additional toggle events (only from label click)
    const toggleAfter = (wrapper.emitted('toggle') || []).length
    expect(toggleAfter).toBe(toggleBefore)
  })

  it('applies opacity-55 to items that are not enabled', () => {
    const enabled: SectionType[] = ['name_contact']
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: enabled,
        columnAssignments: noAssignments,
      },
    })

    const items = wrapper.findAll('li')
    // First item (name_contact) should NOT have opacity-55 class
    expect(items[0]!.classes()).not.toContain('opacity-55')
    // Second item (summary) SHOULD have opacity-55 class
    expect(items[1]!.classes()).toContain('opacity-55')
    // Count disabled items
    const disabledItems = items.filter((item) =>
      item.classes().includes('opacity-55'),
    )
    expect(disabledItems).toHaveLength(9)
  })
})
