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

  // Derived: sections assigned to left column (only meaningful for 2:1 layout)
  const leftColumnSections = computed(() =>
    sections.value.filter((s) => s.column === 'left'),
  )

  // Derived: sections assigned to right column
  const rightColumnSections = computed(() =>
    sections.value.filter((s) => s.column === 'right'),
  )

  // Derived: all section types sorted by order. Enabled AND disabled sections
  // stay interleaved by their `order` — hiding a section keeps it in place
  // instead of jumping to the bottom (RES-109). Respects drag-and-drop
  // reordering from SectionToggles.
  const orderedSectionTypes = computed(() =>
    [...sections.value]
      .sort((a, b) => a.order - b.order)
      .map((s) => s.sectionType),
  )

  /**
   * Initialize a FRESH builder with default sections.
   *
   * RES-103 deferred-create: `id` is the SERVER resume id and starts as
   * `null` — no DB row exists until the first edit autosaves (the composable
   * POSTs, receives the real id, and assigns it here). A truthy id means the
   * resume already exists server-side and saves must PUT /resumes/:id.
   */
  function initializeDefaults() {
    id.value = null
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
   * All 11 section types always stay in the array.
   * @param sectionType
   */
  function toggleSection(sectionType: SectionType) {
    const existing = sections.value.find((s) => s.sectionType === sectionType)
    if (existing) {
      existing.enabled = !existing.enabled
      // Tailor never touches section eyes (RES-108) — the eye toggle is
      // exclusively the user's choice, so a manual flip is always the
      // persistent value and serializes as-is.
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
   * Toggle the `visible` flag on an individual sub-item (entry) within a
   * section. Hidden entries (eye crossed out) are excluded from every
   * resume preview. Independent of `locked` — a locked entry keeps its
   * visibility through Tailor runs, but the user can still hide/show it.
   * @param sectionType
   * @param entryId
   */
  function toggleEntryVisibility(sectionType: SectionType, entryId: string) {
    const section = sections.value.find((s) => s.sectionType === sectionType)
    if (!section) return
    const entry = section.entries.find((e) => e.id === entryId)
    if (entry) {
      entry.visible = !entry.visible
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
   * Apply a new display order to the listed section types.
   *
   * Section types present in `orderedTypes` are placed, in the requested
   * order, into the slots currently occupied by the listed types. Types NOT
   * listed keep their current position — they are never pushed to the end
   * (RES-109: hiding a section must keep it in place).
   *
   * SectionToggles emits the FULL ordered list (hidden sections included), so
   * in normal use this is an exact reorder. The slot-preserving behaviour
   * also makes partial/enabled-only lists safe: unlisted hidden sections stay
   * exactly where they are.
   * @param orderedTypes
   */
  function reorderSections(orderedTypes: SectionType[]) {
    const orderedSet = new Set(orderedTypes)
    const knownTypes = new Set(sections.value.map((s) => s.sectionType))
    // Dedupe + drop unknown types — these are the types that get moved.
    const reorderedTypes = orderedTypes.filter(
      (t, i) => knownTypes.has(t) && orderedTypes.indexOf(t) === i,
    )

    const sorted = [...sections.value].sort((a, b) => a.order - b.order)

    let reorderIdx = 0
    const newSections: ResumeSectionState[] = []

    for (let i = 0; i < sorted.length; i++) {
      const section = sorted[i]!
      if (orderedSet.has(section.sectionType)) {
        // This slot participates in the reorder — place the next requested
        // type here.
        const type = reorderedTypes[reorderIdx]!
        reorderIdx++
        const target = sections.value.find((s) => s.sectionType === type)!
        target.order = i
        newSections.push(target)
      } else {
        // Not part of the reorder — keep the section in its current slot.
        section.order = i
        newSections.push(section)
      }
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
        // Entry ids are regenerated below (the payload's ids may collide
        // with the current session or across anonymous/anonymous imports), so
        // child entries' parentId must be remapped to the NEW ids — otherwise
        // children keep pointing at stale payload ids and every bullet
        // silently disappears from the editors after a reload (RES-83 e2e).
        const idMap = new Map<string, string>()
        const entries = saved.entries.map((e) => {
          const newId = generateId()
          if (e.id) idMap.set(e.id, newId)
          return {
            id: newId,
            order: e.order,
            parentId: e.parentId,
            locked: (e as { locked?: boolean }).locked ?? false,
            visible: (e as { visible?: boolean }).visible ?? true,
            fields: e.fields.map((f) => ({
              key: f.key,
              value: f.value,
              order: f.order,
            })),
          }
        })
        for (const entry of entries) {
          if (entry.parentId && idMap.has(entry.parentId)) {
            entry.parentId = idMap.get(entry.parentId)!
          }
        }
        return {
          sectionId: saved.sectionId,
          sectionType: type,
          column: saved.column,
          order: saved.order,
          enabled: (saved as { enabled?: boolean }).enabled ?? true,
          locked: (saved as { locked?: boolean }).locked ?? false,
          entries,
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
        // RES-108: Tailor never flips section eyes — the eye toggle is
        // exclusively the user's choice, so the live enabled flag is
        // always the persistent value.
        enabled: s.enabled,
        locked: s.locked,
        entries: s.entries.map((e) => ({
          id: e.id,
          order: e.order,
          parentId: e.parentId,
          locked: e.locked,
          visible: e.visible,
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
   * RES-108: Tailor operates at sub-item/bullet level ONLY. It never
   * sets `section.enabled` — the section eye toggle is exclusively the
   * user's choice. Section-level `locked` is likewise obsolete for Tailor:
   * the locks that matter are sub-item/bullet locks (RES-97/RES-106).
   * @param response
   */
  function applyTailorFilter(response: TailorResponse): void {
    isFiltered.value = true

    // Record the sub-item/bullet visibility decided by the match. Sections
    // the response carries no indices for keep every item visible
    // (isBulletRelevant/isSkillRelevant treat a missing entry as relevant).
    filteredBulletIndices.value = response.filteredBulletIndices ?? {}
    filteredHardSkills.value = response.filteredHardSkills
    filteredSoftSkills.value = response.filteredSoftSkills
  }

  /**
   * Clear all filter state and restore full visibility.
   *
   * RES-108: sub-item/bullet visibility is derived from the filter state
   * (filteredBulletIndices/filteredHardSkills/filteredSoftSkills), so
   * clearing it returns every entry/bullet to its pre-tailor visibility.
   * Section eye states are never touched by Tailor and need no restoring.
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

    // Locked entries (or locked bullet sub-items) keep their current
    // visibility regardless of keyword matches. Section-level locks are
    // obsolete for Tailor (RES-108) — only sub-item/bullet locks count.
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
    toggleEntryLock,
    toggleEntryVisibility,
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
    // RES-103/RES-102: assign a local id for an anonymous first save so the
    // blob lands under resume_data_<id> (per-resume isolation) instead of
    // the bare resume_data key.
    generateAnonymousId: (): string => generateId(),
  }
})
