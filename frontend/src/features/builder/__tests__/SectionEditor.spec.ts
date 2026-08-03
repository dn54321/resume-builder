import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useResumeStore } from '@/features/builder/stores/resume'
import SectionEditor from '@/features/builder/components/SectionEditor.vue'
import { SECTION_TYPES, SECTION_LABELS } from '@/features/builder/types/resume'

describe('SectionEditor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useResumeStore()
    store.initializeDefaults()
  })

  /**
   *
   * @param props
   * @param props.selectedSectionId
   */
  function mountEditor(props: { selectedSectionId?: string | null } = {}) {
    return mount(SectionEditor, {
      props: {
        selectedSectionId: props.selectedSectionId ?? null,
      },
    })
  }

  describe('rendering', () => {
    it('renders all enabled sections stacked vertically', async () => {
      const wrapper = mountEditor()
      await flushPromises()

      // By default all 10 sections are enabled
      const headers = wrapper.findAll('button[aria-label]')
      expect(headers).toHaveLength(10)

      for (const sectionType of SECTION_TYPES) {
        expect(wrapper.text()).toContain(SECTION_LABELS[sectionType])
      }
    })

    it('shows empty state when no sections are enabled', async () => {
      const store = useResumeStore()
      // Disable all sections
      for (const sectionType of SECTION_TYPES) {
        store.toggleSection(sectionType)
      }

      const wrapper = mountEditor()
      await flushPromises()

      expect(wrapper.text()).toContain('Enable sections from the sidebar to start editing')
      const headers = wrapper.findAll('button[aria-label]')
      expect(headers).toHaveLength(0)
    })

    it('only renders enabled sections', async () => {
      const store = useResumeStore()
      // Disable all except name_contact and summary
      for (const sectionType of SECTION_TYPES) {
        if (sectionType !== 'name_contact' && sectionType !== 'summary') {
          store.toggleSection(sectionType)
        }
      }

      const wrapper = mountEditor()
      await flushPromises()

      const headers = wrapper.findAll('button[aria-label]')
      expect(headers).toHaveLength(2)
      expect(wrapper.text()).toContain('Name & Contact')
      expect(wrapper.text()).toContain('Summary')
      expect(wrapper.text()).not.toContain('Experience')
    })

    it('renders each section with a colored header accent', async () => {
      const wrapper = mountEditor()
      await flushPromises()

      const headers = wrapper.findAll('button[aria-label]')

      for (const header of headers) {
        // Each header should have the blue left border accent class
        expect(header.classes()).toContain('border-l-4')
        expect(header.classes()).toContain('border-primary')
      }
    })

    it('renders each section header with the section name', async () => {
      const wrapper = mountEditor()
      await flushPromises()

      const headers = wrapper.findAll('button[aria-label]')
      const headerTexts = headers.map((h) => h.text())

      for (const sectionType of SECTION_TYPES) {
        const label = SECTION_LABELS[sectionType]
        const found = headerTexts.some((t) => t.includes(label))
        expect(found).toBe(true)
      }
    })
  })

  describe('collapse/expand', () => {
    it('starts with all sections expanded', async () => {
      const wrapper = mountEditor()
      await flushPromises()

      const headers = wrapper.findAll('button[aria-label]')
      for (const header of headers) {
        expect(header.attributes('aria-expanded')).toBe('true')
      }
    })

    it('collapses a section when header is clicked', async () => {
      const wrapper = mountEditor()
      await flushPromises()

      const headers = wrapper.findAll('button[aria-label]')
      // Click the first section header (name_contact)
      await headers[0]!.trigger('click')

      expect(headers[0]!.attributes('aria-expanded')).toBe('false')

      // The chevron should NOT have rotate-180 (collapsed = pointing down)
      const chevron = headers[0]!.find('span:last-child')
      expect(chevron.classes()).not.toContain('rotate-180')
    })

    it('expands a collapsed section when header is clicked again', async () => {
      const wrapper = mountEditor()
      await flushPromises()

      const headers = wrapper.findAll('button[aria-label]')

      // Collapse first
      await headers[0]!.trigger('click')
      expect(headers[0]!.attributes('aria-expanded')).toBe('false')

      // Expand again
      await headers[0]!.trigger('click')
      expect(headers[0]!.attributes('aria-expanded')).toBe('true')
    })

    it('toggles sections independently', async () => {
      const wrapper = mountEditor()
      await flushPromises()

      const headers = wrapper.findAll('button[aria-label]')

      // Collapse first section
      await headers[0]!.trigger('click')
      expect(headers[0]!.attributes('aria-expanded')).toBe('false')
      expect(headers[1]!.attributes('aria-expanded')).toBe('true')

      // Collapse second section
      await headers[1]!.trigger('click')
      expect(headers[0]!.attributes('aria-expanded')).toBe('false')
      expect(headers[1]!.attributes('aria-expanded')).toBe('false')

      // Expand first section back
      await headers[0]!.trigger('click')
      expect(headers[0]!.attributes('aria-expanded')).toBe('true')
      expect(headers[1]!.attributes('aria-expanded')).toBe('false')
    })

    it('hides editor content when collapsed', async () => {
      const wrapper = mountEditor()
      await flushPromises()

      const headers = wrapper.findAll('button[aria-label]')

      // Find the content div (the .bg-surface div sibling of the header button)
      const firstSectionContainer = headers[0]!.element.parentElement!
      const contentDivs = firstSectionContainer.querySelectorAll('.bg-surface')
      expect(contentDivs.length).toBeGreaterThanOrEqual(1)

      // Collapse it
      await headers[0]!.trigger('click')

      // v-show should set display: none
      const contentDiv = contentDivs[0] as HTMLElement
      expect(contentDiv.style.display).toBe('none')
    })
  })

  describe('scroll-to behavior', () => {
    it('calls scrollIntoView when selectedSectionId changes to a valid section', async () => {
      const scrollMock = vi.fn<() => void>()
      Element.prototype.scrollIntoView = scrollMock

      const wrapper = mountEditor({ selectedSectionId: null })
      await flushPromises()

      // Change selectedSectionId
      await wrapper.setProps({ selectedSectionId: 'experience' })
      await flushPromises()

      expect(scrollMock).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      })
    })

    it('does not call scrollIntoView when selectedSectionId is null', async () => {
      const scrollMock = vi.fn<() => void>()
      Element.prototype.scrollIntoView = scrollMock

      const wrapper = mountEditor({ selectedSectionId: 'name_contact' })
      await flushPromises()

      // Reset mock to clear initial watcher invocation
      scrollMock.mockClear()

      await wrapper.setProps({ selectedSectionId: null })
      await flushPromises()

      expect(scrollMock).not.toHaveBeenCalled()
    })

    it('scrolls to the correct section element', async () => {
      const scrollIntoViewCalls: Element[] = []
      const originalScrollIntoView = Element.prototype.scrollIntoView
      Element.prototype.scrollIntoView = function (
        this: Element,
        arg?: boolean | ScrollIntoViewOptions,
      ): void {
        scrollIntoViewCalls.push(this)
        return originalScrollIntoView.call(this, arg)
      }

      const wrapper = mountEditor({ selectedSectionId: null })
      await flushPromises()

      // Set to 'certifications' (a section near the end)
      await wrapper.setProps({ selectedSectionId: 'certifications' })
      await flushPromises()

      expect(scrollIntoViewCalls.length).toBeGreaterThanOrEqual(1)
      // The element that scrollIntoView was called on should contain 'Certifications' text
      const calledOn = scrollIntoViewCalls[0]!
      expect(calledOn.textContent).toContain('Certifications')

      // Restore
      Element.prototype.scrollIntoView = originalScrollIntoView
    })
  })
})
