import type { SectionEntry } from './section-entry.model';

/**
 * A section within a resume tree, containing ordered entries.
 */
export interface ResumeSection {
  id: string;
  entries: SectionEntry[];
}
