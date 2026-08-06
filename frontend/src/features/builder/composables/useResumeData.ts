/*
 * RES-103 deferred-create — this composable now owns the "don't save until
 * first edit" contract:
 *
 *   - `/builder` (no uuid) starts FRESH: `store.id` is null, no GET, no DB
 *     row. The first edit's autosave POSTs /resumes, claims the returned id,
 *     and replaces the URL with /builder/:id.
 *   - `/builder/:id` loads THAT resume via GET /resumes/:id (the old code
 *     loaded the FIRST resume from the list, ignoring the route id — that
 *     made "Create New Resume" pointless and was fixed here).
 *   - Saves go to PUT /resumes/:id now that the id is known (RES-93 added
 *     the endpoint). A PUT 404 (row deleted elsewhere) recreates via POST.
 *
 * The old ⚠️ WARNING above this comment (RES-90: PUT /resumes without an id
 * 404'd, `enabled` rejected, GET /resumes returns a LIST) is RESOLVED —
 * RES-93 added PUT /resumes/:id, enabled in ResumeSectionDto, and the
 * GET /resumes/:id loader. Do not reintroduce PUT /resumes (no id) or
 * list-first loading.
 */
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useResumeStore } from '@/features/builder/stores/resume'
import { useAuth } from '@/features/auth/composables/useAuth'
import { useApi, ApiRequestError } from '@/shared/composables/useApi'
import type { ResumePayload } from '@/features/builder/types/resume'

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
 * True when the payload carries real user content: a non-empty name or at
 * least one non-empty field value anywhere. RES-103: the editors auto-add
 * EMPTY template entries on mount (name_contact fullName row, summary text
 * row, …). Those are scaffolding, not edits — a fresh builder with only
 * empty template entries must never create a DB row.
 * @param payload
 */
function hasResumeContent(payload: ResumePayload): boolean {
  if (payload.name && payload.name.trim() !== '') return true
  return payload.sections.some((section) =>
    section.entries.some((entry) =>
      entry.fields.some((field) => field.value && field.value.trim() !== ''),
    ),
  )
}

/**
 *
 */
export function useResumeData() {
  const store = useResumeStore()
  const { isAuthenticated } = useAuth()
  const api = useApi()

  // Router access is optional: useResumeData is also invoked directly in
  // unit tests without a router instance. Inside the builder it resolves to
  // the real router; the deferred-create navigation is a no-op when absent.
  let route: ReturnType<typeof useRoute> | null = null
  let router: ReturnType<typeof useRouter> | null = null
  try {
    route = useRoute()
    router = useRouter()
  } catch {
    // No router injected (bare composable call in tests) — loadResume must
    // then receive the resume id explicitly.
  }

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
  //
  // RES-103: on a fresh builder (no server id) the editors auto-add EMPTY
  // template entries on mount — those are scaffolding, not edits, and must
  // not mark the builder dirty (otherwise the autosave POSTs and creates a
  // DB row before the user types anything). Once a server id exists, every
  // change is dirty (clearing content on an existing resume is a real edit).
  watch(
    () => store.toPayload(),
    () => {
      if (
        initialLoadComplete &&
        !isSaving.value &&
        (store.id !== null || hasResumeContent(store.toPayload()))
      ) {
        dirty.value = true
      }
    },
    { deep: true, flush: 'sync' },
  )

  /**
   * Load resume state into the store.
   *
   * RES-103 deferred-create contract:
   * - `resumeId` provided (editing `/builder/:id`) → GET that resume from
   *   the server and load it; `store.id` is set to the server id so later
   *   saves PUT /resumes/:id.
   * - no id (fresh `/builder`) → start from defaults with `store.id = null`;
   *   nothing is fetched and NO DB row exists until the first edit saves.
   *   Anonymous users still restore their previous localStorage draft (the
   *   anonymous persistence mechanism — never a server row).
   * @param resumeId - The route resume id; defaults to the current route
   *   param when called from inside the builder.
   */
  async function loadResume(resumeId?: string | null) {
    const id = resumeId ?? (route?.params.id as string | undefined) ?? null

    if (isAuthenticated.value) {
      // Check sessionStorage first for pending changes that survived a refresh.
      // This is the safety net: if the user edited and refreshed before the
      // debounced auto-save fired, sessionStorage still has the pending state.
      const pending = readFromSessionStorage(id)
      if (
        pending &&
        typeof pending === 'object' &&
        pending !== null &&
        'sections' in pending &&
        Array.isArray((pending as Record<string, unknown>).sections) &&
        ((pending as Record<string, unknown>).sections as unknown[]).length > 0
      ) {
        const payload = pending as { layout?: string; sections: unknown[] }
        // The resume id (null for a fresh builder) must survive the restore
        // so the next autosave PUTs /resumes/:id instead of re-creating.
        store.id = id
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

    if (id) {
      // Editing an existing resume — load THAT resume by id (RES-103: the
      // old code loaded the first resume from the list, which made
      // "Create New Resume" reload an unrelated resume).
      if (isAuthenticated.value) {
        // If the store already holds THIS resume (same id, populated — e.g.
        // the just-created resume right after the deferred-create navigation
        // to /builder/:id), the local state is authoritative. Skipping the
        // redundant GET prevents it from racing and wiping edits the user
        // types while the request is in flight (caught by the
        // builder-autosave e2e: summary text vanished + no ✓ Saved).
        if (store.id === id && store.sections.length > 0) {
          initialLoadComplete = true
          dirty.value = false
          return
        }
        try {
          // The wire shape carries `name` — it MUST be forwarded to
          // loadFromPayload, otherwise the resume name silently resets to
          // empty on every authenticated reload (found via RES-83 e2e:
          // "autosave → reload → name persisted" failed while the DB still
          // had the name).
          const data = await api.get<{
            id: string
            name: string | null
            layout: string
            sections: unknown[]
          }>(`/api/v1/resumes/${id}`)
          store.id = data.id ?? id
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
            // Resume was deleted — fall through to defaults
          } else {
            throw err
          }
        }
      } else {
        // Anonymous + id: restore the per-resume localStorage blob
        // (resume_data_<id>). If nothing is saved for this id, fall through
        // to defaults below.
        const local = readFromLocalStorage(id)
        if (
          local &&
          typeof local === 'object' &&
          local !== null &&
          'sections' in local &&
          Array.isArray((local as Record<string, unknown>).sections) &&
          ((local as Record<string, unknown>).sections as unknown[]).length > 0
        ) {
          const payload = local as { name?: string | null; layout?: string; sections?: unknown[] }
          store.id = id
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
      }
    } else {
      // Fresh builder (no uuid): anonymous-style local state.
      if (!isAuthenticated.value) {
        // Restore the LAST anonymous resume (RES-102 per-resume isolation):
        // the bare resume_data key is never read (it would clobber across
        // resumes); instead follow the resume_data_last_id pointer to the
        // most recently saved per-resume blob. Fresh /builder therefore
        // continues the user's last anonymous draft without sharing data
        // across resumes (RES-103 deferred-create: still no server row).
        const lastId = localStorage.getItem(LAST_ANON_RESUME_KEY)
        const local = lastId ? readFromLocalStorage(lastId) : null
        if (local && typeof local === 'object' && local !== null) {
          const payload = local as { layout?: string; sections?: unknown[] }
          if (
            payload.sections &&
            Array.isArray(payload.sections) &&
            payload.sections.length > 0
          ) {
            store.loadFromPayload({
              layout: (payload.layout as 'standard' | 'column2-1') ?? 'standard',
              sections: payload.sections as ResumePayload['sections'],
            })
            store.id = lastId
            initialLoadComplete = true
            dirty.value = false
            return
          }
        }
      }
    }

    // Nothing found: initialize a fresh builder (no server id yet).
    store.initializeDefaults()
    store.id = null
    initialLoadComplete = true
    dirty.value = false
  }

  /**
   * Create the resume on the server (first edit of a fresh /builder, or a
   * PUT-404 recovery), claim the returned id in the store, and replace the
   * URL with /builder/:id so a refresh keeps the uuid (RES-103).
   * @param payload
   */
  async function createResumeAndNavigate(payload: ResumePayload) {
    const created = await api.post<{ id: string }>('/api/v1/resumes', payload)
    store.id = created.id
    // Clear dirty BEFORE navigating so the route-leave guard doesn't treat
    // the deferred-create navigation as unsaved changes.
    dirty.value = false
    // Clear the sessionStorage safety net BEFORE navigation: the replace
    // remounts the builder at /builder/:id, whose loadResume reads
    // sessionStorage first. A stale pending payload would restore as dirty
    // and block subsequent navigation with the unsaved-changes modal
    // (caught by the unsaved-changes e2e 'no warning after save').
    clearSessionStorage(store.id)
    if (router) {
      await router.replace(`/builder/${created.id}`)
    }
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

      // RES-103 deferred-create: a fresh /builder (no server id yet) must
      // NOT create a DB row until the user types something. The editors'
      // auto-added empty template entries are not edits — skip the save
      // (defense in depth alongside the content-aware dirty watcher).
      // This gate applies to AUTHENTICATED creation only — anonymous local
      // persistence is harmless and must still capture toggle-only edits.
      if (isAuthenticated.value && !store.id && !hasResumeContent(payload)) {
        dirty.value = false
        return
      }

      if (isAuthenticated.value) {
        if (store.id) {
          try {
            // Resume already exists — update it by id (RES-93 added
            // PUT /resumes/:id; the old PUT /resumes-without-id always 404'd).
            await api.put(`/api/v1/resumes/${store.id}`, payload)
          } catch (err) {
            if (err instanceof ApiRequestError && err.status === 404) {
              // The row was deleted server-side (e.g. another tab) —
              // recreate it via POST and claim the new id.
              await createResumeAndNavigate(payload)
              return
            }
            throw err
          }
        } else {
          // First edit on a fresh /builder: create the resume row now.
          await createResumeAndNavigate(payload)
          return
        }
        // Successful backend save — clear the sessionStorage safety net
        clearSessionStorage(store.id)
      } else {
        // Anonymous save. RES-102: anonymous resumes are stored PER-RESUME
        // under resume_data_<id>. RES-103: a fresh /builder has no SERVER id
        // yet (deferred-create), so assign a local id on first save — the
        // same uuid() the store used pre-RES-103 — so the anonymous blob is
        // isolated per resume instead of clobbering resume_data (no suffix).
        if (!store.id) {
          store.id = store.generateAnonymousId()
        }
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
        const payload = store.toPayload()
        // RES-103: skip the empty template the editors auto-add on mount —
        // nothing to persist until the user actually edits. Applies to
        // authenticated creation only (anonymous local saves are harmless).
        if (isAuthenticated.value && !store.id && !hasResumeContent(payload)) return

        // Immediate safety net: write to sessionStorage on every change
        // so edits survive page refreshes before the debounced API save fires.
        if (isAuthenticated.value) {
          writeToSessionStorage(payload, store.id)
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
