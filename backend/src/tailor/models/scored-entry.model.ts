import type { SectionEntryDto } from '../../resumes/dto/create-resume.dto';

/**
 * An entry with a computed relevance score (higher = more relevant).
 */
export interface ScoredEntry {
  entry: SectionEntryDto;
  score: number;
}
