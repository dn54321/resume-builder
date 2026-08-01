import { computed, type ComputedRef } from 'vue'
import { useResumeStore } from '@/features/builder/stores/resume'
import type {
  SectionType,
  SectionFieldState,
  SectionEntryState,
  ResumeSectionState,
} from '@/features/builder/types/resume'

/**
 *
 */
function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Shared logic for section editors.
 * All mutations go through the resume store.
 * @param sectionType
 */
export function useSectionEditor(sectionType: SectionType) {
  const store = useResumeStore()

  const section: ComputedRef<ResumeSectionState | undefined> = computed(() =>
    store.sections.find((s) => s.sectionType === sectionType),
  )

  const entries: ComputedRef<SectionEntryState[]> = computed(
    () => section.value?.entries ?? [],
  )

  // ─── Entry helpers ───

  /**
   *
   * @param entryId
   */
  function getEntry(entryId: string): SectionEntryState | undefined {
    return entries.value.find((e) => e.id === entryId)
  }

  /**
   *
   * @param entryId
   * @param key
   */
  function getField(entryId: string, key: string): SectionFieldState | undefined {
    const entry = getEntry(entryId)
    return entry?.fields.find((f) => f.key === key)
  }

  /**
   *
   * @param entryId
   * @param key
   */
  function getFieldValue(entryId: string, key: string): string {
    return getField(entryId, key)?.value ?? ''
  }

  // ─── Entry mutations ───

  /**
   *
   * @param defaultFields
   */
  function addEntry(defaultFields: { key: string; value: string }[] = []): string {
    if (!section.value) return ''
    const entryId = generateId()
    const fields: SectionFieldState[] = defaultFields.map((f, i) => ({
      key: f.key,
      value: f.value,
      order: i,
    }))
    const newEntry: SectionEntryState = {
      id: entryId,
      order: section.value.entries.length,
      parentId: null,
      fields,
    }
    section.value.entries.push(newEntry)
    return entryId
  }

  /**
   *
   * @param entryId
   */
  function removeEntry(entryId: string): void {
    if (!section.value) return
    section.value.entries = section.value.entries.filter((e) => e.id !== entryId)
    // Re-index orders
    section.value.entries.forEach((e, i) => {
      e.order = i
    })
  }

  /**
   * Reorder top-level entries (entries without parentId).
   * Indices are relative to the top-level filtered list.
   * @param fromIndex
   * @param toIndex
   */
  function reorderEntries(fromIndex: number, toIndex: number): void {
    if (!section.value) return
    const allEntries = section.value.entries
    const topLevel = allEntries.filter((e) => !e.parentId)
    if (fromIndex < 0 || fromIndex >= topLevel.length) return
    if (toIndex < 0 || toIndex >= topLevel.length) return

    // Reorder top-level within the full array
    const [moved] = topLevel.splice(fromIndex, 1)
    if (!moved) return
    topLevel.splice(toIndex, 0, moved)

    // Rebuild entries: top-level in new order, followed by children (keep children order)
    const children = allEntries.filter((e) => e.parentId)
    const newEntries: SectionEntryState[] = []
    for (let i = 0; i < topLevel.length; i++) {
      topLevel[i]!.order = i
      newEntries.push(topLevel[i]!)
    }
    // Append children as-is (they'll be re-indexed separately by their parent)
    for (const child of children) {
      newEntries.push(child)
    }
    section.value.entries = newEntries
  }

  // ─── Field mutations ───

  /**
   *
   * @param entryId
   * @param key
   * @param value
   */
  function updateField(entryId: string, key: string, value: string): void {
    const entry = getEntry(entryId)
    if (!entry) return
    const existing = entry.fields.find((f) => f.key === key)
    if (existing) {
      existing.value = value
    } else {
      entry.fields.push({
        key,
        value,
        order: entry.fields.length,
      })
    }
  }

  // ─── Bullet point mutations (children of an entry) ───

  /**
   *
   * @param parentId
   */
  function getChildren(parentId: string): SectionEntryState[] {
    return entries.value.filter((e) => e.parentId === parentId)
  }

  /**
   *
   * @param parentId
   */
  function addBullet(parentId: string): string | null {
    if (!section.value) return null
    const bulletId = generateId()
    const bulletEntry: SectionEntryState = {
      id: bulletId,
      order: getChildren(parentId).length,
      parentId,
      fields: [{ key: 'text', value: '', order: 0 }],
    }
    section.value.entries.push(bulletEntry)
    return bulletId
  }

  /**
   *
   * @param bulletId
   */
  function removeBullet(bulletId: string): void {
    if (!section.value) return
    section.value.entries = section.value.entries.filter((e) => e.id !== bulletId)
    // Re-index remaining children
    const children = section.value.entries.filter((e) => e.parentId !== null)
    // Group by parentId
    const groups = new Map<string, SectionEntryState[]>()
    for (const child of children) {
      const pid = child.parentId!
      if (!groups.has(pid)) groups.set(pid, [])
      groups.get(pid)!.push(child)
    }
    for (const [, group] of groups) {
      group.sort((a, b) => a.order - b.order)
      group.forEach((e, i) => {
        e.order = i
      })
    }
  }

  /**
   *
   * @param bulletId
   * @param value
   */
  function updateBullet(bulletId: string, value: string): void {
    const bullet = getEntry(bulletId)
    if (!bullet) return
    const field = bullet.fields.find((f) => f.key === 'text')
    if (field) {
      field.value = value
    } else {
      bullet.fields.push({ key: 'text', value, order: 0 })
    }
  }

  /**
   *
   * @param parentId
   * @param fromIndex
   * @param toIndex
   */
  function reorderBullets(parentId: string, fromIndex: number, toIndex: number): void {
    if (!section.value) return
    const allEntries = section.value.entries
    const bullets = allEntries.filter((e) => e.parentId === parentId)
    bullets.sort((a, b) => a.order - b.order)
    if (fromIndex < 0 || fromIndex >= bullets.length) return
    if (toIndex < 0 || toIndex >= bullets.length) return
    const [moved] = bullets.splice(fromIndex, 1)
    if (!moved) return
    bullets.splice(toIndex, 0, moved)
    bullets.forEach((b, i) => {
      b.order = i
    })

    // Rebuild entries: non-bullets + updated bullets
    const nonBullets = allEntries.filter((e) => e.parentId !== parentId)
    section.value.entries = [...nonBullets, ...bullets]
  }

  return {
    section,
    entries,
    getEntry,
    getField,
    getFieldValue,
    addEntry,
    removeEntry,
    reorderEntries,
    updateField,
    getChildren,
    addBullet,
    removeBullet,
    updateBullet,
    reorderBullets,
    generateId,
  }
}
