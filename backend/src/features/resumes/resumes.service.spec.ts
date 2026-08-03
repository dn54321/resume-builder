jest.mock('../../generated/prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ResumesService } from './resumes.service';
import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { CreateResumeDto } from './dto/create-resume.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';

// ─── Helper types for test data ────────────────────────────────────

interface EncryptedFieldResult {
  encrypted: string;
  iv: string;
  authTag: string;
}

interface ResumeRow {
  id: string;
  userId: string;
  layout: string;
  createdAt: Date;
  updatedAt: Date;
}

interface SectionFieldRow {
  id: string;
  sectionEntryId: string;
  key: string;
  value: string;
  iv: string;
  authTag: string;
  order: number;
}

interface SectionEntryRow {
  id: string;
  resumeSectionId: string;
  order: number;
  parentId: string | null;
  fields: SectionFieldRow[];
  children: SectionEntryRow[];
}

interface ResumeSectionRow {
  id: string;
  resumeId: string;
  sectionId: string;
  column: string;
  order: number;
  entries: SectionEntryRow[];
}

interface ResumeTreeRow {
  id: string;
  userId: string;
  layout: string;
  createdAt: Date;
  updatedAt: Date;
  sections: ResumeSectionRow[];
}

// ─── Mock transaction callback type ────────────────────────────────

type TransactionCallback<R> = (tx: Record<string, unknown>) => R | Promise<R>;

interface MockPrisma {
  resume: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  resumeSection: {
    create: jest.Mock;
    findMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  sectionEntry: {
    create: jest.Mock;
    deleteMany: jest.Mock;
  };
  sectionField: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
}

interface MockCrypto {
  encryptField: jest.Mock<EncryptedFieldResult, [string]>;
  decryptField: jest.Mock<string, [string, string, string]>;
}

describe('ResumesService', () => {
  let service: ResumesService;
  let mockPrisma: MockPrisma;
  let mockCrypto: MockCrypto;

  const userId = 'user-1';
  const otherUserId = 'user-2';
  const resumeId = 'resume-1';

  /**
   *
   * @param value
   */
  function makeEncryptedField(value: string): EncryptedFieldResult {
    return {
      encrypted: `enc_${value}`,
      iv: `iv_${value}`,
      authTag: `tag_${value}`,
    };
  }

  /**
   *
   * @param overrides
   */
  function makeResumeResponse(
    overrides: Partial<ResumeTreeRow> = {},
  ): ResumeTreeRow {
    return {
      id: resumeId,
      userId,
      layout: 'standard',
      createdAt: new Date(),
      updatedAt: new Date(),
      sections: [
        {
          id: 'rs-1',
          resumeId,
          sectionId: 'summary',
          column: 'right',
          order: 0,
          entries: [
            {
              id: 'entry-1',
              resumeSectionId: 'rs-1',
              order: 0,
              parentId: null,
              fields: [
                {
                  id: 'field-1',
                  sectionEntryId: 'entry-1',
                  key: 'title',
                  value: 'enc_Software Engineer',
                  iv: 'iv_Software Engineer',
                  authTag: 'tag_Software Engineer',
                  order: 0,
                },
              ],
              children: [],
            },
          ],
        },
      ],
      ...overrides,
    };
  }

  beforeEach(async () => {
    mockPrisma = {
      resume: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      resumeSection: {
        create: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      sectionEntry: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      sectionField: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    mockCrypto = {
      encryptField: jest.fn() as jest.Mock<EncryptedFieldResult, [string]>,
      decryptField: jest.fn() as jest.Mock<string, [string, string, string]>,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResumesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CryptoService, useValue: mockCrypto },
      ],
    }).compile();

    service = module.get<ResumesService>(ResumesService);
  });

  describe('findAll', () => {
    it('returns resume summaries for the authenticated user', async () => {
      const rows: ResumeRow[] = [
        {
          id: 'r1',
          userId,
          layout: 'standard',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'r2',
          userId,
          layout: 'compact',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrisma.resume.findMany.mockResolvedValue(rows);

      const result = await service.findAll(userId);

      expect(mockPrisma.resume.findMany).toHaveBeenCalledWith({
        where: { userId },
        select: {
          id: true,
          layout: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('r1');
    });

    it('returns empty array when user has no resumes', async () => {
      mockPrisma.resume.findMany.mockResolvedValue([]);

      const result = await service.findAll(userId);
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns full tree with decrypted field values', async () => {
      const dbResume = makeResumeResponse();
      mockPrisma.resume.findUnique.mockResolvedValue(dbResume);
      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );

      const result = await service.findOne(resumeId, userId);

      expect(result.sections[0].entries[0].fields[0].value).toBe(
        'Software Engineer',
      );
    });

    it('decrypts nested children entries', async () => {
      const dbResume = makeResumeResponse({
        sections: [
          {
            id: 'rs-1',
            resumeId,
            sectionId: 'summary',
            column: 'right',
            order: 0,
            entries: [
              {
                id: 'parent-1',
                resumeSectionId: 'rs-1',
                order: 0,
                parentId: null,
                fields: [
                  {
                    id: 'f-1',
                    sectionEntryId: 'parent-1',
                    key: 'company',
                    value: 'enc_Parent',
                    iv: 'iv_Parent',
                    authTag: 'tag_Parent',
                    order: 0,
                  },
                ],
                children: [
                  {
                    id: 'child-1',
                    resumeSectionId: 'rs-1',
                    order: 0,
                    parentId: 'parent-1',
                    fields: [
                      {
                        id: 'f-child',
                        sectionEntryId: 'child-1',
                        key: 'detail',
                        value: 'enc_Child',
                        iv: 'iv_Child',
                        authTag: 'tag_Child',
                        order: 0,
                      },
                    ],
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      });
      mockPrisma.resume.findUnique.mockResolvedValue(dbResume);
      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );

      const result = await service.findOne(resumeId, userId);

      expect(result.sections[0].entries[0].fields[0].value).toBe('Parent');
      expect(result.sections[0].entries[0].children).toHaveLength(1);
      expect(result.sections[0].entries[0].children![0].fields[0].value).toBe(
        'Child',
      );
    });

    it("throws NotFoundException for another user's resume", async () => {
      const dbResume = makeResumeResponse({ userId: otherUserId });
      mockPrisma.resume.findUnique.mockResolvedValue(dbResume);

      await expect(service.findOne(resumeId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for non-existent resume', async () => {
      mockPrisma.resume.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('deletes the resume when it belongs to the user', async () => {
      const existingResume = { id: resumeId, userId };
      mockPrisma.resume.findUnique.mockResolvedValue(existingResume);
      mockPrisma.resume.delete.mockResolvedValue({});

      await service.delete(resumeId, userId);

      expect(mockPrisma.resume.findUnique).toHaveBeenCalledWith({
        where: { id: resumeId },
        select: { userId: true },
      });
      expect(mockPrisma.resume.delete).toHaveBeenCalledWith({
        where: { id: resumeId },
      });
    });

    it('throws NotFoundException for non-existent resume', async () => {
      mockPrisma.resume.findUnique.mockResolvedValue(null);

      await expect(service.delete('nonexistent', userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws NotFoundException for another user's resume", async () => {
      const existingResume = { id: resumeId, userId: otherUserId };
      mockPrisma.resume.findUnique.mockResolvedValue(existingResume);

      await expect(service.delete(resumeId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not call delete when ownership check fails', async () => {
      const existingResume = { id: resumeId, userId: otherUserId };
      mockPrisma.resume.findUnique.mockResolvedValue(existingResume);

      await expect(service.delete(resumeId, userId)).rejects.toThrow();
      expect(mockPrisma.resume.delete).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    const dto: CreateResumeDto = {
      layout: 'standard',
      sections: [
        {
          sectionId: 'summary',
          column: 'right',
          order: 0,
          entries: [
            {
              order: 0,
              fields: [
                { key: 'title', value: 'Software Engineer' },
                { key: 'description', value: 'Experienced dev' },
              ],
              children: [
                {
                  order: 0,
                  fields: [{ key: 'detail', value: 'child value' }],
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };

    it('creates entire tree in one transaction and returns decrypted values', async () => {
      const createdResume = {
        id: resumeId,
        userId,
        layout: 'standard',
      };
      const createdSection = {
        id: 'rs-1',
        resumeId,
        sectionId: 'summary',
        column: 'right',
        order: 0,
      };
      const createdEntry = {
        id: 'entry-1',
        resumeSectionId: 'rs-1',
        order: 0,
        parentId: null,
      };
      const createdChild = {
        id: 'child-1',
        resumeSectionId: 'rs-1',
        order: 0,
        parentId: 'entry-1',
      };

      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              create: jest.fn().mockResolvedValue(createdResume),
              findUnique: jest.fn().mockResolvedValue(makeResumeResponse()),
            },
            resumeSection: {
              create: jest.fn().mockResolvedValue(createdSection),
            },
            sectionEntry: {
              create: jest
                .fn()
                .mockResolvedValueOnce(createdEntry)
                .mockResolvedValueOnce(createdChild),
            },
            sectionField: {
              create: jest.fn().mockResolvedValue({}),
            },
          };
          const result = cb(tx);
          return result instanceof Promise ? result : Promise.resolve(result);
        },
      );

      mockCrypto.encryptField.mockImplementation((value: string) =>
        makeEncryptedField(value),
      );
      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );

      const result = await service.create(userId, dto);

      expect(mockCrypto.encryptField).toHaveBeenCalledWith('Software Engineer');
      expect(mockCrypto.encryptField).toHaveBeenCalledWith('Experienced dev');
      expect(mockCrypto.encryptField).toHaveBeenCalledWith('child value');
      expect(mockCrypto.encryptField).toHaveBeenCalledTimes(3);

      expect(result.sections).toBeDefined();
    });
  });

  describe('update', () => {
    it('updates layout when provided', async () => {
      const existingResume: ResumeRow = {
        id: resumeId,
        userId,
        layout: 'standard',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const existingSections = [{ id: 'rs-1' }];
      const updatedResume = makeResumeResponse({
        layout: 'compact',
      });

      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              findUnique: jest
                .fn()
                .mockResolvedValueOnce(existingResume)
                .mockResolvedValueOnce(updatedResume),
              update: jest.fn().mockResolvedValue({}),
            },
            resumeSection: {
              findMany: jest.fn().mockResolvedValue(existingSections),
              deleteMany: jest.fn().mockResolvedValue({}),
              create: jest.fn().mockResolvedValue({
                id: 'rs-2',
                resumeId,
                sectionId: 'summary',
                column: 'left',
                order: 0,
              }),
            },
            sectionEntry: {
              deleteMany: jest.fn().mockResolvedValue({}),
              create: jest.fn().mockResolvedValue({}),
            },
            sectionField: {
              create: jest.fn().mockResolvedValue({}),
            },
          };
          const result = cb(tx);
          return result instanceof Promise ? result : Promise.resolve(result);
        },
      );

      mockCrypto.encryptField.mockImplementation((value: string) =>
        makeEncryptedField(value),
      );
      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );

      const dto: UpdateResumeDto = {
        layout: 'compact',
        sections: [],
      };

      const result = await service.update(resumeId, userId, dto);

      expect(result.layout).toBe('compact');
    });

    it('replaces all sections atomically when sections provided', async () => {
      const existingResume: ResumeRow = {
        id: resumeId,
        userId,
        layout: 'standard',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const existingSections = [{ id: 'rs-old-1' }, { id: 'rs-old-2' }];
      const updatedResume = makeResumeResponse();

      let sectionCreateCallCount = 0;
      let entryDeleteCallCount = 0;

      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              findUnique: jest
                .fn()
                .mockResolvedValueOnce(existingResume)
                .mockResolvedValueOnce(updatedResume),
              update: jest.fn().mockResolvedValue({}),
            },
            resumeSection: {
              findMany: jest.fn().mockResolvedValue(existingSections),
              deleteMany: jest.fn().mockResolvedValue({}),
              create: jest.fn().mockImplementation(() => {
                sectionCreateCallCount++;
                return {
                  id: `rs-new-${sectionCreateCallCount}`,
                  resumeId,
                  sectionId: 'summary',
                  column: 'right',
                  order: 0,
                };
              }),
            },
            sectionEntry: {
              deleteMany: jest.fn().mockImplementation(() => {
                entryDeleteCallCount++;
                return {};
              }),
              create: jest.fn().mockResolvedValue({}),
            },
            sectionField: {
              create: jest.fn().mockResolvedValue({}),
            },
          };
          const result = cb(tx);
          return result instanceof Promise ? result : Promise.resolve(result);
        },
      );

      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );

      const dto: UpdateResumeDto = {
        sections: [
          {
            sectionId: 'summary',
            order: 0,
            entries: [{ order: 0, fields: [], children: [] }],
          },
        ],
      };

      await service.update(resumeId, userId, dto);

      expect(entryDeleteCallCount).toBe(2);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('throws NotFoundException when updating non-existent resume', async () => {
      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              findUnique: jest.fn().mockResolvedValue(null),
            },
          };
          await cb(tx);
        },
      );

      await expect(
        service.update('nonexistent', userId, { layout: 'compact' }),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when updating another user's resume", async () => {
      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              findUnique: jest
                .fn()
                .mockResolvedValue({ id: resumeId, userId: otherUserId }),
            },
          };
          await cb(tx);
        },
      );

      await expect(
        service.update(resumeId, userId, { layout: 'compact' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
