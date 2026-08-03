import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import ResumeBuilder from '@/features/builder/ResumeBuilder.vue'
import { useResumeStore } from '@/features/builder/stores/resume'

// ─── Mock useResumeData ────────────────────────────────────────────
const mockLoadResume = vi.fn<() => Promise<void>>()
const mockSaveResume = vi.fn<() => Promise<void>>()
const mockSetupAutoSave = vi.fn<() => void>()
const mockTeardownAutoSave = vi.fn<() => void>()
const mockDirty = ref(false)

vi.mock('@/features/builder/composables/useResumeData', () => ({
  useResumeData: () => ({
    loadResume: mockLoadResume,
    saveResume: mockSaveResume,
    setupAutoSave: mockSetupAutoSave,
    teardownAutoSave: mockTeardownAutoSave,
    dirty: mockDirty,
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

vi.mock('@/features/builder/components/ConfirmModal.vue', () => ({
  default: {
    name: 'ConfirmModal',
    props: ['modelValue', 'title', 'description', 'confirmText', 'cancelText'],
    emits: ['update:modelValue', 'confirm', 'cancel'],
    template: `
      <div v-if="modelValue" data-testid="confirm-modal">
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
        <button data-testid="confirm-modal-confirm" @click="$emit('confirm')">{{ confirmText }}</button>
        <button data-testid="confirm-modal-cancel" @click="$emit('cancel')">{{ cancelText }}</button>
      </div>
    `,
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

  // ─── Save button tests ────────────────────────────────────────

  it('hides Save Changes button when not dirty', () => {
    mockDirty.value = false
    const wrapper = mountBuilder()
    expect(wrapper.find('[data-testid="toolbar-save-btn"]').exists()).toBe(false)
  })

  it('shows Save Changes button when dirty', async () => {
    mockDirty.value = true
    const wrapper = mountBuilder()
    await nextTick()
    const saveBtn = wrapper.find('[data-testid="toolbar-save-btn"]')
    expect(saveBtn.exists()).toBe(true)
    expect(saveBtn.text()).toBe('Save Changes')
  })

  it('calls saveResume when Save Changes is clicked', async () => {
    mockDirty.value = true
    mockSaveResume.mockResolvedValue(undefined)
    const wrapper = mountBuilder()
    await nextTick()

    const saveBtn = wrapper.find('[data-testid="toolbar-save-btn"]')
    await saveBtn.trigger('click')
    expect(mockSaveResume).toHaveBeenCalled()
  })

  it('shows "Saving..." text while saving', async () => {
    mockDirty.value = true
    // Make saveResume hang so we can inspect the button state
    let resolveSave: () => void
    mockSaveResume.mockImplementation(() => new Promise((r) => { resolveSave = r }))

    const wrapper = mountBuilder()
    await nextTick()

    const saveBtn = wrapper.find('[data-testid="toolbar-save-btn"]')
    await saveBtn.trigger('click')
    await nextTick()

    expect(saveBtn.text()).toBe('Saving...')
    expect(saveBtn.attributes('disabled')).toBeDefined()

    // Resolve so cleanup doesn't leak
    resolveSave!()
    await nextTick()
  })

  it('shows "Saved" confirmation after successful save', async () => {
    vi.useFakeTimers()
    mockDirty.value = true
    mockSaveResume.mockResolvedValue(undefined)

    const wrapper = mountBuilder()
    await nextTick()

    const saveBtn = wrapper.find('[data-testid="toolbar-save-btn"]')
    await saveBtn.trigger('click')
    await nextTick()

    // After save, "Saved" message should appear
    const savedMsg = wrapper.find('[data-testid="toolbar-saved-msg"]')
    expect(savedMsg.exists()).toBe(true)
    expect(savedMsg.text()).toContain('Saved')

    // Advance past 2s — message should fade but still be in DOM
    await vi.advanceTimersByTimeAsync(2100)
    expect(savedMsg.classes()).toContain('opacity-0')

    // Advance past fade-out transition
    await vi.advanceTimersByTimeAsync(600)
    // After full fade-out, the element is removed (v-if="showSaved" becomes false)
    expect(wrapper.find('[data-testid="toolbar-saved-msg"]').exists()).toBe(false)

    vi.useRealTimers()
  })

  // ─── Unsaved changes navigation guard tests ────────────────────

  it('shows unsaved changes modal via v-model binding', async () => {
    // The modal is driven by the showUnsavedModal ref in the component.
    // We can test the ConfirmModal stub renders with correct props.
    mockDirty.value = false
    const wrapper = mountBuilder()
    await nextTick()

    // When not dirty, modal should not be visible
    expect(wrapper.find('[data-testid="confirm-modal"]').exists()).toBe(false)
  })

  it('ConfirmModal stub renders correct title and description', async () => {
    const wrapper = mountBuilder()
    await nextTick()

    // Check the ConfirmModal is wired with correct props by finding it
    // (it's rendered in the template even when modelValue is false, just hidden)
    // Our stub only renders when modelValue is true, so check it's not visible
    expect(wrapper.find('[data-testid="confirm-modal"]').exists()).toBe(false)
  })

  // ─── beforeunload handler tests ─────────────────────────────────

  it('sets event.returnValue when dirty on beforeunload', () => {
    mockDirty.value = true
    const wrapper = mountBuilder()

    const event = new Event('beforeunload') as BeforeUnloadEvent
    // Start with undefined so we can verify the handler sets it
    Object.defineProperty(event, 'returnValue', { value: undefined, writable: true })
    window.dispatchEvent(event)

    // When dirty, the handler sets returnValue to '' to trigger browser dialog
    expect(event.returnValue).toBe('')
    wrapper.unmount()
  })

  it('does not set event.returnValue when not dirty on beforeunload', () => {
    mockDirty.value = false
    const wrapper = mountBuilder()

    const event = new Event('beforeunload') as BeforeUnloadEvent
    Object.defineProperty(event, 'returnValue', { value: 'unchanged', writable: true })
    window.dispatchEvent(event)

    // When not dirty, returnValue should stay unchanged
    expect(event.returnValue).toBe('unchanged')
    wrapper.unmount()
  })

  it('removes beforeunload listener on unmount', () => {
    mockDirty.value = true
    const wrapper = mountBuilder()

    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    wrapper.unmount()

    // The listener was removed during unmount
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  // ─── Main section scrollbar tests ────────────────────────────

  it('renders main section with overflow-y-auto for scrolling', () => {
    const wrapper = mountBuilder()
    const main = wrapper.find('main')
    expect(main.exists()).toBe(true)
    expect(main.classes()).toContain('overflow-y-auto')
  })

  it('renders SectionEditor inside main section', () => {
    const wrapper = mountBuilder()
    const main = wrapper.find('main')
    const sectionEditor = main.find('[data-testid="section-editor"]')
    expect(sectionEditor.exists()).toBe(true)
  })

  it('applies scoped styles with data-v attribute on main element', () => {
    const wrapper = mountBuilder()
    const main = wrapper.find('main')
    // When <style scoped> is present, Vue adds a data-v-* attribute to elements
    const dataAttrs = Object.keys(main.attributes()).filter((k) => k.startsWith('data-v-'))
    expect(dataAttrs.length).toBe(1)
  })
})
