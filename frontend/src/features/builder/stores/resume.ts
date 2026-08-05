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

  /**
   * Eye (enabled) state of every section captured BEFORE the last tailor
   * run. RES-98: tailoring flips the eye toggles to match the strategy
   * result (relevant = visible); Reset Filter restores this snapshot so
   * the user's original visibility choices come back.
   */
  const preTailorEnabled = ref<Record<string, boolean>>({})

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
    preTailorEnabled.value = {}
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
      // A MANUAL eye flip during an active filter session becomes the new
      // persistent value (RES-98): tailoring-induced flips are ephemeral
      // session state (never serialized), but a deliberate user toggle is
      // the user's new intent and must survive save/reload.
      if (Object.prototype.hasOwnProperty.call(preTailorEnabled.value, existing.sectionId)) {
        preTailorEnabled.value[existing.sectionId] = existing.enabled
      }
    }
  }

  /**
   * Toggle the `locked` flag — protects the section from Tailor edits.
   * @param sectionType
   */
  function toggleLock(sectionType: SectionType) {
    const existing = sections.value.find((s) => s.sectionType === sectionType)
    if (existing) {
      existing.locked = !existing.locked
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
    preTailorEnabled.value = {}

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
        // RES-98: while a filter session is active, tailor-flipped eye
        // states are EPHEMERAL — serialize the user's pre-tailor choice so
        // save/reload never persists hidden sections with no Reset path.
        // Manual eye flips during the session update the snapshot (see
        // toggleSection), so deliberate changes still persist.
        enabled: isFiltered.value
          ? (preTailorEnabled.value[s.sectionId] ?? s.enabled)
          : s.enabled,
        locked: s.locked,
        entries: s.entries.map((e) => ({
          id: e.id,
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
   *
   * Locked sections are skipped entirely: their filter indices/skills are not
   * recorded, so every item inside them keeps its current visibility
   * regardless of keyword matches. Lock state itself is never changed by
   * filtering — it only affects what the filter is allowed to touch.
   * @param response
   */
  function applyTailorFilter(response: TailorResponse): void {
    // Snapshot the current eye state BEFORE flipping anything, so Reset
    // Filter restores exactly what the user had before tailoring. Only the
    // FIRST tailor run of a session captures the snapshot — re-running
    // Tailor without Reset keeps the original, so Reset always returns to
    // the true pre-tailor visibility.
    if (!isFiltered.value) {
      const before: Record<string, boolean> = {}
      for (const s of sections.value) {
        before[s.sectionId] = s.enabled
      }
      preTailorEnabled.value = before
    }

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

    // RES-98 eye-toggle feedback: flip the eye toggles to mirror what the
    // matching strategy decided — relevant sections/entries get shown
    // (eye on), sections whose content is entirely non-relevant get hidden
    // (eye off). Locked sections are never toggled (RES-92). Sections the
    // filter carries no information about (empty sections, sections without
    // bullet content) keep their current visibility.
    for (const section of sections.value) {
      if (section.locked) continue
      const relevant = computeSectionRelevance(section)
      if (relevant !== null) {
        section.enabled = relevant
      }
    }
  }

  /**
   * Decide whether a section is relevant to the JD based on the current
   * filter state. Returns `null` when the filter carries no information for
   * the section — the section keeps its current visibility in that case
   * (matches isBulletRelevant/isSkillRelevant semantics).
   * @param section
   */
  function computeSectionRelevance(section: ResumeSectionState): boolean | null {
    // Skill sections: relevant when at least one skill survived. Empty
    // skill sections have no filter info — leave them untouched.
    if (
      section.sectionType === 'hard_skills' ||
      section.sectionType === 'soft_skills'
    ) {
      if (section.entries.length === 0) return null
      const surviving =
        section.sectionType === 'hard_skills'
          ? filteredHardSkills.value
          : filteredSoftSkills.value
      return surviving.length > 0
    }

    // Sections without parented (bullet) content have no index info — the
    // filter never touches them, so neither do we.
    if (!section.entries.some((e) => e.parentId)) return null

    const entryIndices = filteredBulletIndices.value[section.sectionId]
    // Not in the map → nothing was filtered → keep visible (matches
    // isBulletRelevant).
    if (!entryIndices) return null
    // Relevant when at least one bullet of any entry survived the match.
    return entryIndices.some((e) => e.bulletIndices.length > 0)
  }

  /**
   * Clear all filter state and restore full visibility.
   */
  function resetTailorFilter(): void {
    // Restore the eye states captured before the last tailor run (RES-98).
    for (const section of sections.value) {
      const enabledBefore = preTailorEnabled.value[section.sectionId]
      if (enabledBefore !== undefined) {
        section.enabled = enabledBefore
      }
    }
    preTailorEnabled.value = {}

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

    // Locked sections keep their current visibility regardless of matches.
    if (sections.value.find((s) => s.sectionId === sectionId)?.locked) return true

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
