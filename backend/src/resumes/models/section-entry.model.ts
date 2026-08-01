import type { SectionField } from './section-field.model';

/**
 * Tree node for a section entry with its fields and nested children.
 */
export interface SectionEntry {
  id: string;
  fields: SectionField[];
  children: SectionEntry[];
}
