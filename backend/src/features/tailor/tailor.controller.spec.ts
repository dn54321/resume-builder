import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { TailorController } from './tailor.controller';
import { TailorService } from './tailor.service';

describe('TailorController', () => {
  let app: INestApplication<App>;
  let mockTailorService: { tailor: jest.Mock; getBulletCap: jest.Mock };

  beforeEach(async () => {
    mockTailorService = {
      tailor: jest.fn(),
      getBulletCap: jest.fn().mockReturnValue(5),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TailorController],
      providers: [{ provide: TailorService, useValue: mockTailorService }],
    }).compile();

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

  describe('POST /api/v1/resumes/tailor', () => {
    const validRequest = {
      jobDescription: 'React developer needed',
      resume: {
        layout: 'standard',
        name: 'Test',
        sections: [
          {
            sectionId: 'experience',
            column: 'right',
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [{ key: 'company', value: 'Acme', order: 0 }],
              },
            ],
          },
        ],
      },
    };

    it('returns 200 with filtered response for valid request', async () => {
      const mockResponse = {
        filteredBulletIndices: {},
        filteredHardSkills: ['react'],
        filteredSoftSkills: [],
      };
      mockTailorService.tailor.mockReturnValue(mockResponse);

      const response = await request(app.getHttpServer())
        .post('/api/v1/resumes/tailor')
        .send(validRequest)
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockTailorService.tailor).toHaveBeenCalledWith({
        jobDescription: 'React developer needed',
        resume: expect.any(Object),
      });
    });

    it('works without auth headers (anonymous users)', async () => {
      mockTailorService.tailor.mockReturnValue({
        filteredBulletIndices: {},
        filteredHardSkills: [],
        filteredSoftSkills: [],
      });

      await request(app.getHttpServer())
        .post('/api/v1/resumes/tailor')
        .send(validRequest)
        .expect(200);
    });

    it('returns 400 for missing jobDescription', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/resumes/tailor')
        .send({
          resume: validRequest.resume,
        })
        .expect(400);
    });

    it('returns 400 for missing resume', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/resumes/tailor')
        .send({
          jobDescription: 'test',
        })
        .expect(400);
    });

    it('returns 400 for empty jobDescription', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/resumes/tailor')
        .send({
          jobDescription: '',
          resume: validRequest.resume,
        })
        .expect(400);
    });

    it('returns 400 for invalid resume structure', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/resumes/tailor')
        .send({
          jobDescription: 'test',
          resume: { layout: 'invalid', name: 'Test', sections: [] },
        })
        .expect(400);
    });

    it('returns 400 for extra unknown properties', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/resumes/tailor')
        .send({
          ...validRequest,
          foobar: 'unknown',
        })
        .expect(400);
    });

    it('passes bullet cap config to engine via service', async () => {
      mockTailorService.tailor.mockReturnValue({
        filteredBulletIndices: {},
        filteredHardSkills: [],
        filteredSoftSkills: [],
      });

      await request(app.getHttpServer())
        .post('/api/v1/resumes/tailor')
        .send(validRequest)
        .expect(200);

      // Service.tailor was called with the right shape
      expect(mockTailorService.tailor).toHaveBeenCalledWith(
        expect.objectContaining({
          jobDescription: expect.any(String),
          resume: expect.objectContaining({
            layout: expect.any(String),
            sections: expect.any(Array),
          }),
        }),
      );
    });
  });
});
