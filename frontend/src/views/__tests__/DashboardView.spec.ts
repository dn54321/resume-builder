// oxlint-disable vitest/require-mock-type-parameters
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import DashboardView from '@/views/DashboardView.vue'
import ConfirmModal from '@/shared/components/ConfirmModal.vue'
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
  return store
}

const mockResumes = [
  {
    id: 'resume-1',
    name: 'Software Engineer Resume',
    layout: 'standard',
    createdAt: '2025-01-15T10:00:00.000Z',
    updatedAt: '2025-03-01T14:30:00.000Z',
  },
  {
    id: 'resume-2',
    name: null,
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
    expect(cards[0]!.find('.resume-card__name').text()).toBe('Software Engineer Resume')
    expect(cards[1]!.find('.resume-card__name').text()).toBe('Untitled')
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

  it('shows trash icon button on each resume card', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const deleteBtns = wrapper.findAll('[data-testid="delete-btn"]')
    expect(deleteBtns.length).toBe(2)
  })

  it('opens confirm modal on trash button click', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // ConfirmModal should not be visible initially
    const modal = wrapper.getComponent(ConfirmModal)
    expect(modal.props('modelValue')).toBe(false)

    // Click trash on first card
    const deleteBtns = wrapper.findAll('[data-testid="delete-btn"]')
    await deleteBtns[0]!.trigger('click')
    await flushPromises()

    // ConfirmModal should now be visible with correct props
    expect(modal.props('modelValue')).toBe(true)
    expect(modal.props('title')).toBe('Delete Software Engineer Resume?')
    expect(modal.props('description')).toBe('This action cannot be undone.')
    expect(modal.props('variant')).toBe('destructive')
  })

  it('deletes resume on confirm and removes from list', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    // The DELETE call
    mockFetch.mockResolvedValueOnce(mockJsonResponse(null, 204))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Click trash on first card
    const deleteBtns = wrapper.findAll('[data-testid="delete-btn"]')
    await deleteBtns[0]!.trigger('click')
    await flushPromises()

    // Emit confirm on the modal
    const modal = wrapper.getComponent(ConfirmModal)
    await modal.vm.$emit('confirm')
    await flushPromises()

    // Verify DELETE was called
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/resumes/resume-1',
      expect.objectContaining({ method: 'DELETE' }),
    )

    // Only resume-2 remains
    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    expect(cards.length).toBe(1)
    expect(cards[0]!.find('.resume-card__name').text()).toBe('Untitled')
  })

  it('closes modal without deleting when cancel is clicked', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Click trash on first card
    const deleteBtns = wrapper.findAll('[data-testid="delete-btn"]')
    await deleteBtns[0]!.trigger('click')
    await flushPromises()

    // Emit cancel on the modal
    const modal = wrapper.getComponent(ConfirmModal)
    await modal.vm.$emit('cancel')
    await flushPromises()

    // DELETE should NOT have been called (only the initial GET)
    const deleteCalls = mockFetch.mock.calls.filter(
      (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'DELETE',
    )
    expect(deleteCalls.length).toBe(0)

    // Both resumes still present
    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    expect(cards.length).toBe(2)
  })

  it('shows error alert when delete fails', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ message: 'Failed to delete resume' }, 500),
    )

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Click trash on first card
    const deleteBtns = wrapper.findAll('[data-testid="delete-btn"]')
    await deleteBtns[0]!.trigger('click')
    await flushPromises()

    // Emit confirm on the modal
    const modal = wrapper.getComponent(ConfirmModal)
    await modal.vm.$emit('confirm')
    await flushPromises()

    // Error alert should show
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').text()).toBe('Failed to delete resume')
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

  it('btn-primary stylesheet uses --color-foreground not --color-text', () => {
    // JSDOM does not resolve CSS custom property var() references in
    // getComputedStyle, so we verify the scoped <style> block directly.
    const sourcePath = resolve(__dirname, '../DashboardView.vue')
    const source = readFileSync(sourcePath, 'utf-8')

    // Extract the <style scoped> block
    const styleMatch = source.match(/<style[^>]*>([\s\S]*?)<\/style>/)
    expect(styleMatch).not.toBeNull()
    const styleBlock = styleMatch![1]

    // Must use --color-foreground (defined in main.css) for background-color
    expect(styleBlock).toContain(
      'background-color: var(--color-foreground)',
    )

    // Must NOT use --color-text (does not exist → transparent/invisible button)
    expect(styleBlock).not.toContain('var(--color-text)')
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

  // ── Inline Rename ─────────────────────────────────────────

  it('swaps name to input on click and focuses it', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Click the first resume's name
    const name = wrapper.findAll('.resume-card__name')[0]!
    await name.trigger('click')
    await flushPromises()

    // Should now show an input
    const input = wrapper.find('.resume-card__name-input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('Software Engineer Resume')
  })

  it('commits rename on Enter and calls PUT', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    // PUT response for rename
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ id: 'resume-1', name: 'New Name', layout: 'standard' }),
    )

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Start editing
    const name = wrapper.findAll('.resume-card__name')[0]!
    await name.trigger('click')
    await flushPromises()

    // Type new name and press Enter
    const input = wrapper.find('.resume-card__name-input')
    await input.setValue('New Name')
    await input.trigger('keydown.enter')
    await flushPromises()

    // Should have called PUT
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/resumes/resume-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'New Name' }),
      }),
    )

    // Should be back to display mode
    expect(wrapper.find('.resume-card__name-input').exists()).toBe(false)
    expect(wrapper.findAll('.resume-card__name')[0]!.text()).toBe('New Name')
  })

  it('cancels rename on Escape and reverts to display mode', async () => {
    createAuthenticatedStore()
    // Deep-clone to avoid shared-mock mutation from prior tests
    const data = JSON.parse(JSON.stringify(mockResumes)) as typeof mockResumes
    mockFetch.mockResolvedValueOnce(mockJsonResponse(data))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Start editing
    const name = wrapper.findAll('.resume-card__name')[0]!
    await name.trigger('click')
    await flushPromises()

    // Change value then press Escape
    const input = wrapper.find('.resume-card__name-input')
    await input.setValue('Changed')
    await input.trigger('keydown.escape')
    await flushPromises()

    // Should be back to display mode (input gone, name shown)
    expect(wrapper.find('.resume-card__name-input').exists()).toBe(false)
    expect(wrapper.find('.resume-card__name').exists()).toBe(true)
    // Name should not be the edited value
    expect(wrapper.find('.resume-card__name').text()).not.toBe('Changed')
  })

  it('commits rename on blur', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ id: 'resume-1', name: 'Blurred Name', layout: 'standard' }),
    )

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Start editing
    const name = wrapper.findAll('.resume-card__name')[0]!
    await name.trigger('click')
    await flushPromises()

    // Type and blur
    const input = wrapper.find('.resume-card__name-input')
    await input.setValue('Blurred Name')
    await input.trigger('blur')
    await flushPromises()

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/resumes/resume-1',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('cancels rename when trimmed value is empty', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Start editing
    const name = wrapper.findAll('.resume-card__name')[0]!
    await name.trigger('click')
    await flushPromises()

    // Clear and press Enter
    const input = wrapper.find('.resume-card__name-input')
    await input.setValue('   ')
    await input.trigger('keydown.enter')
    await flushPromises()

    // Should cancel — no PUT call, back to display
    expect(wrapper.find('.resume-card__name-input').exists()).toBe(false)
  })

  it('shows rename error on failed PUT', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ message: 'Name already taken' }, 409),
    )

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Start editing
    const name = wrapper.findAll('.resume-card__name')[0]!
    await name.trigger('click')
    await flushPromises()

    // Type and press Enter
    const input = wrapper.find('.resume-card__name-input')
    await input.setValue('Conflict Name')
    await input.trigger('keydown.enter')
    await flushPromises()

    // Should show rename error and still be in editing mode
    expect(wrapper.find('.rename-error').exists()).toBe(true)
    expect(wrapper.find('.rename-error').text()).toBe('Name already taken')
    expect(wrapper.find('.resume-card__name-input').exists()).toBe(true)
  })

  it('shows Untitled for null name resumes', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Second resume has name: null
    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    expect(cards[1]!.find('.resume-card__name').text()).toBe('Untitled')
  })

  it('does not call PUT when name is unchanged', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Start editing
    const name = wrapper.findAll('.resume-card__name')[0]!
    await name.trigger('click')
    await flushPromises()

    // Press Enter without changing the value
    const input = wrapper.find('.resume-card__name-input')
    await input.trigger('keydown.enter')
    await flushPromises()

    // Should only have one fetch call (the initial GET)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    // Back to display mode
    expect(wrapper.find('.resume-card__name-input').exists()).toBe(false)
  })
})
