// oxlint-disable vitest/require-mock-type-parameters
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import AccountView from '@/views/AccountView.vue'
import { useAuthStore } from '@/features/auth/stores/auth'

const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
globalThis.fetch = mockFetch

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

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
    { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
    { path: '/account', name: 'account', component: AccountView },
  ],
})

/**
 *
 */
function createAuthenticatedStore() {
  const store = useAuthStore()
  store.user = { id: 'user-1', email: 'test@example.com' }
  return store
}

describe('AccountView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockFetch.mockReset()
  })

  it('renders account info with email', () => {
    createAuthenticatedStore()

    const wrapper = mount(AccountView, {
      global: { plugins: [router] },
    })

    // CardTitle renders an h3
    const headings = wrapper.findAll('h3')
    expect(headings[0]!.text()).toBe('Account Info')
    expect(wrapper.text()).toContain('test@example.com')
  })

  describe('Change Password', () => {
    it('renders the change password form', () => {
      createAuthenticatedStore()

      const wrapper = mount(AccountView, {
        global: { plugins: [router] },
      })

      const headings = wrapper.findAll('h3')
      expect(headings[1]!.text()).toContain('Change Password')
      expect(wrapper.find('#current-password').exists()).toBe(true)
      expect(wrapper.find('#new-password').exists()).toBe(true)
      expect(wrapper.find('#confirm-new-password').exists()).toBe(true)
    })

    it('shows error when new passwords do not match', async () => {
      createAuthenticatedStore()

      const wrapper = mount(AccountView, {
        global: { plugins: [router] },
      })

      await wrapper.find('#current-password').setValue('current')
      await wrapper.find('#new-password').setValue('new1234')
      await wrapper.find('#confirm-new-password').setValue('different')
      // Trigger the first form (change password)
      await wrapper.findAll('form')[0]!.trigger('submit.prevent')

      await wrapper.vm.$nextTick()

      // The error Alert is in the change password section (first Alert on page)
      expect(wrapper.find('[role="alert"]').text()).toBe(
        'New passwords do not match',
      )
    })

    it('shows error when new password is too short', async () => {
      createAuthenticatedStore()

      const wrapper = mount(AccountView, {
        global: { plugins: [router] },
      })

      await wrapper.find('#current-password').setValue('current')
      await wrapper.find('#new-password').setValue('short')
      await wrapper.find('#confirm-new-password').setValue('short')
      await wrapper.findAll('form')[0]!.trigger('submit.prevent')

      await wrapper.vm.$nextTick()

      expect(wrapper.find('[role="alert"]').text()).toBe(
        'Password must be at least 8 characters',
      )
    })

    it('shows error from server on failed password change', async () => {
      createAuthenticatedStore()
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ message: 'Current password is incorrect' }, 401),
      )

      const wrapper = mount(AccountView, {
        global: { plugins: [router] },
      })

      await wrapper.find('#current-password').setValue('wrong')
      await wrapper.find('#new-password').setValue('newpassword123')
      await wrapper.find('#confirm-new-password').setValue('newpassword123')
      await wrapper.findAll('form')[0]!.trigger('submit.prevent')

      await wrapper.vm.$nextTick()
      // Wait for the async fetch to resolve
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(wrapper.find('[role="alert"]').text()).toBe(
        'Current password is incorrect',
      )
    })

    it('shows success message on successful password change', async () => {
      createAuthenticatedStore()
      mockFetch.mockResolvedValueOnce(mockJsonResponse(null, 204))

      const wrapper = mount(AccountView, {
        global: { plugins: [router] },
      })

      await wrapper.find('#current-password').setValue('correct')
      await wrapper.find('#new-password').setValue('newpassword123')
      await wrapper.find('#confirm-new-password').setValue('newpassword123')
      await wrapper.findAll('form')[0]!.trigger('submit.prevent')

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 10))

      // The success alert is rendered inside the change password section
      const alerts = wrapper.findAll('[role="alert"]')
      expect(alerts.length).toBe(1)
      expect(alerts[0]!.text()).toContain(
        'Password changed successfully',
      )
    })
  })

  describe('Delete Account', () => {
    it('shows error when confirmation text does not match', async () => {
      createAuthenticatedStore()

      const wrapper = mount(AccountView, {
        global: { plugins: [router] },
      })

      await wrapper.find('#delete-password').setValue('password')
      await wrapper.find('#delete-confirm').setValue('wrong text')
      // The delete form is the second form on the page
      await wrapper.findAll('form')[1]!.trigger('submit.prevent')

      await wrapper.vm.$nextTick()

      // The Alert in the delete section
      const alerts = wrapper.findAll('[role="alert"]')
      const deleteAlert = alerts[alerts.length - 1]!
      expect(deleteAlert.text()).toContain(
        'Type "delete my account" to confirm',
      )
    })

    it('clears session on successful delete', async () => {
      createAuthenticatedStore()

      mockFetch.mockResolvedValueOnce(mockJsonResponse(null, 204))

      const wrapper = mount(AccountView, {
        global: { plugins: [router] },
      })

      await wrapper.find('#delete-password').setValue('password')
      await wrapper.find('#delete-confirm').setValue('delete my account')
      await wrapper.findAll('form')[1]!.trigger('submit.prevent')

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 10))

      // After logout, user should be cleared
      const store = useAuthStore()
      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })

    it('shows error from server on wrong password', async () => {
      createAuthenticatedStore()
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ message: 'Password is incorrect' }, 401),
      )

      const wrapper = mount(AccountView, {
        global: { plugins: [router] },
      })

      await wrapper.find('#delete-password').setValue('wrong-pw')
      await wrapper.find('#delete-confirm').setValue('delete my account')
      await wrapper.findAll('form')[1]!.trigger('submit.prevent')

      await wrapper.vm.$nextTick()
      await new Promise((resolve) => setTimeout(resolve, 10))

      const alerts = wrapper.findAll('[role="alert"]')
      const deleteAlert = alerts[alerts.length - 1]!
      expect(deleteAlert.text()).toBe('Password is incorrect')
    })
  })

  describe('Danger zone styling', () => {
    it('renders delete card with destructive border', () => {
      createAuthenticatedStore()

      const wrapper = mount(AccountView, {
        global: { plugins: [router] },
      })

      // The third Card (index 2 in cards array) should have border-destructive
      const cards = wrapper.findAll('.rounded-lg')
      expect(cards.length).toBeGreaterThanOrEqual(3)
      expect(cards[2]!.classes()).toContain('border-destructive')
    })

    it('renders destructive heading in danger zone', () => {
      createAuthenticatedStore()

      const wrapper = mount(AccountView, {
        global: { plugins: [router] },
      })

      const headings = wrapper.findAll('h3')
      expect(headings[2]!.text()).toBe('Delete Account')
      expect(headings[2]!.classes()).toContain('text-destructive')
    })
  })
})
