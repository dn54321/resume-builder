import type { TailorRequest } from '../models/tailor-request.model';
import type { TailorResponse } from '../models/tailor-response.model';

/**
 * Strategy interface for the tailoring matching engine.
 * Each implementation (keyword, llm, hybrid) defines its own
 * approach to scoring and filtering resume entries against a JD.
 */
export interface MatchingEngine {
  /**
   * Score and filter resume entries against the job description.
   * Returns a tailored resume with only the most relevant entries.
   */
  match(request: TailorRequest): Promise<TailorResponse>;
}

export const MATCHING_ENGINE = 'MATCHING_ENGINE';
