jest.mock('../../generated/prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  UnauthorizedException,
  NotFoundException,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';
import { AuthGuard } from '../../common/guards/auth.guard';

interface ResumeBody {
  id: string;
  name: string | null;
  layout: string;
  sections?: SectionBody[];
}

interface SectionBody {
  id: string;
  locked?: boolean;
  entries: EntryBody[];
}

interface EntryBody {
  id: string;
  fields: FieldBody[];
  children: EntryBody[];
}

interface FieldBody {
  id: string;
  key: string;
  value: string;
}

describe('ResumesController', () => {
  let app: INestApplication<App>;
  let mockResumesService: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let mockAuthGuard: CanActivate;

  const authenticatedUserId = 'user-1';

  beforeEach(async () => {
    mockResumesService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    mockAuthGuard = {
      canActivate: jest.fn().mockImplementation((context: ExecutionContext) => {
        const req = context
          .switchToHttp()
          .getRequest<{ user?: { id: string; email: string } }>();
        req.user = { id: authenticatedUserId, email: 'test@example.com' };
        return true;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResumesController],
      providers: [{ provide: ResumesService, useValue: mockResumesService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  /**
   *
   */
  function denyAuth() {
    jest.spyOn(mockAuthGuard, 'canActivate').mockImplementation(() => {
      throw new UnauthorizedException('Authentication required');
    });
  }

  describe('GET /api/v1/resumes', () => {
    it('returns resume summaries for authenticated user', async () => {
      mockResumesService.findAll.mockResolvedValue([
        { id: 'r1', name: 'My Resume', layout: 'standard' },
      ]);

      const response = await request(app.getHttpServer())
        .get('/api/v1/resumes')
        .expect(200);

      const body = response.body as ResumeBody[];
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe('r1');
      expect(mockResumesService.findAll).toHaveBeenCalledWith('user-1');
    });

    it('returns 401 when not authenticated', async () => {
      denyAuth();

      await request(app.getHttpServer()).get('/api/v1/resumes').expect(401);
    });
  });

  describe('GET /api/v1/resumes/:id', () => {
    it('returns full tree with decrypted field values', async () => {
      const resume: ResumeBody = {
        id: 'r1',
        name: null,
        layout: 'standard',
        sections: [
          {
            id: 'rs-1',
            entries: [
              {
                id: 'entry-1',
                fields: [
                  { id: 'f-1', key: 'title', value: 'Software Engineer' },
                ],
                children: [],
              },
            ],
          },
        ],
      };
      mockResumesService.findOne.mockResolvedValue(resume);

      const response = await request(app.getHttpServer())
        .get('/api/v1/resumes/r1')
        .expect(200);

      const body = response.body as ResumeBody;
      expect(body.sections![0].entries[0].fields[0].value).toBe(
        'Software Engineer',
      );
      expect(mockResumesService.findOne).toHaveBeenCalledWith('r1', 'user-1');
    });

    it('returns the locked flag on sections', async () => {
      const resume: ResumeBody = {
        id: 'r1',
        name: null,
        layout: 'standard',
        sections: [{ id: 'rs-1', locked: true, entries: [] }],
      };
      mockResumesService.findOne.mockResolvedValue(resume);

      const response = await request(app.getHttpServer())
        .get('/api/v1/resumes/r1')
        .expect(200);

      const body = response.body as ResumeBody;
      expect(body.sections![0].locked).toBe(true);
    });

    it('returns 404 for non-existent resume', async () => {
      mockResumesService.findOne.mockRejectedValue(
        new NotFoundException('Resume not found'),
      );

      await request(app.getHttpServer())
        .get('/api/v1/resumes/nonexistent')
        .expect(404);
    });

    it('returns 401 when not authenticated', async () => {
      denyAuth();

      await request(app.getHttpServer()).get('/api/v1/resumes/r1').expect(401);
    });
  });

  describe('POST /api/v1/resumes', () => {
    const validDto = {
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

    it('creates resume and returns decrypted values', async () => {
      const created: ResumeBody = {
        id: 'new-resume',
        name: 'My Resume',
        layout: 'standard',
        sections: [
          {
            id: 'rs-1',
            entries: [
              {
                id: 'entry-1',
                fields: [
                  { id: 'f-1', key: 'title', value: 'Software Engineer' },
                ],
                children: [],
              },
            ],
          },
        ],
      };
      mockResumesService.create.mockResolvedValue(created);

      const response = await request(app.getHttpServer())
        .post('/api/v1/resumes')
        .send(validDto)
        .expect(201);

      const body = response.body as ResumeBody;
      expect(body.id).toBe('new-resume');
      expect(mockResumesService.create).toHaveBeenCalledWith(
        'user-1',
        expect.any(Object),
      );
    });

    it('returns 400 for malformed DTO (missing sections)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/resumes')
        .send({})
        .expect(400);
    });

    it('returns 400 for invalid field types', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/resumes')
        .send({ sections: 'not-an-array' })
        .expect(400);
    });

    it('accepts a locked flag per section', async () => {
      const created: ResumeBody = {
        id: 'new-resume',
        name: 'My Resume',
        layout: 'standard',
        sections: [
          {
            id: 'rs-1',
            locked: true,
            entries: [],
          },
        ],
      };
      mockResumesService.create.mockResolvedValue(created);

      const response = await request(app.getHttpServer())
        .post('/api/v1/resumes')
        .send({
          ...validDto,
          sections: [{ ...validDto.sections[0], locked: true }],
        })
        .expect(201);

      const body = response.body as ResumeBody;
      expect(body.sections![0].locked).toBe(true);

      const createCalls = mockResumesService.create.mock
        .calls as unknown as Array<
        [string, { sections: Array<{ locked?: boolean }> }]
      >;
      expect(createCalls[0][1].sections[0].locked).toBe(true);
    });

    it('rejects a non-boolean locked flag', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/resumes')
        .send({
          ...validDto,
          sections: [{ ...validDto.sections[0], locked: 'yes' }],
        })
        .expect(400);
    });

    it('returns 400 for extra unknown properties', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/resumes')
        .send({ ...validDto, foobar: 'unknown' })
        .expect(400);
    });

    it('returns 401 when not authenticated', async () => {
      denyAuth();

      await request(app.getHttpServer())
        .post('/api/v1/resumes')
        .send(validDto)
        .expect(401);
    });
  });

  describe('PUT /api/v1/resumes/:id', () => {
    it('updates resume and returns updated tree', async () => {
      const updated: ResumeBody = {
        id: 'r1',
        name: null,
        layout: 'compact',
        sections: [],
      };
      mockResumesService.update.mockResolvedValue(updated);

      const response = await request(app.getHttpServer())
        .put('/api/v1/resumes/r1')
        .send({ layout: 'compact' })
        .expect(200);

      const body = response.body as ResumeBody;
      expect(body.layout).toBe('compact');
      expect(mockResumesService.update).toHaveBeenCalledWith(
        'r1',
        'user-1',
        expect.any(Object),
      );
    });

    it('returns 404 when resume does not exist', async () => {
      mockResumesService.update.mockRejectedValue(
        new NotFoundException('Resume not found'),
      );

      await request(app.getHttpServer())
        .put('/api/v1/resumes/nonexistent')
        .send({ layout: 'compact' })
        .expect(404);
    });

    it('returns 400 for malformed DTO', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/resumes/r1')
        .send({ layout: 123 })
        .expect(400);
    });

    it('accepts a locked flag per section when updating', async () => {
      const updated: ResumeBody = {
        id: 'r1',
        name: null,
        layout: 'compact',
        sections: [{ id: 'rs-1', locked: true, entries: [] }],
      };
      mockResumesService.update.mockResolvedValue(updated);

      const response = await request(app.getHttpServer())
        .put('/api/v1/resumes/r1')
        .send({
          sections: [
            {
              sectionId: 'summary',
              column: 'right',
              order: 0,
              locked: true,
              entries: [],
            },
          ],
        })
        .expect(200);

      const body = response.body as ResumeBody;
      expect(body.sections![0].locked).toBe(true);

      const updateCalls = mockResumesService.update.mock
        .calls as unknown as Array<
        [string, string, { sections: Array<{ locked?: boolean }> }]
      >;
      expect(updateCalls[0][2].sections[0].locked).toBe(true);
    });

    it('returns 401 when not authenticated', async () => {
      denyAuth();

      await request(app.getHttpServer())
        .put('/api/v1/resumes/r1')
        .send({ layout: 'compact' })
        .expect(401);
    });
  });

  describe('DELETE /api/v1/resumes/:id', () => {
    it('returns 204 on successful delete', async () => {
      mockResumesService.delete.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete('/api/v1/resumes/r1')
        .expect(204);

      expect(mockResumesService.delete).toHaveBeenCalledWith('r1', 'user-1');
    });

    it('returns 404 when resume does not exist', async () => {
      mockResumesService.delete.mockRejectedValue(
        new NotFoundException('Resume not found'),
      );

      await request(app.getHttpServer())
        .delete('/api/v1/resumes/nonexistent')
        .expect(404);
    });

    it('returns 404 when resume belongs to another user', async () => {
      mockResumesService.delete.mockRejectedValue(
        new NotFoundException('Resume not found'),
      );

      await request(app.getHttpServer())
        .delete('/api/v1/resumes/other-user-resume')
        .expect(404);
    });

    it('returns 401 when not authenticated', async () => {
      denyAuth();

      await request(app.getHttpServer())
        .delete('/api/v1/resumes/r1')
        .expect(401);
    });
  });
});
