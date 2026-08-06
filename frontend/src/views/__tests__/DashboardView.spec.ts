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
    { path: '/builder', name: 'builder', component: { template: '<div>Builder</div>' } },
    { path: '/builder/:id', name: 'builder-edit', component: { template: '<div>Builder</div>' } },
  ],
})

/**
 * Create an authenticated auth store so the dashboard's auth guard passes.
 * @returns {ReturnType<typeof useAuthStore>} The store with a user set
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
 * Full resume payload for `resume-1` (standard layout) — the wire shape
 * returned by `GET /api/v1/resumes/:id`.
 */
const mockFullResumeStandard = {
  id: 'resume-1',
  userId: 'user-1',
  name: 'Software Engineer Resume',
  layout: 'standard',
  createdAt: '2025-01-15T10:00:00.000Z',
  updatedAt: '2025-03-01T14:30:00.000Z',
  sections: [
    {
      id: 'section-1',
      sectionId: 'name_contact',
      column: 'right',
      order: 0,
      enabled: true,
      locked: false,
      entries: [
        {
          id: 'entry-1',
          order: 0,
          parentId: null,
          locked: false,
          fields: [{ key: 'fullName', value: 'John Doe', order: 0 }],
        },
      ],
    },
  ],
}

/**
 * Full resume payload for `resume-2` (two-column layout) with both a left
 * and a right column section — exercises the TwoColumnLayout preview path.
 */
const mockFullResumeTwoColumn = {
  id: 'resume-2',
  userId: 'user-1',
  name: 'Two Column Resume',
  layout: 'column2-1',
  createdAt: '2025-02-20T08:00:00.000Z',
  updatedAt: '2025-03-10T09:15:00.000Z',
  sections: [
    {
      id: 'section-2',
      sectionId: 'name_contact',
      column: 'right',
      order: 0,
      enabled: true,
      locked: false,
      entries: [
        {
          id: 'entry-2',
          order: 0,
          parentId: null,
          locked: false,
          fields: [{ key: 'fullName', value: 'Jane Smith', order: 0 }],
        },
      ],
    },
    {
      id: 'section-3',
      sectionId: 'experience',
      column: 'left',
      order: 1,
      enabled: true,
      locked: false,
      entries: [
        {
          id: 'entry-3',
          order: 0,
          parentId: null,
          locked: false,
          fields: [{ key: 'company', value: 'Acme Corp', order: 0 }],
        },
      ],
    },
  ],
}

// Mock ResizeObserver since it is not available in jsdom — mirrors the
// LivePreview spec. Instances are tracked so tests can trigger a resize.
class MockResizeObserver {
  static instances: MockResizeObserver[] = []

  private callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }

  observe() {}
  unobserve() {}
  disconnect() {}

  trigger(entries: ResizeObserverEntry[]) {
    this.callback(entries, this as unknown as ResizeObserver)
  }
}

vi.stubGlobal('ResizeObserver', MockResizeObserver)

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
    MockResizeObserver.instances = []
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

  // ── Two-Pane Layout ─────────────────────────────────────────

  it('renders two panes: resume list (left) and preview (right)', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    expect(wrapper.find('[data-testid="dashboard-list-pane"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="dashboard-preview-pane"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="dashboard-list"]').exists()).toBe(true)
  })

  it('shows "Select a resume to preview" placeholder when nothing is selected', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const placeholder = wrapper.find('[data-testid="preview-placeholder"]')
    expect(placeholder.exists()).toBe(true)
    expect(placeholder.text()).toContain('Select a resume to preview')
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

  it('shows the double-click hint when resumes exist', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const hint = wrapper.find('[data-testid="dashboard-dblclick-hint"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('Double-click a resume to edit it in the builder')
  })

  it('does not show the double-click hint in the empty state', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse([]))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.find('[data-testid="dashboard-dblclick-hint"]').exists()).toBe(false)
  })

  it('adds a "Double-click to edit in builder" title tooltip to each card', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      expect(card.attributes('title')).toBe('Double-click to edit in builder')
    }
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

  // ── Selection & Preview (RES-87) ────────────────────────────

  it('selects the resume and loads its preview on card click (no navigation)', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockFullResumeStandard))
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    await cards[0]!.trigger('click')
    await flushPromises()

    // The full resume is fetched via GET /api/v1/resumes/:id
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/resumes/resume-1',
      expect.objectContaining({ method: 'GET' }),
    )

    // No navigation to the builder anymore — preview instead
    expect(pushSpy).not.toHaveBeenCalled()

    const body = wrapper.find('[data-testid="preview-body"]')
    expect(body.exists()).toBe(true)
    // Production layout component rendered with the resume content
    expect(wrapper.find('.standard-layout').exists()).toBe(true)
    expect(wrapper.text()).toContain('John Doe')
  })

  it('selects the resume on card keyboard enter', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockFullResumeStandard))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    await cards[1]!.trigger('keydown.enter')
    await flushPromises()

    expect(wrapper.find('[data-testid="preview-body"]').exists()).toBe(true)
  })

  it('selects the resume on card keyboard space', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockFullResumeStandard))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    await cards[0]!.trigger('keydown.space')
    await flushPromises()

    expect(wrapper.find('[data-testid="preview-body"]').exists()).toBe(true)
  })

  it('selects the resume when the card name is clicked (no inline edit)', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockFullResumeStandard))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Clicking the name is a card click — it must select, not start editing
    const name = wrapper.findAll('.resume-card__name')[0]!
    await name.trigger('click')
    await flushPromises()

    expect(wrapper.find('.resume-card__name-input').exists()).toBe(false)
    expect(wrapper.find('[data-testid="preview-body"]').exists()).toBe(true)
  })

  it('renders the two-column layout for resumes saved with column2-1', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockFullResumeTwoColumn))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    await cards[1]!.trigger('click')
    await flushPromises()

    expect(wrapper.find('.two-column-layout').exists()).toBe(true)
    expect(wrapper.text()).toContain('Jane Smith')
    expect(wrapper.text()).toContain('Acme Corp')
  })

  it('highlights the selected card', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockFullResumeStandard))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    expect(cards[0]!.classes()).not.toContain('resume-card--selected')

    await cards[0]!.trigger('click')
    await flushPromises()

    const cardsAfter = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    expect(cardsAfter[0]!.classes()).toContain('resume-card--selected')
    expect(cardsAfter[1]!.classes()).not.toContain('resume-card--selected')
  })

  it('shows a loading state while the full resume is being fetched', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    // Never resolve the full-resume fetch — keep the preview loading
    mockFetch.mockImplementationOnce(() => new Promise(() => {}))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    await cards[0]!.trigger('click')
    await flushPromises()

    const loading = wrapper.find('[data-testid="preview-loading"]')
    expect(loading.exists()).toBe(true)
    expect(loading.text()).toContain('Loading preview')
  })

  it('shows an error in the preview pane when the full-resume fetch fails', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ message: 'Failed to load resume' }, 500),
    )

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    await cards[0]!.trigger('click')
    await flushPromises()

    const error = wrapper.find('[data-testid="preview-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toBe('Failed to load resume')
  })

  it('shows generic preview error when full-resume fetch throws non-API error', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    await cards[0]!.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="preview-error"]').text()).toBe(
      'Something went wrong',
    )
  })

  it('scales the preview paper down to fit the pane', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockFullResumeStandard))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    await cards[0]!.trigger('click')
    await flushPromises()

    const paper = wrapper.find('[data-testid="preview-paper"]')
    expect(paper.exists()).toBe(true)
    const style = paper.attributes('style')
    expect(style).toContain('transform: scale(')
    // jsdom has no layout — falls back to the unmeasured default scale
    expect(style).toContain('scale(0.3)')
  })

  it('wraps the paper in a box sized to the scaled footprint (no clipping)', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockFullResumeStandard))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    await cards[0]!.trigger('click')
    await flushPromises()

    // jsdom has no layout → default scale 0.3 → wrapper is 245×317px
    const scaled = wrapper.find('[data-testid="preview-scaled"]')
    expect(scaled.exists()).toBe(true)
    expect(scaled.attributes('style')).toContain('width: 245px')
    expect(scaled.attributes('style')).toContain('height: 317px')

    // The unscaled paper sits inside the wrapper — its box is larger than
    // the wrapper, but the wrapper's width is the visible footprint.
    const paper = wrapper.find('[data-testid="preview-paper"]')
    expect(paper.exists()).toBe(true)
  })

  it('shrinks the wrapper footprint when the pane is resized', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockFullResumeStandard))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    await cards[0]!.trigger('click')
    await flushPromises()

    // Narrow pane: 300px → scale = (300 - 32) / 816 ≈ 0.3284 → wrapper 268×347
    const observer =
      MockResizeObserver.instances[MockResizeObserver.instances.length - 1]
    expect(observer).toBeDefined()
    observer!.trigger([
      { contentRect: { width: 300 } } as ResizeObserverEntry,
    ])
    await nextTick()

    const scaled = wrapper.find('[data-testid="preview-scaled"]')
    expect(scaled.attributes('style')).toContain('width: 268px')
    expect(scaled.attributes('style')).toContain('height: 347px')

    wrapper.unmount()
  })

  it('recomputes the preview scale when the pane is resized', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockFullResumeStandard))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    await cards[0]!.trigger('click')
    await flushPromises()

    // Simulate a 900px-wide preview pane: scale = (900 - 32) / 816 ≈ 1.0637
    const instances = MockResizeObserver.instances
    const observer = instances[instances.length - 1]
    expect(observer).toBeDefined()
    observer!.trigger([
      { contentRect: { width: 900 } } as ResizeObserverEntry,
    ])
    await nextTick()

    const style = wrapper
      .find('[data-testid="preview-paper"]')
      .attributes('style')
    const match = style!.match(/scale\(([\d.]+)\)/)
    expect(match).not.toBeNull()
    expect(parseFloat(match![1]!)).toBeCloseTo((900 - 32) / 816, 5)
  })

  it('resets the preview pane when the selected resume is deleted', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockFullResumeStandard))
    mockFetch.mockResolvedValueOnce(mockJsonResponse(null, 204))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Select resume-1 and load its preview
    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    await cards[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="preview-body"]').exists()).toBe(true)

    // Delete it via the dropdown
    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-delete')
    await flushPromises()

    const modal = wrapper.getComponent(ConfirmModal)
    await modal.vm.$emit('confirm')
    await flushPromises()

    // Preview pane is back to the placeholder
    expect(wrapper.find('[data-testid="preview-placeholder"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="preview-body"]').exists()).toBe(false)

    wrapper.unmount()
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

  it('renders Edit in Builder, Rename, Duplicate and Delete options in the dropdown', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)

    const editItem = document.querySelector('[data-testid="menu-edit-builder"]')
    const renameItem = document.querySelector('[data-testid="menu-rename"]')
    const duplicateItem = document.querySelector('[data-testid="menu-duplicate"]')
    const deleteItem = document.querySelector('[data-testid="menu-delete"]')

    expect(editItem).not.toBeNull()
    expect(renameItem).not.toBeNull()
    expect(duplicateItem).not.toBeNull()
    expect(deleteItem).not.toBeNull()
    expect(editItem!.textContent).toContain('Edit in Builder')
    expect(renameItem!.textContent).toContain('Rename')
    expect(duplicateItem!.textContent).toContain('Duplicate')
    expect(deleteItem!.textContent).toContain('Delete')

    // Edit in Builder sits above Rename in the menu
    expect(editItem!.compareDocumentPosition(renameItem!) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy()

    wrapper.unmount()
  })

  // ── Edit in Builder (RES-100) ──────────────────────────────

  it('navigates to the builder when Edit in Builder is chosen from the menu', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-edit-builder')
    await flushPromises()

    // Navigates to /builder/:id for the clicked resume (same pattern as
    // handleCreateResume) — no preview fetch is triggered.
    expect(pushSpy).toHaveBeenCalledWith('/builder/resume-1')
    const previewFetchCalls = mockFetch.mock.calls.filter(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('/api/v1/resumes/resume-1'),
    )
    expect(previewFetchCalls.length).toBe(0)

    wrapper.unmount()
  })

  it('navigates to the builder for the correct resume when opened from a non-first card', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Open the menu on the second card (name: null → Untitled)
    await openCardMenu(wrapper, 1)
    clickMenuItem('menu-edit-builder')
    await flushPromises()

    expect(pushSpy).toHaveBeenCalledWith('/builder/resume-2')

    wrapper.unmount()
  })

  it('opens the builder when a resume card is double-clicked', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    await cards[0]!.trigger('dblclick')
    await flushPromises()

    expect(pushSpy).toHaveBeenCalledWith('/builder/resume-1')

    wrapper.unmount()
  })

  it('does not open the builder when double-clicking the inline rename input', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)
    clickMenuItem('menu-rename')
    await flushPromises()

    // Double-clicking inside the rename editor must not bubble to the card
    const input = wrapper.find('.resume-card__name-input')
    expect(input.exists()).toBe(true)
    await input.trigger('dblclick')
    await flushPromises()

    expect(pushSpy).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('does not open the builder when double-clicking the ⋮ menu trigger', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const trigger = wrapper.findAll('[data-testid="resume-menu-trigger"]')[0]!
    await trigger.trigger('dblclick')
    await flushPromises()

    expect(pushSpy).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('does not select a resume when the menu trigger is clicked', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    await openCardMenu(wrapper, 0)

    // Dropdown is open, no selection, no preview fetch
    expect(wrapper.find('[data-testid="preview-body"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="preview-placeholder"]').exists()).toBe(true)

    wrapper.unmount()
  })

  // ── Pencil Rename Button ───────────────────────────────────

  it('renders a visible pencil rename button on each resume card', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const editBtns = wrapper.findAll('[data-testid="resume-edit-btn"]')
    expect(editBtns.length).toBe(2)

    // Each button is a real <button>, shows the Pencil icon, and carries an
    // accessible label naming the resume it renames.
    for (const btn of editBtns) {
      expect(btn.element.tagName).toBe('BUTTON')
      expect(btn.find('svg').exists()).toBe(true)
      expect(btn.attributes('aria-label')).toBeTruthy()
    }
    expect(editBtns[0]!.attributes('aria-label')).toBe(
      'Rename Software Engineer Resume',
    )
    expect(editBtns[1]!.attributes('aria-label')).toBe('Rename Untitled')

    wrapper.unmount()
  })

  it('starts inline rename when the pencil button is clicked', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const editBtns = wrapper.findAll('[data-testid="resume-edit-btn"]')
    await editBtns[0]!.trigger('click')
    await flushPromises()

    // The pencil triggers the existing inline rename flow: the name becomes
    // an input pre-filled with the current name. No builder navigation.
    const input = wrapper.find('.resume-card__name-input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe(
      'Software Engineer Resume',
    )
    expect(pushSpy).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('starts inline rename for the correct resume from a non-first card', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Second card has name: null → the input is pre-filled with "Untitled"
    const editBtns = wrapper.findAll('[data-testid="resume-edit-btn"]')
    await editBtns[1]!.trigger('click')
    await flushPromises()

    const input = wrapper.find('.resume-card__name-input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('Untitled')
    expect(pushSpy).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('does not select a resume for preview when the pencil is clicked', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockFullResumeStandard))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const editBtns = wrapper.findAll('[data-testid="resume-edit-btn"]')
    await editBtns[0]!.trigger('click')
    await flushPromises()

    // The card's single-click preview must NOT fire — the click is stopped
    // at the button (the pencil only starts inline rename). Placeholder
    // stays; no preview body, no full-resume GET.
    expect(wrapper.find('[data-testid="preview-body"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="preview-placeholder"]').exists()).toBe(true)
    const fullResumeFetches = mockFetch.mock.calls.filter(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        call[0].includes('/api/v1/resumes/resume-1'),
    )
    expect(fullResumeFetches.length).toBe(0)

    wrapper.unmount()
  })

  it('does not open the builder when the pencil button is double-clicked', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))
    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const editBtn = wrapper.findAll('[data-testid="resume-edit-btn"]')[0]!
    // Browser fires click, then dblclick — the dblclick must be stopped at
    // the button so it does not bubble to the card's own dblclick handler
    // (which would open the builder). The first click starts inline rename.
    await editBtn.trigger('click')
    await editBtn.trigger('dblclick')
    await flushPromises()

    expect(pushSpy).not.toHaveBeenCalled()
    expect(wrapper.find('.resume-card__name-input').exists()).toBe(true)

    wrapper.unmount()
  })

  it('keyboard Enter on the pencil does not bubble to the card (no preview select)', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const editBtn = wrapper.findAll('[data-testid="resume-edit-btn"]')[0]!
    await editBtn.trigger('keydown.enter')
    await flushPromises()

    // The card's @keydown.enter (preview select) must not fire.
    const fullResumeFetches = mockFetch.mock.calls.filter(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        call[0].includes('/api/v1/resumes/resume-1'),
    )
    expect(fullResumeFetches.length).toBe(0)
    expect(wrapper.find('[data-testid="preview-placeholder"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('commits rename via the pencil on Enter and calls PUT', async () => {
    createAuthenticatedStore()
    // Deep-clone — commitRename mutates the local resume's name in place
    const data = JSON.parse(JSON.stringify(mockResumes)) as typeof mockResumes
    mockFetch.mockResolvedValueOnce(mockJsonResponse(data))
    // PUT response for rename
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ id: 'resume-1', name: 'Pencil Renamed', layout: 'standard' }),
    )

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Start inline rename from the pencil, type a new name, press Enter
    const editBtns = wrapper.findAll('[data-testid="resume-edit-btn"]')
    await editBtns[0]!.trigger('click')
    await flushPromises()

    const input = wrapper.find('.resume-card__name-input')
    expect(input.exists()).toBe(true)
    await input.setValue('Pencil Renamed')
    await input.trigger('keydown.enter')
    await flushPromises()

    // Name-only PUT through the existing commitRename flow
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/resumes/resume-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'Pencil Renamed' }),
      }),
    )

    // Back to display mode with the updated name
    expect(wrapper.find('.resume-card__name-input').exists()).toBe(false)
    expect(wrapper.findAll('.resume-card__name')[0]!.text()).toBe('Pencil Renamed')

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

  it('falls back to the layout name in the modal title when the resume has no name', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // resume-2 has name: null — the title must fall back to its layout
    await openCardMenu(wrapper, 1)
    clickMenuItem('menu-delete')
    await flushPromises()

    const modal = wrapper.getComponent(ConfirmModal)
    expect(modal.props('modelValue')).toBe(true)
    expect(modal.props('title')).toBe('Delete modern?')

    wrapper.unmount()
  })

  it('ignores confirm when no resume is pending deletion', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Emit confirm without ever opening the modal — resumeToDelete is null,
    // so handleConfirmDelete must early-return without any DELETE call.
    const modal = wrapper.getComponent(ConfirmModal)
    await modal.vm.$emit('confirm')
    await flushPromises()

    const deleteCalls = mockFetch.mock.calls.filter(
      (call: unknown[]) => call[1] && (call[1] as RequestInit).method === 'DELETE',
    )
    expect(deleteCalls.length).toBe(0)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    // List unchanged
    const cards = wrapper.findAll('.resume-card:not(.resume-card--skeleton)')
    expect(cards.length).toBe(2)

    wrapper.unmount()
  })

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

  it('navigates to /builder without creating a DB record (RES-103)', async () => {
    createAuthenticatedStore()
    // Only the resumes fetch fires — NO create POST.
    mockFetch.mockResolvedValueOnce(mockJsonResponse([]))

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

    // Navigates to the fresh builder — no uuid, no backend POST
    expect(pushSpy).toHaveBeenCalledWith('/builder')
    const postCalls = mockFetch.mock.calls.filter(
      ([url, init]) =>
        String(url).includes('/api/v1/resumes') &&
        (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(postCalls).toHaveLength(0)
  })

  it('navigates to /builder from the header button without creating a row (RES-103)', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

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

    expect(pushSpy).toHaveBeenCalledWith('/builder')
    const postCalls = mockFetch.mock.calls.filter(
      ([url, init]) =>
        String(url).includes('/api/v1/resumes') &&
        (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(postCalls).toHaveLength(0)
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
      'background-color: var(--color-foreground',
    )

    // Must NOT use --color-text (does not exist → transparent/invisible button)
    expect(styleBlock).not.toContain('var(--color-text)')

    // Defense-in-depth (RES-101): a missing/renamed theme var must not be
    // able to make the button invisible again — the fallback literal only
    // applies when the var is undefined.
    expect(styleBlock).toContain('var(--color-foreground, #0a0a0a)')
    expect(styleBlock).toContain('var(--color-background, #ffffff)')
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

  it('enables Create New Resume button once resumes load', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const btn = wrapper.find('.dashboard-header .btn-primary')
    expect(btn.exists()).toBe(true)
    // Not stuck disabled — a user with resumes present can always create.
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('enables Create New Resume button when the resumes fetch fails', async () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ message: 'Error' }, 500))

    const wrapper = mount(DashboardView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Error surfaced…
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)

    // …and the header button is usable again (a failed list load must not
    // leave the user unable to create a resume).
    const btn = wrapper.find('.dashboard-header .btn-primary')
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('clears loading and re-enables Create New Resume when the resumes fetch times out', async () => {
    vi.useFakeTimers()
    try {
      // Keep the timeout bound in sync with the component's constant.
      const source = readFileSync(resolve(__dirname, '../DashboardView.vue'), 'utf-8')
      const timeoutMatch = source.match(
        /const RESUMES_FETCH_TIMEOUT_MS = (\d+)/,
      )
      expect(timeoutMatch).not.toBeNull()
      const timeoutMs = Number(timeoutMatch![1])

      createAuthenticatedStore()
      // The resumes request never settles (backend hung) — previously this
      // left isLoading=true forever, disabling the Create button.
      mockFetch.mockImplementation(() => new Promise(() => {}))

      const wrapper = mount(DashboardView, {
        global: { plugins: [router] },
      })

      // While the request is pending, the header button is disabled.
      const btn = wrapper.find('.dashboard-header .btn-primary')
      expect(btn.attributes('disabled')).toBeDefined()

      // Advance past the fetch timeout.
      await vi.advanceTimersByTimeAsync(timeoutMs)

      // Loading resolved: skeletons gone, timeout error surfaced, and the
      // header button is re-enabled so the user can still create.
      expect(wrapper.findAll('.resume-card--skeleton').length).toBe(0)
      const alert = wrapper.find('[role="alert"]')
      expect(alert.exists()).toBe(true)
      expect(alert.text()).toBe('Timed out loading resumes — please try again')
      expect(btn.attributes('disabled')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  // ── Responsive <768px ──────────────────────────────────────

  it('stacks the panes vertically below 768px (list on top, preview below)', () => {
    createAuthenticatedStore()
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockResumes))

    mount(DashboardView, {
      global: { plugins: [router] },
    })

    // Scoped SFC styles are injected as <style> tags in jsdom — find the
    // (max-width: 767px) media rule targeting .dashboard-body.
    let mediaCss = ''
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRule[] = []
      try {
        rules = Array.from(sheet.cssRules ?? [])
      } catch {
        continue // cross-origin stylesheet — skip
      }
      for (const rule of rules) {
        if (
          rule instanceof CSSMediaRule &&
          rule.conditionText.includes('max-width: 767px')
        ) {
          const css = Array.from(rule.cssRules)
            .map((r) => r.cssText)
            .join('\n')
          if (css.includes('dashboard-body')) {
            mediaCss += css
          }
        }
      }
    }

    expect(mediaCss).toContain('flex-direction: column')
    // The list pane sits above the preview pane in the stacked layout
    expect(mediaCss).toContain('dashboard-list-pane')
    expect(mediaCss).toContain('dashboard-preview-pane')
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
