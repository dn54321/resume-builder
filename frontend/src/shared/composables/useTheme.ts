import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

/**
 * Valid theme modes: explicit light/dark, or follow system preference.
 */
export type Theme = 'light' | 'dark' | 'system'

const THEME_STORAGE_KEY = 'theme'
const DARK_CLASS = 'dark'

/**
 * Read the stored theme preference from localStorage.
 * Falls back to 'system' when nothing is stored or the value is invalid.
 */
function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // localStorage unavailable (private browsing, quota exceeded, etc.)
  }
  return 'system'
}

/**
 * Query the current system-level color scheme preference.
 */
function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Apply or remove the `dark` class on <html>.
 */
function applyTheme(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return
  if (resolved === 'dark') {
    document.documentElement.classList.add(DARK_CLASS)
  } else {
    document.documentElement.classList.remove(DARK_CLASS)
  }
}

/**
 * Composable that manages the application theme.
 *
 * Provides:
 * - `theme` — reactive ref for the user's chosen mode (light/dark/system)
 * - `resolvedTheme` — computed that resolves 'system' to 'light' or 'dark' via matchMedia
 * - `setTheme(t)` — persist the choice and update <html> class
 * - `toggleTheme()` — cycle light → dark → system → light
 *
 * Theme state is persisted to localStorage under the key `"theme"`.
 */
export function useTheme() {
  const theme = ref<Theme>(getStoredTheme())
  const systemPref = ref<'light' | 'dark'>(getSystemPreference())

  const resolvedTheme = computed<'light' | 'dark'>(() => {
    if (theme.value === 'system') return systemPref.value
    return theme.value
  })

  let mediaQuery: MediaQueryList | null = null

  function handleSystemChange(e: MediaQueryListEvent) {
    systemPref.value = e.matches ? 'dark' : 'light'
  }

  onMounted(() => {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', handleSystemChange)

    // Apply the resolved theme on mount so the <html> class matches
    applyTheme(resolvedTheme.value)
  })

  onUnmounted(() => {
    mediaQuery?.removeEventListener('change', handleSystemChange)
  })

  // Keep <html> class in sync whenever the resolved theme changes
  watch(resolvedTheme, (newVal) => {
    applyTheme(newVal)
  })

  /**
   * Persist the chosen theme mode and update the document class list.
   */
  function setTheme(t: Theme) {
    theme.value = t
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t)
    } catch {
      // Silently ignore localStorage failures
    }
    applyTheme(resolvedTheme.value)
  }

  /**
   * Cycle through light → dark → system → light.
   */
  function toggleTheme() {
    const cycle: Record<Theme, Theme> = {
      light: 'dark',
      dark: 'system',
      system: 'light',
    }
    setTheme(cycle[theme.value])
  }

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
  }
}
