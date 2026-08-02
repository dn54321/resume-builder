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

      // Badge is a span with the text
      const spans = wrapper.findAll('span')
      const badge = spans.find((s) => s.text() === 'Resume Builder')
      expect(badge).toBeTruthy()
      expect(badge!.classes()).toContain('inline-block')
      expect(badge!.classes()).toContain('rounded-full')

      // Heading is an h1
      const heading = wrapper.find('h1')
      expect(heading.exists()).toBe(true)
      expect(heading.text()).toBe('Build a resume that gets you hired')

      // Subheading text
      expect(wrapper.text()).toContain('smart section management')
    })

    it('renders guest CTA buttons when not authenticated', () => {
      const wrapper = mountHome()

      // CTAs are RouterLink stubs rendered as <a> tags
      const links = wrapper.findAll('a')
      // "Get Started" and "Log in"
      const getStarted = links.find((a) => a.text() === 'Get Started')
      const logIn = links.find((a) => a.text() === 'Log in')

      expect(getStarted).toBeTruthy()
      expect(getStarted!.attributes('href')).toBe('/signup')
      expect(getStarted!.classes()).toContain('bg-primary')

      expect(logIn).toBeTruthy()
      expect(logIn!.attributes('href')).toBe('/login')
      expect(logIn!.classes()).toContain('border')
    })

    it('renders authenticated CTA buttons when authenticated', () => {
      setAuthenticated()
      const wrapper = mountHome()

      const links = wrapper.findAll('a')
      const dashboard = links.find((a) => a.text() === 'Go to Dashboard')
      const createNew = links.find((a) => a.text() === 'Create New Resume')

      expect(dashboard).toBeTruthy()
      expect(dashboard!.attributes('href')).toBe('/dashboard')
      expect(dashboard!.classes()).toContain('bg-primary')

      expect(createNew).toBeTruthy()
      expect(createNew!.attributes('href')).toBe('/dashboard')
    })
  })

  describe('Features Grid', () => {
    it('renders exactly 4 feature cards', () => {
      const wrapper = mountHome()

      // Feature cards are divs with rounded-xl border classes
      const cards = wrapper.findAll('.rounded-xl.border')
      expect(cards).toHaveLength(4)
    })

    it('each feature card has an icon, title, and description', () => {
      const wrapper = mountHome()

      // Feature titles
      expect(wrapper.text()).toContain('Live Preview')
      expect(wrapper.text()).toContain('Smart Sections')
      expect(wrapper.text()).toContain('Tailor to Jobs')
      expect(wrapper.text()).toContain('PDF Export')

      // Descriptions
      expect(wrapper.text()).toContain('See changes in real time as you edit')
      expect(wrapper.text()).toContain('Download a polished PDF with one click')
    })

    it('feature icons are rendered with aria-hidden', () => {
      const wrapper = mountHome()

      const icons = wrapper.findAll('[aria-hidden="true"]')
      expect(icons.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('Footer', () => {
    it('renders the footer with app name', () => {
      const wrapper = mountHome()

      const footer = wrapper.find('footer')
      expect(footer.exists()).toBe(true)
      expect(footer.text()).toContain('Resume Builder')
      expect(footer.text()).toContain('Vue, NestJS, and Tailwind CSS')
    })
  })
})
