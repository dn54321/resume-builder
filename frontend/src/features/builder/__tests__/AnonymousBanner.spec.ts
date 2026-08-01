import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AnonymousBanner from '@/features/builder/components/AnonymousBanner.vue'

function createTestRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div/>' } },
      { path: '/signup', name: 'signup', component: { template: '<div/>' } },
      { path: '/login', name: 'login', component: { template: '<div/>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div/>' } },
    ],
  })
  return router
}

describe('AnonymousBanner', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  async function mountBanner() {
    const router = createTestRouter()
    await router.push('/')
    await router.isReady()
    return mount(AnonymousBanner, {
      global: { plugins: [router] },
    })
  }

  it('renders the warning message', async () => {
    const wrapper = await mountBanner()
    expect(wrapper.text()).toContain('You are not signed in')
    expect(wrapper.text()).toContain('Sign Up')
    expect(wrapper.text()).toContain('Log In')
  })

  it('contains links to signup and login', async () => {
    const wrapper = await mountBanner()
    const links = wrapper.findAll('a')
    expect(links).toHaveLength(2)
    expect(links[0]!.text()).toContain('Sign Up')
    expect(links[1]!.text()).toContain('Log In')
  })

  it('is visible by default', async () => {
    const wrapper = await mountBanner()
    expect(wrapper.find('.anonymous-banner').exists()).toBe(true)
  })

  it('hides when dismiss button is clicked', async () => {
    const wrapper = await mountBanner()
    await wrapper.find('.anonymous-banner__dismiss').trigger('click')
    expect(wrapper.find('.anonymous-banner').exists()).toBe(false)
  })

  it('stays hidden across remounts within the session', async () => {
    const wrapper1 = await mountBanner()
    await wrapper1.find('.anonymous-banner__dismiss').trigger('click')
    wrapper1.unmount()

    const wrapper2 = await mountBanner()
    expect(wrapper2.find('.anonymous-banner').exists()).toBe(false)
  })

  it('reappears after clearing sessionStorage', async () => {
    const wrapper1 = await mountBanner()
    await wrapper1.find('.anonymous-banner__dismiss').trigger('click')
    wrapper1.unmount()

    sessionStorage.clear()

    const wrapper2 = await mountBanner()
    expect(wrapper2.find('.anonymous-banner').exists()).toBe(true)
  })
})
