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

  it('uses the primary brand color for document body fill', () => {
    const wrapper = mount(AppLogo)
    const paths = wrapper.findAll('path')
    // The first path (document body) should have fill with --color-primary
    const firstPath = paths[0]!
    const fill = firstPath.attributes('fill')
    expect(fill).toContain('--color-primary')
  })

  it('uses currentColor for strokes in light mode', () => {
    const wrapper = mount(AppLogo)
    const paths = wrapper.findAll('path')
    // All paths should use stroke="currentColor" for theme compatibility
    for (const path of paths) {
      expect(path.attributes('stroke')).toBe('currentColor')
    }
  })

  it('renders as visible on dark background when using currentColor', () => {
    // In dark mode, --color-primary stays #f59e0b (amber) and
    // currentColor inherits the light text color, so the logo remains visible.
    document.documentElement.classList.add('dark')

    const wrapper = mount(AppLogo)
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    // The fill should still reference the CSS variable
    const firstPath = wrapper.findAll('path')[0]!
    expect(firstPath.attributes('fill')).toContain('--color-primary')

    document.documentElement.classList.remove('dark')
  })

  it('has exactly the expected number of path elements', () => {
    const wrapper = mount(AppLogo)
    // Document body + folded corner + checkmark = 3 paths
    expect(wrapper.findAll('path')).toHaveLength(3)
  })
})
