<template>
  <div class="section-editor">
    <div v-if="!selectedSectionId" class="section-editor__empty">
      <p>Select a section to edit from the sidebar</p>
    </div>
    <template v-else>
      <component :is="editorComponent" :key="selectedSectionId" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, type Component } from 'vue'
import type { SectionType } from '@/features/builder/types/resume'

const props = defineProps<{
  selectedSectionId: string | null
}>()

// Lazy-loaded editor components
const editorMap: Record<SectionType, Component> = {
  name_contact: defineAsyncComponent(() => import('./editors/NameContactEditor.vue')),
  summary: defineAsyncComponent(() => import('./editors/SummaryEditor.vue')),
  experience: defineAsyncComponent(() => import('./editors/ExperienceEditor.vue')),
  education: defineAsyncComponent(() => import('./editors/EducationEditor.vue')),
  hard_skills: defineAsyncComponent(() => import('./editors/HardSkillsEditor.vue')),
  soft_skills: defineAsyncComponent(() => import('./editors/SoftSkillsEditor.vue')),
  certifications: defineAsyncComponent(() => import('./editors/CertificationsEditor.vue')),
  projects: defineAsyncComponent(() => import('./editors/ProjectsEditor.vue')),
  languages: defineAsyncComponent(() => import('./editors/LanguagesEditor.vue')),
  hobbies: defineAsyncComponent(() => import('./editors/HobbiesEditor.vue')),
}

const editorComponent = computed(() => {
  if (!props.selectedSectionId) return null
  return editorMap[props.selectedSectionId as SectionType] ?? null
})
</script>

<style scoped>
.section-editor {
  height: 100%;
  overflow-y: auto;
}

.section-editor__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted, #9ca3af);
  font-size: 0.875rem;
  font-style: italic;
}
</style>
