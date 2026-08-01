import type { ResumePayload } from './resume-payload.model';

/**
 * Request body for POST /resumes/tailor.
 */
export interface TailorRequest {
  jobDescription: string;
  resume: ResumePayload;
}
