/**
 * Marks entries as bullet-type or skill-type so the engine knows which
 * scoring strategy to apply. Entries with neither tag pass through unfiltered.
 */
export interface BulletSkillTags {
  /** Indices of entries that are bullet-type (experience bullets). */
  bulletIndices: number[];
  /** Indices of entries that are skill-type. */
  skillIndices: number[];
}
