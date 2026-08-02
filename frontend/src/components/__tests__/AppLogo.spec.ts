import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppLogo from '@/components/AppLogo.vue'

describe('AppLogo', () => {
  it('renders an SVG element', () => {
    const wrapper = mount(AppLogo)
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
  })

  it('has correct dimensions', () => {
    const wrapper = mount(AppLogo)
    const svg = wrapper.find('svg')
    expect(svg.attributes('width')).toBe('24')
    expect(svg.attributes('height')).toBe('24')
  })

  it('is marked as aria-hidden', () => {
    const wrapper = mount(AppLogo)
    const svg = wrapper.find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
  })

  it('renders without errors', () => {
    const wrapper = mount(AppLogo)
    expect(wrapper.exists()).toBe(true)
  })
})
