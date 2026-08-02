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
   */
  function mountComponent(props: { modelValue: boolean }) {
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

  it('saves JD text to store on Save button click', async () => {
    const store = useResumeStore()
    store.jdText = ''

    const wrapper = mountComponent({ modelValue: true })
    await nextTick()

    const textarea = wrapper.find('[data-testid="jd-textarea"]')
    await textarea.setValue('New JD')

    const saveBtn = wrapper.find('[data-testid="jd-modal-save"]')
    await saveBtn.trigger('click')

    expect(store.jdText).toBe('New JD')
  })

  it('emits update:modelValue with false on Save', async () => {
    const wrapper = mountComponent({ modelValue: true })
    await nextTick()

    const textarea = wrapper.find('[data-testid="jd-textarea"]')
    await textarea.setValue('Some JD')

    const saveBtn = wrapper.find('[data-testid="jd-modal-save"]')
    await saveBtn.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    const lastEmit = wrapper.emitted('update:modelValue')
    expect(lastEmit![lastEmit!.length - 1]).toEqual([false])
  })

  it('discards unsaved changes on Cancel', async () => {
    const store = useResumeStore()
    store.jdText = 'Original JD'

    const wrapper = mountComponent({ modelValue: true })
    await nextTick()

    // Modify textarea but cancel
    const textarea = wrapper.find('[data-testid="jd-textarea"]')
    await textarea.setValue('Changed JD')

    const cancelBtn = wrapper.find('[data-testid="jd-modal-cancel"]')
    await cancelBtn.trigger('click')

    // Store should still have original value
    expect(store.jdText).toBe('Original JD')
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

  it('renders Cancel and Save buttons when open', async () => {
    const wrapper = mountComponent({ modelValue: true })
    await nextTick()
    expect(wrapper.find('[data-testid="jd-modal-cancel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="jd-modal-save"]').exists()).toBe(true)
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
