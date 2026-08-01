// The 10 resume section types (matches backend Section table seed data)
export const SECTION_TYPES = [
  'name_contact',
  'summary',
  'experience',
  'education',
  'hard_skills',
  'soft_skills',
  'certifications',
  'projects',
  'languages',
  'hobbies',
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

// Section labels matching backend Section table
export const SECTION_LABELS: Record<SectionType, string> = {
  name_contact: 'Name & Contact',
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  hard_skills: 'Hard Skills',
  soft_skills: 'Soft Skills',
  certifications: 'Certifications',
  projects: 'Projects',
  languages: 'Languages',
  hobbies: 'Hobbies',
}

export type LayoutType = 'standard' | 'column2-1'
