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
          @toggle="store.toggleSection"
          @set-column="store.setSectionColumn"
          @reorder="store.reorderSections"
        />
      </aside>

      <!-- Center: Section editor (placeholder) -->
      <main class="resume-builder__editor">
        <div class="resume-builder__placeholder">
          <p>Section editor &mdash; coming in a future update</p>
        </div>
      </main>

      <!-- Right: Live preview (placeholder) -->
      <aside class="resume-builder__preview">
        <div class="resume-builder__placeholder">
          <p>Live preview &mdash; coming in a future update</p>
        </div>
      </aside>
    </div>

    <!-- Bottom: JD input area (placeholder) -->
    <footer class="resume-builder__jd-input">
      <div class="resume-builder__placeholder">
        <p>Job description input &mdash; coming in a future update</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useResumeStore } from '@/features/builder/stores/resume'
import { useResumeData } from '@/features/builder/composables/useResumeData'
import { useAuth } from '@/features/auth/composables/useAuth'
import LayoutPicker from '@/features/builder/components/LayoutPicker.vue'
import SectionToggles from '@/features/builder/components/SectionToggles.vue'
import AnonymousBanner from '@/features/builder/components/AnonymousBanner.vue'
import type { SectionType } from '@/features/builder/types/resume'

const store = useResumeStore()
const { isAuthenticated } = useAuth()
const { loadResume, setupAutoSave, teardownAutoSave } = useResumeData()

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
  overflow-y: auto;
  padding: 1rem;
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
  padding: 1rem;
  margin-top: 1rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.5rem;
  background: var(--color-background, #fff);
  flex-shrink: 0;
}

/* Responsive: stack on smaller screens */
@media (max-width: 1024px) {
  .resume-builder__grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr 1fr;
  }
}
</style>
