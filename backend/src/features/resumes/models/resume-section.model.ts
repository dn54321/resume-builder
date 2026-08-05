import type { SectionEntry } from './section-entry.model';

/**
 * A section within a resume tree, containing ordered entries.
 * Mirrors the ResumeSection Prisma schema: sectionId, column and order
 * flow through decryptResumeFields via the spread, so they are always
 * present on a full tree returned by the service.
 */
export interface ResumeSection {
  id: string;
  sectionId: string;
  column: string;
  order: number;
  /** Whether the section is locked (e.g. protected from further edits). */
  locked: boolean;
  /** Whether the section is visible in the rendered resume (soft-toggle). */
  enabled?: boolean;
  entries: SectionEntry[];
}
