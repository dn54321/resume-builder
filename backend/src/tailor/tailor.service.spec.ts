import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TailorService } from './tailor.service';
import type { TailorRequest } from './models/tailor-request.model';

// ─── Stub engines ─────────────────────────────────────────────────

const KEYWORD_RESULT = { sections: [{ sectionId: 'kw', entries: [] }] };
const LLM_RESULT = { sections: [{ sectionId: 'llm', entries: [] }] };
const HYBRID_RESULT = { sections: [{ sectionId: 'hybrid', entries: [] }] };

jest.mock('./engines/keyword.engine', () => ({
  KeywordEngine: jest.fn().mockImplementation(() => ({
    match: jest.fn().mockResolvedValue(KEYWORD_RESULT),
  })),
}));

jest.mock('./engines/llm.engine', () => ({
  LlmEngine: jest.fn().mockImplementation(() => ({
    match: jest.fn().mockResolvedValue(LLM_RESULT),
  })),
}));

jest.mock('./engines/hybrid.engine', () => ({
  HybridEngine: jest.fn().mockImplementation(() => ({
    match: jest.fn().mockResolvedValue(HYBRID_RESULT),
  })),
}));

import { KeywordEngine } from './engines/keyword.engine';
import { LlmEngine } from './engines/llm.engine';
import { HybridEngine } from './engines/hybrid.engine';

// ─── Helpers ──────────────────────────────────────────────────────

/**
 *
 * @param overrides
 */
function makeConfig(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    MATCHING_ENGINE: 'keyword',
    BULLET_CAP: 5,
    LLM_API_KEY: undefined,
    LLM_MODEL: 'gpt-4o-mini',
  };
  return { ...defaults, ...overrides };
}

/**
 *
 * @param overrides
 */
function makeRequest(overrides: Partial<TailorRequest> = {}): TailorRequest {
  return {
    jobDescription: 'Software Engineer with React experience',
    resume: {
      sections: [
        {
          sectionId: 'experience',
          order: 0,
          entries: [
            {
              order: 0,
              fields: [
                { key: 'title', value: 'My Job' },
                { key: 'bullet', value: 'Built React apps' },
              ],
              children: [],
            },
          ],
        },
      ],
    },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('TailorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── MATCHING_ENGINE selection ──────────────────────────────

  describe('MATCHING_ENGINE=keyword', () => {
    it('uses KeywordEngine and delegates to engine.match()', async () => {
      const config = makeConfig({ MATCHING_ENGINE: 'keyword' });
      const mockConfigService = { get: jest.fn((key: string) => config[key]) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TailorService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const service = module.get<TailorService>(TailorService);
      const request = makeRequest();

      await service.tailor(request);

      expect(KeywordEngine).toHaveBeenCalledWith(5);
      expect(LlmEngine).not.toHaveBeenCalled();
      expect(HybridEngine).not.toHaveBeenCalled();
    });

    it('returns the keyword engine response', async () => {
      const config = makeConfig({ MATCHING_ENGINE: 'keyword' });
      const mockConfigService = { get: jest.fn((key: string) => config[key]) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TailorService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const service = module.get<TailorService>(TailorService);
      const result = await service.tailor(makeRequest());

      expect(result).toEqual(KEYWORD_RESULT);
    });
  });

  describe('MATCHING_ENGINE=llm', () => {
    it('uses LlmEngine when LLM_API_KEY is provided', async () => {
      const config = makeConfig({
        MATCHING_ENGINE: 'llm',
        LLM_API_KEY: 'sk-test',
      });
      const mockConfigService = { get: jest.fn((key: string) => config[key]) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TailorService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const service = module.get<TailorService>(TailorService);
      await service.tailor(makeRequest());

      expect(LlmEngine).toHaveBeenCalledWith(
        { apiKey: 'sk-test', model: 'gpt-4o-mini' },
        5,
      );
      expect(KeywordEngine).not.toHaveBeenCalled();
    });

    it('throws when LLM_API_KEY is missing', async () => {
      const config = makeConfig({
        MATCHING_ENGINE: 'llm',
        LLM_API_KEY: undefined,
      });
      const mockConfigService = { get: jest.fn((key: string) => config[key]) };

      await expect(
        Test.createTestingModule({
          providers: [
            TailorService,
            { provide: ConfigService, useValue: mockConfigService },
          ],
        }).compile(),
      ).rejects.toThrow(
        'LLM_API_KEY is required when MATCHING_ENGINE is "llm"',
      );
    });

    it('uses custom LLM_MODEL when provided', async () => {
      const config = makeConfig({
        MATCHING_ENGINE: 'llm',
        LLM_API_KEY: 'sk-test',
        LLM_MODEL: 'gpt-4-turbo',
      });
      const mockConfigService = { get: jest.fn((key: string) => config[key]) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TailorService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const service = module.get<TailorService>(TailorService);
      await service.tailor(makeRequest());

      expect(LlmEngine).toHaveBeenCalledWith(
        { apiKey: 'sk-test', model: 'gpt-4-turbo' },
        5,
      );
    });
  });

  describe('MATCHING_ENGINE=hybrid', () => {
    it('uses HybridEngine when LLM_API_KEY is provided', async () => {
      const config = makeConfig({
        MATCHING_ENGINE: 'hybrid',
        LLM_API_KEY: 'sk-test',
      });
      const mockConfigService = { get: jest.fn((key: string) => config[key]) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TailorService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const service = module.get<TailorService>(TailorService);
      await service.tailor(makeRequest());

      expect(HybridEngine).toHaveBeenCalledWith(
        { apiKey: 'sk-test', model: 'gpt-4o-mini' },
        5,
      );
    });

    it('throws when LLM_API_KEY is missing', async () => {
      const config = makeConfig({
        MATCHING_ENGINE: 'hybrid',
        LLM_API_KEY: undefined,
      });
      const mockConfigService = { get: jest.fn((key: string) => config[key]) };

      await expect(
        Test.createTestingModule({
          providers: [
            TailorService,
            { provide: ConfigService, useValue: mockConfigService },
          ],
        }).compile(),
      ).rejects.toThrow(
        'LLM_API_KEY is required when MATCHING_ENGINE is "hybrid"',
      );
    });
  });

  describe('MATCHING_ENGINE=unknown', () => {
    it('throws for invalid engine type', async () => {
      const config = makeConfig({ MATCHING_ENGINE: 'unknown' });
      const mockConfigService = { get: jest.fn((key: string) => config[key]) };

      await expect(
        Test.createTestingModule({
          providers: [
            TailorService,
            { provide: ConfigService, useValue: mockConfigService },
          ],
        }).compile(),
      ).rejects.toThrow('Unknown MATCHING_ENGINE');
    });
  });
});
