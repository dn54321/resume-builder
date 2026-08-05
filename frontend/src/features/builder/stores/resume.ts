import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  type SectionType,
  type ResumeSectionState,
  type ResumePayload,
  type LayoutType,
  type SectionEntryState,
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
    locked: false,
    entries: [],
  }
}

export const useResumeStore = defineStore('resume', () => {
  const id = ref<string | null>(null)
  const name = ref<string>('')
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

  // Derived: locked section types (protected from Tailor edits)
  const lockedSections = computed(() =>
    sections.value.filter((s) => s.locked).map((s) => s.sectionType),
  )

  // Derived: sections assigned to left column (only meaningful for 2:1 layout)
  const leftColumnSections = computed(() =>
    sections.value.filter((s) => s.column === 'left'),
  )

  // Derived: sections assigned to right column
  const rightColumnSections = computed(() =>
    sections.value.filter((s) => s.column === 'right'),
  )

  // Derived: all section types sorted by order, enabled first, disabled at end
  // (respects drag-and-drop reordering from SectionToggles)
  const orderedSectionTypes = computed(() => {
    const sorted = [...sections.value].sort((a, b) => a.order - b.order)
    const enabled = sorted.filter((s) => s.enabled).map((s) => s.sectionType)
    const disabled = sorted.filter((s) => !s.enabled).map((s) => s.sectionType)
    return [...enabled, ...disabled]
  })

  /**
   *
   */
  function initializeDefaults() {
    id.value = generateId()
    name.value = ''
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
   * Toggle the `locked` flag — protects the section from Tailor edits.
   * Kept for backward compatibility: the section-level lock remains a
   * fast-path in the Tailor engine even though the UI lock now lives on
   * individual entries.
   * @param sectionType
   */
  function toggleLock(sectionType: SectionType) {
    const existing = sections.value.find((s) => s.sectionType === sectionType)
    if (existing) {
      existing.locked = !existing.locked
    }
  }

  /**
   * Toggle the `locked` flag on an individual sub-item (entry) within a
   * section. Locked entries are never modified/removed by Tailor
   * Resume, even when their section is unlocked.
   * @param sectionType
   * @param entryId
   */
  function toggleEntryLock(sectionType: SectionType, entryId: string) {
    const section = sections.value.find((s) => s.sectionType === sectionType)
    if (!section) return
    const entry = section.entries.find((e) => e.id === entryId)
    if (entry) {
      entry.locked = !entry.locked
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
    name.value = payload.name ?? ''
    layout.value = payload.layout

    // Load saved sections, then fill in any new SECTION_TYPES that were
    // added after the resume was created (e.g. experience). Missing types
    // get a default empty section so they appear in the sidebar and editor.
    const savedMap = new Map(
      payload.sections.map((s) => [s.sectionId, s]),
    )
    const maxOrder = payload.sections.reduce((m, s) => Math.max(m, s.order), -1)

    sections.value = SECTION_TYPES.map((type, i) => {
      const saved = savedMap.get(type)
      if (saved) {
        return {
          sectionId: saved.sectionId,
          sectionType: type,
          column: saved.column,
          order: saved.order,
          enabled: (saved as { enabled?: boolean }).enabled ?? true,
          locked: (saved as { locked?: boolean }).locked ?? false,
          entries: saved.entries.map((e) => ({
            id: generateId(),
            order: e.order,
            parentId: e.parentId,
            locked: (e as { locked?: boolean }).locked ?? false,
            fields: e.fields.map((f) => ({
              key: f.key,
              value: f.value,
              order: f.order,
            })),
          })),
        }
      }
      // Section type added after resume was created — insert as disabled
      // at the end so it doesn't disrupt the existing layout.
      return {
        sectionId: type,
        sectionType: type,
        column: 'right',
        order: maxOrder + 1 + i,
        enabled: false,
        locked: false,
        entries: [],
      }
    })
  }

  /**
   *
   */
  function toPayload(): ResumePayload {
    return {
      name: name.value || null,
      layout: layout.value,
      sections: sections.value.map((s) => ({
        sectionId: s.sectionId,
        column: s.column,
        order: s.order,
        enabled: s.enabled,
        locked: s.locked,
        entries: s.entries.map((e) => ({
          id: e.id,
          order: e.order,
          parentId: e.parentId,
          locked: e.locked,
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
   *
   * Locked sections are skipped entirely: their filter indices/skills are not
   * recorded, so every item inside them keeps its current visibility
   * regardless of keyword matches. Lock state itself is never changed by
   * filtering — it only affects what the filter is allowed to touch.
   * @param response
   */
  function applyTailorFilter(response: TailorResponse): void {
    isFiltered.value = true

    const isLocked = (sectionId: string): boolean =>
      sections.value.find((s) => s.sectionId === sectionId)?.locked ?? false

    // Skip locked sections — don't record indices that would hide their items.
    const filteredIndices: Record<string, EntryBulletIndices[]> = {}
    for (const [sectionId, indices] of Object.entries(
      response.filteredBulletIndices ?? {},
    )) {
      if (!isLocked(sectionId)) {
        filteredIndices[sectionId] = indices
      }
    }
    filteredBulletIndices.value = filteredIndices

    // Locked skill sections keep every skill visible. (The empty list is safe
    // because isSkillRelevant short-circuits to true for locked sections.)
    filteredHardSkills.value = isLocked('hard_skills')
      ? []
      : response.filteredHardSkills
    filteredSoftSkills.value = isLocked('soft_skills')
      ? []
      : response.filteredSoftSkills
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
   * Get the top-level entries of a section in display order.
   * @param sectionId
   */
  function topLevelEntries(sectionId: string): SectionEntryState[] {
    const section = sections.value.find((s) => s.sectionId === sectionId)
    if (!section) return []
    return section.entries
      .filter((e) => !e.parentId)
      .sort((a, b) => a.order - b.order)
  }

  /**
   * Check whether the entry at the given top-level index is locked.
   * @param sectionId
   * @param entryIndex
   */
  function isEntryLockedAt(sectionId: string, entryIndex: number): boolean {
    const topLevel = topLevelEntries(sectionId)
    return entryIndex >= 0 && entryIndex < topLevel.length
      ? topLevel[entryIndex]!.locked
      : false
  }

  /**
   * Check whether a specific bullet (child entry) is locked.
   * @param sectionId
   * @param entryIndex - index of the parent entry within top-level entries
   * @param bulletIndex - index of the bullet within that entry's children
   */
  function isBulletEntryLocked(
    sectionId: string,
    entryIndex: number,
    bulletIndex: number,
  ): boolean {
    const topLevel = topLevelEntries(sectionId)
    const parent = topLevel[entryIndex]
    if (!parent) return false
    const children = sections.value
      .find((s) => s.sectionId === sectionId)!
      .entries.filter((e) => e.parentId === parent.id)
      .sort((a, b) => a.order - b.order)
    return bulletIndex >= 0 && bulletIndex < children.length
      ? children[bulletIndex]!.locked
      : false
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

    // Locked sections keep their current visibility regardless of matches.
    if (sections.value.find((s) => s.sectionId === sectionId)?.locked) return true

    // Locked entries (or locked bullet sub-items) keep their current
    // visibility regardless of keyword matches.
    if (isEntryLockedAt(sectionId, entryIndex)) return true
    if (isBulletEntryLocked(sectionId, entryIndex, bulletIndex)) return true

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

    // Locked sections keep their current visibility regardless of matches.
    if (sections.value.find((s) => s.sectionId === sectionId)?.locked) return true

    const lowerName = skillName.toLowerCase().trim()

    // Locked skill entries keep their visibility regardless of matches.
    const section = sections.value.find((s) => s.sectionId === sectionId)
    const lockedEntry = section?.entries.find(
      (e) =>
        !e.parentId &&
        e.locked &&
        e.fields.some(
          (f) =>
            f.key === 'name' &&
            f.value.toLowerCase().trim() === lowerName,
        ),
    )
    if (lockedEntry) return true

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
   * Bullets belonging to locked entries are always counted as visible.
   * @param sectionId
   */
  function getFilteredBulletCount(sectionId: string): { visible: number; total: number } {
    const section = sections.value.find((s) => s.sectionId === sectionId)
    if (!section) return { visible: 0, total: 0 }

    let total = 0
    let lockedVisible = 0
    const topLevel = section.entries
      .filter((e) => !e.parentId)
      .sort((a, b) => a.order - b.order)

    for (const entry of topLevel) {
      const children = section.entries.filter((e) => e.parentId === entry.id)
      total += children.length
      // Locked parent entries keep ALL their bullets visible.
      if (entry.locked) {
        lockedVisible += children.length
      } else {
        // A locked bullet child is individually visible.
        lockedVisible += children.filter((c) => c.locked).length
      }
    }

    if (!isFiltered.value) return { visible: total, total }

    const entryIndices = filteredBulletIndices.value[sectionId]
    if (!entryIndices) return { visible: total, total }

    let visible = lockedVisible
    for (const ei of entryIndices) {
      // Locked entries were already counted in full — don't double count.
      const entry = topLevel[ei.entryOrder]
      if (entry?.locked) continue
      // Locked bullet children are already counted — don't count them again
      // from the filter indices.
      const lockedChildren = entry
        ? section.entries.filter((e) => e.parentId === entry.id && e.locked)
            .length
        : 0
      visible += Math.max(0, ei.bulletIndices.length - lockedChildren)
    }
    return { visible: Math.min(visible, total), total }
  }

  return {
    id,
    name,
    layout,
    sections,
    enabledSections,
    lockedSections,
    orderedSectionTypes,
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
    toggleLock,
    toggleEntryLock,
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
