import type { SectionField } from './section-field.model';

/**
 * Tree node for a section entry with its fields and nested children.
 * Mirrors the SectionEntry Prisma schema: order and parentId flow through
 * decryptResumeFields via the spread, so they are always present on a
 * full tree returned by the service.
 *
 * NOTE: Prisma's default back-relation (resumeSection.entries) returns ALL
 * entries for a section, children included. Child entries therefore appear
 * both in the flat `entries` array (with `parentId` set) and nested inside
 * their parent's `children` array. Consumers that need only top-level
 * entries must filter on `parentId`.
 */
export interface SectionEntry {
  id: string;
  order: number;
  parentId?: string | null;
  /** Whether the entry is locked (Tailor must not modify/remove it, RES-97). */
  locked: boolean;
  fields: SectionField[];
  children?: SectionEntry[];
}
