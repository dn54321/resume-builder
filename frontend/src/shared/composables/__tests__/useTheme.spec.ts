import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { useTheme, type Theme } from '@/shared/composables/useTheme'

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Create a mock MediaQueryList for use in matchMedia stubs.
 * @param matches
 */
function mockMediaQueryList(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>(),
    removeEventListener: vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>(),
    addListener: vi.fn<(listener: EventListenerOrEventListenerObject) => void>(),
    removeListener: vi.fn<(listener: EventListenerOrEventListenerObject) => void>(),
    dispatchEvent: vi.fn<(event: Event) => boolean>(),
  } as MediaQueryList
}

/** Thin host component that exposes the composable state for testing. */
const ThemeTestHost = defineComponent({
  setup() {
    const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme()
    return { theme, resolvedTheme, setTheme, toggleTheme }
  },
  template: '<div />',
})

/**
 *
 */
function mountHost() {
  return mount(ThemeTestHost)
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    // Default system pref to light
    window.matchMedia = vi.fn<(query: string) => MediaQueryList>().mockReturnValue(
      mockMediaQueryList(false),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Initialisation ────────────────────────────────────────────────

  it('defaults to system when localStorage has no value', () => {
    const wrapper = mountHost()
    expect(wrapper.vm.theme).toBe('system')
  })

  it('reads stored light theme from localStorage', () => {
    localStorage.setItem('theme', 'light')
    const wrapper = mountHost()
    expect(wrapper.vm.theme).toBe('light')
  })

  it('reads stored dark theme from localStorage', () => {
    localStorage.setItem('theme', 'dark')
    const wrapper = mountHost()
    expect(wrapper.vm.theme).toBe('dark')
  })

  it('reads stored system theme from localStorage', () => {
    localStorage.setItem('theme', 'system')
    const wrapper = mountHost()
    expect(wrapper.vm.theme).toBe('system')
  })

  it('ignores garbage localStorage values and falls back to system', () => {
    localStorage.setItem('theme', 'banana')
    const wrapper = mountHost()
    expect(wrapper.vm.theme).toBe('system')
  })

  // ── resolvedTheme ─────────────────────────────────────────────────

  it('resolves light theme directly', () => {
    localStorage.setItem('theme', 'light')
    const wrapper = mountHost()
    expect(wrapper.vm.resolvedTheme).toBe('light')
  })

  it('resolves dark theme directly', () => {
    localStorage.setItem('theme', 'dark')
    const wrapper = mountHost()
    expect(wrapper.vm.resolvedTheme).toBe('dark')
  })

  it('resolves system theme to light when OS prefers light', () => {
    const wrapper = mountHost()
    expect(wrapper.vm.theme).toBe('system')
    expect(wrapper.vm.resolvedTheme).toBe('light')
  })

  it('resolves system theme to dark when OS prefers dark', () => {
    window.matchMedia = vi.fn<(query: string) => MediaQueryList>().mockReturnValue(
      mockMediaQueryList(true),
    )
    const wrapper = mountHost()
    expect(wrapper.vm.resolvedTheme).toBe('dark')
  })

  // ── setTheme ──────────────────────────────────────────────────────

  it('persists to localStorage', () => {
    const wrapper = mountHost()
    ;(wrapper.vm as { setTheme: (t: Theme) => void }).setTheme('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('adds dark class to <html> when set to dark', () => {
    const wrapper = mountHost()
    ;(wrapper.vm as { setTheme: (t: Theme) => void }).setTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes dark class from <html> when set to light', () => {
    document.documentElement.classList.add('dark')
    const wrapper = mountHost()
    ;(wrapper.vm as { setTheme: (t: Theme) => void }).setTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('adds dark class when system resolves to dark', () => {
    window.matchMedia = vi.fn<(query: string) => MediaQueryList>().mockReturnValue(
      mockMediaQueryList(true),
    )
    const wrapper = mountHost()
    // theme defaults to 'system', and system pref mock returns dark
    expect(wrapper.vm.resolvedTheme).toBe('dark')
    // The onMounted + watch should have applied the dark class
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  // ── toggleTheme ───────────────────────────────────────────────────

  it('cycles light → dark → system → light', () => {
    const wrapper = mountHost()
    const vm = wrapper.vm as { setTheme: (t: Theme) => void; toggleTheme: () => void; theme: Theme }
    vm.setTheme('light')

    vm.toggleTheme()
    expect(vm.theme).toBe('dark')

    vm.toggleTheme()
    expect(vm.theme).toBe('system')

    vm.toggleTheme()
    expect(vm.theme).toBe('light')
  })

  it('persists after each toggle', () => {
    const wrapper = mountHost()
    const vm = wrapper.vm as { setTheme: (t: Theme) => void; toggleTheme: () => void }
    vm.setTheme('light')

    vm.toggleTheme()
    expect(localStorage.getItem('theme')).toBe('dark')

    vm.toggleTheme()
    expect(localStorage.getItem('theme')).toBe('system')

    vm.toggleTheme()
    expect(localStorage.getItem('theme')).toBe('light')
  })

  // ── matchMedia listener ───────────────────────────────────────────

  it('registers a matchMedia change listener on mount', () => {
    const mql = mockMediaQueryList(false)
    window.matchMedia = vi.fn<(query: string) => MediaQueryList>().mockReturnValue(mql)
    mountHost()
    expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('removes matchMedia listener on unmount', () => {
    const mql = mockMediaQueryList(false)
    window.matchMedia = vi.fn<(query: string) => MediaQueryList>().mockReturnValue(mql)
    const wrapper = mountHost()
    wrapper.unmount()
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('reacts to matchMedia change when in system mode', async () => {
    let changeHandler: ((e: MediaQueryListEvent) => void) | null = null
    const mql = {
      ...mockMediaQueryList(false),
      addEventListener: vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>().mockImplementation((_event: string, handler: (e: MediaQueryListEvent) => void) => {
        changeHandler = handler
      }),
    } as MediaQueryList
    window.matchMedia = vi.fn<(query: string) => MediaQueryList>().mockReturnValue(mql)

    const wrapper = mountHost()
    const vm = wrapper.vm as { resolvedTheme: string }

    // Initially light
    expect(vm.resolvedTheme).toBe('light')

    // Simulate system switching to dark
    changeHandler!({ matches: true } as MediaQueryListEvent)
    await nextTick()
    expect(vm.resolvedTheme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    // Simulate system switching back to light
    changeHandler!({ matches: false } as MediaQueryListEvent)
    await nextTick()
    expect(vm.resolvedTheme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('ignores matchMedia change when not in system mode', async () => {
    let changeHandler: ((e: MediaQueryListEvent) => void) | null = null
    const mql = {
      ...mockMediaQueryList(false),
      addEventListener: vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>().mockImplementation((_event: string, handler: (e: MediaQueryListEvent) => void) => {
        changeHandler = handler
      }),
    } as MediaQueryList
    window.matchMedia = vi.fn<(query: string) => MediaQueryList>().mockReturnValue(mql)

    const wrapper = mountHost()
    const vm = wrapper.vm as { setTheme: (t: Theme) => void; resolvedTheme: string }

    // Switch to explicit light
    vm.setTheme('light')
    expect(vm.resolvedTheme).toBe('light')

    // System changes to dark, but we're explicitly light
    changeHandler!({ matches: true } as MediaQueryListEvent)
    await nextTick()
    expect(vm.resolvedTheme).toBe('light')
  })

  // ── SSR safety ───────────────────────────────────────────────────

  it('defaults to system when window is undefined (SSR)', async () => {
    const savedWindow = globalThis.window
    vi.stubGlobal('window', undefined)
    vi.resetModules()

    try {
      const mod = await import('@/shared/composables/useTheme')
      const { useTheme } = mod

      expect(() => useTheme()).not.toThrow()

      const { theme, resolvedTheme } = useTheme()
      expect(theme.value).toBe('system')
      expect(resolvedTheme.value).toBe('light')
    } finally {
      vi.stubGlobal('window', savedWindow)
    }
  })

  // ── Edge cases ────────────────────────────────────────────────────

  it('survives localStorage being unavailable', () => {
    const originalGetItem = Storage.prototype.getItem
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.getItem = () => {
      throw new Error('quota exceeded')
    }
    Storage.prototype.setItem = () => {
      throw new Error('quota exceeded')
    }

    const wrapper = mountHost()
    const vm = wrapper.vm as { theme: Theme; setTheme: (t: Theme) => void }

    // Should fall back to 'system' and not throw
    expect(vm.theme).toBe('system')

    // setTheme should not throw even when setItem fails
    expect(() => vm.setTheme('dark')).not.toThrow()
    // Still updates the reactive ref
    expect(vm.theme).toBe('dark')

    Storage.prototype.getItem = originalGetItem
    Storage.prototype.setItem = originalSetItem
  })
})
