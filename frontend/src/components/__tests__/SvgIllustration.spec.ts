import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SvgIllustration from '@/components/SvgIllustration.vue'

const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="currentColor"/></svg>`

describe('SvgIllustration', () => {
  it('renders the SVG content inline', () => {
    const wrapper = mount(SvgIllustration, {
      props: { svg: sampleSvg },
    })

    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.find('circle').exists()).toBe(true)
  })

  it('renders with role="img" when ariaLabel is provided', () => {
    const wrapper = mount(SvgIllustration, {
      props: { svg: sampleSvg, ariaLabel: 'Test illustration' },
    })

    const root = wrapper.find('.svg-illustration')
    expect(root.attributes('role')).toBe('img')
    expect(root.attributes('aria-label')).toBe('Test illustration')
  })

  it('renders without role when ariaLabel is not provided', () => {
    const wrapper = mount(SvgIllustration, {
      props: { svg: sampleSvg },
    })

    const root = wrapper.find('.svg-illustration')
    expect(root.attributes('role')).toBeUndefined()
  })

  it('applies custom class to root element', () => {
    const wrapper = mount(SvgIllustration, {
      props: { svg: sampleSvg, class: 'my-custom-class' },
    })

    const root = wrapper.find('.svg-illustration')
    expect(root.classes()).toContain('my-custom-class')
  })

  it('renders without errors with empty SVG', () => {
    const wrapper = mount(SvgIllustration, {
      props: { svg: '' },
    })

    expect(wrapper.exists()).toBe(true)
  })

  it('preserves viewBox attribute from source SVG', () => {
    const wrapper = mount(SvgIllustration, {
      props: { svg: sampleSvg },
    })

    const svg = wrapper.find('svg')
    expect(svg.attributes('viewBox')).toBe('0 0 100 100')
  })
})
