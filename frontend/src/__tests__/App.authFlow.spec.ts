/**
 * Integration-style tests for the auth flow in App.vue.
 *
 * Uses the real Pinia auth store with a mocked fetch to verify
 * the skeleton → resolved transition that prevents the
 * "flash of wrong buttons" bug.
 *
 * NOTE: In vitest + jsdom, microtasks queued by resolved Promises
 * are NOT flushed by nextTick() or Promise.resolve(). Yield to
 * the macrotask queue (setTimeout) to drain them.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from '@/App.vue'
import { useAuthStore } from '@/features/auth/stores/auth'

const mockFetch = vi.fn<typeof fetch>()
global.fetch = mockFetch

/** Flush pending work by yielding to the macrotask queue. */
const flush = () => new Promise<void>(r => setTimeout(r, 0))

/**
 *
 * @param data
 * @param status
 */
function mockJsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response
}

/**
 *
 */
function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
      { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
      { path: '/signup', name: 'signup', component: { template: '<div>Signup</div>' } },
      { path: '/dashboard', name: 'dashboard', component: { template: '<div>Dashboard</div>' }, meta: { requiresAuth: true } },
      { path: '/account', name: 'account', component: { template: '<div>Account</div>' } },
      { path: '/builder', name: 'builder', component: { template: '<div>Builder</div>' } },
    ],
  })
}

let pinia: ReturnType<typeof createPinia>

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  mockFetch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App auth flow — skeleton → resolved transition', () => {
  it('shows skeleton while auth is loading, then transitions to authenticated nav', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ user: { id: '1', email: 'test@example.com' } }))

    const router = makeRouter()
    await router.push('/')

    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
        stubs: { AppLogo: true, RouterView: true },
      },
    })

    const store = useAuthStore()

    // 1. Skeleton is visible immediately after mount
    expect(store.authReady).toBe(false)
    expect(wrapper.find('.animate-pulse').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('My Resumes')
    expect(wrapper.text()).not.toContain('Log in')

    // 2. Flush pending microtasks via macrotask yield
    await flush()

    // 3. Store has updated
    expect(store.authReady).toBe(true)
    expect(store.isAuthenticated).toBe(true)

    // 4. Skeleton gone, authenticated nav visible
    expect(wrapper.find('.animate-pulse').exists()).toBe(false)
    expect(wrapper.text()).toContain('My Resumes')
    // Navbar shows a profile icon instead of the raw email text
    const userTrigger = wrapper
      .findAll('button[data-slot="dropdown-menu-trigger"]')
      .find((button) => button.find('svg.lucide-user').exists())
    expect(userTrigger).toBeDefined()
    expect(userTrigger!.find('svg.size-4').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('test@example.com')
    expect(wrapper.text()).not.toContain('Log in')
    expect(wrapper.text()).not.toContain('Sign up')
  })

  it('shows skeleton while auth is loading, then transitions to unauthenticated nav', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ user: null }))

    const router = makeRouter()
    await router.push('/')

    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
        stubs: { AppLogo: true, RouterView: true },
      },
    })

    const store = useAuthStore()

    expect(store.authReady).toBe(false)
    expect(wrapper.find('.animate-pulse').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Log in')

    await flush()

    expect(store.authReady).toBe(true)
    expect(store.isAuthenticated).toBe(false)

    expect(wrapper.find('.animate-pulse').exists()).toBe(false)
    expect(wrapper.text()).toContain('Log in')
    expect(wrapper.text()).toContain('Sign up')
    expect(wrapper.text()).not.toContain('My Resumes')
  })

  it('still resolves when /me returns 401', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ message: 'Unauthorized' }, 401))

    const router = makeRouter()
    await router.push('/')

    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
        stubs: { AppLogo: true, RouterView: true },
      },
    })

    const store = useAuthStore()

    expect(wrapper.find('.animate-pulse').exists()).toBe(true)

    await flush()

    expect(store.authReady).toBe(true)
    expect(wrapper.find('.animate-pulse').exists()).toBe(false)
    expect(wrapper.text()).toContain('Log in')
    expect(wrapper.text()).toContain('Sign up')
  })

  it('still resolves when /me fails with network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const router = makeRouter()
    await router.push('/')

    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
        stubs: { AppLogo: true, RouterView: true },
      },
    })

    const store = useAuthStore()

    expect(wrapper.find('.animate-pulse').exists()).toBe(true)

    await flush()

    // finally block always runs — should resolve to unauthenticated
    expect(store.authReady).toBe(true)
    expect(wrapper.find('.animate-pulse').exists()).toBe(false)
    expect(wrapper.text()).toContain('Log in')
    expect(wrapper.text()).toContain('Sign up')
  })

  it('calls /api/v1/auth/me with credentials: include on mount', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ user: null }))

    const router = makeRouter()
    await router.push('/')

    mount(App, {
      global: {
        plugins: [pinia, router],
        stubs: { AppLogo: true, RouterView: true },
      },
    })

    await flush()

    const calls = mockFetch.mock.calls as [string, RequestInit][]
    const meCall = calls.find(([url]) => url.toString().includes('/api/v1/auth/me'))
    expect(meCall).toBeDefined()
    expect(meCall![1].credentials).toBe('include')
  })
})
