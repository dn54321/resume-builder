import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import SignupView from '../SignupView.vue'
import { useAuthStore } from '../stores/auth'
import { ApiRequestError } from '@/shared/composables/useApi'

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

let pinia: ReturnType<typeof createPinia>

/**
 *
 */
function mountSignup() {
  return mount(SignupView, {
    global: {
      plugins: [pinia, router],
      stubs: {
        RouterLink: true,
      },
    },
    attachTo: document.body,
  })
}

describe('SignupView', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
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

  it('redirects to /builder when already authenticated', async () => {
    const store = useAuthStore()
    store.token = 'existing-token'
    store.user = { id: '1', email: 'test@test.com' }

    mountSignup()
    await nextTick()

    expect(mockReplace).toHaveBeenCalledWith('/builder')
  })

  it('does not redirect when not authenticated', async () => {
    mountSignup()
    await nextTick()

    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('shows email format error on blur with invalid email', async () => {
    const wrapper = mountSignup()
    const emailInput = wrapper.find('#signup-email')
    await emailInput.setValue('invalid-email')
    await emailInput.trigger('blur')
    const errors = wrapper.find('.errors')
    expect(errors.text()).toContain('Please enter a valid email address')
  })

  it('does not show email format error on blur for valid email', async () => {
    const wrapper = mountSignup()
    const emailInput = wrapper.find('#signup-email')
    await emailInput.setValue('valid@example.com')
    await emailInput.trigger('blur')
    expect(wrapper.find('.errors').exists()).toBe(false)
  })

  it('clears email format error when user types a valid email', async () => {
    const wrapper = mountSignup()
    const emailInput = wrapper.find('#signup-email')

    // First trigger invalid
    await emailInput.setValue('bad')
    await emailInput.trigger('blur')
    expect(wrapper.find('.errors').text()).toContain('Please enter a valid email address')

    // Then type a valid email and blur again
    await emailInput.setValue('good@example.com')
    await emailInput.trigger('blur')
    // Error element gone when all errors cleared
    expect(wrapper.find('.errors').exists()).toBe(false)
  })

  it('shows email format error on submit for invalid email', async () => {
    const wrapper = mountSignup()
    await wrapper.find('#signup-email').setValue('not-an-email')
    await wrapper.find('#signup-password').setValue('Password1')
    await wrapper.find('#signup-confirm-password').setValue('Password1')
    await wrapper.find('form').trigger('submit.prevent')
    const errors = wrapper.find('.errors')
    expect(errors.text()).toContain('Please enter a valid email address')
  })

  it('displays backend email validation errors verbatim via ApiRequestError', async () => {
    const store = useAuthStore()
    vi.spyOn(store, 'signup').mockRejectedValue(
      new ApiRequestError({
        status: 400,
        message: 'Validation failed',
        errors: { email: ['email must be an email'] },
      }),
    )

    const wrapper = mountSignup()
    // Use an email that passes client-side regex but would fail server-side
    await wrapper.find('#signup-email').setValue('user@bad.com')
    await wrapper.find('#signup-password').setValue('Password1')
    await wrapper.find('#signup-confirm-password').setValue('Password1')
    await wrapper.find('form').trigger('submit.prevent')
    const errors = wrapper.find('.errors')
    expect(errors.text()).toContain('email must be an email')
  })

  it('displays ApiRequestError message when no field-level errors', async () => {
    const store = useAuthStore()
    vi.spyOn(store, 'signup').mockRejectedValue(
      new ApiRequestError({
        status: 409,
        message: 'An account with this email already exists',
      }),
    )

    const wrapper = mountSignup()
    await wrapper.find('#signup-email').setValue('existing@example.com')
    await wrapper.find('#signup-password').setValue('Password1')
    await wrapper.find('#signup-confirm-password').setValue('Password1')
    await wrapper.find('form').trigger('submit.prevent')
    const errors = wrapper.find('.errors')
    expect(errors.text()).toContain('An account with this email already exists')
  })

  it('shows fallback message for non-ApiRequestError errors', async () => {
    const store = useAuthStore()
    vi.spyOn(store, 'signup').mockRejectedValue(new Error('Network failure'))

    const wrapper = mountSignup()
    await wrapper.find('#signup-email').setValue('test@example.com')
    await wrapper.find('#signup-password').setValue('Password1')
    await wrapper.find('#signup-confirm-password').setValue('Password1')
    await wrapper.find('form').trigger('submit.prevent')
    const errors = wrapper.find('.errors')
    expect(errors.text()).toContain('An unexpected error occurred. Please try again.')
    expect(errors.text()).not.toContain('Something went wrong')
  })
})