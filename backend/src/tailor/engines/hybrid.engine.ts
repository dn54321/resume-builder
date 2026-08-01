import { Injectable } from '@nestjs/common';
import { KeywordEngine } from './keyword.engine';
import { LlmEngine, type LlmConfig } from './llm.engine';
import type { MatchingEngine } from './matching-engine.interface';
import type { TailorRequest } from '../models/tailor-request.model';
import type { TailorResponse } from '../models/tailor-response.model';

/**
 * Hybrid matching engine: keyword pre-filter (2x bulletCap) then LLM re-rank.
 * Combines the speed of keyword filtering with the semantic understanding of LLM.
 */
@Injectable()
export class HybridEngine implements MatchingEngine {
  private readonly keywordEngine: KeywordEngine;
  private readonly llmEngine: LlmEngine;

  constructor(llmConfig: LlmConfig, bulletCap: number = 5) {
    // Keyword engine gets 2x bulletCap for pre-filtering
    this.keywordEngine = new KeywordEngine(bulletCap * 2);
    // LLM engine gets the actual bulletCap for final ranking
    this.llmEngine = new LlmEngine(llmConfig, bulletCap);
  }

  async match(request: TailorRequest): Promise<TailorResponse> {
    // Step 1: Keyword pre-filter with 2x bulletCap (built into keywordEngine)
    const preFiltered = await this.keywordEngine.match(request);

    // Build a pre-filtered request: for each section, only include entries
    // that passed the keyword filter
    const preFilteredRequest: TailorRequest = {
      jobDescription: request.jobDescription,
      resume: {
        sections: request.resume.sections.map((originalSection) => {
          // Find the matching pre-filtered section
          const filteredSection = preFiltered.sections.find(
            (s) => s.sectionId === originalSection.sectionId,
          );

          if (!filteredSection) {
            return originalSection;
          }

          // Create a set of entry identifiers that passed keyword filter
          // We match by order + first field value since entries don't have IDs
          const filteredKeys = new Set(
            filteredSection.entries.map(
              (e) => `${e.order}|${e.fields[0]?.value ?? ''}`,
            ),
          );

          return {
            ...originalSection,
            entries: originalSection.entries.filter((e) =>
              filteredKeys.has(`${e.order}|${e.fields[0]?.value ?? ''}`),
            ),
          };
        }),
      },
    };

    // Step 2: LLM re-rank on the pre-filtered set
    return this.llmEngine.match(preFilteredRequest);
  }
}
