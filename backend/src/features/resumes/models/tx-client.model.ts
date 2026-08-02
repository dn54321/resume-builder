import type { Prisma } from '../../../generated/prisma/client';

/**
 * Subset of Prisma's transaction client used by createEntries.
 * Uses UncheckedCreateInput variants because the code passes
 * foreign-key scalars (e.g. sectionEntryId) directly rather
 * than nested relation objects.
 */
export interface TxClient {
  resume: {
    create: (args: {
      data: Prisma.ResumeUncheckedCreateInput;
    }) => Promise<{ id: string }>;
    findUnique: (args: {
      where: { id: string };
      include: Record<string, unknown>;
    }) => Promise<unknown>;
    update: (args: {
      where: { id: string };
      data: Prisma.ResumeUncheckedUpdateInput;
    }) => Promise<unknown>;
  };
  resumeSection: {
    create: (args: {
      data: Prisma.ResumeSectionUncheckedCreateInput;
    }) => Promise<{ id: string }>;
    findMany: (args: {
      where: { resumeId: string };
      select: { id: boolean };
    }) => Promise<Array<{ id: string }>>;
    deleteMany: (args: { where: { resumeId: string } }) => Promise<unknown>;
  };
  sectionEntry: {
    create: (args: {
      data: Prisma.SectionEntryUncheckedCreateInput;
    }) => Promise<{ id: string }>;
    deleteMany: (args: {
      where: { resumeSectionId: string };
    }) => Promise<unknown>;
  };
  sectionField: {
    create: (args: {
      data: Prisma.SectionFieldUncheckedCreateInput;
    }) => Promise<unknown>;
  };
}
