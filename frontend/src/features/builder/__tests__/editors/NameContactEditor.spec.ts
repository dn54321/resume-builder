import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useResumeStore } from '@/features/builder/stores/resume'
import NameContactEditor from '@/features/builder/components/editors/NameContactEditor.vue'

describe('NameContactEditor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useResumeStore()
    store.initializeDefaults()
  })

  it('renders all 6 fields', () => {
    const wrapper = mount(NameContactEditor)

    const inputs = wrapper.findAll('input')
    expect(inputs).toHaveLength(6)
  })

  it('renders Full Name as required field', () => {
    const wrapper = mount(NameContactEditor)

    const fullNameInput = wrapper.find('#nc-full-name')
    expect(fullNameInput.attributes('required')).toBeDefined()
    expect(fullNameInput.attributes('type')).toBe('text')
  })

  it('uses correct input types', () => {
    const wrapper = mount(NameContactEditor)

    const emailInput = wrapper.find('#nc-email')
    expect(emailInput.attributes('type')).toBe('email')

    const phoneInput = wrapper.find('#nc-phone')
    expect(phoneInput.attributes('type')).toBe('tel')

    const linkedinInput = wrapper.find('#nc-linkedin')
    expect(linkedinInput.attributes('type')).toBe('url')

    const websiteInput = wrapper.find('#nc-website')
    expect(websiteInput.attributes('type')).toBe('url')
  })

  it('updates field value on input', async () => {
    const wrapper = mount(NameContactEditor)

    const input = wrapper.find('#nc-full-name')
    await input.setValue('Jane Doe')

    const store = useResumeStore()
    const section = store.sections.find((s) => s.sectionType === 'name_contact')
    expect(section).toBeDefined()
    expect(section!.entries).toHaveLength(1)
    const fullNameField = section!.entries[0]!.fields.find((f) => f.key === 'fullName')
    expect(fullNameField?.value).toBe('Jane Doe')
  })

  it('creates an entry on mount if none exists', () => {
    // Manually clear the section entries
    const store = useResumeStore()
    const section = store.sections.find((s) => s.sectionType === 'name_contact')
    section!.entries = []

    mount(NameContactEditor)

    expect(section!.entries).toHaveLength(1)
    expect(section!.entries[0]!.fields).toHaveLength(6)
  })
})
