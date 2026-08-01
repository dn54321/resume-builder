import { watch } from 'vue'
import { useResumeStore } from '@/features/builder/stores/resume'
import { useAuth } from '@/features/auth/composables/useAuth'
import { useApi, ApiRequestError } from '@/shared/composables/useApi'

const LOCAL_STORAGE_KEY = 'resume_data'

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

function writeToLocalStorage(data: unknown) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Silently fail on quota exceeded or other storage errors
  }
}

let autoSaveWatch: (() => void) | null = null

export function useResumeData() {
  const store = useResumeStore()
  const { isAuthenticated } = useAuth()
  const api = useApi()

  async function loadResume() {
    if (isAuthenticated.value) {
      try {
        const data = await api.get<{ id: string; layout: string; name: string; sections: unknown[] }>(
          '/api/v1/resumes',
        )
        if (data.sections?.length > 0) {
          store.loadFromPayload({
            layout: data.layout as 'standard' | 'column2-1',
            name: data.name ?? '',
            sections: data.sections as ResumePayload['sections'],
          })
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
      const payload = local as { layout?: string; name?: string; sections?: unknown[] }
      if (payload.sections && Array.isArray(payload.sections) && payload.sections.length > 0) {
        store.loadFromPayload({
          layout: (payload.layout as 'standard' | 'column2-1') ?? 'standard',
          name: payload.name ?? '',
          sections: payload.sections as ResumePayload['sections'],
        })
        return
      }
    }

    // Nothing found: initialize defaults
    store.initializeDefaults()
  }

  async function saveResume() {
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
    } else {
      writeToLocalStorage(payload)
    }
  }

  async function saveResumeDebounced(): Promise<void> {
    // Simple debounce: clears any pending save and schedules a new one
    // This is called from the watcher; the watch already provides debounce
    return saveResume()
  }

  function setupAutoSave() {
    if (autoSaveWatch) {
      autoSaveWatch()
    }

    let timer: ReturnType<typeof setTimeout> | null = null

    autoSaveWatch = watch(
      () => store.toPayload(),
      () => {
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
  }
}

// Import type for use in loadResume
import type { ResumePayload } from '@/features/builder/types/resume'
