import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSectionEditor } from '@/features/builder/composables/useSectionEditor'
import { useResumeStore } from '@/features/builder/stores/resume'
import type { SectionType } from '@/features/builder/types/resume'

describe('useSectionEditor', () => {
  let store: ReturnType<typeof useResumeStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useResumeStore()
    store.initializeDefaults()
  })

  function getEditor(sectionType: SectionType) {
    return useSectionEditor(sectionType)
  }

  describe('addEntry / removeEntry', () => {
    it('adds an entry with default fields to a section', () => {
      const editor = getEditor('experience')
      editor.addEntry([
        { key: 'company', value: 'Acme' },
        { key: 'title', value: 'Dev' },
      ])

      expect(editor.entries.value).toHaveLength(1)
      const entry = editor.entries.value[0]!
      expect(entry.fields).toHaveLength(2)
      expect(editor.getFieldValue(entry.id, 'company')).toBe('Acme')
      expect(editor.getFieldValue(entry.id, 'title')).toBe('Dev')
    })

    it('removes an entry by id', () => {
      const editor = getEditor('experience')
      const id1 = editor.addEntry([{ key: 'company', value: 'A' }])
      const id2 = editor.addEntry([{ key: 'company', value: 'B' }])

      editor.removeEntry(id1)
      expect(editor.entries.value).toHaveLength(1) // 1 entry remaining (id2)
      expect(editor.entries.value.find((e) => e.id === id1)).toBeUndefined()
      expect(editor.entries.value[0]!.id).toBe(id2)
    })

    it('re-indexes orders after removal', () => {
      const editor = getEditor('experience')
      editor.addEntry([{ key: 'company', value: 'A' }])
      editor.addEntry([{ key: 'company', value: 'B' }])
      editor.addEntry([{ key: 'company', value: 'C' }])

      // Remove the first entry
      editor.removeEntry(editor.entries.value[0]!.id)

      const remaining = editor.entries.value.filter((e) => !e.parentId)
      expect(remaining).toHaveLength(2)
      expect(remaining[0]!.order).toBe(0)
      expect(remaining[1]!.order).toBe(1)
    })
  })

  describe('updateField', () => {
    it('updates an existing field value', () => {
      const editor = getEditor('experience')
      const id = editor.addEntry([{ key: 'company', value: 'Old' }])
      editor.updateField(id, 'company', 'New')

      expect(editor.getFieldValue(id, 'company')).toBe('New')
    })

    it('creates a new field if key does not exist', () => {
      const editor = getEditor('experience')
      const id = editor.addEntry([])
      editor.updateField(id, 'location', 'SF')

      expect(editor.getFieldValue(id, 'location')).toBe('SF')
      expect(editor.entries.value[0]!.fields).toHaveLength(1)
    })
  })

  describe('reorderEntries', () => {
    it('reorders top-level entries', () => {
      const editor = getEditor('experience')
      const id1 = editor.addEntry([{ key: 'company', value: 'A' }])
      const id2 = editor.addEntry([{ key: 'company', value: 'B' }])

      editor.reorderEntries(0, 1)

      const topLevel = editor.entries.value.filter((e) => !e.parentId)
      expect(topLevel[0]!.id).toBe(id2)
      expect(topLevel[1]!.id).toBe(id1)
      expect(topLevel[0]!.order).toBe(0)
      expect(topLevel[1]!.order).toBe(1)
    })

    it('keeps children when reordering top-level entries', () => {
      const editor = getEditor('experience')
      const parentId = editor.addEntry([{ key: 'company', value: 'Parent' }])
      editor.addEntry([{ key: 'company', value: 'Other' }])
      editor.addBullet(parentId)
      editor.addBullet(parentId)

      editor.reorderEntries(0, 1)

      // Children should still exist
      const children = editor.getChildren(parentId)
      expect(children).toHaveLength(2)
    })
  })

  describe('bullet points', () => {
    it('adds a bullet as a child entry', () => {
      const editor = getEditor('experience')
      const parentId = editor.addEntry([{ key: 'company', value: 'A' }])
      const bulletId = editor.addBullet(parentId)

      expect(bulletId).toBeTruthy()
      const children = editor.getChildren(parentId)
      expect(children).toHaveLength(1)
      expect(children[0]!.parentId).toBe(parentId)
      expect(children[0]!.fields[0]!.key).toBe('text')
    })

    it('removes a bullet', () => {
      const editor = getEditor('experience')
      const parentId = editor.addEntry([{ key: 'company', value: 'A' }])
      const bulletId = editor.addBullet(parentId)

      editor.removeBullet(bulletId!)
      expect(editor.getChildren(parentId)).toHaveLength(0)
    })

    it('updates a bullet text', () => {
      const editor = getEditor('experience')
      const parentId = editor.addEntry([{ key: 'company', value: 'A' }])
      const bulletId = editor.addBullet(parentId)

      editor.updateBullet(bulletId!, 'Updated text')
      const children = editor.getChildren(parentId)
      expect(children[0]!.fields[0]!.value).toBe('Updated text')
    })

    it('reorders bullets', () => {
      const editor = getEditor('experience')
      const parentId = editor.addEntry([{ key: 'company', value: 'A' }])
      const b1 = editor.addBullet(parentId)!
      editor.updateBullet(b1, 'First')
      const b2 = editor.addBullet(parentId)!
      editor.updateBullet(b2, 'Second')

      editor.reorderBullets(parentId, 0, 1)

      const children = editor.getChildren(parentId).sort((a, b) => a.order - b.order)
      expect(children[0]!.id).toBe(b2)
      expect(children[1]!.id).toBe(b1)
    })
  })

  describe('single-entry sections', () => {
    it('getFieldValue returns empty string for missing entry', () => {
      const editor = getEditor('summary')
      expect(editor.getFieldValue('nonexistent', 'text')).toBe('')
    })

    it('is no-op for missing section type (not enabled)', () => {
      store.toggleSection('summary')
      const editor = getEditor('summary')
      expect(editor.section.value).toBeUndefined()
      expect(editor.entries.value).toEqual([])
    })
  })
})
