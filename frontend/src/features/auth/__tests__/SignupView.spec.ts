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
    { path: '/dashboard', name: 'dashboard', component: { template: '<div>Dashboard</div>' } },
    { path: '/builder', name: 'builder', component: { template: '<div>Builder</div>' } },
  ],
})

// Save originals before mocking so we can use them for query.redirect test
const realPush = router.push
const realReplace = router.replace

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
  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
    vi.clearAllMocks()
    // Reset route to clean state (no query params)
    await realReplace.call(router, '/signup')
  })

  it('renders decorative SVG blobs with aria-hidden', () => {
    const wrapper = mountSignup()

    // All decorative blobs should render SvgIllustration components
    const svgIllustrations = wrapper.findAll('.svg-illustration')
    expect(svgIllustrations.length).toBeGreaterThanOrEqual(5)

    // The decorative containers should have aria-hidden="true"
    const ariaHiddenContainers = wrapper.findAll('[aria-hidden="true"]')
    expect(ariaHiddenContainers.length).toBeGreaterThanOrEqual(4)

    // Decorative containers should have pointer-events-none
    const pointerEventsNone = wrapper.findAll('.pointer-events-none')
    expect(pointerEventsNone.length).toBeGreaterThanOrEqual(4)
  })

  it('renders email, password, and confirm password fields', () => {
    const wrapper = mountSignup()
    expect(wrapper.find('#signup-email').exists()).toBe(true)
    expect(wrapper.find('#signup-password').exists()).toBe(true)
    expect(wrapper.find('#signup-confirm').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Sign up')
  })

  it('shows validation errors for empty fields', async () => {
    const wrapper = mountSignup()
    await wrapper.find('form').trigger('submit.prevent')
    // shadcn Alert with variant="destructive" has role="alert"
    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Email is required')
    expect(alert.text()).toContain('Password is required')
  })

  it('shows error when password is too short', async () => {
    const wrapper = mountSignup()
    await wrapper.find('#signup-email').setValue('test@test.com')
    await wrapper.find('#signup-password').setValue('short')
    await wrapper.find('#signup-confirm').setValue('short')
    await wrapper.find('form').trigger('submit.prevent')
    const alert = wrapper.find('[role="alert"]')
    expect(alert.text()).toContain('Password must be at least 8 characters')
  })

  it('shows error when passwords do not match', async () => {
    const wrapper = mountSignup()
    await wrapper.find('#signup-email').setValue('test@test.com')
    await wrapper.find('#signup-password').setValue('Password1')
    await wrapper.find('#signup-confirm').setValue('Password2')
    await wrapper.find('form').trigger('submit.prevent')
    const alert = wrapper.find('[role="alert"]')
    expect(alert.text()).toContain('Passwords do not match')
  })

  it('shows link to login page', () => {
    const wrapper = mountSignup()
    expect(wrapper.text()).toContain('Already have an account?')
  })

  it('redirects to /dashboard when already authenticated', async () => {
    const store = useAuthStore()
    store.token = 'existing-token'
    store.user = { id: '1', email: 'test@test.com' }

    mountSignup()
    await nextTick()

    expect(mockReplace).toHaveBeenCalledWith('/dashboard')
  })

  it('does not redirect when not authenticated', async () => {
    mountSignup()
    await nextTick()

    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('redirects to query.redirect after successful signup', async () => {
    // Navigate to /signup?redirect=/builder using the real router so route.query is populated
    await realPush.call(router, { path: '/signup', query: { redirect: '/builder' } })

    const store = useAuthStore()
    const signupSpy = vi.spyOn(store, 'signup').mockResolvedValue(undefined)

    const wrapper = mountSignup()
    await wrapper.find('#signup-email').setValue('test@test.com')
    await wrapper.find('#signup-password').setValue('Password1')
    await wrapper.find('#signup-confirm').setValue('Password1')
    await wrapper.find('form').trigger('submit.prevent')

    expect(signupSpy).toHaveBeenCalledWith('test@test.com', 'Password1')
    expect(mockReplace).toHaveBeenCalledWith('/builder')
  })

  it('redirects to /dashboard after successful signup when no query.redirect', async () => {
    const store = useAuthStore()
    vi.spyOn(store, 'signup').mockResolvedValue(undefined)

    const wrapper = mountSignup()
    await wrapper.find('#signup-email').setValue('test@test.com')
    await wrapper.find('#signup-password').setValue('Password1')
    await wrapper.find('#signup-confirm').setValue('Password1')
    await wrapper.find('form').trigger('submit.prevent')

    expect(mockReplace).toHaveBeenCalledWith('/dashboard')
  })

  it('has type="email" on the email input', () => {
    const wrapper = mountSignup()
    const input = wrapper.find('#signup-email')
    expect((input.element as HTMLInputElement).type).toBe('email')
  })

  it('has autocomplete="email" on the email input', () => {
    const wrapper = mountSignup()
    const input = wrapper.find('#signup-email')
    expect((input.element as HTMLInputElement).autocomplete).toBe('email')
  })

  it('shows email format error on blur with invalid email', async () => {
    const wrapper = mountSignup()
    const emailInput = wrapper.find('#signup-email')
    await emailInput.setValue('not-an-email')
    await emailInput.trigger('blur')
    await nextTick()
    expect(wrapper.text()).toContain('Please enter a valid email address')
  })

  it('clears email format error on blur with valid email', async () => {
    const wrapper = mountSignup()
    const emailInput = wrapper.find('#signup-email')
    // First set an invalid email and blur to trigger the error
    await emailInput.setValue('invalid')
    await emailInput.trigger('blur')
    await nextTick()
    expect(wrapper.text()).toContain('Please enter a valid email address')
    // Then set a valid email and blur to clear the error
    await emailInput.setValue('valid@example.com')
    await emailInput.trigger('blur')
    await nextTick()
    expect(wrapper.text()).not.toContain('Please enter a valid email address')
  })

  it('shows email format error on submit when email is invalid', async () => {
    const wrapper = mountSignup()
    await wrapper.find('#signup-email').setValue('not-an-email')
    await wrapper.find('#signup-password').setValue('password123')
    await wrapper.find('#signup-confirm').setValue('password123')
    await wrapper.find('form').trigger('submit.prevent')
    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Please enter a valid email address')
  })

  it('displays backend validation error verbatim from ApiRequestError.errors', async () => {
    const store = useAuthStore()
    const apiError = new ApiRequestError({
      status: 400,
      message: 'Validation failed',
      errors: { email: ['Invalid email domain'] },
    })
    vi.spyOn(store, 'signup').mockRejectedValue(apiError)

    const wrapper = mountSignup()
    await wrapper.find('#signup-email').setValue('test@bad.com')
    await wrapper.find('#signup-password').setValue('password123')
    await wrapper.find('#signup-confirm').setValue('password123')
    await wrapper.find('form').trigger('submit.prevent')

    await nextTick()
    const alert = wrapper.find('[role="alert"]')
    expect(alert.text()).toContain('Invalid email domain')
    expect(alert.text()).not.toContain('An unexpected error occurred')
  })

  it('displays ApiRequestError.message when no field errors exist', async () => {
    const store = useAuthStore()
    const apiError = new ApiRequestError({
      status: 429,
      message: 'Too many requests. Try again later.',
    })
    vi.spyOn(store, 'signup').mockRejectedValue(apiError)

    const wrapper = mountSignup()
    await wrapper.find('#signup-email').setValue('test@test.com')
    await wrapper.find('#signup-password').setValue('password123')
    await wrapper.find('#signup-confirm').setValue('password123')
    await wrapper.find('form').trigger('submit.prevent')

    await nextTick()
    const alert = wrapper.find('[role="alert"]')
    expect(alert.text()).toContain('Too many requests. Try again later.')
  })

  it('shows fallback for unexpected non-ApiRequestError errors', async () => {
    const store = useAuthStore()
    vi.spyOn(store, 'signup').mockRejectedValue(new Error('Network failure'))

    const wrapper = mountSignup()
    await wrapper.find('#signup-email').setValue('test@test.com')
    await wrapper.find('#signup-password').setValue('password123')
    await wrapper.find('#signup-confirm').setValue('password123')
    await wrapper.find('form').trigger('submit.prevent')

    await nextTick()
    const alert = wrapper.find('[role="alert"]')
    expect(alert.text()).toContain('An unexpected error occurred. Please try again.')
  })
})
