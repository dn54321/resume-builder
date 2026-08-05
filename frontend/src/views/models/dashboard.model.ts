import type {
  ResumeSectionState,
  SectionType,
} from '@/features/builder/types/resume'

/**
 * Summary row returned by `GET /api/v1/resumes` (list endpoint).
 * Rendered on the dashboard's resume cards.
 */
export interface ResumeSummary {
  id: string
  name: string | null
  layout: string
  createdAt: string
  updatedAt: string
}

/**
 * Full resume returned by `GET /api/v1/resumes/:id` — the wire shape.
 * `createdAt` / `updatedAt` are ISO strings once serialized by Express.
 */
export interface ResumeFull {
  id: string
  userId: string
  name: string | null
  layout: string
  createdAt: string
  updatedAt: string
  sections: ResumeFullSection[]
}

/**
 * A section inside a full resume tree. The backend's `sectionId` values are
 * the section type ids (e.g. `name_contact`, `experience`) — the same values
 * the preview components key on. `enabled` / `locked` are optional because
 * older saves may predate those columns.
 */
export interface ResumeFullSection {
  id: string
  sectionId: SectionType
  column: 'left' | 'right'
  order: number
  enabled?: boolean
  locked?: boolean
  entries: ResumeFullEntry[]
}

/**
 * An entry inside a full resume section. Child (bullet) entries appear both
 * in the flat `entries` array (with `parentId` set) and nested in their
 * parent's `children` — the preview components read the flat array.
 */
export interface ResumeFullEntry {
  id: string
  order: number
  parentId: string | null
  /** Whether the entry is locked — Tailor must not modify/remove it. */
  locked?: boolean
  fields: ResumeFullField[]
  children?: ResumeFullEntry[]
}

export interface ResumeFullField {
  key: string
  value: string
  /** Order is optional on the wire (SectionFieldDto marks it optional). */
  order?: number
}

/**
 * Map the sections of a full resume (`GET /api/v1/resumes/:id`) into the
 * `ResumeSectionState[]` shape consumed by the production preview components
 * (`StandardLayout` / `TwoColumnLayout`). Missing optional flags default to
 * their production values so the preview renders identically to the builder.
 * @param {ResumeFullSection[]} sections - Sections from the full resume wire shape
 * @returns {ResumeSectionState[]} Preview-ready section states
 */
export function toPreviewSections(
  sections: ResumeFullSection[],
): ResumeSectionState[] {
  return sections.map((section) => ({
    sectionId: section.sectionId,
    sectionType: section.sectionId,
    column: section.column === 'left' ? 'left' : 'right',
    order: section.order,
    enabled: section.enabled ?? true,
    locked: section.locked ?? false,
    entries: section.entries.map((entry) => ({
      id: entry.id,
      order: entry.order,
      parentId: entry.parentId ?? null,
      locked: entry.locked ?? false,
      fields: entry.fields.map((field) => ({
        key: field.key,
        value: field.value,
        order: field.order ?? 0,
      })),
    })),
  }))
}
