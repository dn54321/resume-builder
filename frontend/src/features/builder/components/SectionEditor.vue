<template>
  <div class="h-full overflow-y-auto">
    <div
      v-if="enabledSectionTypes.length === 0"
      class="flex items-center justify-center h-full text-sm text-muted-foreground/70 italic"
    >
      <p>Enable sections from the sidebar to start editing</p>
    </div>
    <template v-else>
      <div
        v-for="sectionType in enabledSectionTypes"
        :key="sectionType"
        :ref="(el: unknown) => setSectionRef(sectionType, el as HTMLElement | null)"
        class="border-b border-border last:border-b-0"
      >
        <!-- Section header with color accent matching sidebar -->
        <button
          class="w-full flex items-center gap-2 px-4 py-3 text-left border-l-4 border-primary bg-primary/10 hover:bg-primary/15 transition-colors cursor-pointer"
          :aria-expanded="!collapsedSections.has(sectionType)"
          :aria-label="`Toggle ${SECTION_LABELS[sectionType]} section`"
          @click="toggleCollapse(sectionType)"
        >
          <span class="flex-1 text-sm font-semibold text-primary">
            {{ SECTION_LABELS[sectionType] }}
          </span>
          <span
            class="text-primary text-xs transition-transform duration-200 shrink-0"
            :class="{ 'rotate-180': !collapsedSections.has(sectionType) }"
          >
            &#x25BC;
          </span>
        </button>

        <!-- Editor content -->
        <div v-show="!collapsedSections.has(sectionType)" class="bg-surface">
          <component :is="editorMap[sectionType]" :key="sectionType" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, defineAsyncComponent, type Component } from 'vue'
import { useResumeStore } from '@/features/builder/stores/resume'
import {
  SECTION_TYPES,
  SECTION_LABELS,
  type SectionType,
} from '@/features/builder/types/resume'

const props = defineProps<{
  selectedSectionId: string | null
}>()

const store = useResumeStore()

// All 10 section types exist in the store; filter to enabled ones
const enabledSectionTypes = computed<SectionType[]>(() =>
  SECTION_TYPES.filter((type) => store.sections.some((s) => s.sectionType === type && s.enabled)),
)

// Collapse state: set of collapsed section types (start all expanded = empty set)
const collapsedSections = ref<Set<SectionType>>(new Set())

/**
 * Toggle collapse/expand for a section.
 * @param sectionType
 */
function toggleCollapse(sectionType: SectionType): void {
  const next = new Set(collapsedSections.value)
  if (next.has(sectionType)) {
    next.delete(sectionType)
  } else {
    next.add(sectionType)
  }
  collapsedSections.value = next
}

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

// Ref map for scroll-to behavior
const sectionRefs: Record<SectionType, HTMLElement | null> = {} as Record<
  SectionType,
  HTMLElement | null
>

/**
 * Populate the ref map via :ref function binding.
 * @param sectionType
 * @param el
 */
function setSectionRef(sectionType: SectionType, el: HTMLElement | null): void {
  sectionRefs[sectionType] = el
}

// Watch selectedSectionId → smooth-scroll to the corresponding section
watch(
  () => props.selectedSectionId,
  async (newId) => {
    if (!newId) return
    await nextTick()
    const el = sectionRefs[newId as SectionType]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  },
)
</script>
