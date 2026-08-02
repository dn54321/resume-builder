/**
 * Response shape from POST /api/v1/resumes/tailor.
 * Contains only relevant item indices/names — not the full resume.
 */
export interface TailorResponse {
  /** Per-section filtered bullet indices. Only sections with bullets are included. */
  filteredBulletIndices: Record<string, EntryBulletIndices[]>;
  /** Names of hard skills deemed relevant (lowercased for matching). */
  filteredHardSkills: string[];
  /** Names of soft skills deemed relevant (lowercased for matching). */
  filteredSoftSkills: string[];
}

export interface EntryBulletIndices {
  entryOrder: number;
  bulletIndices: number[];
}

/**
 * Request body sent to POST /api/v1/resumes/tailor.
 */
export interface TailorRequest {
  jobDescription: string;
  resume: ResumePayload;
}

/**
 * Mirrors the resume payload shape expected by the API.
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
