import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { CreateResumeDto } from './dto/create-resume.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';

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
        name: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const resume = await this.prisma.resume.findUnique({
      where: { id },
      include: {
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
      },
    });

    if (!resume || resume.userId !== userId) {
      throw new NotFoundException('Resume not found');
    }

    return this.decryptResumeFields(resume);
  }

  async create(userId: string, dto: CreateResumeDto) {
    return this.prisma.$transaction(async (tx) => {
      const resume = await tx.resume.create({
        data: {
          userId,
          layout: dto.layout ?? 'standard',
          name: dto.name ?? null,
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
        await tx.resume.findUnique({
          where: { id: resume.id },
          include: this.fullResumeInclude,
        }),
      );
    });
  }

  async update(id: string, userId: string, dto: UpdateResumeDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.resume.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId) {
        throw new NotFoundException('Resume not found');
      }

      // Update layout and name if provided
      if (dto.layout !== undefined || dto.name !== undefined) {
        await tx.resume.update({
          where: { id },
          data: {
            ...(dto.layout !== undefined ? { layout: dto.layout } : {}),
            ...(dto.name !== undefined ? { name: dto.name } : {}),
          },
        });
      }

      // Replace sections entirely
      if (dto.sections !== undefined) {
        // Delete all entries first (fields cascade), then sections
        const existingSections = await tx.resumeSection.findMany({
          where: { resumeId: id },
          select: { id: true },
        });

        for (const s of existingSections) {
          await tx.sectionEntry.deleteMany({ where: { resumeSectionId: s.id } });
        }

        await tx.resumeSection.deleteMany({ where: { resumeId: id } });

        // Create new sections
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
        await tx.resume.findUnique({
          where: { id },
          include: this.fullResumeInclude,
        }),
      );
    });
  }

  private get fullResumeInclude() {
    return {
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
  }

  private async createEntries(
    tx: any,
    resumeSectionId: string,
    entries: CreateResumeDto['sections'][number]['entries'],
    parentId?: string,
  ) {
    for (const entryDto of entries) {
      const entry = await tx.sectionEntry.create({
        data: {
          resumeSectionId,
          order: entryDto.order,
          parentId: parentId ?? null,
        },
      });

      for (const fieldDto of entryDto.fields) {
        const { encrypted, iv, authTag } =
          this.crypto.encryptField(fieldDto.value);
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

  private decryptResumeFields(resume: any): any {
    const decrypted = { ...resume };

    if (decrypted.sections) {
      decrypted.sections = decrypted.sections.map((section: any) => ({
        ...section,
        entries: section.entries.map((entry: any) =>
          this.decryptEntry(entry),
        ),
      }));
    }

    return decrypted;
  }

  private decryptEntry(entry: any): any {
    const decrypted = { ...entry };

    if (decrypted.fields) {
      decrypted.fields = decrypted.fields.map((field: any) => ({
        ...field,
        value: this.crypto.decryptField(
          field.value,
          field.iv,
          field.authTag,
        ),
      }));
    }

    if (decrypted.children) {
      decrypted.children = decrypted.children.map((child: any) =>
        this.decryptEntry(child),
      );
    }

    return decrypted;
  }
}
