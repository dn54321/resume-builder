import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KeywordEngine } from './engines/keyword.engine';
import { LlmEngine } from './engines/llm.engine';
import { HybridEngine } from './engines/hybrid.engine';
import type { MatchingEngine } from './engines/matching-engine.interface';
import type { TailorRequest } from './models/tailor-request.model';
import type { TailorResponse } from './models/tailor-response.model';
import type { EnvConfig } from '../common/config/models/env-config.model';

type MatchingEngineType = EnvConfig['MATCHING_ENGINE'];

/**
 * Service that routes tailor requests to the configured matching engine
 * based on the MATCHING_ENGINE environment variable.
 */
@Injectable()
export class TailorService {
  private readonly logger = new Logger(TailorService.name);
  private readonly engine: MatchingEngine;
  private readonly bulletCap: number;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {
    const engineType =
      this.configService.get<MatchingEngineType>('MATCHING_ENGINE');
    this.bulletCap = this.configService.get<number>('BULLET_CAP');

    switch (engineType) {
      case 'keyword':
        this.engine = new KeywordEngine(this.bulletCap);
        this.logger.log('Using keyword matching engine');
        break;
      case 'llm': {
        const apiKey = this.configService.get<string>('LLM_API_KEY');
        if (!apiKey) {
          throw new Error(
            'LLM_API_KEY is required when MATCHING_ENGINE is "llm"',
          );
        }
        const model = this.configService.get<string>('LLM_MODEL');
        this.engine = new LlmEngine(
          { apiKey, model: model ?? 'gpt-4o-mini' },
          this.bulletCap,
        );
        this.logger.log('Using LLM matching engine');
        break;
      }
      case 'hybrid': {
        const apiKey = this.configService.get<string>('LLM_API_KEY');
        if (!apiKey) {
          throw new Error(
            'LLM_API_KEY is required when MATCHING_ENGINE is "hybrid"',
          );
        }
        const model = this.configService.get<string>('LLM_MODEL');
        this.engine = new HybridEngine(
          { apiKey, model: model ?? 'gpt-4o-mini' },
          this.bulletCap,
        );
        this.logger.log('Using hybrid matching engine');
        break;
      }
      default:
        throw new Error(`Unknown MATCHING_ENGINE: ${String(engineType)}`);
    }
  }

  async tailor(request: TailorRequest): Promise<TailorResponse> {
    return this.engine.match(request);
  }
}
