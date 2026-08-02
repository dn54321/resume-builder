/**
 * The resume structure accepted by the tailor endpoint.
 * Mirrors the frontend ResumePayload shape.
 */
export interface ResumePayload {
  layout: 'standard' | 'column2-1';
  name: string;
  sections: ResumeSectionPayload[];
}

export interface ResumeSectionPayload {
  sectionId: string;
  column: 'left' | 'right';
  order: number;
  entries: ResumeEntryPayload[];
}

export interface ResumeEntryPayload {
  order: number;
  parentId: string | null;
  fields: ResumeFieldPayload[];
  children?: ResumeEntryPayload[];
}

export interface ResumeFieldPayload {
  key: string;
  value: string;
  order: number;
}
