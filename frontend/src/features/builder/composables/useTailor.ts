import { ref } from 'vue'
import { useResumeStore } from '@/features/builder/stores/resume'
import { useApi, ApiRequestError } from '@/shared/composables/useApi'
import type { TailorResponse, TailorRequest, ResumePayload } from '@/features/builder/models/tailor-response.model'

/**
 * Composable for calling the tailor endpoint and managing filter state.
 * @example
 * const { isTailoring, tailorError, isFiltered, tailorResume, resetFilter } = useTailor()
 * await tailorResume(jobDescription)
 */
export function useTailor() {
  const store = useResumeStore()
  const api = useApi()

  const isTailoring = ref(false)
  const tailorError = ref<string | null>(null)
  const bulletCap = ref(5)

  /**
   * Call the POST /api/v1/resumes/tailor endpoint with the current
   * resume data and the provided job description.
   * On success, applies the filter to the resume store.
   * @param jobDescription - The JD text to match against
   */
  async function tailorResume(jobDescription: string): Promise<void> {
    const trimmed = jobDescription.trim()
    if (!trimmed) {
      tailorError.value = 'Please enter a job description'
      return
    }

    // Save JD text in store for session convenience
    store.jdText = trimmed

    isTailoring.value = true
    tailorError.value = null

    const payload: TailorRequest = {
      jobDescription: trimmed,
      resume: store.toPayload() as unknown as ResumePayload,
    }

    try {
      const response = await api.post<TailorResponse>(
        '/api/v1/resumes/tailor',
        payload,
      )
      store.applyTailorFilter(response)
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        tailorError.value = err.message || 'Failed to tailor resume'
      } else if (err instanceof Error) {
        tailorError.value = err.message
      } else {
        tailorError.value = 'An unexpected error occurred'
      }
    } finally {
      isTailoring.value = false
    }
  }

  /**
   * Clear filter state and restore full visibility of all items.
   */
  function resetFilter(): void {
    tailorError.value = null
    store.resetTailorFilter()
  }

  return {
    /** Whether a tailor request is in progress */
    isTailoring,
    /** Error message from the last tailor request, or null */
    tailorError,
    /** Whether the filtering is currently active */
    isFiltered: store.isFiltered,
    /** Maximum bullets per entry (configured server-side) */
    bulletCap,
    /**
     * Call the tailor endpoint with the provided JD.
     * Applies the filter to the resume store on success.
     */
    tailorResume,
    /**
     * Clear filter state, restoring all items to full visibility.
     */
    resetFilter,
  }
}
