import type { SectionField } from './section-field.model';

/**
 * Tree node for a section entry with its fields and nested children.
 * Mirrors the SectionEntry Prisma schema: order flows through
 * decryptResumeFields via the spread, so it is always present on a
 * full tree returned by the service.
 */
export interface SectionEntry {
  id: string;
  order: number;
  fields: SectionField[];
  children?: SectionEntry[];
}
