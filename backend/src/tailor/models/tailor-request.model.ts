import type { ResumeSectionDto } from '../../resumes/dto/create-resume.dto';

/**
 * Internal shape for the tailor request after validation.
 */
export interface TailorRequest {
  jobDescription: string;
  resume: {
    sections: ResumeSectionDto[];
  };
}
