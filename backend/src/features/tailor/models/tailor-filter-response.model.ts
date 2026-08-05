/**
 * Shape of the tailor endpoint response — the filter the frontend applies
 * via store.applyTailorFilter(). Contains only relevant item indices/names,
 * NOT the full resume. This is the contract the frontend
 * (features/builder/models/tailor-response.model.ts) consumes:
 *
 *   filteredBulletIndices[sectionId] → which bullet indices survive per
 *     top-level entry. An entry present with an empty array hides all its
 *     bullets; a section absent from the map keeps everything visible.
 *   filteredHardSkills / filteredSoftSkills → lowercased skill names that
 *     are relevant; any unlisted skill is hidden (unless locked).
 *
 * The engines internally work on filtered `sections` (TailorResponse);
 * TailorService converts between the two via toFilterResponse().
 */
export interface TailorFilterResponse {
  /** Per-section filtered bullet indices. Only sections with bullets are included. */
  filteredBulletIndices: Record<string, EntryBulletIndices[]>;
  /** Names of hard skills deemed relevant (lowercased for matching). */
  filteredHardSkills: string[];
  /** Names of soft skills deemed relevant (lowercased for matching). */
  filteredSoftSkills: string[];
}

/**
 * For a given top-level entry of a section (identified by entryOrder),
 * which bullet indices (0-based within that entry's children, order-sorted)
 * are relevant.
 */
export interface EntryBulletIndices {
  entryOrder: number;
  bulletIndices: number[];
}
