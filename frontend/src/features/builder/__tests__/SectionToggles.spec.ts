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

    const items = wrapper.findAll('.section-toggles__item')
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

    const checkboxes = wrapper.findAll<HTMLInputElement>('.section-toggles__checkbox')
    expect(checkboxes).toHaveLength(10)
    for (const cb of checkboxes) {
      expect(cb.element.checked).toBe(true)
    }
  })

  it('shows checkboxes unchecked for disabled sections', () => {
    const enabled: SectionType[] = ['contact', 'summary']
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: enabled,
        columnAssignments: noAssignments,
      },
    })

    const checkboxes = wrapper.findAll<HTMLInputElement>('.section-toggles__checkbox')
    // experience should be unchecked (not in enabled list)
    const experienceCheckbox = checkboxes.find((cb) => {
      const label = (cb.element.closest('.section-toggles__item') as HTMLElement)
        ?.querySelector('.section-toggles__label-text')
        ?.textContent
      return label === 'Experience'
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

    // Toggle off "contact" — find its checkbox
    const contactItem = wrapper.findAll('.section-toggles__item').find((item) =>
      item.text().includes('Contact'),
    )
    const checkbox = contactItem!.find<HTMLInputElement>('input[type="checkbox"]')
    await checkbox.setValue(false)

    expect(wrapper.emitted('toggle')).toBeTruthy()
    expect(wrapper.emitted('toggle')![0]).toEqual(['contact' as SectionType])
  })

  it('shows column select only for 2:1 layout with enabled sections', () => {
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'column2-1',
        enabledSections: allEnabled,
        columnAssignments: noAssignments,
      },
    })

    const selects = wrapper.findAll('.section-toggles__column-select')
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

    const selects = wrapper.findAll('.section-toggles__column-select')
    expect(selects).toHaveLength(0)
  })

  it('hides column select for disabled sections even in 2:1 layout', () => {
    const enabled: SectionType[] = ['contact']
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'column2-1',
        enabledSections: enabled,
        columnAssignments: noAssignments,
      },
    })

    const selects = wrapper.findAll('.section-toggles__column-select')
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

    const contactItem = wrapper.findAll('.section-toggles__item').find((item) =>
      item.text().includes('Contact'),
    )
    const select = contactItem!.find('.section-toggles__column-select')
    await select.setValue('left')

    expect(wrapper.emitted('setColumn')).toBeTruthy()
    expect(wrapper.emitted('setColumn')![0]).toEqual(['contact' as SectionType, 'left'])
  })

  it('shows move buttons for enabled sections', () => {
    const enabled: SectionType[] = ['contact', 'summary', 'experience']
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: enabled,
        columnAssignments: noAssignments,
      },
    })

    const moveButtons = wrapper.findAll('.section-toggles__move-btn')
    expect(moveButtons).toHaveLength(3)
  })

  it('hides move buttons for disabled sections', () => {
    const enabled: SectionType[] = ['contact']
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: enabled,
        columnAssignments: noAssignments,
      },
    })

    const moveButtons = wrapper.findAll('.section-toggles__move-btn')
    expect(moveButtons).toHaveLength(1)
  })

  it('shows enabled sections first, then disabled', () => {
    const enabled: SectionType[] = ['experience', 'contact']
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: enabled,
        columnAssignments: noAssignments,
      },
    })

    const labels = wrapper.findAll('.section-toggles__label-text')
    const labelTexts = labels.map((el) => el.text())

    // First two should be the enabled ones (contact, experience in their natural order)
    // Actually, the orderedSections computed puts enabled first maintaining SECTION_TYPES order
    expect(labelTexts[0]).toBe('Contact')
    expect(labelTexts[1]).toBe('Experience')
    // Then disabled follow
    expect(labelTexts[2]).toBe('Summary')
  })
})
