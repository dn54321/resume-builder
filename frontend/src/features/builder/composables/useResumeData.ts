import { ref, watch } from 'vue'
import { useResumeStore } from '@/features/builder/stores/resume'
import { useAuth } from '@/features/auth/composables/useAuth'
import { useApi, ApiRequestError } from '@/shared/composables/useApi'

const LOCAL_STORAGE_KEY = 'resume_data'

/**
 * sessionStorage key for pending changes that survive page refreshes
 * but are scoped to the tab (cleared when tab is closed).
 * Only used for authenticated users as a safety net between auto-saves.
 */
const SESSION_STORAGE_KEY = 'resume_pending_changes'

/**
 *
 */
function readFromLocalStorage(): unknown {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    localStorage.removeItem(LOCAL_STORAGE_KEY)
    return null
  }
}

/**
 *
 * @param data
 */
function writeToLocalStorage(data: unknown) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Silently fail on quota exceeded or other storage errors
  }
}

/**
 * Read pending changes from sessionStorage.
 * Returns null if nothing is stored or the data is corrupt.
 */
function readFromSessionStorage(): unknown {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

/**
 * Write pending changes to sessionStorage (synchronous, immediate).
 * This is the safety net — it captures every mutation so edits survive
 * page refreshes and accidental navigation before the debounced API save fires.
 * @param data
 */
function writeToSessionStorage(data: unknown) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Silently fail on quota exceeded or other storage errors
  }
}

/**
 * Remove pending changes from sessionStorage after a successful backend save.
 */
function clearSessionStorage() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // Ignore errors (e.g. if sessionStorage is not available)
  }
}

let autoSaveWatch: (() => void) | null = null

/**
 *
 */
export function useResumeData() {
  const store = useResumeStore()
  const { isAuthenticated } = useAuth()
  const api = useApi()

  /**
   * Dirty flag: true when there are unsaved changes in the store,
   * false after a successful save or after the initial load.
   */
  const dirty = ref(false)
  let initialLoadComplete = false

  // Watch for store mutations — mark dirty on any change after initial load.
  // flush: 'sync' is required so the watcher fires synchronously while
  // initialLoadComplete is still false during loadResume(). Without it,
  // the callback fires asynchronously after initialLoadComplete is set to
  // true, causing a false dirty flag right after load.
  watch(
    () => store.toPayload(),
    () => {
      if (initialLoadComplete) {
        dirty.value = true
      }
    },
    { deep: true, flush: 'sync' },
  )

  /**
   *
   */
  async function loadResume() {
    if (isAuthenticated) {
      // Check sessionStorage first for pending changes that survived a refresh.
      // This is the safety net: if the user edited and refreshed before the
      // debounced auto-save fired, sessionStorage still has the pending state.
      const pending = readFromSessionStorage()
      if (
        pending &&
        typeof pending === 'object' &&
        pending !== null &&
        'sections' in pending &&
        Array.isArray((pending as Record<string, unknown>).sections) &&
        ((pending as Record<string, unknown>).sections as unknown[]).length > 0
      ) {
        const payload = pending as { layout?: string; sections: unknown[] }
        store.loadFromPayload({
          layout: (payload.layout as 'standard' | 'column2-1') ?? 'standard',
          sections: payload.sections as ResumePayload['sections'],
        })
        initialLoadComplete = true
        dirty.value = true
        // Keep sessionStorage data — it will be cleared on explicit save.
        // Mark as dirty so the user knows these are pending changes.
        return
      }

      try {
        const data = await api.get<{ id: string; layout: string; sections: unknown[] }>(
          '/api/v1/resumes',
        )
        if (data.sections?.length > 0) {
          store.loadFromPayload({
            layout: data.layout as 'standard' | 'column2-1',
            sections: data.sections as ResumePayload['sections'],
          })
          initialLoadComplete = true
          dirty.value = false
          return
        }
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          // No resume yet, fall through to defaults
        } else {
          throw err
        }
      }
    }

    // Anonymous or authenticated user with no resume: try localStorage
    const local = readFromLocalStorage()
    if (local && typeof local === 'object' && local !== null) {
      const payload = local as { layout?: string; sections?: unknown[] }
      if (payload.sections && Array.isArray(payload.sections) && payload.sections.length > 0) {
        store.loadFromPayload({
          layout: (payload.layout as 'standard' | 'column2-1') ?? 'standard',
          sections: payload.sections as ResumePayload['sections'],
        })
        initialLoadComplete = true
        dirty.value = false
        return
      }
    }

    // Nothing found: initialize defaults
    store.initializeDefaults()

    initialLoadComplete = true
    dirty.value = false
  }

  /**
   *
   */
  async function saveResume() {
    const payload = store.toPayload()

    if (isAuthenticated) {
      try {
        await api.put('/api/v1/resumes', payload)
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          // Resume doesn't exist yet, POST it
          await api.post('/api/v1/resumes', payload)
        } else {
          throw err
        }
      }
      // Successful backend save — clear the sessionStorage safety net
      clearSessionStorage()
    } else {
      writeToLocalStorage(payload)
    }

    // Clear dirty flag on successful save
    dirty.value = false
  }

  /**
   *
   */
  async function saveResumeDebounced(): Promise<void> {
    // Simple debounce: clears any pending save and schedules a new one
    // This is called from the watcher; the watch already provides debounce
    return saveResume()
  }

  /**
   *
   */
  function setupAutoSave() {
    if (autoSaveWatch) {
      autoSaveWatch()
    }

    let timer: ReturnType<typeof setTimeout> | null = null

    autoSaveWatch = watch(
      () => store.toPayload(),
      () => {
        // Immediate safety net: write to sessionStorage on every change
        // so edits survive page refreshes before the debounced API save fires.
        if (isAuthenticated) {
          writeToSessionStorage(store.toPayload())
        }

        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          saveResume().catch((err) => {
            console.error('Auto-save failed:', err)
          })
        }, 1500) // 1.5 second debounce
      },
      { deep: true },
    )
  }

  /**
   *
   */
  function teardownAutoSave() {
    if (autoSaveWatch) {
      autoSaveWatch()
      autoSaveWatch = null
    }
  }

  return {
    loadResume,
    saveResume,
    saveResumeDebounced,
    setupAutoSave,
    teardownAutoSave,
    dirty,
  }
}

// Import type for use in loadResume
import type { ResumePayload } from '@/features/builder/types/resume'
