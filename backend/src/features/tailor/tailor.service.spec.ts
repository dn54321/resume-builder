import { Test, TestingModule } from '@nestjs/testing';
import { TailorService } from './tailor.service';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../common/config/models/env-config.model';
import type { TailorRequest } from './models/tailor-request.model';

describe('TailorService', () => {
  let service: TailorService;
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'MATCHING_ENGINE') return 'keyword';
        if (key === 'BULLET_CAP') return 5;
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TailorService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<TailorService>(TailorService);
  });

  describe('tailor', () => {
    it('delegates to matching engine and returns filtered response', () => {
      const request: TailorRequest = {
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
                  children: [
                    {
                      order: 0,
                      parentId: 'e1',
                      fields: [
                        { key: 'text', value: 'Built React apps', order: 0 },
                      ],
                    },
                    {
                      order: 1,
                      parentId: 'e1',
                      fields: [{ key: 'text', value: 'Made coffee', order: 0 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const result = service.tailor(request);
      expect(result).toBeDefined();
      expect(result.filteredBulletIndices).toBeDefined();
    });

    it('handles empty JD', () => {
      const request: TailorRequest = {
        jobDescription: '',
        resume: {
          layout: 'standard',
          name: 'Test',
          sections: [],
        },
      };

      const result = service.tailor(request);
      expect(result.filteredBulletIndices).toEqual({});
      expect(result.filteredHardSkills).toEqual([]);
      expect(result.filteredSoftSkills).toEqual([]);
    });
  });

  describe('getBulletCap', () => {
    it('returns the configured bullet cap', () => {
      expect(service.getBulletCap()).toBe(5);
    });

    it('returns default bullet cap when config returns undefined', () => {
      // ConfigService.get with a default returns the default when value is undefined
      const service2 = new TailorService({
        get: (key: string, defaultValue?: unknown) =>
          defaultValue !== undefined ? defaultValue : undefined,
      } as unknown as ConfigService<EnvConfig>);
      expect(service2.getBulletCap()).toBe(5);
    });
  });
});
