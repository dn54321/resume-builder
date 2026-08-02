// oxlint-disable vitest/require-mock-type-parameters
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { useAuthStore } from '@/features/auth/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
    { path: '/signup', name: 'signup', component: { template: '<div>Signup</div>' } },
    { path: '/dashboard', name: 'dashboard', component: { template: '<div>Dashboard</div>' } },
    { path: '/builder', name: 'builder', component: { template: '<div>Builder</div>' } },
  ],
})

let pinia: ReturnType<typeof createPinia>

/**
 *
 */
function mountHome() {
  return mount(HomeView, {
    global: {
      plugins: [pinia, router],
      stubs: {
        RouterLink: {
          template: '<a :href="to"><slot /></a>',
          props: ['to'],
        },
      },
    },
  })
}

/**
 *
 * @param email
 */
function setAuthenticated(email = 'test@example.com') {
  const store = useAuthStore()
  store.$patch({
    user: { id: 'user-1', email },
    token: 'valid-token',
  })
}

describe('HomeView', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('Hero Section', () => {
    it('renders the badge, heading, and subheading', () => {
      const wrapper = mountHome()

      expect(wrapper.find('.badge').text()).toBe('Resume Builder')
      expect(wrapper.find('.hero-heading').text()).toBe(
        'Build a resume that gets you hired',
      )
      expect(wrapper.find('.hero-subheading').exists()).toBe(true)
      expect(wrapper.find('.hero-subheading').text()).toContain(
        'smart section management',
      )
    })

    it('renders guest CTA buttons when not authenticated', () => {
      const wrapper = mountHome()

      const buttons = wrapper.findAll('.cta-buttons .btn')
      expect(buttons).toHaveLength(2)

      const primaryBtn = buttons[0]!
      expect(primaryBtn.text()).toBe('Get Started')
      expect(primaryBtn.attributes('href')).toBe('/signup')
      expect(primaryBtn.classes()).toContain('btn-primary')

      const outlineBtn = buttons[1]!
      expect(outlineBtn.text()).toBe('Log in')
      expect(outlineBtn.attributes('href')).toBe('/login')
      expect(outlineBtn.classes()).toContain('btn-outline')
    })

    it('renders authenticated CTA buttons when authenticated', () => {
      setAuthenticated()
      const wrapper = mountHome()

      const buttons = wrapper.findAll('.cta-buttons .btn')
      expect(buttons).toHaveLength(2)

      const primaryBtn = buttons[0]!
      expect(primaryBtn.text()).toBe('Go to Dashboard')
      expect(primaryBtn.attributes('href')).toBe('/dashboard')
      expect(primaryBtn.classes()).toContain('btn-primary')

      const outlineBtn = buttons[1]!
      expect(outlineBtn.text()).toBe('Create New Resume')
      expect(outlineBtn.attributes('href')).toBe('/dashboard')
      expect(outlineBtn.classes()).toContain('btn-outline')
    })
  })

  describe('Features Grid', () => {
    it('renders exactly 4 feature cards', () => {
      const wrapper = mountHome()

      const cards = wrapper.findAll('.feature-card')
      expect(cards).toHaveLength(4)
    })

    it('each feature card has an icon, title, and description', () => {
      const wrapper = mountHome()

      const cards = wrapper.findAll('.feature-card')
      for (const card of cards) {
        expect(card.find('.feature-icon').exists()).toBe(true)
        expect(card.find('.feature-title').exists()).toBe(true)
        expect(card.find('.feature-description').exists()).toBe(true)
      }
    })

    it('renders expected feature titles', () => {
      const wrapper = mountHome()

      const titles = wrapper.findAll('.feature-title').map((el) => el.text())
      expect(titles).toContain('Live Preview')
      expect(titles).toContain('Smart Sections')
      expect(titles).toContain('Tailor to Jobs')
      expect(titles).toContain('PDF Export')
    })
  })

  describe('Footer', () => {
    it('renders the footer with app name', () => {
      const wrapper = mountHome()

      const footer = wrapper.find('footer.footer')
      expect(footer.exists()).toBe(true)
      expect(footer.text()).toContain('Resume Builder')
      expect(footer.text()).toContain('Vue, NestJS, and Tailwind CSS')
    })
  })
})
