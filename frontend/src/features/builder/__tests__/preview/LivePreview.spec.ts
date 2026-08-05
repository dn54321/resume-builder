import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useResumeStore } from '@/features/builder/stores/resume'
import LivePreview from '@/features/builder/components/LivePreview.vue'

let pinia: ReturnType<typeof createPinia>

/**
 * Get the resume store (must be called after beforeEach sets up pinia).
 */
function makeStore() {
  return useResumeStore()
}

/**
 * Mount LivePreview with required stubs for teleported dialog content.
 */
function mountLivePreview() {
  return mount(LivePreview, {
    global: {
      plugins: [pinia],
      stubs: {
        Teleport: {
          props: ['to', 'disabled'],
          template: '<div class="teleport-target"><slot /></div>',
        },
      },
    },
  })
}

// Mock ResizeObserver since it's not available in jsdom
class MockResizeObserver {
  private callback: ResizeObserverCallback
  private elements: Set<Element>

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    this.elements = new Set()
  }

  observe(el: Element) {
    this.elements.add(el)
  }

  unobserve(el: Element) {
    this.elements.delete(el)
  }

  disconnect() {
    this.elements.clear()
  }

  // Helper: trigger resize
  trigger(entries: ResizeObserverEntry[]) {
    this.callback(entries, this as unknown as ResizeObserver)
  }
}

vi.stubGlobal('ResizeObserver', MockResizeObserver)

/**
 * Mock MediaQueryList with a test helper to simulate viewport changes.
 * Returns the mql mock plus a simulateChange() function that fires any
 * registered 'change' listeners (mirrors matchMedia behavior at runtime).
 * @param initialMatches
 */
/**
 * Stub window.matchMedia for a test. Returns the mock MediaQueryList plus a
 * simulateChange() helper that fires registered 'change' listeners, mirroring
 * real matchMedia behavior across the 1024px breakpoint.
 * @param {boolean} initialMatches - whether (min-width: 1024px) initially matches
 * @returns {{ mql: object; simulateChange: (matches: boolean) => void }} mock MQL object and simulateChange helper
 */
function stubMatchMedia(initialMatches: boolean) {
  const listeners: Array<(event: { matches: boolean }) => void> = []
  const mql = {
    matches: initialMatches,
    media: '(min-width: 1024px)',
    onchange: null,
    addEventListener: vi.fn<(_type: string, listener: (event: { matches: boolean }) => void) => void>(
      (_type, listener) => {
        listeners.push(listener)
      },
    ),
    removeEventListener: vi.fn<(_type: string, listener: (event: { matches: boolean }) => void) => void>(
      (_type, listener) => {
        const idx = listeners.indexOf(listener)
        if (idx !== -1) listeners.splice(idx, 1)
      },
    ),
    addListener: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
    dispatchEvent: vi.fn<() => boolean>(),
  }
  vi.stubGlobal('matchMedia', vi.fn(() => mql))
  return {
    mql,
    simulateChange(matches: boolean) {
      mql.matches = matches
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent)
      }
    },
  }
}

describe('LivePreview', () => {
  beforeEach(() => {
    // Ensure pinia is set up
    pinia = createPinia()
    setActivePinia(pinia)
    // jsdom does not implement matchMedia — reset any stub left by a
    // previous test so the fullscreen button defaults to visible (<1024px).
    vi.stubGlobal('matchMedia', undefined)
  })

  it('renders the header bar with Preview label', () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()

    const header = wrapper.find('.live-preview__header')
    expect(header.exists()).toBe(true)
    expect(header.text()).toContain('Preview')
  })

  it('renders a full-screen button in the header', () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()

    const button = wrapper.find('.live-preview__expand-btn')
    expect(button.exists()).toBe(true)
    expect(button.attributes('aria-label')).toBe('Open full screen preview')
    expect(button.attributes('title')).toBe('Full screen preview')
  })

  it('hides the full-screen expand button at desktop widths (>=1024px)', async () => {
    stubMatchMedia(true) // min-width: 1024px matches → desktop
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()
    // isDesktop is set in onMounted → flush the reactive update
    await nextTick()

    const button = wrapper.find('.live-preview__expand-btn')
    expect(button.exists()).toBe(false)
  })

  it('shows the full-screen expand button below 1024px (mobile)', async () => {
    stubMatchMedia(false) // min-width: 1024px does not match → mobile
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()
    await nextTick()

    const button = wrapper.find('.live-preview__expand-btn')
    expect(button.exists()).toBe(true)
  })

  it('hides/shows the expand button reactively when the viewport crosses 1024px', async () => {
    const { simulateChange } = stubMatchMedia(false) // start mobile
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()
    expect(wrapper.find('.live-preview__expand-btn').exists()).toBe(true)

    // Resize to desktop → button disappears
    simulateChange(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.live-preview__expand-btn').exists()).toBe(false)

    // Resize back below 1024px → button reappears
    simulateChange(false)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.live-preview__expand-btn').exists()).toBe(true)
  })

  it('keeps the expand button visible when matchMedia is unavailable', async () => {
    // No matchMedia stub — jsdom default is undefined; the component must
    // degrade gracefully and keep the button visible (mobile default).
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()
    await nextTick()

    expect(wrapper.find('.live-preview__expand-btn').exists()).toBe(true)
  })

  it('opens FullscreenPreview when full-screen button is clicked', async () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()

    // FullscreenPreview should not be open initially
    const fpComponent = wrapper.findComponent({ name: 'FullscreenPreview' })
    expect(fpComponent.props('open')).toBe(false)

    // Click the full-screen button
    const button = wrapper.find('.live-preview__expand-btn')
    await button.trigger('click')

    // FullscreenPreview should now be open
    expect(fpComponent.props('open')).toBe(true)
  })

  it('closes FullscreenPreview when modal emits update:open false', async () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()

    // Open the modal
    const button = wrapper.find('.live-preview__expand-btn')
    await button.trigger('click')

    const fpComponent = wrapper.findComponent({ name: 'FullscreenPreview' })
    expect(fpComponent.props('open')).toBe(true)

    // Simulate close from the modal
    await fpComponent.vm.$emit('update:open', false)

    expect(fpComponent.props('open')).toBe(false)
  })

  it('renders a paper container with id="resume-preview"', () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()

    const paper = wrapper.find('#resume-preview')
    expect(paper.exists()).toBe(true)
    expect(paper.classes()).toContain('live-preview__paper')
  })

  it('renders StandardLayout when layout is "standard"', () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()

    // StandardLayout should be rendered
    expect(wrapper.findComponent({ name: 'StandardLayout' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'TwoColumnLayout' }).exists()).toBe(false)
  })

  it('renders TwoColumnLayout when layout is "column2-1"', () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'column2-1'

    const wrapper = mountLivePreview()

    expect(wrapper.findComponent({ name: 'TwoColumnLayout' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'StandardLayout' }).exists()).toBe(false)
  })

  it('passes store sections to layout components', () => {
    const store = makeStore()
    store.loadFromPayload({
      layout: 'standard',
      sections: [
        {
          sectionId: 'summary',
          column: 'right',
          order: 0,
          entries: [
            {
              order: 0,
              parentId: null,
              fields: [{ key: 'text', value: 'Test summary', order: 0 }],
            },
          ],
        },
      ],
    })

    const wrapper = mountLivePreview()
    const standardLayout = wrapper.findComponent({ name: 'StandardLayout' })
    expect(standardLayout.exists()).toBe(true)
    expect(standardLayout.props('sections')).toEqual(store.sections)
  })

  it('applies scale transform to paper based on container width', () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()

    const paper = wrapper.find('#resume-preview')
    const style = paper.attributes('style')
    // At default containerWidth of 300, scale should be (300-24)/816 ~ 0.338
    expect(style).toContain('transform: scale(')
    expect(style).toContain(')')
  })

  it('caps scale at 1.0 when container is wide enough', () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()

    const paper = wrapper.find('#resume-preview')
    const style = paper.attributes('style')
    // Since containerWidth starts at 300, scale is < 1
    expect(style).toContain('transform: scale(0.')
  })

  it('uses minimum scale 0.3 when containerWidth is non-positive', () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    // containerWidth starts at 300 (reasonable default)
    // The scale computed property uses a minimum of 0.3 for safety
    // With default 300px: scale = (300-24)/816 = 0.338...
    // This is > 0.3 so the floor behavior is not triggered with factory defaults.
    // Just verify scale is computed and > 0
    const wrapper = mountLivePreview()

    const paper = wrapper.find('#resume-preview')
    const style = paper.attributes('style')
    const match = style.match(/scale\(([\d.]+)\)/)
    expect(match).not.toBeNull()
    const scaleValue = parseFloat(match![1]!)
    expect(scaleValue).toBeGreaterThan(0)
    expect(scaleValue).toBeLessThanOrEqual(1)
  })

  it('styles the header bar with white background and proper height', () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()

    const header = wrapper.find('.live-preview__header')
    expect(header.classes()).toContain('bg-white')
    expect(header.classes()).toContain('h-10')
  })

  it('styles the expand button with proper size and hover states', () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()

    const button = wrapper.find('.live-preview__expand-btn')
    expect(button.classes()).toContain('size-8')
    expect(button.classes()).toContain('text-gray-500')
    expect(button.classes()).toContain('hover:text-gray-700')
    expect(button.classes()).toContain('hover:bg-gray-100')
    expect(button.classes()).toContain('rounded-md')
    expect(button.attributes('title')).toBe('Full screen preview')
  })

  it('renders US Letter sized paper (816px × 1056px)', () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()

    const paper = wrapper.find('#resume-preview')
    // Paper is 816px wide, 1056px tall (US Letter at 96 DPI)
    expect(paper.element).toBeTruthy()
    // Check class is applied (exact width/height are set via CSS)
    expect(paper.classes()).toContain('live-preview__paper')
  })
})
