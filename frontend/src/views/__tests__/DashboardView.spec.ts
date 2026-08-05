// oxlint-disable vitest/require-mock-type-parameters
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import DashboardView from '@/views/DashboardView.vue'
import ConfirmModal from '@/shared/components/ConfirmModal.vue'
import { useAuthStore } from '@/features/auth/stores/auth'

const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
globalThis.fetch = mockFetch

/**
 * Build a minimal fetch Response for mocking API calls.
 * @param {unknown} data - Payload to return from `json()`/`text()`
 * @param {number} status - HTTP status code (default 200)
 * @returns {Response} A mock Response with the given status and payload
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

/**
 * Open the ellipsis menu on the card at `index` and resolve the teleported
 * content (reka-ui portals DropdownMenuContent to document.body).
 * @param {VueWrapper} wrapper - Mounted DashboardView wrapper
 * @param {number} index - Card index whose menu should be opened
 * @returns {Promise<void>} Resolves once the menu content has rendered
 */
async function openCardMenu(wrapper: VueWrapper, index = 0): Promise<void> {
  const triggers = wrapper.findAll('[data-testid="resume-menu-trigger"]')
  await triggers[index]!.trigger('click')
  await nextTick()
}

/**
 * Click a teleported dropdown item by test id.
 * @param {string} testId - data-testid of the menu item
 */
function clickMenuItem(testId: string): void {
  const item = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
  expect(item).not.toBeNull()
  item!.click()
}

describe('DashboardView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockFetch.mockReset()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
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

  it('navigates to builder on card keyboard space', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    await cards[0]!.trigger('keydown.space')

    expect(pushSpy).toHaveBeenCalledWith('/builder/resume-1')
  })

  it('navigates to builder when the card name is clicked (no inline edit)', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Clicking the name is a card click — it must navigate, not start editing
    const name = wrapper.findAll('.resume-card__name')[0]!
    await name.trigger('click')

    expect(pushSpy).toHaveBeenCalledWith('/builder/resume-1')
    expect(wrapper.find('.resume-card__name-input').exists()).toBe(false)
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

  // ── Card Actions Dropdown ───────────────────────────────────

  it('shows an ellipsis menu button on each resume card', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const menuBtns = wrapper.findAll('[data-testid="resume-menu-trigger"]')
    expect(menuBtns.length).toBe(2)
  })

  it('renders Rename, Duplicate and Delete options in the dropdown', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)

    const renameItem = document.querySelector('[data-testid="menu-rename"]')
    const duplicateItem = document.querySelector('[data-testid="menu-duplicate"]')
    const deleteItem = document.querySelector('[data-testid="menu-delete"]')

    expect(renameItem).not.toBeNull()
    expect(duplicateItem).not.toBeNull()
    expect(deleteItem).not.toBeNull()
    expect(renameItem!.textContent).toContain('Rename')
    expect(duplicateItem!.textContent).toContain('Duplicate')
    expect(deleteItem!.textContent).toContain('Delete')

    wrapper.unmount()
  })

  it('does not navigate to builder when the menu trigger is clicked', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)

    // The dropdown is open and no navigation happened
    expect(pushSpy).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  // ── Duplicate ───────────────────────────────────────────────

  it('duplicates a resume and adds the copy to the list', async () => {
    createAuthenticatedStore()
    // Deep-clone so the unshift of the copy doesn't pollute the shared mock
    const data = JSON.parse(JSON.stringify(mockResumes)) as typeof mockResumes
    mockFetch.mockResolvedValueOnce(mockJsonResponse(data))
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(
        {
          id: 'resume-1-copy',
          name: 'Copy of Software Engineer Resume',
          layout: 'standard',
          createdAt: '2025-04-01T10:00:00.000Z',
          updatedAt: '2025-04-01T10:00:00.000Z',
        },
        201,
      ),
    )

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-duplicate')
    await flushPromises()

    // POST to the duplicate endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/resumes/resume-1/duplicate',
      expect.objectContaining({ method: 'POST' }),
    )

    // The copy is prepended (newest first) and no navigation happened
    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    expect(cards.length).toBe(3)
    expect(cards[0]!.find('.resume-card__name').text()).toBe(
      'Copy of Software Engineer Resume',
    )

    wrapper.unmount()
  })

  it('shows error alert when duplicate fails', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ message: 'Failed to duplicate resume' }, 500),
    )

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-duplicate')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Failed to duplicate resume',
    )

    // List unchanged
    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    expect(cards.length).toBe(2)

    wrapper.unmount()
  })

  it('shows generic error when duplicate throws non-API error', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-duplicate')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe('Something went wrong')

    wrapper.unmount()
  })

  // ── Delete ──────────────────────────────────────────────────

  it('opens confirm modal when Delete is chosen from the menu', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // ConfirmModal should not be visible initially
    const modal = wrapper.getComponent(ConfirmModal)
    expect(modal.props('modelValue')).toBe(false)

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-delete')
    await flushPromises()

    // ConfirmModal should now be visible with correct props
    expect(modal.props('modelValue')).toBe(true)
    expect(modal.props('title')).toBe('Delete Software Engineer Resume?')
    expect(modal.props('description')).toBe('This action cannot be undone.')
    expect(modal.props('variant')).toBe('destructive')

    wrapper.unmount()
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

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-delete')
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

    wrapper.unmount()
  })

  it('closes modal without deleting when cancel is clicked', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-delete')
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

    wrapper.unmount()
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

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-delete')
    await flushPromises()

    // Emit confirm on the modal
    const modal = wrapper.getComponent(ConfirmModal)
    await modal.vm.$emit('confirm')
    await flushPromises()

    // Error alert should show
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').text()).toBe('Failed to delete resume')

    wrapper.unmount()
  })

  it('shows generic error when delete throws non-API error', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-delete')
    await flushPromises()

    const modal = wrapper.getComponent(ConfirmModal)
    await modal.vm.$emit('confirm')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe('Something went wrong')

    wrapper.unmount()
  })

  it('shows generic error when rename throws non-API error', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-rename')
    await flushPromises()

    const input = wrapper.find('.resume-card__name-input')
    await input.setValue('Network Name')
    await input.trigger('keydown.enter')
    await flushPromises()

    // Stays in edit mode with a generic rename error
    expect(wrapper.find('.rename-error').exists()).toBe(true)
    expect(wrapper.find('.rename-error').text()).toBe('Failed to rename')

    wrapper.unmount()
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

  // ── Rename (triggered from the ⋮ dropdown) ────────────────

  it('starts inline rename when Rename is chosen from the menu', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-rename')
    await flushPromises()

    // Should now show an input
    const input = wrapper.find('.resume-card__name-input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('Software Engineer Resume')

    wrapper.unmount()
  })

  it('commits rename on Enter and calls PUT', async () => {
    createAuthenticatedStore()
    // Deep-clone — commitRename mutates the local resume's name in place
    const data = JSON.parse(JSON.stringify(mockResumes)) as typeof mockResumes
    mockFetch.mockResolvedValueOnce(mockJsonResponse(data))
    // PUT response for rename
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ id: 'resume-1', name: 'New Name', layout: 'standard' }),
    )

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-rename')
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

    wrapper.unmount()
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

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-rename')
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

    wrapper.unmount()
  })

  it('commits rename on blur', async () => {
    createAuthenticatedStore()
    // Deep-clone — commitRename mutates the local resume's name in place
    const data = JSON.parse(JSON.stringify(mockResumes)) as typeof mockResumes
    mockFetch.mockResolvedValueOnce(mockJsonResponse(data))
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ id: 'resume-1', name: 'Blurred Name', layout: 'standard' }),
    )

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-rename')
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

    wrapper.unmount()
  })

  it('cancels rename when trimmed value is empty', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-rename')
    await flushPromises()

    // Clear and press Enter
    const input = wrapper.find('.resume-card__name-input')
    await input.setValue('   ')
    await input.trigger('keydown.enter')
    await flushPromises()

    // Should cancel — no PUT call, back to display
    expect(wrapper.find('.resume-card__name-input').exists()).toBe(false)

    wrapper.unmount()
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

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-rename')
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

    wrapper.unmount()
  })

  it('does not call PUT when name is unchanged', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-rename')
    await flushPromises()

    // Press Enter without changing the value
    const input = wrapper.find('.resume-card__name-input')
    await input.trigger('keydown.enter')
    await flushPromises()

    // Should only have one fetch call (the initial GET)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    // Back to display mode
    expect(wrapper.find('.resume-card__name-input').exists()).toBe(false)

    wrapper.unmount()
  })
})
