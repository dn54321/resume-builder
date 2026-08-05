import type { SectionField } from './section-field.model';

/**
 * Tree node for a section entry with its fields and nested children.
 *
 * Mirrors the `SectionEntry` Prisma row (via the `fullResumeInclude`
 * relation include), so the tree can be mapped back into a
 * `CreateResumeDto` when duplicating a resume.
 */
export interface SectionEntry {
  id: string;
  resumeSectionId: string;
  order: number;
  parentId: string | null;
  fields: SectionField[];
  children?: SectionEntry[];
}
