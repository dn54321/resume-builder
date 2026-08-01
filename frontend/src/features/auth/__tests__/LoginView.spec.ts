import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../LoginView.vue'
import { useAuthStore } from '../stores/auth'

const mockPush = vi.fn<(...args: unknown[]) => Promise<void>>()
const mockReplace = vi.fn<(...args: unknown[]) => Promise<void>>()

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/signup', name: 'signup', component: { template: '<div>Signup</div>' } },
    { path: '/builder', name: 'builder', component: { template: '<div>Builder</div>' } },
  ],
})

router.push = mockPush
router.replace = mockReplace

let pinia: ReturnType<typeof createPinia>

/**
 *
 */
function mountLogin() {
  return mount(LoginView, {
    global: {
      plugins: [pinia, router],
      stubs: {
        RouterLink: true,
      },
    },
    attachTo: document.body,
  })
}

describe('LoginView', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('renders email and password fields', () => {
    const wrapper = mountLogin()
    expect(wrapper.find('#login-email').exists()).toBe(true)
    expect(wrapper.find('#login-password').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Login')
  })

  it('shows validation errors for empty fields', async () => {
    const wrapper = mountLogin()
    await wrapper.find('form').trigger('submit.prevent')
    const errors = wrapper.find('.errors')
    expect(errors.exists()).toBe(true)
    expect(errors.text()).toContain('Email is required')
    expect(errors.text()).toContain('Password is required')
  })

  it('shows link to signup page', () => {
    const wrapper = mountLogin()
    expect(wrapper.text()).toContain("Don't have an account?")
  })

  it('redirects to /builder when already authenticated', async () => {
    // Simulate authenticated state by setting user and token
    const store = useAuthStore()
    store.token = 'existing-token'
    store.user = { id: '1', email: 'test@test.com' }

    mountLogin()
    await nextTick()

    expect(mockReplace).toHaveBeenCalledWith('/builder')
  })

  it('does not redirect when not authenticated', async () => {
    mountLogin()
    await nextTick()

    expect(mockReplace).not.toHaveBeenCalled()
  })
})
