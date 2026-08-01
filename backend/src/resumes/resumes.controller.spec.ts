jest.mock('../generated/prisma/client', () => ({
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
import { AuthGuard } from '../common/guards/auth.guard';

interface ResumeBody {
  id: string;
  layout: string;
  name: string | null;
  sections?: SectionBody[];
}

interface SectionBody {
  id: string;
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
  };
  let mockAuthGuard: CanActivate;

  const authenticatedUserId = 'user-1';

  beforeEach(async () => {
    mockResumesService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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

  function denyAuth() {
    jest.spyOn(mockAuthGuard, 'canActivate').mockImplementation(() => {
      throw new UnauthorizedException('Authentication required');
    });
  }

  describe('GET /api/v1/resumes', () => {
    it('returns resume summaries for authenticated user', async () => {
      mockResumesService.findAll.mockResolvedValue([
        { id: 'r1', layout: 'standard', name: 'My Resume' },
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
        layout: 'standard',
        name: 'My Resume',
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
      name: 'My Resume',
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
        layout: 'standard',
        name: 'My Resume',
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
        layout: 'compact',
        name: 'Updated Resume',
        sections: [],
      };
      mockResumesService.update.mockResolvedValue(updated);

      const response = await request(app.getHttpServer())
        .put('/api/v1/resumes/r1')
        .send({ layout: 'compact', name: 'Updated Resume' })
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
        .send({ name: 'Test' })
        .expect(404);
    });

    it('returns 400 for malformed DTO', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/resumes/r1')
        .send({ layout: 123 })
        .expect(400);
    });

    it('returns 401 when not authenticated', async () => {
      denyAuth();

      await request(app.getHttpServer())
        .put('/api/v1/resumes/r1')
        .send({ name: 'Test' })
        .expect(401);
    });
  });
});
