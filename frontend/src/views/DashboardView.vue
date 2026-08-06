<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/features/auth/composables/useAuth'
import { useApi, ApiRequestError } from '@/shared/composables/useApi'
import ConfirmModal from '@/shared/components/ConfirmModal.vue'
import { Ellipsis, Pencil, SquarePen, Copy, Trash2, FileText, ZoomIn, ZoomOut } from '@lucide/vue'
import StandardLayout from '@/features/builder/components/preview/StandardLayout.vue'
import TwoColumnLayout from '@/features/builder/components/preview/TwoColumnLayout.vue'
import {
  toPreviewSections,
  type ResumeSummary,
  type ResumeFull,
} from '@/views/models/dashboard.model'
import type { ResumeSectionState } from '@/features/builder/types/resume'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

// US Letter paper size at 96 DPI — the preview components are authored
// against this fixed pixel size and scaled down to fit the pane.
const PAPER_WIDTH_PX = 816
const PAPER_HEIGHT_PX = 1056
// Total horizontal breathing room between the pane edges and the scaled
// paper. Must cover the preview body's own `1rem` padding on BOTH sides
// (16px × 2 = 32px) — otherwise the scaled wrapper is wider than the
// content box and the paper still overflows narrow panes (verified
// empirically: with PADDING=24 a 793px pane produced 8px of horizontal
// overflow). PADDING=32 makes the wrapper exactly fit the content box.
const PADDING = 32
const MIN_SCALE = 0.2
const MAX_SCALE = 1.2

const router = useRouter()
const auth = useAuth()
const api = useApi()

/**
 * Upper bound for the initial resume-list request.
 *
 * If `GET /api/v1/resumes` never settles (backend down but the connection
 * hangs, proxy wedged), `isLoading` stays `true` forever: skeleton cards
 * render indefinitely and the header "Create New Resume" button remains
 * DISABLED (`:disabled="isLoading"`), so the user has no way to create a
 * resume — the exact failure reported in RES-101. Bounding the fetch with
 * a timeout guarantees loading always resolves and the button becomes
 * usable again.
 */
const RESUMES_FETCH_TIMEOUT_MS = 15000

/** Error thrown when a request exceeds its timeout bound. */
class RequestTimeoutError extends Error {
  constructor(label: string) {
    super(`Request timed out: ${label}`)
    this.name = 'RequestTimeoutError'
  }
}

/**
 * Race a promise against a timeout so a hung request cannot leave the
 * UI stuck in a loading state. The timer is cleared as soon as either
 * side settles.
 * @param {Promise<T>} promise - The operation to bound
 * @param {number} ms - Timeout in milliseconds
 * @param {string} label - Human-readable operation name (for the error)
 * @returns {Promise<T>} Resolves with the operation result, or rejects
 * with {@link RequestTimeoutError} after `ms`.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestTimeoutError(label)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer)
  })
}

const resumes = ref<ResumeSummary[]>([])
const isLoading = ref(true)
const error = ref('')
const showConfirmModal = ref(false)
const resumeToDelete = ref<ResumeSummary | null>(null)

// ── Preview state (two-pane layout) ───────────────────────────────

const selectedResumeId = ref<string | null>(null)
const previewResume = ref<ResumeFull | null>(null)
const isPreviewLoading = ref(false)
const previewError = ref('')

/**
 * Monotonic token guarding against stale preview responses — if the user
 * clicks two cards in quick succession, only the latest fetch wins.
 */
let previewRequestSeq = 0

/**
 * Sections of the selected resume mapped to the shape the production
 * preview components (StandardLayout / TwoColumnLayout) consume.
 */
const previewSections = computed<ResumeSectionState[]>(() =>
  previewResume.value ? toPreviewSections(previewResume.value.sections) : [],
)

// ── Preview scaling ────────────────────────────────────────────────

const previewPaneRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)

// ─── Dashboard preview zoom (mirrors RES-115 builder zoom) ────────
// The user asked for zoom controls on the dashboard resume preview too.
// Same range/steps/persistence as the builder's LivePreview.
const MIN_ZOOM = 0.5
const MAX_ZOOM = 1.5
const ZOOM_STEP = 0.1
const ZOOM_STORAGE_KEY = 'resume-dashboard:preview-zoom'

/**
 *
 * @param value
 */
function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

/**
 *
 */
function loadInitialZoom(): number {
  try {
    const raw = window.sessionStorage?.getItem(ZOOM_STORAGE_KEY)
    if (raw) {
      const parsed = parseFloat(raw)
      if (!Number.isNaN(parsed)) return clampZoom(parsed)
    }
  } catch {
    // storage unavailable — default to 100%
  }
  return 1
}

/**
 *
 */
function persistZoom() {
  try {
    window.sessionStorage?.setItem(ZOOM_STORAGE_KEY, String(zoomFactor.value))
  } catch {
    // storage unavailable — zoom still works for the session
  }
}

/**
 *
 * @param value
 */
function setZoom(value: number) {
  zoomFactor.value = clampZoom(value)
  persistZoom()
}

/**
 *
 */
function zoomIn() {
  setZoom(zoomFactor.value + ZOOM_STEP)
}

/**
 *
 */
function zoomOut() {
  setZoom(zoomFactor.value - ZOOM_STEP)
}

const zoomFactor = ref(loadInitialZoom())
const zoomPercent = computed(() => Math.round(zoomFactor.value * 100))

/**
 * Scale the 816px-wide paper so it fits the preview pane with padding,
 * multiplied by the user's zoom factor (50%–150%).
 * Falls back to 0.3 before the pane width has been measured (jsdom, SSR).
 */
const previewScale = computed(() => {
  const base =
    containerWidth.value <= 0
      ? 0.3
      : Math.min(MAX_SCALE, Math.max(MIN_SCALE, (containerWidth.value - PADDING) / PAPER_WIDTH_PX))
  return Math.min(MAX_SCALE * MAX_ZOOM, Math.max(MIN_SCALE * MIN_ZOOM, base * zoomFactor.value))
})

/**
 * Layout size of the scaled paper. CSS transforms do not affect layout, so
 * the paper itself stays 816×1056px in the box model — without these
 * explicit dimensions the unscaled box would overflow narrow preview panes
 * (horizontal scrollbar + flexbox centering clips the left edge). Wrapping
 * the paper in a box sized to the scaled dimensions keeps it fully visible
 * and unscrollable.
 */
const scaledPaperWidth = computed(() => Math.round(PAPER_WIDTH_PX * previewScale.value))
const scaledPaperHeight = computed(() => Math.round(PAPER_HEIGHT_PX * previewScale.value))

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  const el = previewPaneRef.value
  if (el && 'ResizeObserver' in window) {
    // Read initial width, then keep tracking on pane resize.
    containerWidth.value = el.clientWidth
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        containerWidth.value = entry.contentRect.width
      }
    })
    resizeObserver.observe(el)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

// ── Inline rename state ─────────────────────

const editingId = ref<string | null>(null)
const editValue = ref('')
const editingOriginal = ref('')
const renameError = ref('')
const renameLoading = ref(false)
const duplicatingId = ref<string | null>(null)

onMounted(async () => {
  if (!auth.isAuthenticated.value) {
    router.replace('/login')
    return
  }

  await fetchResumes()
})

/**
 * Fetch the resume list from the API.
 * @returns {Promise<void>} Resolves when the list has been loaded
 */
async function fetchResumes(): Promise<void> {
  isLoading.value = true
  error.value = ''

  try {
    resumes.value = await withTimeout(
      api.get<ResumeSummary[]>('/api/v1/resumes'),
      RESUMES_FETCH_TIMEOUT_MS,
      'loading resumes',
    )
  } catch (err) {
    if (err instanceof RequestTimeoutError) {
      // Distinct message: a hung request is a connectivity problem, not a
      // server-side rejection. Loading resolves so the header Create
      // button re-enables and the user can still create a resume.
      error.value = 'Timed out loading resumes — please try again'
    } else if (err instanceof ApiRequestError) {
      error.value = err.message
    } else {
      error.value = 'Something went wrong'
    }
  } finally {
    isLoading.value = false
  }
}

/**
 * Create a new resume: navigate to the fresh builder at /builder (no uuid
 * suffix). RES-103 deferred-create — nothing is persisted here; the resume
 * row is created by the builder's autosave on the FIRST edit, which POSTs
 * and then replaces the URL with /builder/:id.
 */
function handleCreateResume(): void {
  router.push('/builder')
}

/**
 * Open a resume in the Builder editor. This is the dashboard's second
 * entry point into `/builder/:id` (the first is Create New Resume).
 * @param {ResumeSummary} resume - The resume to edit
 */
function handleEditResume(resume: ResumeSummary): void {
  router.push(`/builder/${resume.id}`)
}

/**
 * Select a resume card: fetch the full resume and render its preview in
 * the right pane. Replaces the old navigate-to-builder card click.
 * @param {ResumeSummary} resume - The clicked resume
 */
async function selectResume(resume: ResumeSummary): Promise<void> {
  const seq = ++previewRequestSeq
  selectedResumeId.value = resume.id
  previewError.value = ''
  isPreviewLoading.value = true

  try {
    const full = await api.get<ResumeFull>(`/api/v1/resumes/${resume.id}`)
    if (seq !== previewRequestSeq) return // stale — a newer selection won
    previewResume.value = full
  } catch (err) {
    if (seq !== previewRequestSeq) return
    previewResume.value = null
    if (err instanceof ApiRequestError) {
      previewError.value = err.message
    } else {
      previewError.value = 'Something went wrong'
    }
  } finally {
    if (seq === previewRequestSeq) {
      isPreviewLoading.value = false
    }
  }
}

/**
 * Format a date string for display.
 * @param {string} dateStr - ISO date string
 * @returns {string} Locale-formatted date
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ── Inline rename ───────────────────────────

/**
 * Start editing a resume's name.
 * @param {ResumeSummary} resume - The resume to rename
 */
function startEditing(resume: ResumeSummary): void {
  editingId.value = resume.id
  editingOriginal.value = resume.name || 'Untitled'
  editValue.value = resume.name || 'Untitled'
  renameError.value = ''

  void nextTick(() => {
    const input = document.querySelector<HTMLInputElement>(
      `.resume-card__name-input[data-id="${resume.id}"]`,
    )
    input?.focus()
    input?.select()
  })
}

/**
 * Commit the rename via API call.
 */
async function commitRename(): Promise<void> {
  const id = editingId.value
  if (!id) return

  const trimmed = editValue.value.trim()

  // No change — cancel
  if (trimmed === editingOriginal.value || trimmed === '') {
    cancelRename()
    return
  }

  renameError.value = ''
  renameLoading.value = true

  try {
    await api.put(`/api/v1/resumes/${id}`, { name: trimmed })
    // Update local state
    const resume = resumes.value.find((r) => r.id === id)
    if (resume) resume.name = trimmed
    editingId.value = null
  } catch (err) {
    if (err instanceof ApiRequestError) {
      renameError.value = err.message
    } else {
      renameError.value = 'Failed to rename'
    }
  } finally {
    renameLoading.value = false
  }
}

/**
 * Cancel inline rename, reverting to display state.
 */
function cancelRename(): void {
  editingId.value = null
  renameError.value = ''
}

/**
 * Duplicate a resume via the API and add the copy to the list.
 *
 * The copy is prepended so the list stays consistent with the backend's
 * `createdAt desc` ordering (newest first).
 * @param {ResumeSummary} resume - The resume to duplicate
 */
async function handleDuplicate(resume: ResumeSummary): Promise<void> {
  error.value = ''
  duplicatingId.value = resume.id

  try {
    const copy = await api.post<ResumeSummary>(
      `/api/v1/resumes/${resume.id}/duplicate`,
    )
    resumes.value.unshift(copy)
  } catch (err) {
    if (err instanceof ApiRequestError) {
      error.value = err.message
    } else {
      error.value = 'Something went wrong'
    }
  } finally {
    duplicatingId.value = null
  }
}

/**
 * Open the confirm modal for a resume.
 * @param {ResumeSummary} resume - The resume to delete
 */
function handleDeleteClick(resume: ResumeSummary): void {
  error.value = ''
  resumeToDelete.value = resume
  showConfirmModal.value = true
}

/**
 * Execute the deletion after user confirms.
 */
async function handleConfirmDelete(): Promise<void> {
  if (!resumeToDelete.value) return

  error.value = ''

  try {
    await api.del(`/api/v1/resumes/${resumeToDelete.value.id}`)
    const deletedId = resumeToDelete.value.id
    resumes.value = resumes.value.filter((r) => r.id !== deletedId)

    // If the deleted resume was being previewed, reset the preview pane
    // back to its placeholder state.
    if (selectedResumeId.value === deletedId) {
      previewRequestSeq++ // invalidate any in-flight fetch for it
      selectedResumeId.value = null
      previewResume.value = null
      isPreviewLoading.value = false
      previewError.value = ''
    }
  } catch (err) {
    if (err instanceof ApiRequestError) {
      error.value = err.message
    } else {
      error.value = 'Something went wrong'
    }
  } finally {
    resumeToDelete.value = null
  }
}
</script>

<template>
  <div class="dashboard-view">
    <div class="dashboard-body">
      <!-- ── Left pane: resume list (~35%) ─────────────────── -->
      <aside class="dashboard-list-pane" data-testid="dashboard-list-pane">
        <!-- Pane header -->
        <header class="dashboard-header">
          <h1>My Resumes</h1>
          <button
            class="btn-primary"
            :disabled="isLoading"
            @click="handleCreateResume"
          >
            Create New Resume
          </button>
        </header>

        <!-- Hint: discoverable double-click affordance (RES-104) -->
        <p
          v-if="resumes.length > 0"
          class="dashboard-dblclick-hint"
          data-testid="dashboard-dblclick-hint"
        >
          💡 Double-click a resume to edit it in the builder
        </p>

        <!-- Error State -->
        <div
          v-if="error"
          class="mb-6 rounded-md border px-4 py-3 text-sm bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200"
          role="alert"
        >
          {{ error }}
        </div>

        <!-- Loading State -->
        <div v-if="isLoading" class="dashboard-list">
          <div
            v-for="n in 3"
            :key="n"
            class="resume-card resume-card--skeleton"
          >
            <div class="skeleton-line skeleton-line--title" />
            <div class="skeleton-line skeleton-line--date" />
          </div>
        </div>

        <!-- Empty State -->
        <div v-else-if="resumes.length === 0" class="empty-state">
          <div class="empty-state-card">
            <div class="empty-state-icon">📄</div>
            <h2>No resumes yet</h2>
            <p>Create your first resume to get started</p>
            <button class="btn-primary" @click="handleCreateResume">
              Create New Resume
            </button>
          </div>
        </div>

        <!-- Resume List -->
        <div v-else class="dashboard-list" data-testid="dashboard-list">
          <div
            v-for="resume in resumes"
            :key="resume.id"
            class="resume-card bg-card border border-border text-card-foreground rounded-lg hover:border-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2"
            :class="{ 'resume-card--selected': selectedResumeId === resume.id }"
            role="button"
            tabindex="0"
            :aria-pressed="selectedResumeId === resume.id"
            title="Double-click to edit in builder"
            @click="selectResume(resume)"
            @dblclick="handleEditResume(resume)"
            @keydown.enter="selectResume(resume)"
            @keydown.space.prevent="selectResume(resume)"
          >
            <div class="resume-card__header">
              <!-- Display name (rename via the ⋮ dropdown) -->
              <h3 v-if="editingId !== resume.id" class="resume-card__name">
                {{ resume.name || 'Untitled' }}
              </h3>

              <!-- Inline rename input -->
              <div v-else class="resume-card__name-edit" @click.stop @dblclick.stop @keydown.stop>
                <input
                  v-model="editValue"
                  :data-id="resume.id"
                  class="resume-card__name-input"
                  :disabled="renameLoading"
                  maxlength="200"
                  @keydown.enter="commitRename()"
                  @keydown.escape="cancelRename()"
                  @blur="commitRename()"
                />
                <span v-if="renameLoading" class="rename-spinner" />
              </div>

              <!-- Card actions: pencil rename shortcut + ⋮ menu -->
              <div class="resume-card__actions">
                <button
                  class="resume-card__edit-btn"
                  data-testid="resume-edit-btn"
                  :aria-label="`Rename ${resume.name || 'Untitled'}`"
                  title="Rename resume"
                  @click.stop="startEditing(resume)"
                  @dblclick.stop
                  @keydown.stop
                >
                  <Pencil class="size-4" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    class="resume-card__menu-btn"
                    data-testid="resume-menu-trigger"
                    :aria-label="`Options for ${resume.name || 'Untitled'}`"
                    @click.stop
                    @dblclick.stop
                    @keydown.stop
                  >
                    <Ellipsis class="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-44">
                    <DropdownMenuItem
                      data-testid="menu-edit-builder"
                      @select="handleEditResume(resume)"
                    >
                      <SquarePen class="size-4" />
                      Edit in Builder
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid="menu-rename"
                      @select="startEditing(resume)"
                    >
                      <Pencil class="size-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid="menu-duplicate"
                      :disabled="duplicatingId === resume.id"
                      @select="handleDuplicate(resume)"
                    >
                      <Copy class="size-4" />
                      {{ duplicatingId === resume.id ? 'Duplicating…' : 'Duplicate' }}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      data-testid="menu-delete"
                      variant="destructive"
                      @select="handleDeleteClick(resume)"
                    >
                      <Trash2 class="size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <!-- Rename error -->
            <p
              v-if="editingId === resume.id && renameError"
              class="rename-error"
            >
              {{ renameError }}
            </p>
            <p class="resume-card__date">
              Updated {{ formatDate(resume.updatedAt) }}
            </p>
          </div>
        </div>
      </aside>

      <!-- ── Right pane: live preview (~65%) ───────────────── -->
      <section
        ref="previewPaneRef"
        class="dashboard-preview-pane"
        data-testid="dashboard-preview-pane"
      >
        <!-- Placeholder: nothing selected yet -->
        <div
          v-if="!selectedResumeId"
          class="dashboard-preview-placeholder"
          data-testid="preview-placeholder"
        >
          <FileText class="dashboard-preview-placeholder__icon" />
          <p>Select a resume to preview</p>
        </div>

        <!-- Loading: fetching the full resume -->
        <div
          v-else-if="isPreviewLoading"
          class="dashboard-preview-loading"
          data-testid="preview-loading"
          role="status"
          aria-live="polite"
        >
          <span class="preview-spinner" aria-hidden="true" />
          <span>Loading preview…</span>
        </div>

        <!-- Error: full-resume fetch failed -->
        <div
          v-else-if="previewError"
          class="dashboard-preview-error"
          role="alert"
          data-testid="preview-error"
        >
          {{ previewError }}
        </div>

        <!-- Scaled paper -->
        <div
          v-else-if="previewResume"
          class="dashboard-preview-body"
          data-testid="preview-body"
        >
          <!-- Sizing wrapper: holds the scaled footprint so the scaled-down
               paper never overflows (and clips) narrow preview panes -->
          <div
            class="dashboard-preview__scaled"
            :style="{
              width: `${scaledPaperWidth}px`,
              height: `${scaledPaperHeight}px`,
            }"
            data-testid="preview-scaled"
          >
            <div
              class="dashboard-preview__paper"
              :style="{ transform: `scale(${previewScale})` }"
              data-testid="preview-paper"
            >
            <StandardLayout
              v-if="previewResume.layout === 'standard'"
              :sections="previewSections"
            />
            <TwoColumnLayout
              v-else
              :sections="previewSections"
            />
            </div>

            <!-- Zoom controls: INSIDE the scaled wrapper so they anchor to
                 the paper and scroll WITH it — not to the pane viewport
                 (absolute-in-body kept them fixed while the paper scrolled
                 underneath). right-6 clears the pane scrollbar. -->
            <div
              class="dashboard-preview__zoom-controls absolute bottom-3 right-6 z-10 inline-flex items-center gap-0.5 rounded-full border border-border bg-surface/95 p-1 shadow-md"
              role="group"
              aria-label="Preview zoom"
              data-testid="dashboard-preview-zoom-controls"
            >
              <button
                class="inline-flex items-center justify-center size-8 rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                type="button"
                :disabled="zoomFactor <= MIN_ZOOM"
                aria-label="Zoom out"
                title="Zoom out"
                data-testid="dashboard-preview-zoom-out"
                @click="zoomOut"
              >
                <ZoomOut class="size-4" />
              </button>
              <span
                class="inline-block min-w-10 text-center text-xs font-semibold tabular-nums text-foreground select-none"
                aria-live="polite"
                data-testid="dashboard-preview-zoom-value"
              >
                {{ zoomPercent }}%
              </span>
              <button
                class="inline-flex items-center justify-center size-8 rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                type="button"
                :disabled="zoomFactor >= MAX_ZOOM"
                aria-label="Zoom in"
                title="Zoom in"
                data-testid="dashboard-preview-zoom-in"
                @click="zoomIn"
              >
                <ZoomIn class="size-4" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Confirm Delete Modal -->
    <ConfirmModal
      v-model="showConfirmModal"
      :title="resumeToDelete ? `Delete ${resumeToDelete.name || resumeToDelete.layout}?` : 'Delete?'"
      description="This action cannot be undone."
      confirm-label="Delete"
      cancel-label="Cancel"
      variant="destructive"
      data-testid="confirm-delete-modal"
      @confirm="handleConfirmDelete"
    />
  </div>
</template>

<style scoped>
.dashboard-view {
  height: calc(100vh - 4rem); /* below the sticky app header (h-16) */
  display: flex;
  flex-direction: column;
  padding: 1rem;
}

/* ── Two-pane body ───────────────────────── */

.dashboard-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 1rem;
}

/* ── Left pane ───────────────────────────── */

.dashboard-list-pane {
  flex: 0 0 35%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-card);
  padding: 1rem;
  overflow: hidden;
}

.dashboard-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-right: 0.25rem;
}

/* ── Pane header ─────────────────────────── */

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.dashboard-header h1 {
  margin: 0;
  font-size: 1.5rem;
}

/* ── Double-click hint (RES-104) ────────── */

.dashboard-dblclick-hint {
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  color: var(--muted-foreground);
  flex-shrink: 0;
}

/* ── Buttons ────────────────────────────── */

.btn-primary {
  padding: 0.625rem 1.25rem;
  font-size: 1rem;
  cursor: pointer;
  border: none;
  border-radius: 6px;
  /* Fallback literals guard against a missing/renamed theme variable.
     The stale frontend/dist shipped for RES-101 referenced the removed
     legacy text-color token — the button rendered with a transparent
     background and light text, i.e. completely invisible in light mode.
     These defaults only apply when the var is undefined, so the button
     can never silently disappear again. */
  background-color: var(--color-foreground, #0a0a0a);
  color: var(--color-background, #ffffff);
  font-weight: 500;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Resume Card ────────────────────────── */

.resume-card {
  padding: 1.25rem;
  border-radius: 8px;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
}

/* Selected card — highlighted to show which resume is being previewed */
.resume-card--selected {
  border-color: var(--color-foreground);
  box-shadow: 0 0 0 1px var(--color-foreground);
}

.resume-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.resume-card__name {
  margin: 0;
  font-size: 1.125rem;
  text-transform: capitalize;
  word-break: break-word;
  flex: 1;
}

.resume-card__actions {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

/* Pencil rename shortcut — always-visible entry point into inline rename,
   mirroring the ⋮ menu button's styling and hover behavior. */
.resume-card__edit-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 4px;
  color: var(--muted-foreground);
  transition: color 0.15s, background-color 0.15s;
}

.resume-card__menu-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 4px;
  color: var(--muted-foreground);
  transition: color 0.15s, background-color 0.15s;
}

/* ── Inline Rename ──────────────────────── */

.resume-card__name-edit {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.resume-card__name-input {
  flex: 1;
  padding: 0.25rem 0.5rem;
  font-size: 1.125rem;
  border: 1px solid var(--color-foreground);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: inherit;
  outline: none;
}

.resume-card__name-input:focus {
  border-color: var(--color-foreground);
  box-shadow: 0 0 0 2px var(--color-foreground);
}

.rename-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-foreground);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.rename-error {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: #dc2626;
}

.resume-card__edit-btn:hover,
.resume-card__menu-btn:hover {
  color: var(--color-foreground);
  background-color: var(--muted);
}

.resume-card__date {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--muted-foreground);
}

/* ── Skeleton Card ──────────────────────── */

.resume-card--skeleton {
  cursor: default;
  pointer-events: none;
}

.skeleton-line {
  height: 1rem;
  background: var(--muted);
  border-radius: 4px;
  animation: pulse 1.5s ease-in-out infinite;
}

.skeleton-line--title {
  width: 60%;
  height: 1.25rem;
  margin-bottom: 0.75rem;
}

.skeleton-line--date {
  width: 80%;
  height: 0.8125rem;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ── Empty State ────────────────────────── */

.empty-state {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 2rem 0;
  overflow-y: auto;
}

.empty-state-card {
  text-align: center;
  padding: 2.5rem 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  max-width: 340px;
  width: 100%;
  background: var(--color-card);
  align-self: flex-start;
}

.empty-state-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.empty-state-card h2 {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
}

.empty-state-card p {
  margin: 0 0 1.5rem;
  color: var(--muted-foreground);
  font-size: 0.9375rem;
}

/* ── Right pane: live preview ───────────── */

.dashboard-preview-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--muted);
  overflow: hidden;
}

.dashboard-preview-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--muted-foreground);
  text-align: center;
  padding: 1rem;
}

.dashboard-preview-placeholder__icon {
  width: 3rem;
  height: 3rem;
  opacity: 0.5;
}

.dashboard-preview-placeholder p {
  margin: 0;
  font-size: 1rem;
}

.dashboard-preview-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--muted-foreground);
  font-size: 0.9375rem;
}

.preview-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-foreground);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.dashboard-preview-error {
  margin: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  border: 1px solid #fca5a5;
  background: #fee2e2;
  color: #991b1b;
  font-size: 0.875rem;
}

html.dark .dashboard-preview-error {
  border-color: #7f1d1d;
  background: #450a0a;
  color: #fecaca;
}

/* ── Scaled paper ───────────────────────── */

.dashboard-preview-body {
  position: relative; /* anchor for the floating zoom controls */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

/* Sizing wrapper — holds the paper's scaled footprint (see scaledPaperWidth).
   Without it the 816px unscaled box overflows narrow panes and, combined
   with justify-content: center, clips the paper's left edge. */
.dashboard-preview__scaled {
  position: relative;
  flex-shrink: 0;
}

.dashboard-preview__paper {
  width: 816px;
  height: 1056px;
  background: #fff;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.15),
    0 1px 3px rgba(0, 0, 0, 0.1);
  transform-origin: top left;
  overflow: hidden;
}

/* ── Responsive: stack vertically < 768px ── */

@media (max-width: 767px) {
  .dashboard-view {
    height: auto;
    min-height: 0;
    padding: 0.5rem;
  }

  .dashboard-body {
    flex-direction: column;
    gap: 0.75rem;
  }

  /* List on top, preview below */
  .dashboard-list-pane {
    flex: none;
    width: 100%;
    max-height: 45vh;
  }

  .dashboard-preview-pane {
    flex: 1;
    width: 100%;
    min-height: 55vh;
  }
}
</style>
