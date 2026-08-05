import type { SectionEntry } from './section-entry.model';

/**
 * A section within a resume tree, containing ordered entries.
 */
export interface ResumeSection {
  id: string;
  /** Whether the section is locked (e.g. protected from further edits). */
  locked: boolean;
  entries: SectionEntry[];
}
