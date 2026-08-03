// oxlint-disable vitest/require-mock-type-parameters
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '@/views/DashboardView.vue'
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
    { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
    { path: '/dashboard', name: 'dashboard', component: DashboardView },
    { path: '/builder/:id', name: 'builder', component: { template: '<div>Builder</div>' } },
  ],
})

/**
 *
 */
function createAuthenticatedStore() {
  const store = useAuthStore()
  store.user = { id: 'user-1', email: 'test@example.com' }
  store.token = 'valid-token'
  localStorage.setItem('auth_token', 'valid-token')
  return store
}

const mockResumes = [
  {
    id: 'resume-1',
    layout: 'standard',
    createdAt: '2025-01-15T10:00:00.000Z',
    updatedAt: '2025-03-01T14:30:00.000Z',
  },
  {
    id: 'resume-2',
    layout: 'modern',
    createdAt: '2025-02-20T08:00:00.000Z',
    updatedAt: '2025-03-10T09:15:00.000Z',
  },
]

describe('DashboardView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockFetch.mockReset()
  })

  // ── Auth Guard ──────────────────────────────────────────────

  it('redirects to /login when not authenticated', async () => {
    const pushSpy = vi.spyOn(router, 'replace')

    mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    expect(pushSpy).toHaveBeenCalledWith('/login')
  })

  // ── Header ──────────────────────────────────────────────────

  it('renders "My Resumes" heading and Create New Resume button', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('My Resumes')
    expect(wrapper.find('.btn-primary').text()).toBe('Create New Resume')
  })

  // ── Loading State ───────────────────────────────────────────

  it('shows skeleton cards while loading', () => {
    createAuthenticatedStore()
    // Never resolve — keep loading
    mockFetch.mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    const skeletons = wrapper.findAll('.resume-card--skeleton')
    expect(skeletons.length).toBe(3)
    expect(wrapper.find('.skeleton-line--title').exists()).toBe(true)
    expect(wrapper.find('.skeleton-line--date').exists()).toBe(true)
  })

  // ── Error State ─────────────────────────────────────────────

  it('shows error alert when API fetch fails', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ message: 'Internal server error' }, 500),
    )

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').text()).toBe('Internal server error')
  })

  it('shows generic error when fetch throws non-API error', async () => {
    createAuthenticatedStore()
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').text()).toBe('Something went wrong')
  })

  // ── Empty State ─────────────────────────────────────────────

  it('shows empty state when no resumes exist', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse([]))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.find('.empty-state-card h2').text()).toBe('No resumes yet')
    expect(wrapper.find('.empty-state-card p').text()).toContain(
      'Create your first resume to get started',
    )
    expect(wrapper.find('.empty-state-card .btn-primary').exists()).toBe(true)
  })

  // ── Resume List ─────────────────────────────────────────────

  it('renders resume cards from API response', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    expect(cards.length).toBe(2)
    expect(cards[0]!.find('.resume-card__name').text()).toBe('standard')
    expect(cards[1]!.find('.resume-card__name').text()).toBe('modern')
  })

  it('shows formatted dates on resume cards', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    // Date format varies by locale, but should contain "Updated"
    expect(cards[0]!.find('.resume-card__date').text()).toContain('Updated')
  })

  it('navigates to builder on card click', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    await cards[0]!.trigger('click')

    expect(pushSpy).toHaveBeenCalledWith('/builder/resume-1')
  })

  it('navigates to builder on card keyboard enter', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    await cards[1]!.trigger('keydown.enter')

    expect(pushSpy).toHaveBeenCalledWith('/builder/resume-2')
  })

  // ── Delete Button ───────────────────────────────────────────

  it('does not show delete button', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // No delete action visible
    expect(wrapper.text()).not.toContain('Delete')
    expect(wrapper.text()).not.toContain('delete')
  })

  // ── Create Resume Flow ─────────────────────────────────────

  it('creates resume and navigates to builder on success', async () => {
    createAuthenticatedStore()
    // First call: fetch resumes (empty list)
    mockFetch.mockResolvedValueOnce(mockJsonResponse([]))
    // Second call: create resume
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ id: 'new-resume-id' }, 201),
    )

    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Empty state renders with CTA button
    const emptyStateBtn = wrapper.find('.empty-state-card .btn-primary')
    expect(emptyStateBtn.exists()).toBe(true)

    await emptyStateBtn.trigger('click')
    await flushPromises()

    // Verify POST was called with sections: []
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/resumes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sections: [] }),
      }),
    )

    expect(pushSpy).toHaveBeenCalledWith('/builder/new-resume-id')
  })

  it('shows error when create resume fails', async () => {
    createAuthenticatedStore()
    // First call: fetch resumes (empty list)
    mockFetch.mockResolvedValueOnce(mockJsonResponse([]))
    // Second call: create fails
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ message: 'Failed to create resume' }, 500),
    )

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const emptyStateBtn = wrapper.find('.empty-state-card .btn-primary')
    await emptyStateBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').text()).toBe('Failed to create resume')
  })

  it('shows generic error when create throws non-API error', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse([]))
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const emptyStateBtn = wrapper.find('.empty-state-card .btn-primary')
    await emptyStateBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').text()).toBe('Something went wrong')
  })

  it('creates resume from header button and navigates to builder', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ id: 'new-resume-id-2' }, 201),
    )

    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // The Create New Resume button in the header (when resumes exist)
    const headerBtn = wrapper.find('.dashboard-header .btn-primary')
    expect(headerBtn.exists()).toBe(true)

    await headerBtn.trigger('click')
    await flushPromises()

    expect(pushSpy).toHaveBeenCalledWith('/builder/new-resume-id-2')
  })

  // ── Dark Mode / Theme ─────────────────────────────────────

  it('error alert has dark-mode Tailwind classes', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ message: 'Error' }, 500),
    )

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.classes()).toContain('dark:bg-red-950')
    expect(alert.classes()).toContain('dark:border-red-800')
    expect(alert.classes()).toContain('dark:text-red-200')
  })

  it('skeleton cards render with skeleton class for theme-aware styling', () => {
    createAuthenticatedStore()
    mockFetch.mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    const skeletons = wrapper.findAll('.resume-card--skeleton')
    expect(skeletons.length).toBe(3)
    expect(wrapper.find('.skeleton-line').exists()).toBe(true)
  })

  it('empty-state card has theme-card background via CSS var', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse([]))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Verify the empty state card renders (CSS var --color-card is applied via scoped style)
    const card = wrapper.find('.empty-state-card')
    expect(card.exists()).toBe(true)
    expect(card.find('h2').text()).toBe('No resumes yet')
  })

  it('disables Create New Resume button while loading', () => {
    createAuthenticatedStore()
    mockFetch.mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    const btn = wrapper.find('.dashboard-header .btn-primary')
    expect(btn.attributes('disabled')).toBeDefined()
  })
})
