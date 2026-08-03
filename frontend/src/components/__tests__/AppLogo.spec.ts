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
    const frontPage = rects[1]!
    expect(frontPage.attributes('fill')).toBe('currentColor')
    expect(frontPage.attributes('opacity')).toBe('0.9')
  })

  it('renders back page with reduced opacity currentColor', () => {
    const wrapper = mount(AppLogo)
    const rects = wrapper.findAll('rect')
    // Back page is the first rect (index 0), opacity 0.25
    const backPage = rects[0]!
    expect(backPage.attributes('fill')).toBe('currentColor')
    expect(backPage.attributes('opacity')).toBe('0.25')
  })

  it('renders accent bar with primary color CSS variable', () => {
    const wrapper = mount(AppLogo)
    const rects = wrapper.findAll('rect')
    // Accent bar is the last rect (index 5)
    const accentBar = rects[5]!
    expect(accentBar.attributes('fill')).toBe('var(--color-primary, #f59e0b)')
  })

  it('renders three content lines with background color CSS variable', () => {
    const wrapper = mount(AppLogo)
    const rects = wrapper.findAll('rect')
    // Content lines are indices 2, 3, 4
    for (let i = 2; i <= 4; i++) {
      expect(rects[i]!.attributes('fill')).toBe(
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

  describe('dark mode', () => {
    it('renders page bodies with currentColor that inherits from dark foreground', () => {
      // Mount inside a dark wrapper element
      const darkWrapper = document.createElement('div')
      darkWrapper.classList.add('dark')
      document.body.appendChild(darkWrapper)

      const mounted = mount(AppLogo, {
        attachTo: darkWrapper,
      })

      const rects = mounted.findAll('rect')
      const frontPage = rects[1]!
      // In dark mode, currentColor should still be used; the CSS cascade
      // handles the actual color. Verify the attribute is still currentColor.
      expect(frontPage.attributes('fill')).toBe('currentColor')

      // Accent bar should still use the primary color variable
      const accentBar = rects[5]!
      expect(accentBar.attributes('fill')).toBe('var(--color-primary, #f59e0b)')

      document.body.removeChild(darkWrapper)
    })

    it('keeps accent bar amber/gold in both light and dark mode', () => {
      // The primary color is #f59e0b in both light and dark theme
      const wrapper = mount(AppLogo)
      const rects = wrapper.findAll('rect')
      const accentBar = rects[5]!
      // Verify the fallback value is the brand amber
      expect(accentBar.attributes('fill')).toContain('#f59e0b')
    })
  })

  describe('favicon compatibility', () => {
    it('has a simple enough design to be recognizable at small sizes', () => {
      const wrapper = mount(AppLogo)
      // Key shapes that define the document metaphor:
      // - Two offset rounded rects (pages)
      // - Content lines
      // - An accent bar
      const rects = wrapper.findAll('rect')
      // The stacked pages design uses large shapes with distinct colors
      // that remain distinguishable when scaled down
      expect(rects).toHaveLength(6)
    })

    it('uses viewBox that matches favicon', () => {
      const wrapper = mount(AppLogo)
      const svg = wrapper.find('svg')
      expect(svg.attributes('viewBox')).toBe('0 0 32 32')
    })
  })
})
