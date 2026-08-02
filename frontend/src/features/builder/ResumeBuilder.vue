<template>
  <div class="flex flex-col h-screen max-h-screen overflow-hidden p-4 box-border">
    <AnonymousBanner v-if="!isAuthenticated" />
    <header class="flex items-center justify-end pb-3 shrink-0">
      <PdfExportButton />
    </header>
    <div class="grid grid-cols-[260px_1fr_300px] gap-4 flex-1 min-h-0 max-[1024px]:grid-cols-1 max-[1024px]:grid-rows-[auto_1fr_1fr]">
      <!-- Left sidebar: LayoutPicker + SectionToggles -->
      <aside class="overflow-y-auto p-4 border border-gray-300 rounded-lg bg-white">
        <LayoutPicker v-model="store.layout" />
        <SectionToggles
          :layout="store.layout"
          :enabled-sections="store.enabledSections"
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

    <!-- Bottom: JD input area -->
    <footer class="p-0 mt-4 border border-gray-300 rounded-lg bg-white shrink-0 max-h-[35vh] overflow-y-auto">
      <JdInput />
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useResumeStore } from '@/features/builder/stores/resume'
import { useResumeData } from '@/features/builder/composables/useResumeData'
import { useAuth } from '@/features/auth/composables/useAuth'
import LayoutPicker from '@/features/builder/components/LayoutPicker.vue'
import SectionToggles from '@/features/builder/components/SectionToggles.vue'
import SectionEditor from '@/features/builder/components/SectionEditor.vue'
import JdInput from '@/features/builder/components/JdInput.vue'
import AnonymousBanner from '@/features/builder/components/AnonymousBanner.vue'
import LivePreview from '@/features/builder/components/LivePreview.vue'
import PdfExportButton from '@/features/builder/components/PdfExportButton.vue'
import type { SectionType } from '@/features/builder/types/resume'

const store = useResumeStore()
const { isAuthenticated } = useAuth()
const { loadResume, setupAutoSave, teardownAutoSave } = useResumeData()

const selectedSectionId = ref<string | null>(null)

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

onUnmounted(() => {
  teardownAutoSave()
})
</script>


