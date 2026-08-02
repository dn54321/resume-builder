import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  type SectionType,
  type ResumeSectionState,
  type ResumePayload,
  type LayoutType,
  SECTION_TYPES,
} from '@/features/builder/types/resume'
import type { TailorResponse, EntryBulletIndices } from '@/features/builder/models/tailor-response.model'

/**
 *
 */
function generateId(): string {
  return crypto.randomUUID()
}

/**
 *
 * @param sectionType
 * @param order
 */
function createDefaultSection(sectionType: SectionType, order: number): ResumeSectionState {
  return {
    sectionId: sectionType,
    sectionType,
    column: 'right',
    order,
    enabled: true,
    entries: [],
  }
}

export const useResumeStore = defineStore('resume', () => {
  const id = ref<string | null>(null)
  const layout = ref<LayoutType>('standard')
  const sections = ref<ResumeSectionState[]>([])

  // ─── Tailor / Filter state ───────────────────────────────────────

  const isFiltered = ref(false)
  const jdText = ref('')
  const filteredBulletIndices = ref<Record<string, EntryBulletIndices[]>>({})
  const filteredHardSkills = ref<string[]>([])
  const filteredSoftSkills = ref<string[]>([])

  // Derived: enabled section types (visible in the resume)
  const enabledSections = computed(() =>
    sections.value.filter((s) => s.enabled).map((s) => s.sectionType),
  )

  // Derived: sections assigned to left column (only meaningful for 2:1 layout)
  const leftColumnSections = computed(() =>
    sections.value.filter((s) => s.column === 'left'),
  )

  // Derived: sections assigned to right column
  const rightColumnSections = computed(() =>
    sections.value.filter((s) => s.column === 'right'),
  )

  // Derived: enabled section types sorted by their order property
  // (respects drag-and-drop reordering from SectionToggles)
  const orderedEnabledSectionTypes = computed(() =>
    sections.value
      .filter((s) => s.enabled)
      .sort((a, b) => a.order - b.order)
      .map((s) => s.sectionType),
  )

  /**
   *
   */
  function initializeDefaults() {
    id.value = generateId()
    layout.value = 'standard'
    sections.value = SECTION_TYPES.map((type, i) => createDefaultSection(type, i))
  }

  /**
   *
   * @param newLayout
   */
  function setLayout(newLayout: LayoutType) {
    layout.value = newLayout
    // When switching to standard, all sections go to right column
    if (newLayout === 'standard') {
      for (const section of sections.value) {
        section.column = 'right'
      }
    }
  }

  /**
   * Soft-toggle: flip the `enabled` flag without losing entries/fields.
   * All 10 section types always stay in the array.
   * @param sectionType
   */
  function toggleSection(sectionType: SectionType) {
    const existing = sections.value.find((s) => s.sectionType === sectionType)
    if (existing) {
      existing.enabled = !existing.enabled
    }
  }

  /**
   *
   * @param sectionType
   * @param column
   */
  function setSectionColumn(sectionType: SectionType, column: 'left' | 'right') {
    const section = sections.value.find((s) => s.sectionType === sectionType)
    if (section) {
      section.column = column
    }
  }

  /**
   * Reorder only enabled sections; disabled sections stay at the end
   * preserving their relative order.
   * @param orderedTypes
   */
  function reorderSections(orderedTypes: SectionType[]) {
    const enabledSectionsList = sections.value.filter((s) => s.enabled)
    const disabledSectionsList = sections.value.filter((s) => !s.enabled)

    const newSections: ResumeSectionState[] = []

    // First, place enabled sections in the requested order
    for (let i = 0; i < orderedTypes.length; i++) {
      const existing = enabledSectionsList.find((s) => s.sectionType === orderedTypes[i])
      if (existing) {
        existing.order = i
        newSections.push(existing)
      }
    }

    // Append any enabled sections not in orderedTypes (safety net)
    for (const s of enabledSectionsList) {
      if (!newSections.includes(s)) {
        s.order = newSections.length
        newSections.push(s)
      }
    }

    // Append disabled sections at the end, preserving their relative order
    const disabledBase = newSections.length
    for (let i = 0; i < disabledSectionsList.length; i++) {
      disabledSectionsList[i]!.order = disabledBase + i
      newSections.push(disabledSectionsList[i]!)
    }

    sections.value = newSections
  }

  /**
   *
   * @param sectionType
   */
  function isSectionEnabled(sectionType: SectionType): boolean {
    const section = sections.value.find((s) => s.sectionType === sectionType)
    return section?.enabled ?? false
  }

  /**
   *
   * @param payload
   */
  function loadFromPayload(payload: ResumePayload) {
    layout.value = payload.layout
    sections.value = payload.sections.map((s) => {
      const sectionType = s.sectionId as SectionType
      return {
        sectionId: s.sectionId,
        sectionType,
        column: s.column,
        order: s.order,
        enabled: (s as { enabled?: boolean }).enabled ?? true,
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

  /**
   *
   */
  function toPayload(): ResumePayload {
    return {
      layout: layout.value,
      sections: sections.value.map((s) => ({
        sectionId: s.sectionId,
        column: s.column,
        order: s.order,
        enabled: s.enabled,
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

  // ─── Tailor filter functions ─────────────────────────────────────

  /**
   * Apply the tailor response filter to the resume store.
   * @param response
   */
  function applyTailorFilter(response: TailorResponse): void {
    isFiltered.value = true
    filteredBulletIndices.value = response.filteredBulletIndices
    filteredHardSkills.value = response.filteredHardSkills
    filteredSoftSkills.value = response.filteredSoftSkills
  }

  /**
   * Clear all filter state and restore full visibility.
   */
  function resetTailorFilter(): void {
    isFiltered.value = false
    filteredBulletIndices.value = {}
    filteredHardSkills.value = []
    filteredSoftSkills.value = []
  }

  /**
   * Check if a bullet point is relevant according to the current filter.
   * @param sectionId
   * @param entryIndex - index of the parent entry within top-level entries of the section
   * @param bulletIndex - index of the bullet within that entry's children
   * @returns true if relevant or filter is inactive
   */
  function isBulletRelevant(
    sectionId: string,
    entryIndex: number,
    bulletIndex: number,
  ): boolean {
    if (!isFiltered.value) return true

    const entryIndices = filteredBulletIndices.value[sectionId]
    if (!entryIndices) return true

    const entry = entryIndices.find((e) => e.entryOrder === entryIndex)
    if (!entry) return false

    return entry.bulletIndices.includes(bulletIndex)
  }

  /**
   * Check if a skill name is relevant according to the current filter.
   * @param sectionId - 'hard_skills' or 'soft_skills'
   * @param skillName - the skill name (case-insensitive matching)
   * @returns true if relevant or filter is inactive
   */
  function isSkillRelevant(sectionId: string, skillName: string): boolean {
    if (!isFiltered.value) return true

    const lowerName = skillName.toLowerCase().trim()
    if (sectionId === 'hard_skills') {
      return filteredHardSkills.value.includes(lowerName)
    }
    if (sectionId === 'soft_skills') {
      return filteredSoftSkills.value.includes(lowerName)
    }
    return true
  }

  /**
   * Get the count of visible bullets for a section when filtered.
   * Returns an object: { visible: number, total: number }
   * @param sectionId
   */
  function getFilteredBulletCount(sectionId: string): { visible: number; total: number } {
    const section = sections.value.find((s) => s.sectionId === sectionId)
    if (!section) return { visible: 0, total: 0 }

    let total = 0
    const topLevel = section.entries
      .filter((e) => !e.parentId)
      .sort((a, b) => a.order - b.order)

    for (const entry of topLevel) {
      const children = section.entries.filter((e) => e.parentId === entry.id)
      total += children.length
    }

    if (!isFiltered.value) return { visible: total, total }

    const entryIndices = filteredBulletIndices.value[sectionId]
    if (!entryIndices) return { visible: total, total }

    let visible = 0
    for (const ei of entryIndices) {
      visible += ei.bulletIndices.length
    }
    return { visible, total }
  }

  return {
    id,
    layout,
    sections,
    enabledSections,
    orderedEnabledSectionTypes,
    leftColumnSections,
    rightColumnSections,
    // Filter state
    isFiltered,
    jdText,
    filteredBulletIndices,
    filteredHardSkills,
    filteredSoftSkills,
    // Actions
    initializeDefaults,
    setLayout,
    toggleSection,
    setSectionColumn,
    reorderSections,
    isSectionEnabled,
    loadFromPayload,
    toPayload,
    // Filter actions
    applyTailorFilter,
    resetTailorFilter,
    isBulletRelevant,
    isSkillRelevant,
    getFilteredBulletCount,
  }
})
