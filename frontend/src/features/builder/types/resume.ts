// The 10 resume section types
export const SECTION_TYPES = [
  'contact',
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'languages',
  'volunteer',
  'references',
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
  fields: SectionFieldState[]
}

export interface ResumeSectionState {
  sectionId: string
  sectionType: SectionType
  column: 'left' | 'right'
  order: number
  entries: SectionEntryState[]
}

export interface ResumePayload {
  layout: 'standard' | 'column2-1'
  name: string
  sections: {
    sectionId: string
    column: 'left' | 'right'
    order: number
    entries: {
      order: number
      parentId: string | null
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
  contact: 'Contact',
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certifications: 'Certifications',
  languages: 'Languages',
  volunteer: 'Volunteer',
  references: 'References',
}

export type LayoutType = 'standard' | 'column2-1'
