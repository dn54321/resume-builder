/**
 * Response from POST /resumes/tailor.
 * Contains indices into the original resume entries/bullets
 * that were deemed relevant, plus relevant skill names.
 */
export interface TailorResponse {
  /** Per-section filtered bullet indices. Only sections with bullets are included. */
  filteredBulletIndices: Record<string, EntryBulletIndices[]>;
  /** Names of hard skills deemed relevant (lowercased for matching). */
  filteredHardSkills: string[];
  /** Names of soft skills deemed relevant (lowercased for matching). */
  filteredSoftSkills: string[];
}

/**
 * For a given top-level entry of a section (identified by entryOrder),
 * which bullet indices (0-based within that entry's children) are relevant.
 */
export interface EntryBulletIndices {
  entryOrder: number;
  bulletIndices: number[];
}
