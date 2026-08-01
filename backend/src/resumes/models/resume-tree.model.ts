import type { ResumeSection } from './resume-section.model';

/**
 * Full resume tree shape used internally by the service layer.
 * Includes an index signature because Prisma queries may return
 * additional properties beyond the explicitly typed fields.
 */
export interface ResumeTree {
  id: string;
  userId: string;
  layout: string;
  name: string | null;
  sections: ResumeSection[];
  [key: string]: unknown;
}
