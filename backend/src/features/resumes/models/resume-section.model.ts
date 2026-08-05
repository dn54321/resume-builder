import type { SectionEntry } from './section-entry.model';

/**
 * A section within a resume tree, containing ordered entries.
 *
 * Mirrors the `ResumeSection` Prisma row (via the `fullResumeInclude`
 * relation include), so the tree can be mapped back into a
 * `CreateResumeDto` when duplicating a resume.
 */
export interface ResumeSection {
  id: string;
  resumeId: string;
  sectionId: string;
  column: string;
  order: number;
  /** Whether the section is locked (e.g. protected from further edits). */
  locked: boolean;
  entries: SectionEntry[];
}
