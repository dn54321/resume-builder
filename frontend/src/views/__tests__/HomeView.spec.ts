import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/builder', name: 'builder', component: { template: '<div>Builder</div>' } },
    { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
  ],
})

/**
 *
 */
function mountHome() {
  return mount(HomeView, {
    global: { plugins: [router] },
  })
}

describe('HomeView', () => {
  it('renders the hero headline', () => {
    const wrapper = mountHome()
    expect(wrapper.text()).toContain('Build a resume')
  })

  it('renders the gradient sub-headline', () => {
    const wrapper = mountHome()
    expect(wrapper.text()).toContain("you're proud of")
  })

  it('renders the hero description', () => {
    const wrapper = mountHome()
    expect(wrapper.text()).toContain('Create professional, tailored resumes in minutes')
  })

  it('renders a "Get Started Free" button linking to /builder', () => {
    const wrapper = mountHome()
    const links = wrapper.findAllComponents({ name: 'RouterLink' })
    const builderLink = links.find(
      (l) => l.props('to') === '/builder',
    )
    expect(builderLink?.exists()).toBe(true)
    expect(builderLink?.text()).toContain('Get Started')
  })

  it('renders a "Log in" button linking to /login', () => {
    const wrapper = mountHome()
    const links = wrapper.findAllComponents({ name: 'RouterLink' })
    const loginLink = links.find((l) => l.props('to') === '/login')
    expect(loginLink?.exists()).toBe(true)
    expect(loginLink?.text()).toContain('Log in')
  })

  it('renders the features section heading', () => {
    const wrapper = mountHome()
    expect(wrapper.text()).toContain('Everything you need to land the job')
  })

  it('renders all four feature cards', () => {
    const wrapper = mountHome()

    expect(wrapper.text()).toContain('AI-Powered Tailoring')
    expect(wrapper.text()).toContain('Flexible Sections')
    expect(wrapper.text()).toContain('Live Preview')
    expect(wrapper.text()).toContain('PDF Export')
  })

  it('renders feature descriptions', () => {
    const wrapper = mountHome()

    expect(wrapper.text()).toContain('Paste a job description')
    expect(wrapper.text()).toContain('Choose exactly which sections')
    expect(wrapper.text()).toContain('See every change instantly')
    expect(wrapper.text()).toContain('Download a polished, print-ready PDF')
  })

  it('renders the hero illustration', () => {
    const wrapper = mountHome()
    const illustrations = wrapper.findAllComponents({ name: 'SvgIllustration' })
    expect(illustrations.length).toBeGreaterThanOrEqual(1)
  })

  it('renders feature spot illustrations', () => {
    const wrapper = mountHome()
    const illustrations = wrapper.findAllComponents({ name: 'SvgIllustration' })
    // At least: hero + wave-divider + 4 features + decorative blobs
    expect(illustrations.length).toBeGreaterThanOrEqual(6)
  })

  it('renders the CTA section', () => {
    const wrapper = mountHome()
    expect(wrapper.text()).toContain('Ready to build your resume?')
  })

  it('renders a "Start Building Now" CTA button', () => {
    const wrapper = mountHome()
    const links = wrapper.findAllComponents({ name: 'RouterLink' })
    const ctaLink = links.filter((l) => l.props('to') === '/builder')
    // Should have both hero CTA and bottom CTA
    expect(ctaLink.length).toBeGreaterThanOrEqual(2)
  })
})
