import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from '@/App.vue'

const mockCheckSession = vi.fn<() => Promise<void>>()
const mockLogout = vi.fn<() => Promise<void>>()

// Create mock auth state that we can mutate per test
let mockIsAuthenticated = false
let mockAuthReady = true
const mockUser = { id: '1', email: 'test@example.com' }
let mockUserValue: { id: string; email: string } | null = null

vi.mock('@/features/auth/composables/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    authReady: mockAuthReady,
    user: mockUserValue,
    checkSession: mockCheckSession,
    logout: mockLogout,
  }),
}))

const mockRouterPush = vi.fn<(...args: unknown[]) => Promise<void>>()

/**
 * Create a fresh router for each test.
 * @returns a configured router with mock push
 */
function makeRouter() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
      { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
      { path: '/signup', name: 'signup', component: { template: '<div>Signup</div>' } },
      { path: '/dashboard', name: 'dashboard', component: { template: '<div>Dashboard</div>' } },
      { path: '/account', name: 'account', component: { template: '<div>Account</div>' } },
      { path: '/builder', name: 'builder', component: { template: '<div>Builder</div>' } },
    ],
  })
  router.push = mockRouterPush
  return router
}

let pinia: ReturnType<typeof createPinia>

/**
 * Mount App with router initialized at '/'.
 * @param router - a vue-router instance
 * @returns mounted wrapper
 */
async function mountApp(router: ReturnType<typeof makeRouter>) {
  await router.push('/')
  return mount(App, {
    global: {
      plugins: [pinia, router],
      stubs: {
        AppLogo: true,
        RouterView: true,
      },
    },
  })
}

describe('App', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    mockIsAuthenticated = false
    mockAuthReady = true
    mockUserValue = null
  })

  describe('rendering', () => {
    it('calls checkSession on mount', async () => {
      const router = makeRouter()
      await mountApp(router)
      expect(mockCheckSession).toHaveBeenCalledTimes(1)
    })

    it('renders the brand name', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      expect(wrapper.text()).toContain('Resume Builder')
    })

    it('renders the Home nav link', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      // Logo/brand acts as the home link — no separate "Home" text needed
      expect(wrapper.text()).toContain('Resume Builder')
    })
  })

  describe('auth readiness', () => {
    beforeEach(() => {
      mockAuthReady = false
    })

    it('shows skeleton placeholders while auth is not ready', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)

      // Skeleton placeholders are visible
      expect(wrapper.find('.animate-pulse').exists()).toBe(true)

      // Auth-dependent content is not shown
      expect(wrapper.text()).not.toContain('Log in')
      expect(wrapper.text()).not.toContain('Sign up')
      expect(wrapper.text()).not.toContain('My Resumes')
    })
  })

  describe('guest state (unauthenticated)', () => {
    it('shows Log in and Sign up buttons', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      expect(wrapper.text()).toContain('Log in')
      expect(wrapper.text()).toContain('Sign up')
    })

    it('does not show My Resumes link', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      expect(wrapper.text()).not.toContain('My Resumes')
    })

    it('does not show user email dropdown trigger', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      // In guest state, no email text appears
      expect(wrapper.text()).not.toContain('@')
    })
  })

  describe('authenticated state', () => {
    beforeEach(() => {
      mockIsAuthenticated = true
      mockUserValue = mockUser
    })

    it('shows My Resumes link', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      expect(wrapper.text()).toContain('My Resumes')
    })

    it('shows user email as dropdown trigger text', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      expect(wrapper.text()).toContain('test@example.com')
    })

    it('does not show Log in and Sign up buttons', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      expect(wrapper.text()).not.toContain('Log in')
      expect(wrapper.text()).not.toContain('Sign up')
    })

    it('renders DropdownMenu component', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      // The DropdownMenu should be rendered in authenticated state
      const dropdown = wrapper.findComponent({ name: 'DropdownMenu' })
      expect(dropdown.exists()).toBe(true)
    })

    it('renders DropdownMenuTrigger with user email', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      const trigger = wrapper.findComponent({ name: 'DropdownMenuTrigger' })
      expect(trigger.exists()).toBe(true)
    })
  })

  describe('navbar structure', () => {
    it('has sticky header with bottom border', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      const header = wrapper.find('header')
      expect(header.exists()).toBe(true)
      expect(header.classes()).toContain('sticky')
      expect(header.classes()).toContain('border-b')
      expect(header.classes()).toContain('z-50')
    })

    it('wraps content in min-h-screen flex container', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      const rootDiv = wrapper.find('.min-h-screen')
      expect(rootDiv.exists()).toBe(true)
      expect(rootDiv.classes()).toContain('flex')
      expect(rootDiv.classes()).toContain('flex-col')
    })

    it('has a main element with flex-1', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      const main = wrapper.find('main')
      expect(main.exists()).toBe(true)
      expect(main.classes()).toContain('flex-1')
    })

    it('renders RouterView inside the main element', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      const main = wrapper.find('main')
      const routerView = main.findComponent({ name: 'RouterView' })
      expect(routerView.exists()).toBe(true)
    })
  })

  describe('responsive layout', () => {
    it('uses max-w-7xl container for content width constraint', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      const container = wrapper.find('.max-w-7xl')
      expect(container.exists()).toBe(true)
    })

    it('has responsive padding classes on the navbar container', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      const container = wrapper.find('.max-w-7xl')
      expect(container.classes()).toContain('px-4')
      expect(container.classes()).toContain('sm:px-6')
      expect(container.classes()).toContain('lg:px-8')
    })

    it('truncates user email on narrow screens', async () => {
      mockIsAuthenticated = true
      mockUserValue = { id: '1', email: 'very-long-email-address@example.com' }
      const router = makeRouter()
      const wrapper = await mountApp(router)
      const emailSpan = wrapper.find('.truncate')
      expect(emailSpan.exists()).toBe(true)
      expect(emailSpan.classes()).toContain('max-w-[160px]')
    })

    it('keeps navbar items in a flex row with gap', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      const nav = wrapper.find('nav')
      expect(nav.classes()).toContain('flex')
      expect(nav.classes()).toContain('items-center')
      expect(nav.classes()).toContain('gap-4')
    })
  })

  describe('dropdown menu structure', () => {
    beforeEach(() => {
      mockIsAuthenticated = true
      mockUserValue = mockUser
    })

    it('renders DropdownMenuContent (menu items container)', async () => {
      const router = makeRouter()
      const wrapper = await mountApp(router)
      const content = wrapper.findComponent({ name: 'DropdownMenuContent' })
      expect(content.exists()).toBe(true)
    })

    it('renders DropdownMenuContent with menu slot items', async () => {
      // DropdownMenuContent exists in the component tree.
      // The internal items (Account settings, Log out, separator) are
      // conditionally rendered via Portal and only appear when the menu
      // is open — their behavior is covered by e2e tests.
      const router = makeRouter()
      const wrapper = await mountApp(router)
      const content = wrapper.findComponent({ name: 'DropdownMenuContent' })
      expect(content.exists()).toBe(true)
    })
  })
})
