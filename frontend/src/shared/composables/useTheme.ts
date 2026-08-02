import { ref, watchEffect } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme-mode'
const DARK_CLASS = 'dark'

// Global reactive state so all consumers share the same value
const currentTheme = ref<ThemeMode>('system')
// Whether initTheme has already read localStorage
let localStorageRead = false

/**
 * Read the persisted theme from localStorage, defaulting to 'system'.
 * @returns the stored theme mode
 */
function loadTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch {
    // localStorage unavailable (e.g. SSR, privacy mode)
  }
  return 'system'
}

/**
 * Persist the current theme choice to localStorage.
 * @param mode - the selected theme mode
 */
function persistTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

/**
 * Resolve whether dark mode should be active given a theme mode.
 * @param mode - the selected theme mode
 * @returns `true` if dark appearance should be applied
 */
function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  // system — check the media query
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return false
}

/**
 * Apply or remove the dark class on the document root.
 * @param mode - the selected theme mode
 */
function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  const isDark = resolveIsDark(mode)
  document.documentElement.classList.toggle(DARK_CLASS, isDark)
}

// Watch for changes and apply + persist automatically.
// First run happens synchronously at module load before any component mounts,
// writing 'system' to localStorage and toggling dark class. When initTheme()
// fires on first useTheme() call, it bumps currentTheme.value which re-triggers
// this effect to persist and apply the correct stored value.
watchEffect(() => {
  const mode = currentTheme.value
  persistTheme(mode)
  applyTheme(mode)
})

// Listen for system preference changes
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  if (mediaQuery) {
    mediaQuery.addEventListener('change', () => {
      if (currentTheme.value === 'system') {
        applyTheme('system')
      }
    })
  }
}

/**
 * Initialize the theme — called once on first useTheme() call.
 * Reads from localStorage and applies the initial theme.
 */
function initTheme(): void {
  if (localStorageRead) return
  localStorageRead = true
  currentTheme.value = loadTheme()
}

/**
 * Composable to read and write the current theme mode.
 *
 * Initializes from localStorage on first call.
 * @returns reactive theme ref and a setter
 */
export function useTheme() {
  initTheme()

  /**
   * Set the current theme mode.
   * @param mode - 'light', 'dark', or 'system'
   */
  function setTheme(mode: ThemeMode): void {
    currentTheme.value = mode
  }

  return {
    /** The current theme mode (reactive ref). */
    theme: currentTheme,
    /** Set the theme mode. */
    setTheme,
  }
}
