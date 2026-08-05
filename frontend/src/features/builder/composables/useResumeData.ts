/*
 * ⚠️ WARNING — authenticated save/load contract is broken against the real backend.
 *
 * Verified 2026-08-05 (RES-90) with curl against a fresh backend:
 *
 *   1. saveResume() calls PUT /api/v1/resumes (no :id), but the backend only
 *      exposes PUT /resumes/:id → always 404.
 *   2. The 404 fallback POSTs the payload, which the whitelisted
 *      ResumeSectionDto rejects because the frontend's toPayload() sends an
 *      `enabled` property per section: "sections.0.property enabled should
 *      not exist" → 400.
 *   3. loadResume() GETs /api/v1/resumes, which returns ResumeSummary[] (a
 *      LIST), but the code expects a single object with `.sections` — so a
 *      saved authenticated resume is never loaded either.
 *
 * Net effect: for authenticated users, autosave ALWAYS fails (error lands in
 * the console only) and the "✓ Saved" indicator never appears; the session-
 * storage safety net is the only thing preserving edits. Introduced in the
 * RES-66/RES-67 era and never caught because the repo-root e2e suite
 * (e2e/) is not wired into CI and the backend has no integration tests for
 * these endpoints.
 *
 * This is a PRE-EXISTING bug, out of scope for the RES-90 frontend-only
 * ticket. Fix in a dedicated ticket: align the API contract (PUT
 * /resumes/:id with the resume id, drop `enabled` from the payload or add
 * it to ResumeSectionDto, and GET /resumes/:id for load). Do NOT paper
 * over it in the frontend with hardcoded ids or by stripping fields.
 */
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

  /**
   * Reactive flag: true while a save operation is in progress.
   * Exposed so the builder can render a "Saving…" indicator while
   * the debounced autosave (or an explicit save) is in flight.
   * Also doubles as a guard that prevents the dirty watcher from
   * re-asserting dirty=true after saveResume() has cleared it.
   */
  const isSaving = ref(false)

  // Watch for store mutations — mark dirty on any change after initial load.
  // flush: 'sync' is required so the watcher fires synchronously while
  // initialLoadComplete is still false during loadResume(). Without it,
  // the callback fires asynchronously after initialLoadComplete is set to
  // true, causing a false dirty flag right after load.
  watch(
    () => store.toPayload(),
    () => {
      if (initialLoadComplete && !isSaving.value) {
        dirty.value = true
      }
    },
    { deep: true, flush: 'sync' },
  )

  /**
   *
   */
  async function loadResume() {
    if (isAuthenticated.value) {
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
   * Save the current resume state to the backend (authenticated) or
   * localStorage (anonymous). Sets isSaving guard during the operation
   * to prevent the dirty watcher from re-asserting dirty=true after
   * the save completes and clears the dirty flag.
   */
  async function saveResume() {
    isSaving.value = true
    try {
      const payload = store.toPayload()

      if (isAuthenticated.value) {
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
    } finally {
      isSaving.value = false
    }
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
        if (isAuthenticated.value) {
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
    isSaving,
  }
}

// Import type for use in loadResume
import type { ResumePayload } from '@/features/builder/types/resume'
