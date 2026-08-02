import type { SectionEntryDto } from '../../resumes/dto/create-resume.dto';

/**
 * Shape of the tailor endpoint response — same structure as the request resume
 * but with bullet and skill entries filtered to relevant matches.
 */
export interface TailorResponse {
  sections: TailorResponseSection[];
}

export interface TailorResponseSection {
  sectionId: string;
  entries: SectionEntryDto[];
}
