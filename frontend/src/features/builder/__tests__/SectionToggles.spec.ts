import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import SectionToggles from '@/features/builder/components/SectionToggles.vue'
import { SECTION_TYPES, type SectionType } from '@/features/builder/types/resume'

// jsdom 29 does not provide DataTransfer or DragEvent globals.
// Define minimal mocks so the component's DnD handlers can be tested.
class MockDataTransfer {
  effectAllowed = 'none'
  dropEffect = 'none'
  private _data = new Map<string, string>()

  setData(format: string, data: string): void {
    this._data.set(format, data)
  }
  getData(format: string): string {
    return this._data.get(format) ?? ''
  }
}

/**
 * Create a DragEvent-like object with a mocked dataTransfer and any extra
 * property overrides (e.g. clientY). Uses a plain Event under the hood
 * so we stay compatible with jsdom.
 * @param type
 * @param overrides
 */
function createDragEvent(
  type: string,
  overrides: Record<string, unknown> = {},
): DragEvent {
  const dt = new MockDataTransfer()
  const event = new Event(type, { bubbles: true, cancelable: true }) as unknown as DragEvent
  // Attach dataTransfer
  Object.defineProperty(event, 'dataTransfer', {
    value: dt,
    writable: false,
    configurable: true,
  })
  // Attach any overrides
  for (const [key, value] of Object.entries(overrides)) {
    Object.defineProperty(event, key, {
      value,
      writable: false,
      configurable: true,
    })
  }
  return event
}

/**
 * Attach a mock getBoundingClientRect to a DOM element so dragover can
 * compute above/below positions.
 * @param element
 * @param rect
 */
function mockRect(
  element: HTMLElement,
  rect: Partial<DOMRect> = {},
): void {
  element.getBoundingClientRect = vi.fn<() => DOMRect>().mockReturnValue({
    top: 0,
    left: 0,
    bottom: 40,
    right: 200,
    width: 200,
    height: 40,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect)
}

describe('SectionToggles', () => {
  const allEnabled = SECTION_TYPES as unknown as SectionType[]
  const noAssignments = Object.fromEntries(
    SECTION_TYPES.map((t) => [t, 'right' as const]),
  ) as Record<SectionType, 'left' | 'right'>

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ── Rendering tests ─────────────────────────────────────────────

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

    const items = wrapper.findAll('li')
    const contactItem = items.find((item) =>
      item.text().includes('Contact'),
    )
    const checkbox = contactItem!.find<HTMLInputElement>('input[type="checkbox"]')
    await checkbox.setValue(false)

    expect(wrapper.emitted('toggle')).toBeTruthy()
    expect(wrapper.emitted('toggle')![0]).toEqual(['name_contact' as SectionType])
  })

  it('shows column select only for 2:1 layout with enabled sections (showTwoColumn=true)', () => {
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'column2-1',
        enabledSections: allEnabled,
        columnAssignments: noAssignments,
        showTwoColumn: true,
      },
    })

    const selects = wrapper.findAll('select')
    expect(selects).toHaveLength(10)
  })

  it('hides column select in 2:1 layout when showTwoColumn is false (feature flag off)', () => {
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'column2-1',
        enabledSections: allEnabled,
        columnAssignments: noAssignments,
      },
    })

    const selects = wrapper.findAll('select')
    expect(selects).toHaveLength(0)
  })

  it('hides column select for standard layout', () => {
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: allEnabled,
        columnAssignments: noAssignments,
        showTwoColumn: true,
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
        showTwoColumn: true,
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
        showTwoColumn: true,
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

  it('uses SECTION_TYPES order by default when orderedSectionTypes is not provided', () => {
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

    expect(labelTexts[0]).toContain('Name & Contact')
    expect(labelTexts[1]).toContain('Summary')
    expect(labelTexts[2]).toContain('Experience')
    expect(labelTexts).toHaveLength(10)
  })

  it('uses orderedSectionTypes prop for custom display order', () => {
    const customOrder: SectionType[] = ['experience', 'name_contact', 'summary', 'education']
    const wrapper = mount(SectionToggles, {
      props: {
        layout: 'standard',
        enabledSections: allEnabled,
        orderedSectionTypes: customOrder,
        columnAssignments: noAssignments,
      },
    })

    const items = wrapper.findAll('li')
    const labelTexts = items.map((el) => el.text())

    expect(labelTexts[0]).toContain('Experience')
    expect(labelTexts[1]).toContain('Name & Contact')
    expect(labelTexts[2]).toContain('Summary')
    expect(labelTexts[3]).toContain('Education')
    expect(labelTexts).toHaveLength(4) // only orderedSectionTypes.length items when provided
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

  it('emits toggle and select when clicking a disabled section label', async () => {
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

    // Should emit toggle first (to enable it), then select (to scroll to it)
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

    // Capture toggle events before clicking
    const items = wrapper.findAll('li')
    const contactItem = items.find((item) =>
      item.text().includes('Contact'),
    )
    const label = contactItem!.find('label')

    const toggleBefore = (wrapper.emitted('toggle') || []).length

    await label.trigger('click')

    // Should emit select for enabled section
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual(['name_contact' as SectionType])

    // Should NOT emit toggle for enabled sections
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
    expect(items[0]!.classes()).not.toContain('opacity-55')
    expect(items[1]!.classes()).toContain('opacity-55')
    const disabledItems = items.filter((item) =>
      item.classes().includes('opacity-55'),
    )
    expect(disabledItems).toHaveLength(9)
  })

  // ── HTML5 Drag-and-Drop tests ───────────────────────────────────

  describe('drag and drop', () => {
    it('sets draggable="true" on enabled sections only', () => {
      const enabled: SectionType[] = ['name_contact', 'summary']
      const wrapper = mount(SectionToggles, {
        props: {
          layout: 'standard',
          enabledSections: enabled,
          columnAssignments: noAssignments,
        },
      })

      const items = wrapper.findAll('li')
      // name_contact (index 0) and summary (index 1) are enabled → draggable
      expect(items[0]!.attributes('draggable')).toBe('true')
      expect(items[1]!.attributes('draggable')).toBe('true')
      // experience (index 2) is disabled → not draggable
      expect(items[2]!.attributes('draggable')).toBe('false')
    })

    it('onDragStart sets dataTransfer.effectAllowed and hides dragged item', async () => {
      const wrapper = mount(SectionToggles, {
        props: {
          layout: 'standard',
          enabledSections: allEnabled,
          columnAssignments: noAssignments,
        },
      })

      const li = wrapper.find('li[draggable="true"]')
      const event = createDragEvent('dragstart')
      li.element.dispatchEvent(event)
      await nextTick()

      // Verify dataTransfer properties were set
      const dt = (event as unknown as { dataTransfer: MockDataTransfer }).dataTransfer
      expect(dt.effectAllowed).toBe('move')
      expect(dt.getData('text/plain')).toBe('name_contact')

      // Verify dragged item gets opacity-50 class
      expect(li.classes()).toContain('opacity-50')
    })

    it('onDragStart prevents dragging disabled sections', () => {
      const enabled: SectionType[] = ['name_contact']
      const wrapper = mount(SectionToggles, {
        props: {
          layout: 'standard',
          enabledSections: enabled,
          columnAssignments: noAssignments,
        },
      })

      // summary is disabled (index 1)
      const disabledLi = wrapper.findAll('li')[1]!
      const event = createDragEvent('dragstart')
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
      disabledLi.element.dispatchEvent(event)

      // preventDefault should be called because the section is not enabled
      expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('onDragOver prevents default and sets dropIndicator (above)', async () => {
      const wrapper = mount(SectionToggles, {
        props: {
          layout: 'standard',
          enabledSections: allEnabled,
          columnAssignments: noAssignments,
        },
      })

      // Simulate dragging "name_contact" (index 0)
      const sourceLi = wrapper.findAll('li')[0]!
      const dragStartEvent = createDragEvent('dragstart')
      sourceLi.element.dispatchEvent(dragStartEvent)
      await nextTick()

      // Drag over "summary" (index 1), cursor in top half
      const targetLi = wrapper.findAll('li')[1]!
      mockRect(targetLi.element, { top: 100, bottom: 140, height: 40 })
      const dragOverEvent = createDragEvent('dragover', { clientY: 110 }) // top half (< 120)
      const preventDefaultSpy = vi.spyOn(dragOverEvent, 'preventDefault')
      targetLi.element.dispatchEvent(dragOverEvent)
      await nextTick()

      expect(preventDefaultSpy).toHaveBeenCalled()
      const dt = (dragOverEvent as unknown as { dataTransfer: MockDataTransfer }).dataTransfer
      expect(dt.dropEffect).toBe('move')

      // Check visual indicator — summary should have border-t-2 (above)
      expect(targetLi.classes()).toContain('border-t-2')
      expect(targetLi.classes()).toContain('border-primary')
    })

    it('onDragOver sets dropIndicator below when cursor is in bottom half', async () => {
      const wrapper = mount(SectionToggles, {
        props: {
          layout: 'standard',
          enabledSections: allEnabled,
          columnAssignments: noAssignments,
        },
      })

      // Simulate dragging "name_contact"
      const sourceLi = wrapper.findAll('li')[0]!
      sourceLi.element.dispatchEvent(createDragEvent('dragstart'))
      await nextTick()

      // Drag over "summary", cursor in bottom half
      const targetLi = wrapper.findAll('li')[1]!
      mockRect(targetLi.element, { top: 100, bottom: 140, height: 40 })
      targetLi.element.dispatchEvent(createDragEvent('dragover', { clientY: 130 })) // bottom half (> 120)
      await nextTick()

      expect(targetLi.classes()).toContain('border-b-2')
      expect(targetLi.classes()).toContain('border-primary')
    })

    it('onDragOver does nothing for disabled sections', () => {
      const enabled: SectionType[] = ['name_contact', 'summary']
      const wrapper = mount(SectionToggles, {
        props: {
          layout: 'standard',
          enabledSections: enabled,
          columnAssignments: noAssignments,
        },
      })

      // Start drag on name_contact
      const sourceLi = wrapper.findAll('li')[0]!
      sourceLi.element.dispatchEvent(createDragEvent('dragstart'))

      // Try to drag over "experience" (disabled, index 2)
      const disabledLi = wrapper.findAll('li')[2]!
      mockRect(disabledLi.element, { top: 200, bottom: 240, height: 40 })
      const dragOverEvent = createDragEvent('dragover', { clientY: 210 })
      const preventDefaultSpy = vi.spyOn(dragOverEvent, 'preventDefault')
      disabledLi.element.dispatchEvent(dragOverEvent)

      // preventDefault should NOT be called (drop not allowed on disabled)
      expect(preventDefaultSpy).not.toHaveBeenCalled()
      // No indicator classes
      expect(disabledLi.classes()).not.toContain('border-t-2')
      expect(disabledLi.classes()).not.toContain('border-b-2')
    })

    it('onDragOver skips indicator when dragging over self', () => {
      const wrapper = mount(SectionToggles, {
        props: {
          layout: 'standard',
          enabledSections: allEnabled,
          columnAssignments: noAssignments,
        },
      })

      const li = wrapper.findAll('li')[0]!
      li.element.dispatchEvent(createDragEvent('dragstart'))

      // Drag over same element
      const dragOverEvent = createDragEvent('dragover')
      // preventDefault should NOT be called for self
      const preventDefaultSpy = vi.spyOn(dragOverEvent, 'preventDefault')
      li.element.dispatchEvent(dragOverEvent)

      expect(preventDefaultSpy).not.toHaveBeenCalled()
    })

    it('onDragLeave clears indicator when leaving the element', async () => {
      const wrapper = mount(SectionToggles, {
        props: {
          layout: 'standard',
          enabledSections: allEnabled,
          columnAssignments: noAssignments,
        },
      })

      // Start drag
      const sourceLi = wrapper.findAll('li')[0]!
      sourceLi.element.dispatchEvent(createDragEvent('dragstart'))
      await nextTick()

      // Drag over summary to set indicator
      const targetLi = wrapper.findAll('li')[1]!
      mockRect(targetLi.element, { top: 100, bottom: 140, height: 40 })
      targetLi.element.dispatchEvent(createDragEvent('dragover', { clientY: 110 }))
      await nextTick()
      expect(targetLi.classes()).toContain('border-t-2')

      // Leave summary (relatedTarget is outside)
      const leaveEvent = createDragEvent('dragleave', { relatedTarget: document.body })
      targetLi.element.dispatchEvent(leaveEvent)
      await nextTick()

      // Indicator should be cleared
      expect(targetLi.classes()).not.toContain('border-t-2')
      expect(targetLi.classes()).not.toContain('border-b-2')
    })

    it('onDragLeave does not clear when moving to a child element', async () => {
      const wrapper = mount(SectionToggles, {
        props: {
          layout: 'standard',
          enabledSections: allEnabled,
          columnAssignments: noAssignments,
        },
      })

      // Start drag
      const sourceLi = wrapper.findAll('li')[0]!
      sourceLi.element.dispatchEvent(createDragEvent('dragstart'))
      await nextTick()

      // Drag over summary to set indicator
      const targetLi = wrapper.findAll('li')[1]!
      mockRect(targetLi.element, { top: 100, bottom: 140, height: 40 })
      targetLi.element.dispatchEvent(createDragEvent('dragover', { clientY: 110 }))
      await nextTick()
      expect(targetLi.classes()).toContain('border-t-2')

      // Leave to a child element (the label span inside the li)
      const childEl = targetLi.find('label').element
      const leaveEvent = createDragEvent('dragleave', { relatedTarget: childEl })
      targetLi.element.dispatchEvent(leaveEvent)
      await nextTick()

      // Indicator should STILL be present (not cleared)
      expect(targetLi.classes()).toContain('border-t-2')
    })

    it('onDrop reorders sections when dropping above target', () => {
      const enabledSections: SectionType[] = ['name_contact', 'summary', 'experience', 'education']
      const wrapper = mount(SectionToggles, {
        props: {
          layout: 'standard',
          enabledSections,
          columnAssignments: noAssignments,
        },
      })

      // Simulate dragging name_contact (index 0)
      const sourceLi = wrapper.findAll('li')[0]!
      sourceLi.element.dispatchEvent(createDragEvent('dragstart'))

      // Drag over experience (index 2 in li list), cursor in top half
      const targetLi = wrapper.findAll('li')[2]!
      mockRect(targetLi.element, { top: 200, bottom: 240, height: 40 })
      targetLi.element.dispatchEvent(createDragEvent('dragover', { clientY: 210 }))

      // Drop on experience
      const dropEvent = createDragEvent('drop', { clientY: 210 })
      targetLi.element.dispatchEvent(dropEvent)

      // Should emit reorder with name_contact moved before experience
      expect(wrapper.emitted('reorder')).toBeTruthy()
      const reorderPayload = wrapper.emitted('reorder')![0]![0] as SectionType[]
      // name_contact was index 0, experience was index 2.
      // Drop above experience → name_contact goes to index 1 (before experience)
      // New order: summary, name_contact, experience, education
      expect(reorderPayload).toEqual(['summary', 'name_contact', 'experience', 'education'])
    })

    it('onDrop reorders sections when dropping below target', () => {
      const enabledSections: SectionType[] = ['name_contact', 'summary', 'experience', 'education']
      const wrapper = mount(SectionToggles, {
        props: {
          layout: 'standard',
          enabledSections,
          columnAssignments: noAssignments,
        },
      })

      // Simulate dragging name_contact
      const sourceLi = wrapper.findAll('li')[0]!
      sourceLi.element.dispatchEvent(createDragEvent('dragstart'))

      // Drag over experience, cursor in bottom half
      const targetLi = wrapper.findAll('li')[2]!
      mockRect(targetLi.element, { top: 200, bottom: 240, height: 40 })
      targetLi.element.dispatchEvent(createDragEvent('dragover', { clientY: 230 }))

      // Drop below experience
      targetLi.element.dispatchEvent(createDragEvent('drop', { clientY: 230 }))

      const reorderPayload = wrapper.emitted('reorder')![0]![0] as SectionType[]
      // name_contact was index 0, experience was index 2.
      // Drop below experience → name_contact goes after experience
      // New order: summary, experience, name_contact, education
      expect(reorderPayload).toEqual(['summary', 'experience', 'name_contact', 'education'])
    })

    it('onDrop does nothing on disabled sections', () => {
      const enabledSections: SectionType[] = ['name_contact', 'summary']
      const wrapper = mount(SectionToggles, {
        props: {
          layout: 'standard',
          enabledSections,
          columnAssignments: noAssignments,
        },
      })

      // Start drag on name_contact
      const sourceLi = wrapper.findAll('li')[0]!
      sourceLi.element.dispatchEvent(createDragEvent('dragstart'))

      // Try to drop on disabled experience section
      const disabledLi = wrapper.findAll('li')[2]!
      disabledLi.element.dispatchEvent(createDragEvent('drop'))

      // Should not emit reorder
      expect(wrapper.emitted('reorder')).toBeFalsy()
    })

    it('onDrop does nothing when dropping on self', () => {
      const wrapper = mount(SectionToggles, {
        props: {
          layout: 'standard',
          enabledSections: allEnabled,
          columnAssignments: noAssignments,
        },
      })

      // Start drag on name_contact
      const li = wrapper.findAll('li')[0]!
      li.element.dispatchEvent(createDragEvent('dragstart'))

      // Drop on same element
      li.element.dispatchEvent(createDragEvent('drop'))

      expect(wrapper.emitted('reorder')).toBeFalsy()
    })

    it('onDragEnd cleans up dragType and dropIndicator', async () => {
      const wrapper = mount(SectionToggles, {
        props: {
          layout: 'standard',
          enabledSections: allEnabled,
          columnAssignments: noAssignments,
        },
      })

      // Start drag
      const sourceLi = wrapper.findAll('li')[0]!
      sourceLi.element.dispatchEvent(createDragEvent('dragstart'))
      await nextTick()
      expect(sourceLi.classes()).toContain('opacity-50')

      // Set a drop indicator
      const targetLi = wrapper.findAll('li')[1]!
      mockRect(targetLi.element, { top: 100, bottom: 140, height: 40 })
      targetLi.element.dispatchEvent(createDragEvent('dragover', { clientY: 110 }))
      await nextTick()
      expect(targetLi.classes()).toContain('border-t-2')

      // Fire dragend on source
      sourceLi.element.dispatchEvent(createDragEvent('dragend'))
      await nextTick()

      // All visual state cleaned up
      expect(sourceLi.classes()).not.toContain('opacity-50')
      expect(targetLi.classes()).not.toContain('border-t-2')
    })

    it('integrates with store reorderSections via emit', () => {
      // This test verifies the emitted payload is compatible with
      // reorderSections in resume.ts (which expects SectionType[]).
      const enabledSections: SectionType[] = ['experience', 'education', 'hard_skills']
      const wrapper = mount(SectionToggles, {
        props: {
          layout: 'standard',
          enabledSections,
          columnAssignments: noAssignments,
        },
      })

      // Drag experience (li index 2, enabled index 0) below hard_skills (li index 4, enabled index 2)
      const sourceLi = wrapper.findAll('li')[2]! // experience
      sourceLi.element.dispatchEvent(createDragEvent('dragstart'))

      const targetLi = wrapper.findAll('li')[4]! // hard_skills
      mockRect(targetLi.element, { top: 400, bottom: 440, height: 40 })
      targetLi.element.dispatchEvent(createDragEvent('dragover', { clientY: 430 })) // bottom half

      targetLi.element.dispatchEvent(createDragEvent('drop', { clientY: 430 }))

      const reorderPayload = wrapper.emitted('reorder')![0]![0] as SectionType[]
      // experience moves after hard_skills → [education, hard_skills, experience]
      expect(reorderPayload).toEqual(['education', 'hard_skills', 'experience'])
    })
  })
})
