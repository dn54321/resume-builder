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
import type { ResumeTree } from './models/resume-tree.model';

// ─── Helper types for test data ────────────────────────────────────

interface EncryptedFieldResult {
  encrypted: string;
  iv: string;
  authTag: string;
}

interface ResumeRow {
  id: string;
  userId: string;
  name: string | null;
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
  /** Optional in test rows — legacy fixtures omit it and the service defaults to false. */
  locked?: boolean;
  fields: SectionFieldRow[];
  children: SectionEntryRow[];
}

interface ResumeSectionRow {
  id: string;
  resumeId: string;
  sectionId: string;
  column: string;
  order: number;
  locked: boolean;
  entries: SectionEntryRow[];
}

interface ResumeTreeRow {
  id: string;
  userId: string;
  name: string | null;
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
    findFirst: jest.Mock;
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
      name: null,
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
          locked: false,
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
        findFirst: jest.fn(),
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
          name: null,
          layout: 'standard',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'r2',
          userId,
          name: 'My Resume',
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
          name: true,
          layout: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('r1');
    });

    it('returns name field when present', async () => {
      const rows: ResumeRow[] = [
        {
          id: 'r1',
          userId,
          name: 'My Custom Resume',
          layout: 'standard',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrisma.resume.findMany.mockResolvedValue(rows);

      const result = await service.findAll(userId);

      expect(result[0].name).toBe('My Custom Resume');
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
      expect(result.sections[0].locked).toBe(false);
    });

    it('returns the locked flag on sections', async () => {
      const dbResume = makeResumeResponse();
      dbResume.sections[0].locked = true;
      mockPrisma.resume.findUnique.mockResolvedValue(dbResume);
      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );

      const result = await service.findOne(resumeId, userId);

      expect(result.sections[0].locked).toBe(true);
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
            locked: false,
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

  describe('duplicate', () => {
    /**
     * Configure the findOne half (findUnique + decrypt) and the create half
     * ($transaction) mocks so that `duplicate` runs end-to-end.
     * @param {Partial<ResumeTreeRow>} overrides - Row overrides for the source resume
     * @param {jest.Mock} [sectionCreate] - Optional spy to capture the section create payload
     */
    function mockFullDuplicateFlow(
      overrides: Partial<ResumeTreeRow> = {},
      sectionCreate?: jest.Mock,
    ) {
      const sourceRow = makeResumeResponse(overrides);
      mockPrisma.resume.findUnique.mockResolvedValue(sourceRow);

      const createdResume = {
        id: 'resume-copy-1',
        userId,
        name: sourceRow.name ? `Copy of ${sourceRow.name}` : 'Copy of Untitled',
        layout: 'standard',
      };
      const createdSection = {
        id: 'rs-copy-1',
        resumeId: 'resume-copy-1',
        sectionId: 'summary',
        column: 'right',
        order: 0,
        locked: false,
      };
      const createdEntry = {
        id: 'entry-copy-1',
        resumeSectionId: 'rs-copy-1',
        order: 0,
        parentId: null,
      };

      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              create: jest.fn().mockResolvedValue(createdResume),
              findUnique: jest.fn().mockResolvedValue(
                makeResumeResponse({
                  id: 'resume-copy-1',
                  name: createdResume.name,
                }),
              ),
            },
            resumeSection: {
              create:
                sectionCreate ?? jest.fn().mockResolvedValue(createdSection),
            },
            sectionEntry: {
              create: jest.fn().mockResolvedValue(createdEntry),
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
      mockCrypto.encryptField.mockImplementation((value: string) =>
        makeEncryptedField(value),
      );
    }

    it('returns a copy named "Copy of <original>" with same sections', async () => {
      mockFullDuplicateFlow({ name: 'Software Engineer Resume' });

      const result = await service.duplicate(resumeId, userId);

      expect(result.name).toBe('Copy of Software Engineer Resume');
      expect(result.id).toBe('resume-copy-1');
      // The source tree was loaded (ownership check) and copied
      expect(mockPrisma.resume.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: resumeId } }),
      );
    });

    it('names the copy "Copy of Untitled" when the source has no name', async () => {
      mockFullDuplicateFlow({ name: null });

      const result = await service.duplicate(resumeId, userId);

      expect(result.name).toBe('Copy of Untitled');
    });

    it('re-encrypts the copied field values', async () => {
      mockFullDuplicateFlow({ name: 'Software Engineer Resume' });

      await service.duplicate(resumeId, userId);

      // findOne decrypts 'enc_Software Engineer' → 'Software Engineer';
      // create() must re-encrypt the plaintext value.
      expect(mockCrypto.encryptField).toHaveBeenCalledWith('Software Engineer');
    });

    it('passes the source sections (sectionId/column/order/locked) to create', async () => {
      const sectionCreate = jest.fn().mockResolvedValue({
        id: 'rs-copy-1',
        resumeId: 'resume-copy-1',
        sectionId: 'summary',
        column: 'right',
        order: 0,
        locked: false,
      });
      mockFullDuplicateFlow(
        { name: 'Software Engineer Resume' },
        sectionCreate,
      );

      await service.duplicate(resumeId, userId);

      expect(sectionCreate).toHaveBeenCalledWith({
        data: {
          resumeId: 'resume-copy-1',
          sectionId: 'summary',
          column: 'right',
          order: 0,
          locked: false,
          enabled: true,
        },
      });
    });

    it('throws NotFoundException for non-existent resume', async () => {
      mockPrisma.resume.findUnique.mockResolvedValue(null);

      await expect(service.duplicate('nonexistent', userId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("throws NotFoundException for another user's resume", async () => {
      mockPrisma.resume.findUnique.mockResolvedValue(
        makeResumeResponse({ userId: otherUserId }),
      );

      await expect(service.duplicate(resumeId, userId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
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
        name: null,
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

      const sectionCreate = jest.fn().mockResolvedValue(createdSection);

      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              create: jest.fn().mockResolvedValue(createdResume),
              findUnique: jest.fn().mockResolvedValue(makeResumeResponse()),
            },
            resumeSection: {
              create: sectionCreate,
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

      expect(sectionCreate).toHaveBeenCalledWith({
        data: {
          resumeId,
          sectionId: 'summary',
          column: 'right',
          order: 0,
          locked: false,
          enabled: true,
        },
      });
      expect(mockCrypto.encryptField).toHaveBeenCalledWith('Software Engineer');
      expect(mockCrypto.encryptField).toHaveBeenCalledWith('Experienced dev');
      expect(mockCrypto.encryptField).toHaveBeenCalledWith('child value');
      expect(mockCrypto.encryptField).toHaveBeenCalledTimes(3);

      expect(result.sections).toBeDefined();
    });

    it('persists locked=true when provided on a section', async () => {
      const createdResume = {
        id: resumeId,
        userId,
        name: null,
        layout: 'standard',
      };
      const createdSection = {
        id: 'rs-1',
        resumeId,
        sectionId: 'summary',
        column: 'left',
        order: 0,
        locked: true,
      };
      const sectionCreate = jest.fn().mockResolvedValue(createdSection);

      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              create: jest.fn().mockResolvedValue(createdResume),
              findUnique: jest.fn().mockResolvedValue(makeResumeResponse()),
            },
            resumeSection: {
              create: sectionCreate,
            },
            sectionEntry: {
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

      const dtoWithLocked: CreateResumeDto = {
        layout: 'standard',
        sections: [
          {
            sectionId: 'summary',
            column: 'left',
            order: 0,
            locked: true,
            entries: [],
          },
        ],
      };

      await service.create(userId, dtoWithLocked);

      expect(sectionCreate).toHaveBeenCalledWith({
        data: {
          resumeId,
          sectionId: 'summary',
          column: 'left',
          order: 0,
          locked: true,
          enabled: true,
        },
      });
    });

    it('creates resume with name when provided', async () => {
      const dtoWithName: CreateResumeDto = {
        name: 'My Resume',
        layout: 'standard',
        sections: [],
      };

      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              create: jest.fn().mockResolvedValue({
                id: resumeId,
                userId,
                name: 'My Resume',
                layout: 'standard',
              }),
              findUnique: jest
                .fn()
                .mockResolvedValue(makeResumeResponse({ name: 'My Resume' })),
            },
            resumeSection: {
              create: jest.fn(),
            },
            sectionEntry: {
              create: jest.fn(),
            },
            sectionField: {
              create: jest.fn(),
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

      const result = await service.create(userId, dtoWithName);

      expect(result.name).toBe('My Resume');
    });
  });

  describe('duplicate', () => {
    it('creates a copy named "Copy of <original>" with the same tree', async () => {
      const original = makeResumeResponse({ name: 'My Resume' });
      mockPrisma.resume.findUnique.mockResolvedValue(original);
      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );
      mockCrypto.encryptField.mockImplementation((value: string) =>
        makeEncryptedField(value),
      );

      const resumeCreate = jest.fn().mockResolvedValue({
        id: 'resume-copy',
        userId,
        name: 'Copy of My Resume',
        layout: 'standard',
      });
      const sectionCreate = jest.fn().mockResolvedValue({
        id: 'rs-copy',
        resumeId: 'resume-copy',
        sectionId: 'summary',
        column: 'right',
        order: 0,
        locked: false,
      });

      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              create: resumeCreate,
              findUnique: jest.fn().mockResolvedValue(
                makeResumeResponse({
                  id: 'resume-copy',
                  name: 'Copy of My Resume',
                }),
              ),
            },
            resumeSection: { create: sectionCreate },
            sectionEntry: { create: jest.fn().mockResolvedValue({}) },
            sectionField: { create: jest.fn().mockResolvedValue({}) },
          };
          const result = cb(tx);
          return result instanceof Promise ? result : Promise.resolve(result);
        },
      );

      const result = await service.duplicate(resumeId, userId);

      expect(resumeCreate).toHaveBeenCalledWith({
        data: {
          userId,
          name: 'Copy of My Resume',
          layout: 'standard',
        },
      });
      expect(sectionCreate).toHaveBeenCalledWith({
        data: {
          resumeId: 'resume-copy',
          sectionId: 'summary',
          column: 'right',
          order: 0,
          locked: false,
          enabled: true,
        },
      });
      // the decrypted original value is re-encrypted for the copy
      expect(mockCrypto.encryptField).toHaveBeenCalledWith('Software Engineer');
      expect(result.name).toBe('Copy of My Resume');
    });

    it('names the copy "Copy of" when the original has no name', async () => {
      const original = makeResumeResponse({ name: null });
      mockPrisma.resume.findUnique.mockResolvedValue(original);
      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );
      mockCrypto.encryptField.mockImplementation((value: string) =>
        makeEncryptedField(value),
      );

      const resumeCreate = jest.fn().mockResolvedValue({
        id: 'resume-copy',
        userId,
        name: 'Copy of',
        layout: 'standard',
      });

      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              create: resumeCreate,
              findUnique: jest
                .fn()
                .mockResolvedValue(
                  makeResumeResponse({ id: 'resume-copy', name: 'Copy of' }),
                ),
            },
            resumeSection: { create: jest.fn().mockResolvedValue({}) },
            sectionEntry: { create: jest.fn().mockResolvedValue({}) },
            sectionField: { create: jest.fn().mockResolvedValue({}) },
          };
          const result = cb(tx);
          return result instanceof Promise ? result : Promise.resolve(result);
        },
      );

      await service.duplicate(resumeId, userId);

      expect(resumeCreate).toHaveBeenCalledWith({
        data: { userId, name: 'Copy of', layout: 'standard' },
      });
    });

    it("upsert updates the user's first existing resume", async () => {
      mockPrisma.resume.findFirst.mockResolvedValue({ id: 'resume-1' });
      const updateSpy = jest
        .spyOn(service, 'update')
        .mockResolvedValue(makeResumeResponse({ id: 'resume-1' }) as never);

      const result = await service.upsert(userId, {
        name: 'Updated',
        layout: 'standard',
      });

      expect(updateSpy).toHaveBeenCalledWith(
        'resume-1',
        userId,
        expect.objectContaining({ name: 'Updated' }),
      );
      expect(result.id).toBe('resume-1');
      updateSpy.mockRestore();
    });

    it('upsert creates a new resume when the user has none', async () => {
      mockPrisma.resume.findFirst.mockResolvedValue(null);
      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue(makeResumeResponse({ id: 'new-1' }) as never);

      const result = await service.upsert(userId, {
        name: 'Fresh',
        layout: 'standard',
      });

      expect(createSpy).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ name: 'Fresh' }),
      );
      expect(result.id).toBe('new-1');
      createSpy.mockRestore();
    });

    it('duplicates nested children entries and re-encrypts child values', async () => {
      const original = makeResumeResponse({
        name: 'My Resume',
        sections: [
          {
            id: 'rs-1',
            resumeId,
            sectionId: 'experience',
            column: 'right',
            order: 0,
            locked: false,
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
                    value: 'enc_Acme',
                    iv: 'iv_Acme',
                    authTag: 'tag_Acme',
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
                        id: 'f-2',
                        sectionEntryId: 'child-1',
                        key: 'detail',
                        value: 'enc_ChildValue',
                        iv: 'iv_ChildValue',
                        authTag: 'tag_ChildValue',
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
      mockPrisma.resume.findUnique.mockResolvedValue(original);
      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );
      mockCrypto.encryptField.mockImplementation((value: string) =>
        makeEncryptedField(value),
      );

      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              create: jest.fn().mockResolvedValue({
                id: 'resume-copy',
                userId,
                name: 'Copy of My Resume',
                layout: 'standard',
              }),
              findUnique: jest.fn().mockResolvedValue(
                makeResumeResponse({
                  id: 'resume-copy',
                  name: 'Copy of My Resume',
                }),
              ),
            },
            resumeSection: { create: jest.fn().mockResolvedValue({}) },
            sectionEntry: { create: jest.fn().mockResolvedValue({}) },
            sectionField: { create: jest.fn().mockResolvedValue({}) },
          };
          const result = cb(tx);
          return result instanceof Promise ? result : Promise.resolve(result);
        },
      );

      await service.duplicate(resumeId, userId);

      expect(mockCrypto.encryptField).toHaveBeenCalledWith('Acme');
      expect(mockCrypto.encryptField).toHaveBeenCalledWith('ChildValue');
    });

    it('does not duplicate children as phantom top-level entries (flat Prisma back-relation)', async () => {
      // Real Prisma shape: the section's `entries` back-relation returns ALL
      // entries (children included, with parentId set) while the nested
      // `children` include also nests them under their parent. The DTO must
      // be built from top-level entries only, or the copy gains a phantom
      // sibling for every child.
      const original = makeResumeResponse({
        name: 'My Resume',
        sections: [
          {
            id: 'rs-1',
            resumeId,
            sectionId: 'experience',
            column: 'right',
            order: 0,
            locked: false,
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
                    value: 'enc_Acme',
                    iv: 'iv_Acme',
                    authTag: 'tag_Acme',
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
                        id: 'f-2',
                        sectionEntryId: 'child-1',
                        key: 'detail',
                        value: 'enc_ChildValue',
                        iv: 'iv_ChildValue',
                        authTag: 'tag_ChildValue',
                        order: 0,
                      },
                    ],
                    children: [],
                  },
                ],
              },
              // ← child also appears in the flat entries list (Prisma back-relation)
              {
                id: 'child-1',
                resumeSectionId: 'rs-1',
                order: 0,
                parentId: 'parent-1',
                fields: [
                  {
                    id: 'f-2',
                    sectionEntryId: 'child-1',
                    key: 'detail',
                    value: 'enc_ChildValue',
                    iv: 'iv_ChildValue',
                    authTag: 'tag_ChildValue',
                    order: 0,
                  },
                ],
                children: [],
              },
            ],
          },
        ],
      });
      mockPrisma.resume.findUnique.mockResolvedValue(original);
      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );
      mockCrypto.encryptField.mockImplementation((value: string) =>
        makeEncryptedField(value),
      );

      const entryCreate = jest
        .fn()
        .mockResolvedValueOnce({ id: 'entry-copy-parent' })
        .mockResolvedValueOnce({ id: 'entry-copy-child' });
      const sectionCreate = jest.fn().mockResolvedValue({
        id: 'rs-copy',
        resumeId: 'resume-copy',
        sectionId: 'experience',
        column: 'right',
        order: 0,
        locked: false,
      });

      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              create: jest.fn().mockResolvedValue({
                id: 'resume-copy',
                userId,
                name: 'Copy of My Resume',
                layout: 'standard',
              }),
              findUnique: jest
                .fn()
                .mockResolvedValue(
                  makeResumeResponse({ name: 'Copy of My Resume' }),
                ),
            },
            resumeSection: { create: sectionCreate },
            sectionEntry: { create: entryCreate },
            sectionField: { create: jest.fn().mockResolvedValue({}) },
          };
          const result = cb(tx);
          return result instanceof Promise ? result : Promise.resolve(result);
        },
      );

      await service.duplicate(resumeId, userId);

      // One top-level entry + one child entry — the phantom sibling must not
      // be recreated as a top-level entry.
      interface EntryCreateCall {
        data: {
          resumeSectionId: string;
          order: number;
          parentId: string | null;
        };
      }
      const entryCalls = entryCreate.mock
        .calls as unknown as EntryCreateCall[][];
      expect(entryCalls).toHaveLength(2);
      const parentCall = entryCalls.find(([arg]) => arg.data.parentId === null);
      const childCall = entryCalls.find(([arg]) => arg.data.parentId !== null);
      expect(parentCall).toBeDefined();
      expect(childCall).toBeDefined();
      // child is linked to the newly created parent entry, not created as a
      // phantom top-level sibling
      expect(childCall![0].data.parentId).toBe('entry-copy-parent');
      expect(mockCrypto.encryptField).toHaveBeenCalledWith('Acme');
      expect(mockCrypto.encryptField).toHaveBeenCalledWith('ChildValue');
    });

    it('duplicates entries that have no children array', async () => {
      const original = makeResumeResponse({
        name: 'My Resume',
        sections: [
          {
            id: 'rs-1',
            resumeId,
            sectionId: 'summary',
            column: 'right',
            order: 0,
            locked: false,
            entries: [
              {
                id: 'entry-1',
                resumeSectionId: 'rs-1',
                order: 0,
                parentId: null,
                fields: [
                  {
                    id: 'f-1',
                    sectionEntryId: 'entry-1',
                    key: 'title',
                    value: 'enc_Software Engineer',
                    iv: 'iv_Software Engineer',
                    authTag: 'tag_Software Engineer',
                    order: 0,
                  },
                ],
                children: undefined as unknown as SectionEntryRow[],
              },
            ],
          },
        ],
      });
      mockPrisma.resume.findUnique.mockResolvedValue(original);
      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );
      mockCrypto.encryptField.mockImplementation((value: string) =>
        makeEncryptedField(value),
      );

      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              create: jest.fn().mockResolvedValue({
                id: 'resume-copy',
                userId,
                name: 'Copy of My Resume',
                layout: 'standard',
              }),
              findUnique: jest.fn().mockResolvedValue(
                makeResumeResponse({
                  id: 'resume-copy',
                  name: 'Copy of My Resume',
                }),
              ),
            },
            resumeSection: { create: jest.fn().mockResolvedValue({}) },
            sectionEntry: { create: jest.fn().mockResolvedValue({}) },
            sectionField: { create: jest.fn().mockResolvedValue({}) },
          };
          const result = cb(tx);
          return result instanceof Promise ? result : Promise.resolve(result);
        },
      );

      await service.duplicate(resumeId, userId);

      expect(mockCrypto.encryptField).toHaveBeenCalledWith('Software Engineer');
    });

    it('falls back to an empty children array when findOne returns undefined children', async () => {
      const original: ResumeTree = {
        id: resumeId,
        userId,
        name: 'My Resume',
        layout: 'standard',
        createdAt: new Date(),
        updatedAt: new Date(),
        sections: [
          {
            id: 'rs-1',
            sectionId: 'summary',
            column: 'right',
            order: 0,
            locked: false,
            entries: [
              {
                id: 'entry-1',
                order: 0,
                locked: false,
                fields: [
                  {
                    id: 'f-1',
                    sectionEntryId: 'entry-1',
                    key: 'title',
                    value: 'Software Engineer',
                    iv: 'iv',
                    authTag: 'tag',
                    order: 0,
                  },
                ],
                children: undefined,
              },
            ],
          },
        ],
      };
      jest.spyOn(service, 'findOne').mockResolvedValue(original);
      mockCrypto.encryptField.mockImplementation((value: string) =>
        makeEncryptedField(value),
      );

      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              create: jest.fn().mockResolvedValue({
                id: 'resume-copy',
                userId,
                name: 'Copy of My Resume',
                layout: 'standard',
              }),
              findUnique: jest.fn().mockResolvedValue(
                makeResumeResponse({
                  id: 'resume-copy',
                  name: 'Copy of My Resume',
                }),
              ),
            },
            resumeSection: { create: jest.fn().mockResolvedValue({}) },
            sectionEntry: { create: jest.fn().mockResolvedValue({}) },
            sectionField: { create: jest.fn().mockResolvedValue({}) },
          };
          const result = cb(tx);
          return result instanceof Promise ? result : Promise.resolve(result);
        },
      );

      const result = await service.duplicate(resumeId, userId);

      expect(result.name).toBe('Copy of My Resume');
      expect(mockCrypto.encryptField).toHaveBeenCalledWith('Software Engineer');
    });

    it('throws NotFoundException for a non-existent resume', async () => {
      mockPrisma.resume.findUnique.mockResolvedValue(null);

      await expect(service.duplicate('nonexistent', userId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("throws NotFoundException for another user's resume", async () => {
      mockPrisma.resume.findUnique.mockResolvedValue(
        makeResumeResponse({ userId: otherUserId }),
      );

      await expect(service.duplicate(resumeId, userId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates layout when provided', async () => {
      const existingResume: ResumeRow = {
        id: resumeId,
        userId,
        name: null,
        layout: 'standard',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const existingSections = [{ id: 'rs-1' }];
      const updatedResume = makeResumeResponse({
        name: 'Updated Name',
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
      expect(result.name).toBe('Updated Name');
    });

    it('updates name when provided without layout or sections', async () => {
      const existingResume: ResumeRow = {
        id: resumeId,
        userId,
        name: 'Old Name',
        layout: 'standard',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updatedResume = makeResumeResponse({ name: 'New Name' });

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
              findMany: jest.fn(),
              deleteMany: jest.fn(),
              create: jest.fn(),
            },
            sectionEntry: {
              deleteMany: jest.fn(),
              create: jest.fn(),
            },
            sectionField: {
              create: jest.fn(),
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

      const dto: UpdateResumeDto = { name: 'New Name' };

      const result = await service.update(resumeId, userId, dto);

      expect(result.name).toBe('New Name');
    });

    it('clears name when updated with empty string', async () => {
      const existingResume: ResumeRow = {
        id: resumeId,
        userId,
        name: 'Old Name',
        layout: 'standard',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updatedResume = makeResumeResponse({ name: '' });

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
              findMany: jest.fn(),
              deleteMany: jest.fn(),
              create: jest.fn(),
            },
            sectionEntry: {
              deleteMany: jest.fn(),
              create: jest.fn(),
            },
            sectionField: {
              create: jest.fn(),
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

      const dto: UpdateResumeDto = { name: '' };

      const result = await service.update(resumeId, userId, dto);

      expect(result.name).toBe('');
    });

    it('replaces all sections atomically when sections provided', async () => {
      const existingResume: ResumeRow = {
        id: resumeId,
        userId,
        name: null,
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

    it('persists locked=true on replacement sections during update', async () => {
      const existingResume: ResumeRow = {
        id: resumeId,
        userId,
        name: null,
        layout: 'standard',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const existingSections = [{ id: 'rs-1' }];
      const updatedResume = makeResumeResponse();
      const sectionCreate = jest.fn().mockResolvedValue({
        id: 'rs-2',
        resumeId,
        sectionId: 'summary',
        column: 'right',
        order: 0,
        locked: true,
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
              create: sectionCreate,
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

      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );

      const dto: UpdateResumeDto = {
        sections: [
          {
            sectionId: 'summary',
            order: 0,
            locked: true,
            entries: [{ order: 0, fields: [], children: [] }],
          },
        ],
      };

      await service.update(resumeId, userId, dto);

      expect(sectionCreate).toHaveBeenCalledWith({
        data: {
          resumeId,
          sectionId: 'summary',
          column: 'right',
          order: 0,
          locked: true,
          enabled: true,
        },
      });
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

  describe('entry-level locked (RES-97)', () => {
    /**
     * Configure the $transaction mock so sectionEntry.create is captured.
     * @param entryCreate - Spy on sectionEntry.create
     */
    function mockCreateFlow(entryCreate: jest.Mock) {
      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              create: jest.fn().mockResolvedValue({
                id: resumeId,
                userId,
                name: null,
                layout: 'standard',
              }),
              findUnique: jest.fn().mockResolvedValue(makeResumeResponse()),
            },
            resumeSection: {
              create: jest.fn().mockResolvedValue({ id: 'rs-1' }),
            },
            sectionEntry: { create: entryCreate },
            sectionField: { create: jest.fn().mockResolvedValue({}) },
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
    }

    it('persists entry locked=true when creating a resume', async () => {
      const entryCreate = jest.fn().mockResolvedValue({
        id: 'entry-1',
        resumeSectionId: 'rs-1',
        order: 0,
        parentId: null,
      });
      mockCreateFlow(entryCreate);

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
                locked: true,
                fields: [{ key: 'title', value: 'Software Engineer' }],
                children: [],
              },
            ],
          },
        ],
      };

      await service.create(userId, dto);

      expect(entryCreate).toHaveBeenCalledWith({
        data: {
          resumeSectionId: 'rs-1',
          order: 0,
          parentId: null,
          locked: true,
        },
      });
    });

    it('defaults entry locked to false when the DTO omits it', async () => {
      const entryCreate = jest.fn().mockResolvedValue({
        id: 'entry-1',
        resumeSectionId: 'rs-1',
        order: 0,
        parentId: null,
      });
      mockCreateFlow(entryCreate);

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
                fields: [{ key: 'title', value: 'Software Engineer' }],
                children: [],
              },
            ],
          },
        ],
      };

      await service.create(userId, dto);

      expect(entryCreate).toHaveBeenCalledWith({
        data: {
          resumeSectionId: 'rs-1',
          order: 0,
          parentId: null,
          locked: false,
        },
      });
    });

    it('persists locked on nested child entries during create', async () => {
      const entryCreate = jest
        .fn()
        .mockResolvedValueOnce({
          id: 'parent-1',
          resumeSectionId: 'rs-1',
          order: 0,
          parentId: null,
        })
        .mockResolvedValueOnce({
          id: 'child-1',
          resumeSectionId: 'rs-1',
          order: 0,
          parentId: 'parent-1',
        });
      mockCreateFlow(entryCreate);

      const dto: CreateResumeDto = {
        layout: 'standard',
        sections: [
          {
            sectionId: 'experience',
            column: 'right',
            order: 0,
            entries: [
              {
                order: 0,
                fields: [{ key: 'company', value: 'Acme' }],
                children: [
                  {
                    order: 0,
                    locked: true,
                    fields: [{ key: 'text', value: 'Bullet' }],
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      };

      await service.create(userId, dto);

      interface EntryCreateCall {
        data: {
          resumeSectionId: string;
          order: number;
          parentId: string | null;
          locked?: boolean;
        };
      }
      const childCall = (
        entryCreate.mock.calls as unknown as EntryCreateCall[][]
      ).find(([arg]) => arg.data.parentId !== null);
      expect(childCall).toBeDefined();
      expect(childCall![0].data.locked).toBe(true);
    });

    it('carries entry locked through duplicate', async () => {
      const sourceRow = makeResumeResponse({
        sections: [
          {
            id: 'rs-1',
            resumeId,
            sectionId: 'summary',
            column: 'right',
            order: 0,
            locked: false,
            entries: [
              {
                id: 'entry-1',
                resumeSectionId: 'rs-1',
                order: 0,
                parentId: null,
                locked: true,
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
      });
      mockPrisma.resume.findUnique.mockResolvedValue(sourceRow);
      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );
      mockCrypto.encryptField.mockImplementation((value: string) =>
        makeEncryptedField(value),
      );

      const entryCreate = jest.fn().mockResolvedValue({
        id: 'entry-copy',
        resumeSectionId: 'rs-copy',
        order: 0,
        parentId: null,
      });
      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              create: jest.fn().mockResolvedValue({
                id: 'resume-copy',
                userId,
                name: 'Copy of',
                layout: 'standard',
              }),
              findUnique: jest
                .fn()
                .mockResolvedValue(
                  makeResumeResponse({ id: 'resume-copy', name: 'Copy of' }),
                ),
            },
            resumeSection: {
              create: jest.fn().mockResolvedValue({
                id: 'rs-copy',
                resumeId: 'resume-copy',
                sectionId: 'summary',
                column: 'right',
                order: 0,
                locked: false,
              }),
            },
            sectionEntry: { create: entryCreate },
            sectionField: { create: jest.fn().mockResolvedValue({}) },
          };
          const result = cb(tx);
          return result instanceof Promise ? result : Promise.resolve(result);
        },
      );

      await service.duplicate(resumeId, userId);

      expect(entryCreate).toHaveBeenCalledWith({
        data: {
          resumeSectionId: 'rs-copy',
          order: 0,
          parentId: null,
          locked: true,
        },
      });
    });

    it('persists entry locked=true during update', async () => {
      const existingResume: ResumeRow = {
        id: resumeId,
        userId,
        name: null,
        layout: 'standard',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const existingSections = [{ id: 'rs-old-1' }];
      const entryCreate = jest.fn().mockResolvedValue({
        id: 'entry-new',
        resumeSectionId: 'rs-new',
        order: 0,
        parentId: null,
      });

      mockPrisma.$transaction.mockImplementation(
        async (cb: TransactionCallback<ResumeTreeRow>) => {
          const tx = {
            resume: {
              findUnique: jest
                .fn()
                .mockResolvedValueOnce(existingResume)
                .mockResolvedValueOnce(makeResumeResponse()),
              update: jest.fn().mockResolvedValue({}),
            },
            resumeSection: {
              findMany: jest.fn().mockResolvedValue(existingSections),
              deleteMany: jest.fn().mockResolvedValue({}),
              create: jest.fn().mockResolvedValue({
                id: 'rs-new',
                resumeId,
                sectionId: 'summary',
                column: 'right',
                order: 0,
              }),
            },
            sectionEntry: {
              deleteMany: jest.fn().mockResolvedValue({}),
              create: entryCreate,
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
      mockCrypto.encryptField.mockImplementation((value: string) =>
        makeEncryptedField(value),
      );

      const dto: UpdateResumeDto = {
        sections: [
          {
            sectionId: 'summary',
            column: 'right',
            order: 0,
            entries: [
              {
                order: 0,
                locked: true,
                fields: [{ key: 'title', value: 'Software Engineer' }],
                children: [],
              },
            ],
          },
        ],
      };

      await service.update(resumeId, userId, dto);

      expect(entryCreate).toHaveBeenCalledWith({
        data: {
          resumeSectionId: 'rs-new',
          order: 0,
          parentId: null,
          locked: true,
        },
      });
    });

    it('returns entry locked flag in the decrypted tree', async () => {
      const dbResume = makeResumeResponse({
        sections: [
          {
            id: 'rs-1',
            resumeId,
            sectionId: 'summary',
            column: 'right',
            order: 0,
            locked: false,
            entries: [
              {
                id: 'entry-1',
                resumeSectionId: 'rs-1',
                order: 0,
                parentId: null,
                locked: true,
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
      });
      mockPrisma.resume.findUnique.mockResolvedValue(dbResume);
      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );

      const result = await service.findOne(resumeId, userId);

      expect(result.sections[0].entries[0].locked).toBe(true);
    });
  });
});
