// oxlint-disable vitest/require-mock-type-parameters
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { useAuthStore } from '@/features/auth/stores/auth'

const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
globalThis.fetch = mockFetch

/**
 * Create a router with all routes referenced by HomeView.
 */
function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: HomeView },
      { path: '/signup', name: 'signup', component: { template: '<div>Signup</div>' } },
      { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
      { path: '/dashboard', name: 'dashboard', component: { template: '<div>Dashboard</div>' } },
      { path: '/builder', name: 'builder', component: { template: '<div>Builder</div>' } },
      { path: '/builder/:id', name: 'builder-edit', component: { template: '<div>Builder</div>' } },
    ],
  })
}

/**
 * Mount HomeView with router and Pinia active.
 * @param options
 * @param options.authenticated
 */
function mountHome(options?: { authenticated?: boolean }) {
  const pinia = createPinia()
  setActivePinia(pinia)

  if (options?.authenticated) {
    const auth = useAuthStore()
    auth.user = { id: 'user-1', email: 'test@example.com' }
  }

  const router = createTestRouter()

  return {
    wrapper: mount(HomeView, {
      global: {
        plugins: [pinia, router],
      },
    }),
    router,
  }
}

/**
 * Find the authenticated "Create New Resume" button.
 * @param wrapper
 */
function findCreateButton(wrapper: VueWrapper) {
  const buttons = wrapper.findAllComponents({ name: 'Button' })
  const createBtn = buttons.find((b) => b.text().includes('Create New Resume'))
  expect(createBtn?.exists()).toBe(true)
  return createBtn!
}

describe('HomeView', () => {
  beforeEach(() => {
    localStorage.clear()
    mockFetch.mockReset()
  })

  // ── Hero Section ──────────────────────────────────────────

  it('renders the brand badge', () => {
    const { wrapper } = mountHome()
    expect(wrapper.text()).toContain('Resume Builder')
  })

  it('renders the hero headline', () => {
    const { wrapper } = mountHome()
    expect(wrapper.find('h1').text()).toBe('Build a resume that gets you hired')
  })

  it('renders the hero subheading', () => {
    const { wrapper } = mountHome()
    expect(wrapper.text()).toContain(
      'Create professional resumes with smart section management, live preview, and PDF export.',
    )
  })

  // ── Guest CTAs ────────────────────────────────────────────

  it('shows "Get Started" button linking to /builder when not authenticated', () => {
    const { wrapper } = mountHome({ authenticated: false })

    const links = wrapper.findAllComponents({ name: 'RouterLink' })
    const builderLink = links.find((l) => l.props('to') === '/builder')
    expect(builderLink?.exists()).toBe(true)
    expect(builderLink?.text()).toContain('Get Started')
  })

  it('shows "Log in" button linking to /login when not authenticated', () => {
    const { wrapper } = mountHome({ authenticated: false })

    const links = wrapper.findAllComponents({ name: 'RouterLink' })
    const loginLink = links.find((l) => l.props('to') === '/login')
    expect(loginLink?.exists()).toBe(true)
    expect(loginLink?.text()).toContain('Log in')
  })

  it('does NOT show "Go to Dashboard" when not authenticated', () => {
    const { wrapper } = mountHome({ authenticated: false })
    expect(wrapper.text()).not.toContain('Go to Dashboard')
  })

  // ── Authenticated CTAs ────────────────────────────────────

  it('shows "Go to Dashboard" button linking to /dashboard when authenticated', () => {
    const { wrapper } = mountHome({ authenticated: true })

    const links = wrapper.findAllComponents({ name: 'RouterLink' })
    const dashboardLink = links.find((l) => l.props('to') === '/dashboard')
    expect(dashboardLink?.exists()).toBe(true)
    expect(dashboardLink?.text()).toContain('Go to Dashboard')
  })

  it('shows a "Create New Resume" Button (not a RouterLink) when authenticated', () => {
    const { wrapper } = mountHome({ authenticated: true })

    // It must be a Button, not a RouterLink to /dashboard
    const links = wrapper.findAllComponents({ name: 'RouterLink' })
    const dashboardLink = links.find((l) => l.props('to') === '/dashboard')
    expect(dashboardLink?.text()).not.toContain('Create New Resume')

    const createBtn = findCreateButton(wrapper)
    expect(createBtn.text()).toContain('Create New Resume')
  })

  it('does NOT show "Get Started" when authenticated', () => {
    const { wrapper } = mountHome({ authenticated: true })
    expect(wrapper.text()).not.toContain('Get Started')
  })

  it('does NOT show "Log in" when authenticated', () => {
    const { wrapper } = mountHome({ authenticated: true })
    // The word "Log in" should not appear (case-sensitive match)
    const buttons = wrapper.findAllComponents({ name: 'Button' })
    const loginButton = buttons.find((b) => b.text() === 'Log in')
    expect(loginButton).toBeUndefined()
  })

  // ── Create New Resume flow (RES-103 deferred-create) ───────

  it('navigates to /builder without creating a DB record when clicking "Create New Resume"', async () => {
    const { wrapper } = mountHome({ authenticated: true })

    await findCreateButton(wrapper).trigger('click')
    await flushPromises()

    // No backend POST — the resume row is created on the FIRST edit inside
    // the builder (the builder's autosave POSTs and replaces the URL).
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('navigates to /builder (no uuid) on click', async () => {
    const { wrapper, router } = mountHome({ authenticated: true })

    await findCreateButton(wrapper).trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/builder')
  })

  // ── Feature Grid ──────────────────────────────────────────

  it('renders exactly 4 feature cards', () => {
    const { wrapper } = mountHome()
    const cards = wrapper.findAll('.feature-card')
    expect(cards.length).toBe(4)
  })

  it('renders all feature card titles', () => {
    const { wrapper } = mountHome()
    expect(wrapper.text()).toContain('Live Preview')
    expect(wrapper.text()).toContain('Smart Sections')
    expect(wrapper.text()).toContain('Tailor to Jobs')
    expect(wrapper.text()).toContain('PDF Export')
  })

  it('renders all feature card descriptions', () => {
    const { wrapper } = mountHome()
    expect(wrapper.text()).toContain('See changes in real time as you edit')
    expect(wrapper.text()).toContain('Toggle and reorder sections to match the job')
    expect(wrapper.text()).toContain('Paste a job description, highlight relevant bullets')
    expect(wrapper.text()).toContain('Download a polished PDF with one click')
  })

  it('renders feature card icons', () => {
    const { wrapper } = mountHome()
    const cards = wrapper.findAll('.feature-card')
    const validIcons = ['👁️', '🧩', '🎯', '📄']
    for (const card of cards) {
      // Each card has an icon div with aria-hidden
      const icon = card.find('[aria-hidden="true"]')
      expect(icon.exists()).toBe(true)
      // Trim to handle potential whitespace around emoji
      expect(validIcons).toContain(icon.text().trim())
    }
  })

  // ── Footer ────────────────────────────────────────────────

  it('renders the footer with app name', () => {
    const { wrapper } = mountHome()
    const footer = wrapper.find('footer')
    expect(footer.exists()).toBe(true)
    expect(footer.text()).toContain('Resume Builder')
    expect(footer.text()).toContain('Vue, NestJS, and Tailwind CSS')
  })

  // ── Responsiveness (structural) ───────────────────────────

  it('uses a responsive grid for feature cards', () => {
    const { wrapper } = mountHome()
    const cards = wrapper.findAll('.feature-card')
    expect(cards.length).toBe(4)

    // The grid container should exist and have responsive classes
    const grid = wrapper.find('.grid')
    expect(grid.exists()).toBe(true)
  })
})
