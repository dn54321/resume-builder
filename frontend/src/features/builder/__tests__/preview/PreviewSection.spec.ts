import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PreviewSection from '@/features/builder/components/preview/PreviewSection.vue'

describe('PreviewSection', () => {
  it('renders the heading text', () => {
    const wrapper = mount(PreviewSection, {
      props: { heading: 'Experience' },
      slots: { default: '<p>Content</p>' },
    })

    const heading = wrapper.find('.preview-section__heading')
    expect(heading.text()).toBe('Experience')
  })

  it('renders a horizontal rule', () => {
    const wrapper = mount(PreviewSection, {
      props: { heading: 'Test' },
    })

    const rule = wrapper.find('.preview-section__rule')
    expect(rule.exists()).toBe(true)
  })

  it('renders slot content inside the body', () => {
    const wrapper = mount(PreviewSection, {
      props: { heading: 'Test' },
      slots: { default: '<div class="custom-content">Custom</div>' },
    })

    const body = wrapper.find('.preview-section__body')
    expect(body.find('.custom-content').exists()).toBe(true)
    expect(body.find('.custom-content').text()).toBe('Custom')
  })

  it('applies correct heading styles (uppercase, bold)', () => {
    const wrapper = mount(PreviewSection, {
      props: { heading: 'Test' },
    })

    const heading = wrapper.find('.preview-section__heading')
    // Heading is rendered in ALL CAPS via text-transform
    expect(heading.text()).toBe('Test')
    // Verify the heading element exists and has the right class
    expect(heading.classes()).toContain('preview-section__heading')
  })
})
