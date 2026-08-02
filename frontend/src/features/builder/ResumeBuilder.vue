<template>
  <div class="resume-builder">
    <AnonymousBanner v-if="!isAuthenticated" />
    <div class="resume-builder__grid">
      <!-- Left sidebar: LayoutPicker + SectionToggles -->
      <aside class="resume-builder__sidebar">
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
      <main class="resume-builder__editor">
        <SectionEditor :selected-section-id="selectedSectionId" />
      </main>

      <!-- Right: Live preview -->
      <aside class="resume-builder__preview">
        <LivePreview />
      </aside>
    </div>

    <!-- Bottom: JD input area -->
    <footer class="resume-builder__jd-input">
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

<style scoped>
.resume-builder {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
  padding: 1rem;
  box-sizing: border-box;
}

.resume-builder__grid {
  display: grid;
  grid-template-columns: 260px 1fr 300px;
  gap: 1rem;
  flex: 1;
  min-height: 0;
}

.resume-builder__sidebar {
  overflow-y: auto;
  padding: 1rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.5rem;
  background: var(--color-background, #fff);
}

.resume-builder__editor {
  overflow-y: auto;
  padding: 1rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.5rem;
  background: var(--color-background, #fff);
}

.resume-builder__preview {
  overflow: hidden;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.5rem;
  background: var(--color-background, #fff);
}

.resume-builder__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted, #9ca3af);
  font-size: 0.875rem;
  font-style: italic;
}

.resume-builder__jd-input {
  padding: 0;
  margin-top: 1rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.5rem;
  background: var(--color-background, #fff);
  flex-shrink: 0;
  max-height: 35vh;
  overflow-y: auto;
}

/* Responsive: stack on smaller screens */
@media (max-width: 1024px) {
  .resume-builder__grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr 1fr;
  }
}
</style>
