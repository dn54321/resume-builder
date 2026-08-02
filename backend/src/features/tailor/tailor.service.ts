import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../common/config/models/env-config.model';
import { KeywordEngine } from './engines/keyword.engine';
import type { MatchingEngine } from './engines/matching-engine.interface';
import type { TailorRequest } from './models/tailor-request.model';
import type { TailorResponse } from './models/tailor-response.model';

@Injectable()
export class TailorService {
  private readonly logger = new Logger(TailorService.name);
  private readonly engine: MatchingEngine;
  private readonly bulletCap: number;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService<EnvConfig>,
  ) {
    const engineName = this.configService.get<string>(
      'MATCHING_ENGINE',
      'keyword',
    );
    this.bulletCap = this.configService.get<number>('BULLET_CAP', 5);

    // Currently only keyword engine is implemented.
    // LLM and hybrid will be added in future tickets.
    this.engine = new KeywordEngine();
    this.logger.log(
      `Tailor engine: ${engineName}, bullet cap: ${this.bulletCap}`,
    );
  }

  /**
   * Tailor a resume to a job description.
   * @param request
   */
  tailor(request: TailorRequest): TailorResponse {
    return this.engine.match(request, this.bulletCap);
  }

  /**
   * Get the current bullet cap value (useful for the frontend).
   */
  getBulletCap(): number {
    return this.bulletCap;
  }
}
