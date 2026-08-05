import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import JdModal from '@/features/builder/components/JdModal.vue'
import { useResumeStore } from '@/features/builder/stores/resume'

describe('JdModal', () => {
  let pinia: ReturnType<typeof createPinia>

  /**
   *
   * @param props
   * @param props.modelValue
   * @param props.tailoring
   */
  function mountComponent(props: { modelValue: boolean; tailoring?: boolean }) {
    return mount(JdModal, {
      props,
      global: {
        plugins: [pinia],
        stubs: {
          // Stub teleport so content renders inline in the wrapper
          Teleport: {
            props: ['to', 'disabled'],
            template: '<div class="teleport-target"><slot /></div>',
          },
        },
      },
    })
  }

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
  })

  it('renders textarea when open', async () => {
    const wrapper = mountComponent({ modelValue: true })
    await nextTick()

    const textarea = wrapper.find('[data-testid="jd-textarea"]')
    expect(textarea.exists()).toBe(true)
  })

  it('pre-fills textarea from store.jdText when opened', async () => {
    const store = useResumeStore()
    store.jdText = 'Existing JD text'

    const wrapper = mountComponent({ modelValue: true })
    await nextTick()

    const textarea = wrapper.find('[data-testid="jd-textarea"]')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('Existing JD text')
  })

  it('does not pre-fill textarea when store.jdText is empty', async () => {
    const store = useResumeStore()
    store.jdText = ''

    const wrapper = mountComponent({ modelValue: true })
    await nextTick()

    const textarea = wrapper.find('[data-testid="jd-textarea"]')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('')
  })

  it('emits tailor with the JD in one step when Tailor Resume is clicked', async () => {
    const wrapper = mountComponent({ modelValue: true })
    await nextTick()

    const textarea = wrapper.find('[data-testid="jd-textarea"]')
    await textarea.setValue('New JD')

    const tailorBtn = wrapper.find('[data-testid="jd-modal-tailor"]')
    await tailorBtn.trigger('click')
    await nextTick()

    expect(wrapper.emitted('tailor')).toBeTruthy()
    const lastEmit = wrapper.emitted('tailor')
    expect(lastEmit![lastEmit!.length - 1]).toEqual(['New JD'])
  })

  it('trims whitespace before emitting the JD', async () => {
    const wrapper = mountComponent({ modelValue: true })
    await nextTick()

    const textarea = wrapper.find('[data-testid="jd-textarea"]')
    await textarea.setValue('  New JD  ')

    const tailorBtn = wrapper.find('[data-testid="jd-modal-tailor"]')
    await tailorBtn.trigger('click')
    await nextTick()

    const lastEmit = wrapper.emitted('tailor')
    expect(lastEmit![lastEmit!.length - 1]).toEqual(['New JD'])
  })

  it('keeps modal open and shows inline error when JD is empty', async () => {
    const wrapper = mountComponent({ modelValue: true })
    await nextTick()

    const tailorBtn = wrapper.find('[data-testid="jd-modal-tailor"]')
    await tailorBtn.trigger('click')
    await nextTick()

    // No tailor event, modal never closes (no update:modelValue emitted)
    expect(wrapper.emitted('tailor')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    // Error is shown inline
    const error = wrapper.find('[data-testid="jd-modal-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toBe('Please enter a job description')
  })

  it('shows inline error when JD is whitespace only', async () => {
    const wrapper = mountComponent({ modelValue: true })
    await nextTick()

    const textarea = wrapper.find('[data-testid="jd-textarea"]')
    await textarea.setValue('   ')

    const tailorBtn = wrapper.find('[data-testid="jd-modal-tailor"]')
    await tailorBtn.trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="jd-modal-error"]').exists()).toBe(true)
    expect(wrapper.emitted('tailor')).toBeUndefined()
  })

  it('clears a stale inline error when the modal opens', async () => {
    const store = useResumeStore()
    store.jdText = 'Existing JD'

    const wrapper = mountComponent({ modelValue: true })
    await nextTick()

    // Empty the textarea and trigger the empty-JD error
    await wrapper.find('[data-testid="jd-textarea"]').setValue('')
    await wrapper.find('[data-testid="jd-modal-tailor"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="jd-modal-error"]').exists()).toBe(true)

    // Close and reopen the modal — error is cleared
    await wrapper.setProps({ modelValue: false })
    await nextTick()
    await wrapper.setProps({ modelValue: true })
    await nextTick()

    expect(wrapper.find('[data-testid="jd-modal-error"]').exists()).toBe(false)
  })

  it('disables the Tailor Resume button while tailoring is in flight', async () => {
    const wrapper = mountComponent({ modelValue: true, tailoring: true })
    await nextTick()

    const tailorBtn = wrapper.find('[data-testid="jd-modal-tailor"]')
    expect(tailorBtn.attributes('disabled')).toBeDefined()
    expect(tailorBtn.text()).toContain('Tailoring')
  })

  it('shows the loading spinner while tailoring is in flight', async () => {
    const wrapper = mountComponent({ modelValue: true, tailoring: true })
    await nextTick()

    const spinner = wrapper.find('span[aria-label="Loading"]')
    expect(spinner.exists()).toBe(true)
  })

  it('does not emit tailor on Cancel and keeps store JD unchanged', async () => {
    const store = useResumeStore()
    store.jdText = 'Original JD'

    const wrapper = mountComponent({ modelValue: true })
    await nextTick()

    // Modify textarea but cancel
    const textarea = wrapper.find('[data-testid="jd-textarea"]')
    await textarea.setValue('Changed JD')

    const cancelBtn = wrapper.find('[data-testid="jd-modal-cancel"]')
    await cancelBtn.trigger('click')

    expect(store.jdText).toBe('Original JD')
    expect(wrapper.emitted('tailor')).toBeUndefined()
  })

  it('emits update:modelValue with false on Cancel', async () => {
    const wrapper = mountComponent({ modelValue: true })
    await nextTick()

    const cancelBtn = wrapper.find('[data-testid="jd-modal-cancel"]')
    await cancelBtn.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    const lastEmit = wrapper.emitted('update:modelValue')
    expect(lastEmit![lastEmit!.length - 1]).toEqual([false])
  })

  it('renders dialog title when open', async () => {
    const wrapper = mountComponent({ modelValue: true })
    await nextTick()
    expect(wrapper.text()).toContain('Job Description')
  })

  it('renders Cancel and Tailor Resume buttons when open', async () => {
    const wrapper = mountComponent({ modelValue: true })
    await nextTick()
    expect(wrapper.find('[data-testid="jd-modal-cancel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="jd-modal-tailor"]').exists()).toBe(true)
  })

  it('labels the primary button "Tailor Resume" (not "Save")', async () => {
    const wrapper = mountComponent({ modelValue: true })
    await nextTick()
    const tailorBtn = wrapper.find('[data-testid="jd-modal-tailor"]')
    expect(tailorBtn.text()).toContain('Tailor Resume')
    expect(wrapper.find('[data-testid="jd-modal-save"]').exists()).toBe(false)
  })

  it('has the correct placeholder in textarea', async () => {
    const wrapper = mountComponent({ modelValue: true })
    await nextTick()
    const textarea = wrapper.find('[data-testid="jd-textarea"]')
    expect(textarea.attributes('placeholder')).toBe(
      'Paste a job description here to find the most relevant experience and skills...',
    )
  })
})
