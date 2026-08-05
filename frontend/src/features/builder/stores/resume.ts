import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  type SectionType,
  type ResumeSectionState,
  type ResumePayload,
  type ResumePayloadEntry,
  type SectionFieldState,
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
   * Set the backend resume id (e.g. after loading a saved resume or
   * after a POST creates one). The id drives PUT /resumes/:id on save.
   * @param resumeId
   */
  function setId(resumeId: string) {
    id.value = resumeId
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
   * Flatten nested payload entries (children arrays, as the backend API
   * returns and as toPayload now serializes) into the flat list the store
   * keeps, preserving parent/child relationships via parentId.
   *
   * Also normalizes legacy flat payloads (pre-RES-93) whose entries carry
   * `parentId` directly instead of `children` arrays.
   * @param entries
   * @returns
   */
  function flattenPayloadEntries(
    entries: ResumePayloadEntry[],
  ): {
    id: string
    order: number
    parentId: string | null
    fields: SectionFieldState[]
  }[] {
    const flat: {
      id: string
      order: number
      parentId: string | null
      fields: SectionFieldState[]
    }[] = []
    // Maps payload entry ids → freshly generated store ids so legacy flat
    // parentId references resolve to the new id space regardless of order.
    const idMap = new Map<string, string>()

    // Phase A: assign fresh ids to every entry that declares one (nested
    // and flat alike), so parentId lookups in Phase B always succeed.
    const assignIds = (entry: ResumePayloadEntry) => {
      if (entry.id) idMap.set(entry.id, generateId())
      for (const child of entry.children ?? []) assignIds(child)
    }
    for (const entry of entries) assignIds(entry)

    // Phase B: flatten. Nested children inherit the parent's new id via
    // recursion; legacy flat entries resolve parentId through idMap.
    //
    // Prisma's nested include returns each child BOTH inside its parent's
    // `children` array AND as a flat row in `entries` (with parentId set) —
    // dedupe by old id so the store doesn't end up with duplicate bullets.
    const seenIds = new Set<string>()
    const walk = (entry: ResumePayloadEntry, parentNewId: string | null) => {
      if (entry.id && seenIds.has(entry.id)) {
        // Already emitted (e.g. via a parent's children array) — skip it
        // and its nested children, which were emitted too.
        return
      }
      const newId = entry.id ? (idMap.get(entry.id) ?? generateId()) : generateId()
      if (entry.id) seenIds.add(entry.id)
      flat.push({
        id: newId,
        order: entry.order,
        parentId:
          entry.parentId != null
            ? (idMap.get(entry.parentId) ?? null)
            : parentNewId,
        fields: (entry.fields ?? []).map((f) => ({
          key: f.key,
          value: f.value,
          order: f.order ?? 0,
        })),
      })
      for (const child of entry.children ?? []) walk(child, newId)
    }
    for (const entry of entries) walk(entry, null)

    return flat
  }
  /**
   * Load a saved payload (from the API, sessionStorage, or localStorage)
   * into the store. Entries may be nested (children arrays) or legacy flat
   * (parentId) — both are normalized to the store's flat list.
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
          entries: flattenPayloadEntries(saved.entries),
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
   * Build a nested entries tree (children arrays) matching the backend
   * API contract. Bullets (entries with parentId) become `children` of
   * their parent; leaf entries always get an empty `children` array
   * because SectionEntryDto.children is required.
   * @param entries
   * @returns
   */
  function toNestedEntries(entries: ResumeSectionState['entries']): ResumePayload['sections'][number]['entries'] {
    const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order
    const topLevel = entries.filter((e) => !e.parentId).sort(byOrder)

    return topLevel.map((e) => ({
      order: e.order,
      fields: e.fields
        .slice()
        .sort(byOrder)
        .map((f) => ({ key: f.key, value: f.value, order: f.order })),
      children: entries
        .filter((c) => c.parentId === e.id)
        .sort(byOrder)
        .map((c) => ({
          order: c.order,
          fields: c.fields
            .slice()
            .sort(byOrder)
            .map((f) => ({ key: f.key, value: f.value, order: f.order })),
          children: [],
        })),
    }))
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
        entries: toNestedEntries(s.entries),
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
    setId,
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
