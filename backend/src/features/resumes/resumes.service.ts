import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { CreateResumeDto } from './dto/create-resume.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';
import type { TxClient } from './models/tx-client.model';
import type { SectionField } from './models/section-field.model';
import type { SectionEntry } from './models/section-entry.model';
import type { ResumeSection } from './models/resume-section.model';
import type { ResumeTree } from './models/resume-tree.model';

// ─── Include object ────────────────────────────────────────────────

const fullResumeInclude = {
  sections: {
    include: {
      entries: {
        include: {
          fields: true,
          children: {
            include: {
              fields: true,
            },
          },
        },
      },
    },
  },
} as const;

@Injectable()
export class ResumesService {
  private readonly logger = new Logger(ResumesService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CryptoService) private readonly crypto: CryptoService,
  ) {}

  async findAll(userId: string) {
    return this.prisma.resume.findMany({
      where: { userId },
      select: {
        id: true,
        layout: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string): Promise<ResumeTree> {
    const resume = await this.prisma.resume.findUnique({
      where: { id },
      include: fullResumeInclude,
    });

    if (!resume || resume.userId !== userId) {
      throw new NotFoundException('Resume not found');
    }

    return this.decryptResumeFields(resume);
  }

  async delete(id: string, userId: string): Promise<void> {
    const resume = await this.prisma.resume.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!resume || resume.userId !== userId) {
      throw new NotFoundException('Resume not found');
    }

    await this.prisma.resume.delete({ where: { id } });
  }

  async create(userId: string, dto: CreateResumeDto): Promise<ResumeTree> {
    return this.prisma.$transaction(async (tx) => {
      const resume = await tx.resume.create({
        data: {
          userId,
          layout: dto.layout ?? 'standard',
        },
      });

      for (const sectionDto of dto.sections) {
        const section = await tx.resumeSection.create({
          data: {
            resumeId: resume.id,
            sectionId: sectionDto.sectionId,
            column: sectionDto.column ?? 'right',
            order: sectionDto.order,
          },
        });

        await this.createEntries(tx, section.id, sectionDto.entries);
      }

      return this.decryptResumeFields(
        (await tx.resume.findUnique({
          where: { id: resume.id },
          include: fullResumeInclude,
        }))!,
      );
    });
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateResumeDto,
  ): Promise<ResumeTree> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.resume.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId) {
        throw new NotFoundException('Resume not found');
      }

      if (dto.layout !== undefined) {
        await tx.resume.update({
          where: { id },
          data: { layout: dto.layout },
        });
      }

      if (dto.sections !== undefined) {
        const existingSections = await tx.resumeSection.findMany({
          where: { resumeId: id },
          select: { id: true },
        });

        for (const s of existingSections) {
          await tx.sectionEntry.deleteMany({
            where: { resumeSectionId: s.id },
          });
        }

        await tx.resumeSection.deleteMany({ where: { resumeId: id } });

        for (const sectionDto of dto.sections) {
          const section = await tx.resumeSection.create({
            data: {
              resumeId: id,
              sectionId: sectionDto.sectionId,
              column: sectionDto.column ?? 'right',
              order: sectionDto.order,
            },
          });

          await this.createEntries(tx, section.id, sectionDto.entries);
        }
      }

      return this.decryptResumeFields(
        (await tx.resume.findUnique({
          where: { id },
          include: fullResumeInclude,
        }))!,
      );
    });
  }

  private async createEntries(
    tx: TxClient,
    resumeSectionId: string,
    entries: CreateResumeDto['sections'][number]['entries'],
    parentId?: string,
  ): Promise<void> {
    for (const entryDto of entries) {
      const entry = await tx.sectionEntry.create({
        data: {
          resumeSectionId,
          order: entryDto.order,
          parentId: parentId ?? null,
        },
      });

      for (const fieldDto of entryDto.fields) {
        const { encrypted, iv, authTag } = this.crypto.encryptField(
          fieldDto.value,
        );
        await tx.sectionField.create({
          data: {
            sectionEntryId: entry.id,
            key: fieldDto.key,
            value: encrypted,
            iv,
            authTag,
            order: 0,
          },
        });
      }

      if (entryDto.children && entryDto.children.length > 0) {
        await this.createEntries(
          tx,
          resumeSectionId,
          entryDto.children,
          entry.id,
        );
      }
    }
  }

  private decryptResumeFields(resume: ResumeTree): ResumeTree {
    const decrypted: ResumeTree = { ...resume };

    if (decrypted.sections) {
      decrypted.sections = decrypted.sections.map((section: ResumeSection) => ({
        ...section,
        entries: section.entries.map((entry: SectionEntry) =>
          this.decryptEntry(entry),
        ),
      }));
    }

    return decrypted;
  }

  private decryptEntry(entry: SectionEntry): SectionEntry {
    const decrypted: SectionEntry = { ...entry, fields: [], children: [] };

    if (entry.fields) {
      decrypted.fields = entry.fields.map((field: SectionField) => ({
        ...field,
        value: this.crypto.decryptField(field.value, field.iv, field.authTag),
      }));
    }

    if (entry.children) {
      decrypted.children = entry.children.map((child: SectionEntry) =>
        this.decryptEntry(child),
      );
    }

    return decrypted;
  }
}
