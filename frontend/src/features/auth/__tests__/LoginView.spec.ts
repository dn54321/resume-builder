import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../LoginView.vue'

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

function mountLogin() {
  return mount(LoginView, {
    global: {
      plugins: [createPinia(), router],
      stubs: {
        RouterLink: true,
      },
    },
    attachTo: document.body,
  })
}

describe('LoginView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
})
