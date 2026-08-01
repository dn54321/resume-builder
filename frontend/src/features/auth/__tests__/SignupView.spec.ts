import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import SignupView from '../SignupView.vue'

const mockPush = vi.fn<(...args: unknown[]) => Promise<void>>()
const mockReplace = vi.fn<(...args: unknown[]) => Promise<void>>()

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
    { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
    { path: '/signup', name: 'signup', component: SignupView },
    { path: '/builder', name: 'builder', component: { template: '<div>Builder</div>' } },
  ],
})

router.push = mockPush
router.replace = mockReplace

function mountSignup() {
  return mount(SignupView, {
    global: {
      plugins: [createPinia(), router],
      stubs: {
        RouterLink: true,
      },
    },
    attachTo: document.body,
  })
}

describe('SignupView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('renders email, password, and confirm password fields', () => {
    const wrapper = mountSignup()
    expect(wrapper.find('#signup-email').exists()).toBe(true)
    expect(wrapper.find('#signup-password').exists()).toBe(true)
    expect(wrapper.find('#signup-confirm-password').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Sign Up')
  })

  it('shows validation errors for empty fields', async () => {
    const wrapper = mountSignup()
    await wrapper.find('form').trigger('submit.prevent')
    const errors = wrapper.find('.errors')
    expect(errors.exists()).toBe(true)
    expect(errors.text()).toContain('Email is required')
    expect(errors.text()).toContain('Password is required')
  })

  it('shows error when password is too short', async () => {
    const wrapper = mountSignup()
    await wrapper.find('#signup-email').setValue('test@test.com')
    await wrapper.find('#signup-password').setValue('short')
    await wrapper.find('#signup-confirm-password').setValue('short')
    await wrapper.find('form').trigger('submit.prevent')
    const errors = wrapper.find('.errors')
    expect(errors.text()).toContain('Password must be at least 8 characters')
  })

  it('shows error when passwords do not match', async () => {
    const wrapper = mountSignup()
    await wrapper.find('#signup-email').setValue('test@test.com')
    await wrapper.find('#signup-password').setValue('Password1')
    await wrapper.find('#signup-confirm-password').setValue('Password2')
    await wrapper.find('form').trigger('submit.prevent')
    const errors = wrapper.find('.errors')
    expect(errors.text()).toContain('Passwords do not match')
  })

  it('shows link to login page', () => {
    const wrapper = mountSignup()
    expect(wrapper.text()).toContain('Already have an account?')
  })
})
