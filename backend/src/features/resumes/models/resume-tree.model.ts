import type { ResumeSection } from './resume-section.model';

/**
 * Full resume tree shape used internally by the service layer.
 * Includes an index signature because Prisma queries may return
 * additional properties beyond the explicitly typed fields.
 */
export interface ResumeTree {
  id: string;
  userId: string;
  name: string | null;
  layout: string;
  createdAt: Date;
  updatedAt: Date;
  sections: ResumeSection[];
  [key: string]: unknown;
}
