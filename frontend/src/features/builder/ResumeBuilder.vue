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
          <span class="text-[0.6875rem] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-500" data-testid="filtered-badge">
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
          v-if="dirty"
          class="px-3 py-1.5 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors border border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          :disabled="isSaving"
          @click="onSaveClick"
          data-testid="toolbar-save-btn"
        >
          {{ isSaving ? 'Saving...' : 'Save Changes' }}
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

    <div class="grid grid-cols-[240px_1fr_2fr] gap-4 flex-1 min-h-0 max-[1024px]:grid-cols-1 max-[1024px]:grid-rows-[auto_1fr_1fr]">
      <!-- Left sidebar: LayoutPicker + SectionToggles -->
      <aside class="overflow-y-auto p-4 border border-gray-300 rounded-lg bg-white">
        <LayoutPicker v-model="store.layout" />
        <SectionToggles
          :layout="store.layout"
          :enabled-sections="store.enabledSections"
          :ordered-section-types="store.orderedSectionTypes"
          :column-assignments="columnAssignments"
          :selected-section-id="selectedSectionId"
          @toggle="store.toggleSection"
          @set-column="store.setSectionColumn"
          @reorder="store.reorderSections"
          @select="selectedSectionId = $event"
        />
      </aside>

      <!-- Center: Section editor -->
      <main class="overflow-y-auto p-4 border border-gray-300 rounded-lg bg-white">
        <SectionEditor :selected-section-id="selectedSectionId" />
      </main>

      <!-- Right: Live preview -->
      <aside class="overflow-hidden border border-gray-300 rounded-lg bg-white">
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
import { onBeforeRouteLeave } from 'vue-router'
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
const { isAuthenticated } = useAuth()
const { loadResume, saveResume, setupAutoSave, teardownAutoSave, dirty } = useResumeData()
const { isTailoring, tailorError, bulletCap, tailorResume, resetFilter } = useTailor()

const selectedSectionId = ref<string | null>(null)
const jdModalOpen = ref(false)

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

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.returnValue = ''
  }
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


