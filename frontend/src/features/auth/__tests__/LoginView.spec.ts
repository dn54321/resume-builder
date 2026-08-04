import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../LoginView.vue'
import { useAuthStore } from '../stores/auth'
import { ApiRequestError } from '@/shared/composables/useApi'

const mockPush = vi.fn<(...args: unknown[]) => Promise<void>>()
const mockReplace = vi.fn<(...args: unknown[]) => Promise<void>>()

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/signup', name: 'signup', component: { template: '<div>Signup</div>' } },
    { path: '/builder', name: 'builder', component: { template: '<div>Builder</div>' } },
    { path: '/dashboard', name: 'dashboard', component: { template: '<div>Dashboard</div>' } },
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
  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
    vi.clearAllMocks()
    // Reset route to clean state (no query params)
    await realReplace.call(router, '/login')
  })

  it('renders decorative SVG blobs with aria-hidden', () => {
    const wrapper = mountLogin()

    // All decorative blobs should render SvgIllustration components
    // (SvgIllustration root has class "svg-illustration")
    const svgIllustrations = wrapper.findAll('.svg-illustration')
    expect(svgIllustrations.length).toBeGreaterThanOrEqual(5)

    // The decorative containers should have aria-hidden="true"
    const ariaHiddenContainers = wrapper.findAll('[aria-hidden="true"]')
    expect(ariaHiddenContainers.length).toBeGreaterThanOrEqual(4)

    // Decorative containers should have pointer-events-none
    const pointerEventsNone = wrapper.findAll('.pointer-events-none')
    expect(pointerEventsNone.length).toBeGreaterThanOrEqual(4)
  })

  it('renders email and password fields', () => {
    const wrapper = mountLogin()
    expect(wrapper.find('#login-email').exists()).toBe(true)
    expect(wrapper.find('#login-password').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Log in')
  })

  it('shows validation errors for empty fields', async () => {
    const wrapper = mountLogin()
    await wrapper.find('form').trigger('submit.prevent')
    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Email is required')
    expect(alert.text()).toContain('Password is required')
  })

  it('shows link to signup page', () => {
    const wrapper = mountLogin()
    expect(wrapper.text()).toContain("Don't have an account?")
  })

  it('redirects to /dashboard when already authenticated', async () => {
    // Simulate authenticated state by setting user and token
    const store = useAuthStore()
    store.user = { id: '1', email: 'test@test.com' }

    mountLogin()
    await nextTick()

    expect(mockReplace).toHaveBeenCalledWith('/dashboard')
  })

  it('does not redirect when not authenticated', async () => {
    mountLogin()
    await nextTick()

    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('redirects to query.redirect after successful login', async () => {
    // Navigate to /login?redirect=/builder using the real router so route.query is populated
    await realPush.call(router, { path: '/login', query: { redirect: '/builder' } })

    const store = useAuthStore()
    const loginSpy = vi.spyOn(store, 'login').mockResolvedValue(undefined)

    const wrapper = mountLogin()
    await wrapper.find('#login-email').setValue('test@test.com')
    await wrapper.find('#login-password').setValue('password')
    await wrapper.find('form').trigger('submit.prevent')

    expect(loginSpy).toHaveBeenCalledWith('test@test.com', 'password')
    expect(mockReplace).toHaveBeenCalledWith('/builder')
  })

  it('redirects to /dashboard after successful login when no query.redirect', async () => {
    const store = useAuthStore()
    vi.spyOn(store, 'login').mockResolvedValue(undefined)

    const wrapper = mountLogin()
    await wrapper.find('#login-email').setValue('test@test.com')
    await wrapper.find('#login-password').setValue('password')
    await wrapper.find('form').trigger('submit.prevent')

    expect(mockReplace).toHaveBeenCalledWith('/dashboard')
  })

  it('shows email format error on blur with invalid email', async () => {
    const wrapper = mountLogin()
    const emailInput = wrapper.find('#login-email')
    await emailInput.setValue('not-an-email')
    await emailInput.trigger('blur')
    await nextTick()
    expect(wrapper.text()).toContain('Please enter a valid email address')
  })

  it('clears email format error on blur with valid email', async () => {
    const wrapper = mountLogin()
    const emailInput = wrapper.find('#login-email')
    await emailInput.setValue('invalid')
    await emailInput.trigger('blur')
    await nextTick()
    expect(wrapper.text()).toContain('Please enter a valid email address')
    await emailInput.setValue('good@email.com')
    await emailInput.trigger('blur')
    await nextTick()
    expect(wrapper.text()).not.toContain('Please enter a valid email address')
  })

  it('does not show email error when field is empty on blur', async () => {
    const wrapper = mountLogin()
    const emailInput = wrapper.find('#login-email')
    await emailInput.trigger('blur')
    await nextTick()
    expect(wrapper.text()).not.toContain('Please enter a valid email address')
  })

  it('displays backend validation error verbatim from ApiRequestError.errors', async () => {
    const store = useAuthStore()
    const apiError = new ApiRequestError({
      status: 401,
      message: 'Invalid credentials',
      errors: { email: ['No account found with this email'] },
    })
    vi.spyOn(store, 'login').mockRejectedValue(apiError)

    const wrapper = mountLogin()
    await wrapper.find('#login-email').setValue('nobody@test.com')
    await wrapper.find('#login-password').setValue('wrongpass')
    await wrapper.find('form').trigger('submit.prevent')

    await nextTick()
    const alert = wrapper.find('[role="alert"]')
    expect(alert.text()).toContain('No account found with this email')
    expect(alert.text()).not.toContain('An unexpected error occurred')
  })

  it('shows fallback for unexpected non-ApiRequestError errors', async () => {
    const store = useAuthStore()
    vi.spyOn(store, 'login').mockRejectedValue(new Error('Network failure'))

    const wrapper = mountLogin()
    await wrapper.find('#login-email').setValue('test@test.com')
    await wrapper.find('#login-password').setValue('password123')
    await wrapper.find('form').trigger('submit.prevent')

    await nextTick()
    const alert = wrapper.find('[role="alert"]')
    expect(alert.text()).toContain('An unexpected error occurred. Please try again.')
  })
})
