import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import ResumeBuilder from '@/features/builder/ResumeBuilder.vue'
import { useResumeStore } from '@/features/builder/stores/resume'

// ─── Mock useResumeData ────────────────────────────────────────────
const mockLoadResume = vi.fn<() => Promise<void>>()
const mockSetupAutoSave = vi.fn<() => void>()
const mockTeardownAutoSave = vi.fn<() => void>()

vi.mock('@/features/builder/composables/useResumeData', () => ({
  useResumeData: () => ({
    loadResume: mockLoadResume,
    setupAutoSave: mockSetupAutoSave,
    teardownAutoSave: mockTeardownAutoSave,
  }),
}))

// ─── Mock useAuth ──────────────────────────────────────────────────
vi.mock('@/features/auth/composables/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
  }),
}))

// ─── Mock useTailor ────────────────────────────────────────────────
const mockIsTailoring = ref(false)
const mockTailorError = ref<string | null>(null)
const mockTailorResume = vi.fn<(jd: string) => Promise<void>>()
const mockResetFilter = vi.fn<() => void>()

vi.mock('@/features/builder/composables/useTailor', () => ({
  useTailor: () => ({
    isTailoring: mockIsTailoring,
    tailorError: mockTailorError,
    bulletCap: ref(5),
    isFiltered: false,
    tailorResume: mockTailorResume,
    resetFilter: mockResetFilter,
  }),
}))

// ─── Stub child components ─────────────────────────────────────────
vi.mock('@/features/builder/components/LayoutPicker.vue', () => ({
  default: {
    name: 'LayoutPicker',
    props: ['modelValue'],
    template: '<div data-testid="layout-picker">LayoutPicker</div>',
  },
}))

vi.mock('@/features/builder/components/SectionToggles.vue', () => ({
  default: {
    name: 'SectionToggles',
    template: '<div data-testid="section-toggles">SectionToggles</div>',
  },
}))

vi.mock('@/features/builder/components/SectionEditor.vue', () => ({
  default: {
    name: 'SectionEditor',
    props: ['selectedSectionId'],
    template: '<div data-testid="section-editor">SectionEditor</div>',
  },
}))

vi.mock('@/features/builder/components/JdModal.vue', () => ({
  default: {
    name: 'JdModal',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: `
      <div v-if="modelValue" data-testid="jd-modal">
        <button data-testid="jd-modal-close-stub" @click="$emit('update:modelValue', false)">Close</button>
      </div>
    `,
  },
}))

vi.mock('@/features/builder/components/AnonymousBanner.vue', () => ({
  default: {
    name: 'AnonymousBanner',
    template: '<div data-testid="anonymous-banner">AnonymousBanner</div>',
  },
}))

vi.mock('@/features/builder/components/LivePreview.vue', () => ({
  default: {
    name: 'LivePreview',
    template: '<div data-testid="live-preview">LivePreview</div>',
  },
}))

vi.mock('@/features/builder/components/PdfExportButton.vue', () => ({
  default: {
    name: 'PdfExportButton',
    template: '<div data-testid="pdf-export-btn">PdfExportButton</div>',
  },
}))

describe('ResumeBuilder', () => {
  let pinia: ReturnType<typeof createPinia>

  /**
   *
   */
  function mountBuilder() {
    return mount(ResumeBuilder, {
      global: {
        plugins: [pinia],
      },
    })
  }

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    mockLoadResume.mockResolvedValue(undefined)
    mockIsTailoring.value = false
    mockTailorError.value = null
    mockTailorResume.mockReset()
    mockResetFilter.mockReset()
  })

  it('renders the toolbar with Job Description button', () => {
    const wrapper = mountBuilder()
    const jdBtn = wrapper.find('[data-testid="jd-toolbar-btn"]')
    expect(jdBtn.exists()).toBe(true)
    expect(jdBtn.text()).toBe('Job Description')
  })

  it('renders the Tailor Resume button in toolbar', () => {
    const wrapper = mountBuilder()
    const tailorBtn = wrapper.find('[data-testid="toolbar-tailor-btn"]')
    expect(tailorBtn.exists()).toBe(true)
  })

  it('disables Tailor Resume button when no JD is saved', () => {
    const store = useResumeStore()
    store.jdText = ''

    const wrapper = mountBuilder()
    const tailorBtn = wrapper.find('[data-testid="toolbar-tailor-btn"]')
    expect(tailorBtn.attributes('disabled')).toBeDefined()
  })

  it('shows hint title when Tailor button is disabled', () => {
    const store = useResumeStore()
    store.jdText = ''

    const wrapper = mountBuilder()
    const tailorBtn = wrapper.find('[data-testid="toolbar-tailor-btn"]')
    expect(tailorBtn.attributes('title')).toBe('Save a job description first')
  })

  it('enables Tailor Resume button when JD is saved', () => {
    const store = useResumeStore()
    store.jdText = 'Some JD'

    const wrapper = mountBuilder()
    const tailorBtn = wrapper.find('[data-testid="toolbar-tailor-btn"]')
    expect(tailorBtn.attributes('disabled')).toBeUndefined()
  })

  it('opens JdModal when Job Description button is clicked', async () => {
    const wrapper = mountBuilder()
    const jdBtn = wrapper.find('[data-testid="jd-toolbar-btn"]')

    expect(wrapper.find('[data-testid="jd-modal"]').exists()).toBe(false)

    await jdBtn.trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="jd-modal"]').exists()).toBe(true)
  })

  it('does not render permanent JdInput footer', () => {
    const wrapper = mountBuilder()
    // The old footer should not exist
    const footer = wrapper.find('footer')
    expect(footer.exists()).toBe(false)
  })

  it('does not show Reset Filter button when filter is not active', () => {
    const wrapper = mountBuilder()
    const resetBtn = wrapper.find('[data-testid="toolbar-reset-btn"]')
    expect(resetBtn.exists()).toBe(false)
  })

  it('shows Reset Filter button when filter is active', async () => {
    const store = useResumeStore()
    store.applyTailorFilter({
      filteredBulletIndices: {},
      filteredHardSkills: [],
      filteredSoftSkills: [],
    })

    const wrapper = mountBuilder()
    await nextTick()

    const resetBtn = wrapper.find('[data-testid="toolbar-reset-btn"]')
    expect(resetBtn.exists()).toBe(true)
  })

  it('shows Filtered badge when filter is active', async () => {
    const store = useResumeStore()
    store.applyTailorFilter({
      filteredBulletIndices: {},
      filteredHardSkills: [],
      filteredSoftSkills: [],
    })

    const wrapper = mountBuilder()
    await nextTick()

    const badge = wrapper.find('[data-testid="filtered-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('Filtered')
  })

  it('shows bullet cap info when filter is active', async () => {
    const store = useResumeStore()
    store.applyTailorFilter({
      filteredBulletIndices: {},
      filteredHardSkills: [],
      filteredSoftSkills: [],
    })

    const wrapper = mountBuilder()
    await nextTick()

    expect(wrapper.text()).toContain('Showing relevant bullets')
    expect(wrapper.text()).toContain('max 5 per entry')
  })

  it('hides filter status indicator when filter is not active', () => {
    const wrapper = mountBuilder()
    expect(wrapper.find('[data-testid="filtered-badge"]').exists()).toBe(false)
  })

  it('shows error message when tailorError is set', async () => {
    mockTailorError.value = 'API error'

    const wrapper = mountBuilder()
    await nextTick()

    const error = wrapper.find('[data-testid="toolbar-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toBe('API error')
  })

  it('hides error message when tailorError is null', () => {
    const wrapper = mountBuilder()
    const error = wrapper.find('[data-testid="toolbar-error"]')
    expect(error.exists()).toBe(false)
  })

  it('disables Tailor button when isTailoring is true', async () => {
    mockIsTailoring.value = true
    const store = useResumeStore()
    store.jdText = 'Some JD'

    const wrapper = mountBuilder()
    await nextTick()

    const tailorBtn = wrapper.find('[data-testid="toolbar-tailor-btn"]')
    expect(tailorBtn.attributes('disabled')).toBeDefined()
  })

  it('shows spinner in Tailor button when isTailoring is true', async () => {
    mockIsTailoring.value = true
    const store = useResumeStore()
    store.jdText = 'Some JD'

    const wrapper = mountBuilder()
    await nextTick()

    const spinner = wrapper.find('span[aria-label="Loading"]')
    expect(spinner.exists()).toBe(true)
  })

  it('calls tailorResume when Tailor button is clicked', async () => {
    mockTailorResume.mockResolvedValue(undefined)
    const store = useResumeStore()
    store.jdText = 'React developer'

    const wrapper = mountBuilder()
    await nextTick()

    const tailorBtn = wrapper.find('[data-testid="toolbar-tailor-btn"]')
    await tailorBtn.trigger('click')

    expect(mockTailorResume).toHaveBeenCalledWith('React developer')
  })

  it('calls resetFilter when Reset Filter button is clicked', async () => {
    const store = useResumeStore()
    store.applyTailorFilter({
      filteredBulletIndices: {},
      filteredHardSkills: [],
      filteredSoftSkills: [],
    })

    const wrapper = mountBuilder()
    await nextTick()

    const resetBtn = wrapper.find('[data-testid="toolbar-reset-btn"]')
    await resetBtn.trigger('click')

    expect(mockResetFilter).toHaveBeenCalled()
  })

  it('disables Reset Filter button when isTailoring is true', async () => {
    mockIsTailoring.value = true
    const store = useResumeStore()
    store.applyTailorFilter({
      filteredBulletIndices: {},
      filteredHardSkills: [],
      filteredSoftSkills: [],
    })

    const wrapper = mountBuilder()
    await nextTick()

    const resetBtn = wrapper.find('[data-testid="toolbar-reset-btn"]')
    expect(resetBtn.attributes('disabled')).toBeDefined()
  })

  it('hides filter status when tailorError is set even if filtered', async () => {
    mockTailorError.value = 'Error!'
    const store = useResumeStore()
    store.applyTailorFilter({
      filteredBulletIndices: {},
      filteredHardSkills: [],
      filteredSoftSkills: [],
    })

    const wrapper = mountBuilder()
    await nextTick()

    // Filtered badge should not show when error is present
    expect(wrapper.find('[data-testid="filtered-badge"]').exists()).toBe(false)
    // Error should show instead
    expect(wrapper.find('[data-testid="toolbar-error"]').exists()).toBe(true)
  })

  it('loads resume and sets up auto-save on mount', async () => {
    mountBuilder()
    await nextTick()
    expect(mockLoadResume).toHaveBeenCalled()
    expect(mockSetupAutoSave).toHaveBeenCalled()
  })

  it('tears down auto-save on unmount', () => {
    const wrapper = mountBuilder()
    wrapper.unmount()
    expect(mockTeardownAutoSave).toHaveBeenCalled()
  })
})
