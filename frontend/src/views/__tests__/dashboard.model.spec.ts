import { describe, it, expect } from 'vitest'
import {
  toPreviewSections,
  type ResumeFullSection,
} from '@/views/models/dashboard.model'

describe('toPreviewSections', () => {
  it('maps full-resume sections to the preview component shape', () => {
    const sections: ResumeFullSection[] = [
      {
        id: 'section-1',
        sectionId: 'name_contact',
        column: 'right',
        order: 0,
        enabled: true,
        locked: false,
        entries: [
          {
            id: 'entry-1',
            order: 0,
            parentId: null,
            locked: false,
            fields: [{ key: 'fullName', value: 'John Doe', order: 0 }],
          },
        ],
      },
    ]

    const result = toPreviewSections(sections)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      sectionId: 'name_contact',
      sectionType: 'name_contact',
      column: 'right',
      order: 0,
      enabled: true,
      locked: false,
    })
    expect(result[0]!.entries[0]).toEqual({
      id: 'entry-1',
      order: 0,
      parentId: null,
      locked: false,
      visible: true,
      fields: [{ key: 'fullName', value: 'John Doe', order: 0 }],
    })
  })

  it('normalizes left column and fills missing optional flags', () => {
    const sections: ResumeFullSection[] = [
      {
        id: 'section-2',
        sectionId: 'experience',
        column: 'left',
        order: 3,
        // enabled / locked omitted — must default to true / false
        entries: [
          {
            id: 'entry-2',
            order: 1,
            parentId: 'parent-1',
            // entry locked omitted — must default to false (RES-97)
            fields: [{ key: 'company', value: 'Acme' }],
          },
        ],
      },
    ]

    const result = toPreviewSections(sections)

    expect(result[0]).toMatchObject({
      column: 'left',
      order: 3,
      enabled: true,
      locked: false,
    })
    expect(result[0]!.entries[0]).toEqual({
      id: 'entry-2',
      order: 1,
      parentId: 'parent-1',
      locked: false,
      visible: true,
      fields: [{ key: 'company', value: 'Acme', order: 0 }],
    })
  })

  it('maps any non-left column to right', () => {
    const sections: ResumeFullSection[] = [
      {
        id: 'section-3',
        sectionId: 'hobbies',
        column: 'right',
        order: 5,
        entries: [],
      },
    ]

    const result = toPreviewSections(sections)
    expect(result[0]!.column).toBe('right')
    expect(result[0]!.entries).toEqual([])
  })

  it('defaults entry visible to true and preserves visible=false (RES-106)', () => {
    const sections: ResumeFullSection[] = [
      {
        id: 'section-4',
        sectionId: 'experience',
        column: 'right',
        order: 0,
        entries: [
          {
            id: 'entry-visible',
            order: 0,
            parentId: null,
            // visible omitted — must default to true
            fields: [{ key: 'company', value: 'Visible Corp' }],
          },
          {
            id: 'entry-hidden',
            order: 1,
            parentId: null,
            visible: false,
            fields: [{ key: 'company', value: 'Hidden Corp' }],
          },
        ],
      },
    ]

    const result = toPreviewSections(sections)

    expect(result[0]!.entries[0]!.visible).toBe(true)
    expect(result[0]!.entries[1]!.visible).toBe(false)
  })
})
