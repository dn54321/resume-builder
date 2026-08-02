import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppLogo from '@/components/AppLogo.vue'

describe('AppLogo', () => {
  it('renders an SVG element', () => {
    const wrapper = mount(AppLogo)
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
  })

  it('has correct dimensions (32×32 viewBox)', () => {
    const wrapper = mount(AppLogo)
    const svg = wrapper.find('svg')
    expect(svg.attributes('width')).toBe('32')
    expect(svg.attributes('height')).toBe('32')
    expect(svg.attributes('viewBox')).toBe('0 0 32 32')
  })

  it('is marked as aria-hidden with role img', () => {
    const wrapper = mount(AppLogo)
    const svg = wrapper.find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('role')).toBe('img')
  })

  it('renders two page rects (front + back)', () => {
    const wrapper = mount(AppLogo)
    const rects = wrapper.findAll('rect')
    // 2 page rects + 3 content lines + 1 accent bar = 6 rects
    expect(rects).toHaveLength(6)
  })

  it('renders front page with currentColor fill', () => {
    const wrapper = mount(AppLogo)
    const rects = wrapper.findAll('rect')
    // Front page is the second rect (index 1), opacity 0.9
    const frontPage = rects[1]
    expect(frontPage.attributes('fill')).toBe('currentColor')
    expect(frontPage.attributes('opacity')).toBe('0.9')
  })

  it('renders back page with reduced opacity currentColor', () => {
    const wrapper = mount(AppLogo)
    const rects = wrapper.findAll('rect')
    // Back page is the first rect (index 0), opacity 0.25
    const backPage = rects[0]
    expect(backPage.attributes('fill')).toBe('currentColor')
    expect(backPage.attributes('opacity')).toBe('0.25')
  })

  it('renders accent bar with primary color CSS variable', () => {
    const wrapper = mount(AppLogo)
    const rects = wrapper.findAll('rect')
    // Accent bar is the last rect (index 5)
    const accentBar = rects[5]
    expect(accentBar.attributes('fill')).toBe('var(--color-primary, #f59e0b)')
  })

  it('renders three content lines with background color CSS variable', () => {
    const wrapper = mount(AppLogo)
    const rects = wrapper.findAll('rect')
    // Content lines are indices 2, 3, 4
    for (let i = 2; i <= 4; i++) {
      expect(rects[i].attributes('fill')).toBe(
        'var(--color-background, #fafaf9)'
      )
    }
  })

  it('renders without errors', () => {
    const wrapper = mount(AppLogo)
    expect(wrapper.exists()).toBe(true)
  })

  it('has correct xmlns attribute', () => {
    const wrapper = mount(AppLogo)
    const svg = wrapper.find('svg')
    expect(svg.attributes('xmlns')).toBe('http://www.w3.org/2000/svg')
  })
})
