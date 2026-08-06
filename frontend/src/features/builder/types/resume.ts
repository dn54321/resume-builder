// The 11 resume section types (must match backend Section seed)
export const SECTION_TYPES = [
  'name_contact',
  'summary',
  'experience',
  'education',
  'hard_skills',
  'soft_skills',
  'projects',
  'certifications',
  'languages',
  'hobbies',
  'volunteer',
] as const

export type SectionType = (typeof SECTION_TYPES)[number]

export interface SectionFieldState {
  key: string
  value: string
  order: number
}

export interface SectionEntryState {
  id: string
  order: number
  parentId: string | null
  /** Whether the entry is locked — Tailor must not modify/remove it. */
  locked: boolean
  /** Whether the entry is visible in the rendered resume (eye toggle, RES-106). */
  visible: boolean
  fields: SectionFieldState[]
}

export interface ResumeSectionState {
  sectionId: string
  sectionType: SectionType
  column: 'left' | 'right'
  order: number
  enabled: boolean
  /** Whether the section is locked (tailor/automation must not change its visibility). */
  locked: boolean
  entries: SectionEntryState[]
}

export interface ResumePayload {
  name?: string | null
  layout: 'standard' | 'column2-1'
  sections: {
    sectionId: string
    column: 'left' | 'right'
    order: number
    enabled?: boolean
    locked?: boolean
    entries: {
      /** Optional — set by toPayload() and the backend wire shape; absent in hand-built payloads. */
      id?: string
      order: number
      parentId: string | null
      locked?: boolean
      /** Optional — defaults to true when absent (RES-106 backward compat). */
      visible?: boolean
      fields: {
        key: string
        value: string
        order: number
      }[]
    }[]
  }[]
}

// Section IDs from the backend Section table
export const SECTION_LABELS: Record<SectionType, string> = {
  name_contact: 'Name & Contact',
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  hard_skills: 'Hard Skills',
  soft_skills: 'Soft Skills',
  projects: 'Projects',
  certifications: 'Certifications',
  languages: 'Languages',
  hobbies: 'Hobbies',
  volunteer: 'Volunteer',
}

export type LayoutType = 'standard' | 'column2-1'
