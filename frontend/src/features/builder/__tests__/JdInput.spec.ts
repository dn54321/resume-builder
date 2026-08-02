import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import JdInput from '@/features/builder/components/JdInput.vue'
import { useResumeStore } from '@/features/builder/stores/resume'

// Mock the useTailor composable with reactive refs
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

describe('JdInput', () => {
  let pinia: ReturnType<typeof createPinia>

  /**
   *
   */
  function mountComponent() {
    return mount(JdInput, {
      global: {
        plugins: [pinia],
      },
    })
  }

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    mockIsTailoring.value = false
    mockTailorError.value = null
    mockTailorResume.mockReset()
    mockResetFilter.mockReset()
  })

  it('renders the title', () => {
    const wrapper = mountComponent()
    expect(wrapper.text()).toContain('Tailor to Job Description')
  })

  it('renders the textarea', () => {
    const wrapper = mountComponent()
    const textarea = wrapper.find('textarea')
    expect(textarea.exists()).toBe(true)
  })

  it('renders Tailor Resume button disabled when textarea is empty', () => {
    const wrapper = mountComponent()
    const btn = wrapper.find('[data-testid="tailor-btn"]')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('enables Tailor Resume button when textarea has content', async () => {
    const wrapper = mountComponent()
    const textarea = wrapper.find('textarea')
    await textarea.setValue('React developer')
    const btn = wrapper.find('[data-testid="tailor-btn"]')
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('shows spinner when isTailoring is true', async () => {
    mockIsTailoring.value = true

    const wrapper = mountComponent()
    const textarea = wrapper.find('textarea')
    await textarea.setValue('React developer')

    const spinner = wrapper.find('span[aria-label="Loading"]')
    expect(spinner.exists()).toBe(true)
  })

  it('disables textarea when isTailoring is true', async () => {
    mockIsTailoring.value = true

    const wrapper = mountComponent()
    const textarea = wrapper.find('textarea')
    expect(textarea.attributes('disabled')).toBeDefined()
  })

  it('shows error message when tailorError is set', async () => {
    mockTailorError.value = 'API error'

    const wrapper = mountComponent()
    const error = wrapper.find('[data-testid="jd-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toBe('API error')
  })

  it('shows info text when filter is active', async () => {
    const store = useResumeStore()
    store.applyTailorFilter({
      filteredBulletIndices: {},
      filteredHardSkills: [],
      filteredSoftSkills: [],
    })

    const wrapper = mountComponent()
    // Should show the filtered info
    expect(wrapper.text()).toContain('Filtered')
    expect(wrapper.text()).toContain('Showing relevant bullets')
  })

  it('shows badge when filter is active', async () => {
    const store = useResumeStore()
    store.applyTailorFilter({
      filteredBulletIndices: {},
      filteredHardSkills: [],
      filteredSoftSkills: [],
    })

    const wrapper = mountComponent()
    expect(wrapper.text()).toContain('Filtered')
  })

  it('calls tailorResume on button click', async () => {
    mockTailorResume.mockResolvedValue(undefined)

    const wrapper = mountComponent()
    const textarea = wrapper.find('textarea')
    await textarea.setValue('React developer')

    const btn = wrapper.find('[data-testid="tailor-btn"]')
    await btn.trigger('click')

    expect(mockTailorResume).toHaveBeenCalledWith('React developer')
  })

  it('calls resetFilter on reset button click', async () => {
    const store = useResumeStore()
    store.applyTailorFilter({
      filteredBulletIndices: {},
      filteredHardSkills: [],
      filteredSoftSkills: [],
    })

    const wrapper = mountComponent()
    const resetBtn = wrapper.find('[data-testid="reset-btn"]')
    expect(resetBtn.exists()).toBe(true)

    await resetBtn.trigger('click')
    expect(mockResetFilter).toHaveBeenCalled()
  })

  it('hides Reset Filter button when filter is not active', () => {
    const wrapper = mountComponent()
    const resetBtn = wrapper.find('[data-testid="reset-btn"]')
    expect(resetBtn.exists()).toBe(false)
  })

  it('restores JD text from store on mount', async () => {
    const store = useResumeStore()
    store.jdText = 'Previously saved JD'

    const wrapper = mountComponent()
    // Wait for onMounted to run
    await wrapper.vm.$nextTick()

    const textarea = wrapper.find('textarea')
    expect(textarea.element.value).toBe('Previously saved JD')
  })

  it('adds error class to textarea when error is set', async () => {
    mockTailorError.value = 'Error!'

    const wrapper = mountComponent()
    const textarea = wrapper.find('textarea')
    expect(textarea.classes()).toContain('border-red-600!')
  })
})
