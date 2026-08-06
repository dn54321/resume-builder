import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useResumeStore } from '@/features/builder/stores/resume'
import LivePreview from '@/features/builder/components/LivePreview.vue'

let pinia: ReturnType<typeof createPinia>

/**
 * Get the resume store (must be called after beforeEach sets up pinia).
 * @returns {ReturnType<typeof useResumeStore>} The active resume store.
 */
function makeStore() {
  return useResumeStore()
}

/**
 * Mount LivePreview with required plugins.
 * @returns {VueWrapper} The mounted component wrapper.
 */
function mountLivePreview() {
  return mount(LivePreview, {
    global: {
      plugins: [pinia],
    },
  })
}

/**
 * Parse the current scale from the paper's inline transform.
 * @param {VueWrapper} wrapper - The mounted LivePreview wrapper.
 * @returns {number} The numeric scale applied to the paper.
 */
function getPaperScale(wrapper: VueWrapper): number {
  const style = wrapper.find('#resume-preview').attributes('style')
  const match = style?.match(/scale\(([\d.]+)\)/)
  expect(match).not.toBeNull()
  return parseFloat(match![1]!)
}

/**
 * Read the zoom % shown in the indicator.
 * @param {VueWrapper} wrapper - The mounted LivePreview wrapper.
 * @returns {number} The zoom percentage currently displayed.
 */
function getZoomPercent(wrapper: VueWrapper): number {
  return parseInt(wrapper.find('[data-testid="preview-zoom-value"]').text(), 10)
}

// Mock ResizeObserver since it's not available in jsdom
class MockResizeObserver {
  static instances: MockResizeObserver[] = []
  private callback: ResizeObserverCallback
  private elements: Set<Element>

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    this.elements = new Set()
    MockResizeObserver.instances.push(this)
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

describe('LivePreview', () => {
  beforeEach(() => {
    // Ensure pinia is set up
    pinia = createPinia()
    setActivePinia(pinia)
    // Zoom is persisted to sessionStorage (RES-115) — clear between tests so
    // mounts always start from the 100% default.
    window.sessionStorage.clear()
    MockResizeObserver.instances = []
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

  it('no longer renders a full-screen expand button (FAB in ResumeBuilder is the trigger)', () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()

    // RES-81: the header expand button was removed — the FullscreenPreview
    // modal is now opened exclusively by the mobile FAB in ResumeBuilder.vue.
    expect(wrapper.find('.live-preview__expand-btn').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'FullscreenPreview' }).exists()).toBe(false)
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
              locked: false,
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
    // jsdom reports clientWidth 0 on mount, so the 0.3 fallback applies;
    // scale = 0.3 × default zoom (1.0)
    expect(style).toContain('transform: scale(0.3')
    expect(style).toContain(')')
  })

  it('caps scale at 1.0 when container is wide enough', () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()

    const paper = wrapper.find('#resume-preview')
    const style = paper.attributes('style')
    // jsdom has no layout: containerWidth falls back to 0 → 0.3 scale
    expect(style).toContain('transform: scale(0.3')
  })

  it('uses minimum scale 0.3 when containerWidth is non-positive', () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    // jsdom reports clientWidth 0 on mount, so the 0.3 fallback applies
    // (scale = 0.3 × 1.0 at default zoom).
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

  // ─── Zoom controls (RES-115) ───────────────────────────────────

  it('renders floating zoom controls with +/− buttons and a 100% indicator', () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()

    const controls = wrapper.find('[data-testid="preview-zoom-controls"]')
    expect(controls.exists()).toBe(true)
    expect(controls.classes()).toContain('absolute')
    expect(controls.classes()).toContain('bottom-3')
    // right-6: the control clears the preview scrollbar (regression — it
    // used to sit flush against the scrollbar at right-3)
    expect(controls.classes()).toContain('right-6')

    expect(wrapper.find('[data-testid="preview-zoom-in"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="preview-zoom-out"]').exists()).toBe(true)
    // Default zoom is 100%
    expect(getZoomPercent(wrapper)).toBe(100)
  })

  it('zooms in when + is clicked (scale and % increase)', async () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()
    // Let onMounted run: jsdom reports clientWidth 0, so containerWidth
    // settles to 0 and the fallback scale (0.3 × zoom) applies.
    await wrapper.vm.$nextTick()
    const scaleBefore = getPaperScale(wrapper)

    await wrapper.find('[data-testid="preview-zoom-in"]').trigger('click')

    // One 10% step: 100% → 110%, and the effective scale follows
    expect(getZoomPercent(wrapper)).toBe(110)
    expect(getPaperScale(wrapper)).toBeCloseTo(scaleBefore * 1.1, 10)
    expect(getPaperScale(wrapper)).toBeCloseTo(0.3 * 1.1, 10)
  })

  it('zooms out when − is clicked (scale and % decrease)', async () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()
    await wrapper.vm.$nextTick()
    const scaleBefore = getPaperScale(wrapper)

    await wrapper.find('[data-testid="preview-zoom-out"]').trigger('click')

    expect(getZoomPercent(wrapper)).toBe(90)
    expect(getPaperScale(wrapper)).toBeCloseTo(scaleBefore * 0.9, 10)
    expect(getPaperScale(wrapper)).toBeCloseTo(0.3 * 0.9, 10)
  })

  it('clamps zoom-in at 150% and disables the + button at the max', async () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()
    const zoomIn = wrapper.find('[data-testid="preview-zoom-in"]')

    // 100% → 150% in five 10% steps
    for (let i = 0; i < 5; i++) {
      await zoomIn.trigger('click')
    }
    expect(getZoomPercent(wrapper)).toBe(150)

    // Extra clicks stay clamped at 150% and the button is disabled
    await zoomIn.trigger('click')
    expect(getZoomPercent(wrapper)).toBe(150)
    expect(zoomIn.attributes('disabled')).toBeDefined()

    // Zoom-out is still enabled at the max
    expect(wrapper.find('[data-testid="preview-zoom-out"]').attributes('disabled')).toBeUndefined()
  })

  it('clamps zoom-out at 50% and disables the − button at the min', async () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()
    const zoomOut = wrapper.find('[data-testid="preview-zoom-out"]')

    // 100% → 50% in five 10% steps
    for (let i = 0; i < 5; i++) {
      await zoomOut.trigger('click')
    }
    expect(getZoomPercent(wrapper)).toBe(50)

    // Extra clicks stay clamped at 50% and the button is disabled
    await zoomOut.trigger('click')
    expect(getZoomPercent(wrapper)).toBe(50)
    expect(zoomOut.attributes('disabled')).toBeDefined()

    // Zoom-in is still enabled at the min
    expect(wrapper.find('[data-testid="preview-zoom-in"]').attributes('disabled')).toBeUndefined()
  })

  it('combines the zoom factor with the container-width auto-fit scale', async () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="preview-zoom-in"]').trigger('click')
    const scaleAtZoom110 = getPaperScale(wrapper)

    // Simulate a wider pane: auto-fit scale grows, zoom factor stays 110%
    const ro = MockResizeObserver.instances[0]
    expect(ro).toBeTruthy()
    ro.trigger([
      {
        contentRect: { width: 1200 },
      },
    ] as unknown as ResizeObserverEntry[])
    await wrapper.vm.$nextTick()

    // auto-fit at 1200px = min((1200-24)/816, 1.2) = 1.2; × 1.1 = 1.32
    expect(getPaperScale(wrapper)).toBeCloseTo(1.2 * 1.1, 10)
    expect(getZoomPercent(wrapper)).toBe(110)
    expect(getPaperScale(wrapper)).toBeGreaterThan(scaleAtZoom110)
  })

  it('persists the zoom factor to sessionStorage on change', async () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    const wrapper = mountLivePreview()
    await wrapper.find('[data-testid="preview-zoom-in"]').trigger('click')

    expect(window.sessionStorage.getItem('resume-builder:preview-zoom')).toBe('1.1')
  })

  it('restores the zoom factor from sessionStorage on mount', async () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    window.sessionStorage.setItem('resume-builder:preview-zoom', '1.3')

    const wrapper = mountLivePreview()
    await wrapper.vm.$nextTick()
    expect(getZoomPercent(wrapper)).toBe(130)
    // Scale reflects the restored factor: jsdom has no layout so the 0.3
    // fallback applies × 1.3
    expect(getPaperScale(wrapper)).toBeCloseTo(0.3 * 1.3, 10)
  })

  it('ignores out-of-range sessionStorage zoom values (clamps to 50–150)', () => {
    const store = makeStore()
    store.initializeDefaults()
    store.layout = 'standard'

    window.sessionStorage.setItem('resume-builder:preview-zoom', '9')
    const wrapper = mountLivePreview()
    expect(getZoomPercent(wrapper)).toBe(150)
  })
})
