import type { TailorRequest } from '../models/tailor-request.model';
import type { TailorResponse } from '../models/tailor-response.model';

/**
 * Matching engine strategy interface.
 * Each engine implements a different approach to scoring
 * bullet/skill relevance against a job description.
 */
export interface MatchingEngine {
  /**
   * Rank and filter bullets + skills against the job description.
   * @param request - The resume and job description to match
   * @param bulletCap - Maximum bullets per entry to return
   * @returns Filtered indices and skill names
   */
  match(request: TailorRequest, bulletCap: number): TailorResponse;
}
