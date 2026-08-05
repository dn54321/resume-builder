<template>
  <div class="flex flex-col h-screen max-h-screen overflow-hidden p-4 box-border">
    <AnonymousBanner v-if="!isAuthenticated" />

    <!-- Header with toolbar row -->
    <header class="flex items-center justify-between gap-2 pb-3 shrink-0 flex-wrap">
      <!-- Left: toolbar buttons -->
      <div class="flex items-center gap-2 flex-wrap">
        <button
          class="px-3 py-1.5 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors border border-border bg-background text-foreground hover:bg-muted"
          @click="jdModalOpen = true"
          data-testid="jd-toolbar-btn"
        >
          Job Description
        </button>

        <div class="relative inline-flex">
          <button
            class="px-3 py-1.5 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-primary bg-primary text-primary-foreground hover:not-disabled:bg-primary/90"
            :disabled="isTailoring || !store.jdText.trim()"
            :title="!store.jdText.trim() ? 'Save a job description first' : ''"
            @click="onTailor"
            data-testid="toolbar-tailor-btn"
          >
            <span
              v-if="isTailoring"
              class="inline-block w-[14px] h-[14px] border-2 border-white/30 border-t-white rounded-full animate-spin"
              aria-label="Loading"
            ></span>
            <span v-else>Tailor Resume</span>
          </button>
        </div>

        <button
          v-if="store.isFiltered"
          class="px-3 py-1.5 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-border bg-background text-foreground hover:not-disabled:bg-muted"
          :disabled="isTailoring"
          @click="resetFilter"
          data-testid="toolbar-reset-btn"
        >
          Reset Filter
        </button>

        <!-- Filter status indicator -->
        <template v-if="store.isFiltered && !tailorError">
          <span class="text-[0.6875rem] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary" data-testid="filtered-badge">
            Filtered
          </span>
          <span class="text-xs text-muted-foreground">
            Showing relevant bullets (max {{ bulletCap }} per entry)
          </span>
        </template>

        <div v-if="tailorError" class="px-3 py-1.5 rounded-sm bg-destructive/10 text-destructive text-[0.8125rem] leading-relaxed" data-testid="toolbar-error">
          {{ tailorError }}
        </div>
      </div>

      <!-- Right: Save + PDF export -->
      <div class="flex items-center gap-2">
        <button
          v-if="isAuthenticated || dirty"
          class="px-3 py-1.5 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors border border-primary bg-primary text-primary-foreground hover:not-disabled:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="isSaving || !dirty"
          @click="onSaveClick"
          data-testid="toolbar-save-btn"
        >
          {{ isSaving ? 'Saving...' : dirty ? 'Save' : 'Saved' }}
        </button>
        <span
          v-if="showSaved"
          class="text-[0.8125rem] font-medium text-green-600 transition-opacity duration-500"
          :class="{ 'opacity-0': savedFadingOut, 'opacity-100': !savedFadingOut }"
          data-testid="toolbar-saved-msg"
        >
          ✓ Saved
        </span>
        <PdfExportButton />
      </div>
    </header>

    <div
      ref="gridRef"
      class="builder-grid grid gap-4 flex-1 min-h-0"
      :style="gridStyle"
    >
      <!-- Left sidebar: LayoutPicker + SectionToggles -->
      <aside class="overflow-y-auto p-4 border border-border rounded-lg bg-surface">
        <LayoutPicker v-model="store.layout" :show-two-column="showTwoColumn" />
        <SectionToggles
          :layout="store.layout"
          :enabled-sections="store.enabledSections"
          :ordered-section-types="store.orderedSectionTypes"
          :column-assignments="columnAssignments"
          :selected-section-id="selectedSectionId"
          :show-two-column="showTwoColumn"
          @toggle="store.toggleSection"
          @set-column="store.setSectionColumn"
          @reorder="store.reorderSections"
          @select="selectedSectionId = $event"
        />
      </aside>

      <!-- Center: Section editor -->
      <main class="overflow-y-auto p-4 border border-border rounded-lg bg-surface">
        <input
          type="text"
          :value="store.name"
          class="w-full px-3 py-1.5 mb-3 text-lg font-semibold bg-transparent border-b border-border focus:outline-hidden focus:border-primary"
          placeholder="Untitled Resume"
          aria-label="Resume name"
          data-testid="resume-name-input"
          @input="onNameInput"
          @blur="onNameBlur"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        <SectionEditor :selected-section-id="selectedSectionId" />
      </main>

      <!-- Drag handle: resizable preview divider -->
      <div
        class="resize-handle w-[4px] cursor-col-resize bg-border hover:bg-primary/50 active:bg-primary transition-colors rounded-full justify-self-center self-stretch"
        @pointerdown.prevent="onDragHandlePointerDown"
        data-testid="drag-handle"
        aria-label="Resize preview"
        role="separator"
        aria-valuenow="50"
        aria-valuemin="0"
        aria-valuemax="100"
      />

      <!-- Right: Live preview -->
      <aside class="overflow-hidden border border-border rounded-lg bg-surface">
        <LivePreview />
      </aside>
    </div>

    <!-- JD Modal -->
    <JdModal v-model="jdModalOpen" />

    <!-- Unsaved Changes Modal -->
    <ConfirmModal
      v-model="showUnsavedModal"
      title="Unsaved Changes"
      description="You have unsaved changes. Leave anyway?"
      confirm-text="Leave"
      cancel-text="Stay"
      @confirm="onLeaveAnyway"
      @cancel="onStay"
      data-testid="unsaved-modal"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { useResumeStore } from '@/features/builder/stores/resume'
import { useResumeData } from '@/features/builder/composables/useResumeData'
import { useAuth } from '@/features/auth/composables/useAuth'
import LayoutPicker from '@/features/builder/components/LayoutPicker.vue'
import SectionToggles from '@/features/builder/components/SectionToggles.vue'
import SectionEditor from '@/features/builder/components/SectionEditor.vue'
import JdModal from '@/features/builder/components/JdModal.vue'
import AnonymousBanner from '@/features/builder/components/AnonymousBanner.vue'
import LivePreview from '@/features/builder/components/LivePreview.vue'
import PdfExportButton from '@/features/builder/components/PdfExportButton.vue'
import ConfirmModal from '@/features/builder/components/ConfirmModal.vue'
import { useTailor } from '@/features/builder/composables/useTailor'
import type { SectionType } from '@/features/builder/types/resume'

const store = useResumeStore()
const route = useRoute()
const { isAuthenticated } = useAuth()
const { loadResume, saveResume, setupAutoSave, teardownAutoSave, dirty } = useResumeData()
const { isTailoring, tailorError, bulletCap, tailorResume, resetFilter } = useTailor()

const selectedSectionId = ref<string | null>(null)
const jdModalOpen = ref(false)

// ─── 2:1 column layout feature flag (RES-86) ──────────────────────
//
// The 2:1 column layout (LayoutPicker option + SectionToggles column
// assignment dropdowns) is hidden by default. It is only exposed when the
// URL contains ?layout=True (exact case match). The TwoColumnLayout
// component itself is preserved and still renders for resumes that were
// saved with the column2-1 layout.
const showTwoColumn = computed(() => route.query.layout === 'True')

// ─── Resume name editing ───────────────────────────────────────────

const pendingName = ref<string | null>(null)

/**
 * Track the input value locally without committing to the store on every keystroke.
 * @param event
 */
function onNameInput(event: Event) {
  pendingName.value = (event.target as HTMLInputElement).value
}

/**
 * Commit the name change to the store on blur, then save.
 */
async function onNameBlur() {
  if (pendingName.value !== null && pendingName.value !== store.name) {
    store.name = pendingName.value
    pendingName.value = null
    try {
      await saveResume()
      showSavedConfirmation()
    } catch (err) {
      console.error('Failed to save resume name:', err)
    }
  }
  pendingName.value = null
}

const columnAssignments = computed(() => {
  const assignments: Record<SectionType, 'left' | 'right'> = {} as Record<SectionType, 'left' | 'right'>
  for (const section of store.sections) {
    assignments[section.sectionType] = section.column
  }
  return assignments
})

onMounted(async () => {
  await loadResume()
  setupAutoSave()
  // Select the first enabled section by default
  if (store.sections.length > 0 && !selectedSectionId.value) {
    selectedSectionId.value = store.sections[0]!.sectionType
  }
})

/**
 * Trigger tailoring with the current JD text from the store.
 */
async function onTailor() {
  await tailorResume(store.jdText)
}

// ─── Save button state ────────────────────────────────────────────

const isSaving = ref(false)
const showSaved = ref(false)
const savedFadingOut = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | null = null

/** Handle explicit save button click. */
async function onSaveClick() {
  isSaving.value = true
  try {
    await saveResume()
    showSavedConfirmation()
  } catch (err) {
    console.error('Save failed:', err)
  } finally {
    isSaving.value = false
  }
}

/** Show the "Saved" confirmation that fades after 2s. */
function showSavedConfirmation() {
  if (savedTimer) clearTimeout(savedTimer)
  showSaved.value = true
  savedFadingOut.value = false
  savedTimer = setTimeout(() => {
    savedFadingOut.value = true
    // Remove from DOM after fade-out transition completes
    setTimeout(() => {
      showSaved.value = false
      savedFadingOut.value = false
    }, 500)
  }, 2000)
}

// ─── beforeunload handler ─────────────────────────────────────────

/**
 *
 * @param event
 */
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.returnValue = ''
  }
}

// ─── Resizable preview pane ──────────────────────────────────────

/** Grid container element ref for measuring drag deltas. */
const gridRef = ref<HTMLElement | null>(null)

/**
 * Current preview column width in fr units.
 * Defaults to 2fr (matching the pre-resize behavior).
 */
const previewFr = ref(2)

/** Minimum preview width in pixels (below which the scale gets too small). */
const MIN_PREVIEW_PX = 300

/** Maximum preview width in fr units. */
const MAX_PREVIEW_FR = 2

/** Computed grid template columns for the builder layout. */
const gridStyle = computed(() => ({
  gridTemplateColumns: `240px 1fr 4px ${previewFr.value}fr`,
}))

// Drag state
let dragStartX = 0
let dragStartFr = 2

/**
 * Convert a preview column width (in pixels) to fr units.
 *
 * Grid layout: 240px | 1fr | 4px | Xfr
 * Available fr space = containerWidth - 244
 * previewPx = availableFrSpace * X / (1 + X)
 * => X = previewPx / (availableFrSpace - previewPx)
 * @param containerWidth
 * @param previewPx
 */
function pxToFr(containerWidth: number, previewPx: number): number {
  const availableFrSpace = containerWidth - 244
  if (availableFrSpace <= 0) return MAX_PREVIEW_FR
  return previewPx / (availableFrSpace - previewPx)
}

/**
 * Convert fr units to preview column width in pixels.
 * @param containerWidth
 * @param fr
 */
function frToPx(containerWidth: number, fr: number): number {
  const availableFrSpace = containerWidth - 244
  if (availableFrSpace <= 0) return MIN_PREVIEW_PX
  return (availableFrSpace * fr) / (1 + fr)
}

/**
 * Pointer down on the drag handle — begin resizing.
 * @param event
 */
function onDragHandlePointerDown(event: PointerEvent) {
  const handle = event.target as HTMLElement

  // setPointerCapture may not be available in test environments (jsdom)
  if (typeof handle.setPointerCapture === 'function') {
    handle.setPointerCapture(event.pointerId)
  }

  dragStartX = event.clientX
  dragStartFr = previewFr.value

  handle.addEventListener('pointermove', onDragHandlePointerMove)
  handle.addEventListener('pointerup', onDragHandlePointerUp)
}

/**
 * Pointer move — resize the preview column.
 * @param event
 */
function onDragHandlePointerMove(event: PointerEvent) {
  if (!gridRef.value) return

  const containerWidth = gridRef.value.clientWidth
  // Dragging right (clientX > dragStartX) → handle moves right → preview gets NARROWER
  const deltaX = event.clientX - dragStartX
  const startPreviewPx = frToPx(containerWidth, dragStartFr)

  let newPreviewPx = startPreviewPx - deltaX

  // Clamp to [MIN_PREVIEW_PX, max at MAX_PREVIEW_FR]
  const availableFrSpace = containerWidth - 244
  const maxPreviewPx =
    availableFrSpace > 0
      ? (availableFrSpace * MAX_PREVIEW_FR) / (1 + MAX_PREVIEW_FR)
      : containerWidth
  newPreviewPx = Math.max(MIN_PREVIEW_PX, Math.min(maxPreviewPx, newPreviewPx))

  previewFr.value = parseFloat(pxToFr(containerWidth, newPreviewPx).toFixed(2))
}

/**
 * Pointer up — stop resizing.
 * @param event
 */
function onDragHandlePointerUp(event: PointerEvent) {
  const handle = event.target as HTMLElement

  if (typeof handle.releasePointerCapture === 'function') {
    handle.releasePointerCapture(event.pointerId)
  }

  handle.removeEventListener('pointermove', onDragHandlePointerMove)
  handle.removeEventListener('pointerup', onDragHandlePointerUp)
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  if (savedTimer) clearTimeout(savedTimer)
  teardownAutoSave()
})

// ─── Unsaved changes navigation guard ─────────────────────────────

const showUnsavedModal = ref(false)
let resolveNavigation: ((value: boolean) => void) | null = null

onBeforeRouteLeave(() => {
  if (dirty.value) {
    showUnsavedModal.value = true
    return new Promise<boolean>((resolve) => {
      resolveNavigation = resolve
    })
  }
  return true
})

/** User chose to leave anyway. */
function onLeaveAnyway() {
  showUnsavedModal.value = false
  resolveNavigation?.(true)
  resolveNavigation = null
}

/** User chose to stay. */
function onStay() {
  showUnsavedModal.value = false
  resolveNavigation?.(false)
  resolveNavigation = null
}
</script>

<style scoped>
/* ── Resume name input ─────────────────── */
main {
  /* Firefox */
  scrollbar-width: thin;
  scrollbar-color: var(--muted-foreground) transparent;
}

main::-webkit-scrollbar {
  width: 5px;
}

main::-webkit-scrollbar-track {
  background: transparent;
}

main::-webkit-scrollbar-thumb {
  background: var(--muted-foreground);
  border-radius: 4px;
}

main::-webkit-scrollbar-thumb:hover {
  background: var(--foreground);
}

/* ── Responsive breakpoint: stacked layout at ≤1024px ── */
@media (max-width: 1024px) {
  .builder-grid {
    grid-template-columns: 1fr !important;
    grid-template-rows: auto 1fr 1fr !important;
  }

  .resize-handle {
    display: none !important;
  }
}
</style>


