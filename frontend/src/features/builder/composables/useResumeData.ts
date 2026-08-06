/*
 * ⚠️ RES-102 — per-resume data isolation (previously RES-90/RES-93 warning).
 *
 * The old contract loaded the FIRST resume for every /builder/:id (GET
 * /api/v1/resumes → list[0]) and anonymous users shared ONE localStorage
 * blob — so every resume showed the same data. RES-102 fixed it:
 *
 *   1. loadResume(id) GETs /api/v1/resumes/:id (the route param), never the
 *      list, and sets store.id from the route.
 *   2. saveResume() is id-scoped: PUT /api/v1/resumes/:id (404 → POST to
 *      recreate), or POST when the resume is brand new. The old PUT
 *      /api/v1/resumes (no id) upsert route silently updated the user's
 *      FIRST resume — that is exactly the cross-resume clobbering this
 *      ticket kills.
 *   3. Anonymous storage is keyed per resume: resume_data_<id>, plus a
 *      resume_data_last_id pointer so the auth store can import the most
 *      recent anonymous resume on login/signup.
 *   4. sessionStorage safety net is scoped per resume: resume_pending_changes_<id>.
 *
 * /builder (no :id) always starts from defaults (initializeDefaults) and
 * never loads a saved resume.
 */
import { ref, watch } from 'vue'
import { useResumeStore } from '@/features/builder/stores/resume'
import { useAuth } from '@/features/auth/composables/useAuth'
import { useApi, ApiRequestError } from '@/shared/composables/useApi'

/**
 * localStorage key prefix for anonymous resume blobs. Each anonymous resume
 * is stored under `resume_data_<id>` so two anonymous resumes never clobber
 * each other (RES-102).
 */
const LOCAL_STORAGE_PREFIX = 'resume_data'

/**
 * localStorage pointer to the id of the most recently saved anonymous
 * resume. The auth store reads it on login/signup to import the user's
 * anonymous work (the per-resume keys alone don't say which one is current).
 */
const LAST_ANON_RESUME_KEY = 'resume_data_last_id'

/**
 * sessionStorage key prefix for pending changes that survive page refreshes
 * but are scoped to the tab (cleared when tab is closed). Keyed per resume
 * (`resume_pending_changes_<id>`) so opening resume B never restores resume
 * A's pending edits. Only used for authenticated users as a safety net
 * between auto-saves.
 */
const SESSION_STORAGE_PREFIX = 'resume_pending_changes'

/**
 * Build the localStorage key for an anonymous resume blob.
 * @param {string | null | undefined} id - the resume id (store id / route param)
 * @returns {string} the per-resume localStorage key
 */
function localStorageKey(id: string | null | undefined): string {
  return id ? `${LOCAL_STORAGE_PREFIX}_${id}` : LOCAL_STORAGE_PREFIX
}

/**
 * Build the sessionStorage key for a resume's pending changes.
 * @param {string | null | undefined} id - the resume id
 * @returns {string} the per-resume sessionStorage key
 */
function sessionStorageKey(id: string | null | undefined): string {
  return id ? `${SESSION_STORAGE_PREFIX}_${id}` : SESSION_STORAGE_PREFIX
}

/**
 * Read an anonymous resume blob from localStorage.
 * @param {string | null} [id] - the resume id to read
 * @returns {unknown} the parsed blob, or null when missing/corrupt
 */
function readFromLocalStorage(id?: string | null): unknown {
  const key = localStorageKey(id)
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    localStorage.removeItem(key)
    return null
  }
}

/**
 * Persist an anonymous resume under its own key and remember it as the
 * most recent anonymous resume (for the auth import on login/signup).
 * @param {unknown} data - the resume payload to persist
 * @param {string | null | undefined} id - the resume id
 */
function writeToLocalStorage(data: unknown, id: string | null | undefined) {
  try {
    localStorage.setItem(localStorageKey(id), JSON.stringify(data))
    if (id) {
      localStorage.setItem(LAST_ANON_RESUME_KEY, id)
    }
  } catch {
    // Silently fail on quota exceeded or other storage errors
  }
}

/**
 * Read pending changes from sessionStorage for a specific resume.
 * Returns null if nothing is stored or the data is corrupt.
 * @param {string | null | undefined} id - the resume id
 * @returns {unknown} the parsed pending changes, or null when missing/corrupt
 */
function readFromSessionStorage(id: string | null | undefined): unknown {
  const key = sessionStorageKey(id)
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    sessionStorage.removeItem(key)
    return null
  }
}

/**
 * Write pending changes to sessionStorage (synchronous, immediate) for a
 * specific resume. This is the safety net — it captures every mutation so
 * edits survive page refreshes and accidental navigation before the
 * debounced API save fires.
 * @param {unknown} data - the payload to persist
 * @param {string | null | undefined} id - the resume id
 */
function writeToSessionStorage(data: unknown, id: string | null | undefined) {
  try {
    sessionStorage.setItem(sessionStorageKey(id), JSON.stringify(data))
  } catch {
    // Silently fail on quota exceeded or other storage errors
  }
}

/**
 * Remove pending changes from sessionStorage after a successful backend save.
 * @param {string | null | undefined} id - the resume id
 */
function clearSessionStorage(id: string | null | undefined) {
  try {
    sessionStorage.removeItem(sessionStorageKey(id))
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
   * Load a resume into the store.
   *
   * RES-102: the resume is identified by `id` — the /builder/:id route
   * param. Each resume loads ONLY its own data:
   *
   *   - authenticated + id: sessionStorage safety net first, then GET
   *     /api/v1/resumes/:id (never the list).
   *   - anonymous + id: localStorage `resume_data_<id>`.
   *   - no id (new resume, /builder): start from defaults, never load a
   *     saved resume.
   *
   * A 404 (resume deleted server-side) falls through to defaults.
   * @param {string} [id] - the resume id from the route, or undefined for a new resume
   */
  async function loadResume(id?: string) {
    const resumeId = id ?? null

    // Authenticated + existing resume: restore pending sessionStorage edits
    // first (safety net for edits made before the debounced API save fired).
    if (isAuthenticated.value && resumeId) {
      const pending = readFromSessionStorage(resumeId)
      if (
        pending &&
        typeof pending === 'object' &&
        pending !== null &&
        'sections' in pending &&
        Array.isArray((pending as Record<string, unknown>).sections) &&
        ((pending as Record<string, unknown>).sections as unknown[]).length > 0
      ) {
        const payload = pending as { layout?: string; sections: unknown[] }
        store.id = resumeId
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
    }

    if (resumeId) {
      if (isAuthenticated.value) {
        try {
          // GET the exact resume the route asked for. The wire shape carries
          // `name` — it MUST be forwarded to loadFromPayload, otherwise the
          // resume name silently resets to empty on every reload (RES-83).
          const data = await api.get<{
            id: string
            name: string | null
            layout: string
            sections: unknown[]
          }>(`/api/v1/resumes/${resumeId}`)
          store.id = resumeId
          if (data.sections?.length > 0 || data.layout) {
            store.loadFromPayload({
              name: data.name ?? '',
              layout: data.layout as 'standard' | 'column2-1',
              sections: data.sections as ResumePayload['sections'],
            })
            initialLoadComplete = true
            dirty.value = false
            return
          }
        } catch (err) {
          if (err instanceof ApiRequestError && err.status === 404) {
            // Resume doesn't exist (deleted?) — fall through to defaults
          } else {
            throw err
          }
        }
      } else {
        // Anonymous resume: load the per-resume localStorage blob.
        const local = readFromLocalStorage(resumeId)
        if (
          local &&
          typeof local === 'object' &&
          local !== null &&
          'sections' in local &&
          Array.isArray((local as Record<string, unknown>).sections) &&
          ((local as Record<string, unknown>).sections as unknown[]).length > 0
        ) {
          const payload = local as { name?: string | null; layout?: string; sections?: unknown[] }
          store.id = resumeId
          store.loadFromPayload({
            // The anonymous payload carries `name` too — forward it so the
            // resume name survives reloads (same contract as the API path).
            name: payload.name ?? '',
            layout: (payload.layout as 'standard' | 'column2-1') ?? 'standard',
            sections: payload.sections as ResumePayload['sections'],
          })
          initialLoadComplete = true
          dirty.value = false
          return
        }
        // No saved anonymous resume for this id — fall through to defaults
      }
    }

    // New resume (no id in route) or the id had nothing saved: start from
    // defaults. Never load a saved resume for /builder without an id.
    store.initializeDefaults()

    initialLoadComplete = true
    dirty.value = false
  }

  /**
   * Save the current resume state to the backend (authenticated) or
   * localStorage (anonymous). Sets isSaving guard during the operation
   * to prevent the dirty watcher from re-asserting dirty=true after
   * the save completes and clears the dirty flag.
   *
   * RES-102: the save is scoped to THIS resume (store.id), never to a
   * generic upsert of the user's first resume — otherwise editing resume B
   * would silently overwrite resume A's data.
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
              // Resume was deleted server-side — recreate it and adopt the
              // server-assigned id.
              const created = await api.post<{ id: string }>('/api/v1/resumes', payload)
              store.id = created.id
            } else {
              throw err
            }
          }
        } else {
          // Brand-new resume (no id yet) — create it and remember the id so
          // subsequent saves PUT to it.
          const created = await api.post<{ id: string }>('/api/v1/resumes', payload)
          store.id = created.id
        }
        // Successful backend save — clear the sessionStorage safety net for
        // this resume.
        clearSessionStorage(store.id)
      } else {
        writeToLocalStorage(payload, store.id)
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
          writeToSessionStorage(store.toPayload(), store.id)
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
