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
        name: true,
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

  /**
   * Create a copy of an existing resume named `Copy of <original>`.
   *
   * Loads the full (decrypted) tree via `findOne` (which also enforces
   * ownership), maps it back into a `CreateResumeDto`, and runs it through
   * `create()` — so every field value of the copy is re-encrypted with a
   * fresh key/IV/authTag.
   * @param {string} id - The source resume id
   * @param {string} userId - The authenticated user id
   * @returns {Promise<ResumeTree>} The newly created copy (decrypted)
   */
  async duplicate(id: string, userId: string): Promise<ResumeTree> {
    const existing = await this.findOne(id, userId);

    const dto: CreateResumeDto = {
      name: existing.name ? `Copy of ${existing.name}` : 'Copy of Untitled',
      layout: existing.layout,
      sections: existing.sections.map((section) => ({
        sectionId: section.sectionId,
        column: section.column,
        order: section.order,
        locked: section.locked,
        entries: this.toEntryDtos(section.entries),
      })),
    };

    return this.create(userId, dto);
  }

  /**
   * Map decrypted tree entries into `SectionEntryDto` shape (nested children
   * included) so `create()` can re-persist them.
   * @param {SectionEntry[]} entries - Decrypted entries from the source tree
   * @returns {CreateResumeDto['sections'][number]['entries']} DTO-ready entries
   */
  private toEntryDtos(
    entries: SectionEntry[],
  ): CreateResumeDto['sections'][number]['entries'] {
    return entries.map((entry) => ({
      order: entry.order,
      fields: entry.fields.map((field) => ({
        key: field.key,
        value: field.value,
      })),
      children: entry.children ? this.toEntryDtos(entry.children) : [],
    }));
  }

  async create(userId: string, dto: CreateResumeDto): Promise<ResumeTree> {
    return this.prisma.$transaction(async (tx) => {
      const resume = await tx.resume.create({
        data: {
          userId,
          name: dto.name ?? null,
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
            locked: sectionDto.locked ?? false,
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

  async duplicate(id: string, userId: string): Promise<ResumeTree> {
    const original = await this.findOne(id, userId);

    const dto: CreateResumeDto = {
      name: original.name ? `Copy of ${original.name}` : 'Copy of',
      layout: original.layout,
      sections: original.sections.map((section) => ({
        sectionId: section.sectionId,
        column: section.column,
        order: section.order,
        locked: section.locked,
        // Prisma's back-relation returns every entry for a section, children
        // included — child entries show up in the flat `entries` array (with
        // parentId set) AND nested in their parent's `children`. Map only the
        // top-level entries to DTO entries; their children are copied from the
        // nested `children` arrays, otherwise each child would be duplicated
        // once as a nested child and once as a phantom top-level entry.
        entries: section.entries
          .filter((entry) => !entry.parentId)
          .map((entry) => this.entryToDto(entry)),
      })),
    };

    return this.create(userId, dto);
  }

  private entryToDto(
    entry: SectionEntry,
  ): CreateResumeDto['sections'][number]['entries'][number] {
    return {
      order: entry.order,
      fields: entry.fields.map((field) => ({
        key: field.key,
        value: field.value,
      })),
      children: entry.children
        ? entry.children.map((child) => this.entryToDto(child))
        : [],
    };
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

      const updateData: { name?: string; layout?: string } = {};
      if (dto.name !== undefined) {
        updateData.name = dto.name;
      }
      if (dto.layout !== undefined) {
        updateData.layout = dto.layout;
      }
      if (Object.keys(updateData).length > 0) {
        await tx.resume.update({
          where: { id },
          data: updateData,
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
              locked: sectionDto.locked ?? false,
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
