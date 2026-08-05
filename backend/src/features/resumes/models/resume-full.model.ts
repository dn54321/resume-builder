/**
 * Full resume shape exposed by the controller (sections are untyped in the API).
 *
 * `createdAt` / `updatedAt` are present on every Prisma resume row and are
 * returned (via the tree) by `create`, `update`, and `duplicate` — the
 * dashboard uses them to render the "Updated …" line on each card.
 *
 * Timestamps are typed as `Date` (what the service returns in-process);
 * Express serializes them to ISO strings on the wire.
 */
export interface ResumeFull {
  id: string;
  userId: string;
  name: string | null;
  layout: string;
  createdAt: Date;
  updatedAt: Date;
  sections: unknown[];
}
