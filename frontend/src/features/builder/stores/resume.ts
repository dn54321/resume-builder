import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  type SectionType,
  type ResumeSectionState,
  type ResumePayload,
  type LayoutType,
  SECTION_TYPES,
} from '@/features/builder/types/resume'

function generateId(): string {
  return crypto.randomUUID()
}

function createDefaultSection(sectionType: SectionType, order: number): ResumeSectionState {
  return {
    sectionId: sectionType, // temporary client-side id matching the Section.label slug
    sectionType,
    column: 'right',
    order,
    entries: [],
  }
}

export const useResumeStore = defineStore('resume', () => {
  const id = ref<string | null>(null)
  const layout = ref<LayoutType>('standard')
  const name = ref('')
  const sections = ref<ResumeSectionState[]>([])

  // Derived: enabled section types (visible in the resume)
  const enabledSections = computed(() =>
    sections.value.map((s) => s.sectionType),
  )

  // Derived: sections assigned to left column (only meaningful for 2:1 layout)
  const leftColumnSections = computed(() =>
    sections.value.filter((s) => s.column === 'left'),
  )

  // Derived: sections assigned to right column
  const rightColumnSections = computed(() =>
    sections.value.filter((s) => s.column === 'right'),
  )

  function initializeDefaults() {
    id.value = generateId()
    layout.value = 'standard'
    name.value = ''
    sections.value = SECTION_TYPES.map((type, i) => createDefaultSection(type, i))
  }

  function setLayout(newLayout: LayoutType) {
    layout.value = newLayout
    // When switching to standard, all sections go to right column
    if (newLayout === 'standard') {
      for (const section of sections.value) {
        section.column = 'right'
      }
    }
  }

  function toggleSection(sectionType: SectionType) {
    const existing = sections.value.find((s) => s.sectionType === sectionType)
    if (existing) {
      // Disable: remove from sections
      sections.value = sections.value.filter((s) => s.sectionType !== sectionType)
    } else {
      // Enable: add with defaults
      const order = sections.value.length
      sections.value.push(createDefaultSection(sectionType, order))
    }
  }

  function setSectionColumn(sectionType: SectionType, column: 'left' | 'right') {
    const section = sections.value.find((s) => s.sectionType === sectionType)
    if (section) {
      section.column = column
    }
  }

  function reorderSections(orderedTypes: SectionType[]) {
    const newSections: ResumeSectionState[] = []
    for (let i = 0; i < orderedTypes.length; i++) {
      const existing = sections.value.find((s) => s.sectionType === orderedTypes[i])
      if (existing) {
        existing.order = i
        newSections.push(existing)
      }
    }
    sections.value = newSections
  }

  function isSectionEnabled(sectionType: SectionType): boolean {
    return sections.value.some((s) => s.sectionType === sectionType)
  }

  function loadFromPayload(payload: ResumePayload) {
    layout.value = payload.layout
    name.value = payload.name
    sections.value = payload.sections.map((s) => {
      const sectionType = s.sectionId as SectionType
      return {
        sectionId: s.sectionId,
        sectionType,
        column: s.column,
        order: s.order,
        entries: s.entries.map((e) => ({
          id: generateId(),
          order: e.order,
          parentId: e.parentId,
          fields: e.fields.map((f) => ({
            key: f.key,
            value: f.value,
            order: f.order,
          })),
        })),
      }
    })
  }

  function toPayload(): ResumePayload {
    return {
      layout: layout.value,
      name: name.value,
      sections: sections.value.map((s) => ({
        sectionId: s.sectionId,
        column: s.column,
        order: s.order,
        entries: s.entries.map((e) => ({
          order: e.order,
          parentId: e.parentId,
          fields: e.fields.map((f) => ({
            key: f.key,
            value: f.value,
            order: f.order,
          })),
        })),
      })),
    }
  }

  return {
    id,
    layout,
    name,
    sections,
    enabledSections,
    leftColumnSections,
    rightColumnSections,
    initializeDefaults,
    setLayout,
    toggleSection,
    setSectionColumn,
    reorderSections,
    isSectionEnabled,
    loadFromPayload,
    toPayload,
  }
})
