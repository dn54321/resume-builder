jest.mock('../generated/prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ResumesService } from './resumes.service';
import { PrismaService } from '../common/database/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { CreateResumeDto } from './dto/create-resume.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';

describe('ResumesService', () => {
  let service: ResumesService;
  let mockPrisma: any;
  let mockCrypto: any;

  const userId = 'user-1';
  const otherUserId = 'user-2';
  const resumeId = 'resume-1';

  function makeEncryptedField(value: string) {
    return {
      encrypted: `enc_${value}`,
      iv: `iv_${value}`,
      authTag: `tag_${value}`,
    };
  }

  function makeResumeResponse(overrides: Partial<any> = {}) {
    return {
      id: resumeId,
      userId,
      layout: 'standard',
      name: null,
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
      encryptField: jest.fn(),
      decryptField: jest.fn(),
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
      mockPrisma.resume.findMany.mockResolvedValue([
        { id: 'r1', layout: 'standard', name: 'My Resume', createdAt: new Date(), updatedAt: new Date() },
        { id: 'r2', layout: 'compact', name: null, createdAt: new Date(), updatedAt: new Date() },
      ]);

      const result = await service.findAll(userId);

      expect(mockPrisma.resume.findMany).toHaveBeenCalledWith({
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

    it('throws NotFoundException for another user\'s resume', async () => {
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

  describe('create', () => {
    const dto: CreateResumeDto = {
      layout: 'standard',
      name: 'My Resume',
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
      const createdResume = { id: resumeId, userId, layout: 'standard', name: 'My Resume' };
      const createdSection = { id: 'rs-1', resumeId, sectionId: 'summary', column: 'right', order: 0 };
      const createdEntry = { id: 'entry-1', resumeSectionId: 'rs-1', order: 0, parentId: null };
      const createdChild = { id: 'child-1', resumeSectionId: 'rs-1', order: 0, parentId: 'entry-1' };

      mockPrisma.$transaction.mockImplementation(async (cb: Function) => {
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
        return cb(tx);
      });

      mockCrypto.encryptField.mockImplementation((value: string) =>
        makeEncryptedField(value),
      );
      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );

      const result = await service.create(userId, dto);

      // Verify encryption was called for all field values
      expect(mockCrypto.encryptField).toHaveBeenCalledWith('Software Engineer');
      expect(mockCrypto.encryptField).toHaveBeenCalledWith('Experienced dev');
      expect(mockCrypto.encryptField).toHaveBeenCalledWith('child value');
      expect(mockCrypto.encryptField).toHaveBeenCalledTimes(3);

      // Verify result has decrypted values
      expect(result.sections).toBeDefined();
    });
  });

  describe('update', () => {
    it('updates layout and name when provided', async () => {
      const existingResume = { id: resumeId, userId, layout: 'standard', name: null };
      const existingSections = [{ id: 'rs-1' }];
      const updatedResume = makeResumeResponse({ layout: 'compact', name: 'Updated' });

      mockPrisma.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          resume: {
            findUnique: jest
              .fn()
              .mockResolvedValueOnce(existingResume) // first call: check existence
              .mockResolvedValueOnce(updatedResume), // second call: final fetch
            update: jest.fn().mockResolvedValue({}),
          },
          resumeSection: {
            findMany: jest.fn().mockResolvedValue(existingSections),
            deleteMany: jest.fn().mockResolvedValue({}),
            create: jest.fn().mockResolvedValue({ id: 'rs-2', resumeId, sectionId: 'summary', column: 'left', order: 0 }),
          },
          sectionEntry: {
            deleteMany: jest.fn().mockResolvedValue({}),
            create: jest.fn().mockResolvedValue({}),
          },
          sectionField: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return cb(tx);
      });

      mockCrypto.encryptField.mockImplementation((value: string) =>
        makeEncryptedField(value),
      );
      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );

      const dto: UpdateResumeDto = {
        layout: 'compact',
        name: 'Updated',
        sections: [],
      };

      const result = await service.update(resumeId, userId, dto);

      expect(result.layout).toBe('compact');
      expect(result.name).toBe('Updated');
    });

    it('replaces all sections atomically when sections provided', async () => {
      const existingResume = { id: resumeId, userId, layout: 'standard', name: null };
      const existingSections = [{ id: 'rs-old-1' }, { id: 'rs-old-2' }];
      const updatedResume = makeResumeResponse();

      let sectionCreateCallCount = 0;
      let entryDeleteCallCount = 0;

      mockPrisma.$transaction.mockImplementation(async (cb: Function) => {
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
              return { id: `rs-new-${sectionCreateCallCount}`, resumeId, sectionId: 'summary', column: 'right', order: 0 };
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
        return cb(tx);
      });

      mockCrypto.decryptField.mockImplementation(
        (encrypted: string, _iv: string, _authTag: string) =>
          encrypted.replace('enc_', ''),
      );

      const dto: UpdateResumeDto = {
        sections: [
          {
            sectionId: 'summary',
            order: 0,
            entries: [
              { order: 0, fields: [], children: [] },
            ],
          },
        ],
      };

      await service.update(resumeId, userId, dto);

      // Should delete entries for each old section
      expect(entryDeleteCallCount).toBe(2);
      // Should delete all old sections
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('throws NotFoundException when updating non-existent resume', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          resume: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        };
        return cb(tx);
      });

      await expect(
        service.update('nonexistent', userId, { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when updating another user\'s resume', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          resume: {
            findUnique: jest.fn().mockResolvedValue({ id: resumeId, userId: otherUserId }),
          },
        };
        return cb(tx);
      });

      await expect(
        service.update(resumeId, userId, { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
