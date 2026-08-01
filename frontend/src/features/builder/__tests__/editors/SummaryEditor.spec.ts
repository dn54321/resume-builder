import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useResumeStore } from '@/features/builder/stores/resume'
import SummaryEditor from '@/features/builder/components/editors/SummaryEditor.vue'

describe('SummaryEditor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useResumeStore()
    store.initializeDefaults()
  })

  it('renders a textarea', () => {
    const wrapper = mount(SummaryEditor)
    const textarea = wrapper.find('textarea')
    expect(textarea.exists()).toBe(true)
  })

  it('shows character count', () => {
    const wrapper = mount(SummaryEditor)
    expect(wrapper.text()).toContain('0 / 2000')
  })

  it('updates character count on input', async () => {
    const wrapper = mount(SummaryEditor)
    const textarea = wrapper.find('textarea')
    await textarea.setValue('Hello World')

    expect(wrapper.text()).toContain('11 / 2000')
  })

  it('creates an entry on mount if none exists', () => {
    const store = useResumeStore()
    const section = store.sections.find((s) => s.sectionType === 'summary')
    section!.entries = []

    mount(SummaryEditor)

    expect(section!.entries).toHaveLength(1)
    expect(section!.entries[0]!.fields[0]!.key).toBe('text')
  })

  it('updates store value on input', async () => {
    const wrapper = mount(SummaryEditor)
    const textarea = wrapper.find('textarea')
    await textarea.setValue('A professional summary')

    const store = useResumeStore()
    const section = store.sections.find((s) => s.sectionType === 'summary')
    const textField = section!.entries[0]!.fields.find((f) => f.key === 'text')
    expect(textField?.value).toBe('A professional summary')
  })
})
