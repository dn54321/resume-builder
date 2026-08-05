/*
 * Authenticated save/load contract (RES-93) — FIXED.
 *
 * The contract is now aligned end-to-end:
 *
 *   1. loadResume() GETs /api/v1/resumes (a LIST of ResumeSummary), picks
 *      the most recent row, stores its id, then GETs /api/v1/resumes/:id
 *      for the full decrypted tree (sections + nested entries).
 *   2. saveResume() PUTs /api/v1/resumes/:id using the stored resume id;
 *      POSTs /api/v1/resumes when no id exists yet (or the id 404s),
 *      then stores the created id for subsequent saves.
 *   3. The payload sent to the API matches the whitelisted DTOs: sections
 *      carry `enabled`, entries are nested trees with `children` arrays
 *      (never flat parentId), and fields may carry `order`.
 *   4. The backend persists `enabled` (ResumeSection.enabled) and field
 *      `order` (SectionField.order) so soft-toggles and field ordering
 *      survive reloads.
 *
 * Previously (RES-66/RES-67 era, verified 2026-08-05 during RES-90):
 *   - PUT /api/v1/resumes (no :id) → 404; fallback POST → 400 because the
 *     DTO rejected `enabled` and flat entries lack the required `children`.
 *   - GET /api/v1/resumes returned a LIST but loadResume expected a single
 *     object — a saved authenticated resume was never loaded.
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
      // Resolve the backend resume id FIRST (GET /api/v1/resumes returns a
      // LIST of ResumeSummary ordered by createdAt desc) so that pending
      // sessionStorage changes — and every subsequent save — PUT to the
      // correct resume instead of creating duplicates.
      let backendResumeId: string | null = null
      try {
        const list = await api.get<
          { id: string; name: string | null; layout: string }[]
        >('/api/v1/resumes')
        if (list.length > 0) {
          backendResumeId = list[0]!.id
          store.setId(backendResumeId)
        }
      } catch (err) {
        if (!(err instanceof ApiRequestError && err.status === 404)) {
          throw err
        }
        // 404 → no resume yet; fall through
      }

      // Check sessionStorage next for pending changes that survived a
      // refresh. This is the safety net: if the user edited and refreshed
      // before the debounced auto-save fired, sessionStorage still has the
      // pending state.
      const pending = readFromSessionStorage()
      if (
        pending &&
        typeof pending === 'object' &&
        pending !== null &&
        'sections' in pending &&
        Array.isArray((pending as Record<string, unknown>).sections) &&
        ((pending as Record<string, unknown>).sections as unknown[]).length > 0
      ) {
        const payload = pending as {
          name?: string | null
          layout?: string
          sections: unknown[]
        }
        store.loadFromPayload({
          // Preserve the pending name — the safety net captures the whole
          // toPayload() including name. Dropping it here wiped the resume
          // name on every reload that took this path (RES-93).
          name: payload.name ?? null,
          layout: (payload.layout as 'standard' | 'column2-1') ?? 'standard',
          sections: payload.sections as ResumePayload['sections'],
        })
        if (backendResumeId) store.setId(backendResumeId)
        initialLoadComplete = true
        dirty.value = true
        // Keep sessionStorage data — it will be cleared on explicit save.
        // Mark as dirty so the user knows these are pending changes.
        return
      }

      if (backendResumeId) {
        try {
          // Fetch the full decrypted tree by id (sections + nested entries).
          const data = await api.get<
            { id: string; layout: string; sections: unknown[] }
          >(`/api/v1/resumes/${backendResumeId}`)
          if (data.sections?.length > 0) {
            store.loadFromPayload(data as unknown as ResumePayload)
            initialLoadComplete = true
            dirty.value = false
            return
          }
          // Backend resume row exists but has no sections yet (e.g. created
          // from the dashboard). Initialize defaults but KEEP the backend id
          // so the first save updates this resume instead of creating a
          // duplicate.
          store.initializeDefaults()
          store.setId(backendResumeId)
          initialLoadComplete = true
          dirty.value = false
          return
        } catch (err) {
          if (!(err instanceof ApiRequestError && err.status === 404)) {
            throw err
          }
          // Resume was deleted between the list and the fetch — fall through
          // to defaults; saveResume's PUT 404 → POST fallback recreates it.
        }
      }
    }

    // Anonymous or authenticated user with no resume: try localStorage
    const local = readFromLocalStorage()
    if (local && typeof local === 'object' && local !== null) {
      const payload = local as {
        name?: string | null
        layout?: string
        sections?: unknown[]
      }
      if (payload.sections && Array.isArray(payload.sections) && payload.sections.length > 0) {
        store.loadFromPayload({
          // Preserve the stored name (same RES-93 bug as the sessionStorage
          // path — dropping it wiped the resume name on reload).
          name: payload.name ?? null,
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
        if (store.id) {
          try {
            await api.put(`/api/v1/resumes/${store.id}`, payload)
          } catch (err) {
            if (err instanceof ApiRequestError && err.status === 404) {
              // Resume was deleted server-side — recreate it via POST
              const created = await api.post<{ id: string }>(
                '/api/v1/resumes',
                payload,
              )
              store.setId(created.id)
            } else {
              throw err
            }
          }
        } else {
          // No backend resume yet — create it and remember the id so
          // subsequent saves update (PUT) instead of duplicating.
          const created = await api.post<{ id: string }>(
            '/api/v1/resumes',
            payload,
          )
          store.setId(created.id)
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
