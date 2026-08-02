import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'

describe('useTheme', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('can set theme to dark and applies the dark class', async () => {
    const { useTheme } = await import('@/shared/composables/useTheme')
    const { theme, setTheme } = useTheme()
    setTheme('dark')
    await nextTick()
    expect(theme.value).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('can set theme to light and removes the dark class', async () => {
    const { useTheme } = await import('@/shared/composables/useTheme')
    const { theme, setTheme } = useTheme()
    // Set to dark first, then light
    setTheme('dark')
    await nextTick()
    expect(theme.value).toBe('dark')

    setTheme('light')
    await nextTick()
    expect(theme.value).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('persists theme choice to localStorage', async () => {
    const { useTheme } = await import('@/shared/composables/useTheme')
    const { setTheme } = useTheme()

    setTheme('light')
    await nextTick()
    expect(localStorage.getItem('theme-mode')).toBe('light')

    setTheme('dark')
    await nextTick()
    expect(localStorage.getItem('theme-mode')).toBe('dark')

    setTheme('system')
    await nextTick()
    expect(localStorage.getItem('theme-mode')).toBe('system')
  })

  it('cycles through all three modes', async () => {
    const { useTheme } = await import('@/shared/composables/useTheme')
    const { theme, setTheme } = useTheme()

    setTheme('light')
    expect(theme.value).toBe('light')

    setTheme('dark')
    expect(theme.value).toBe('dark')

    setTheme('system')
    expect(theme.value).toBe('system')
  })

  it('returns the same reactive ref across multiple calls (singleton)', async () => {
    const { useTheme } = await import('@/shared/composables/useTheme')
    const { theme: theme1 } = useTheme()
    const { theme: theme2 } = useTheme()
    theme1.value = 'dark'
    expect(theme2.value).toBe('dark')
  })

  it('does not apply dark class for system theme when system prefers light', async () => {
    const { useTheme } = await import('@/shared/composables/useTheme')
    const { setTheme } = useTheme()
    // Apply dark first, then switch to system
    setTheme('dark')
    await nextTick()
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    setTheme('system')
    await nextTick()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  describe('error handling', () => {
    it('survives localStorage.setItem throwing during persist', async () => {
      // Override setItem to throw before the module initializes
      const originalSetItem = localStorage.setItem
      localStorage.setItem = vi.fn<(...args: unknown[]) => void>(() => {
        throw new Error('readonly storage')
      })

      const { useTheme } = await import('@/shared/composables/useTheme')
      const { theme, setTheme } = useTheme()

      // Setting the theme should not throw
      expect(() => setTheme('dark')).not.toThrow()

      // The reactive value still updates even if persist fails
      await nextTick()
      expect(theme.value).toBe('dark')

      localStorage.setItem = originalSetItem
    })

    it('defaults to system when localStorage.getItem throws', async () => {
      // Override getItem to throw before the module initializes
      const originalGetItem = localStorage.getItem
      localStorage.getItem = vi.fn<(...args: unknown[]) => string | null>(() => {
        throw new Error('storage unavailable')
      })

      const { useTheme } = await import('@/shared/composables/useTheme')
      const { theme } = useTheme()

      // Should fall back to 'system'
      await nextTick()
      expect(theme.value).toBe('system')

      localStorage.getItem = originalGetItem
    })

    it('defaults to system when localStorage contains invalid value', async () => {
      localStorage.setItem('theme-mode', 'INVALID')

      const { useTheme } = await import('@/shared/composables/useTheme')
      const { theme } = useTheme()

      await nextTick()
      expect(theme.value).toBe('system')
    })
  })
})
