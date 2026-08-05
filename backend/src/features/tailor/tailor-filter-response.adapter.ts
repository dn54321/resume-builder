import type { TailorRequest } from './models/tailor-request.model';
import type { TailorResponse } from './models/tailor-response.model';
import type {
  TailorFilterResponse,
  EntryBulletIndices,
} from './models/tailor-filter-response.model';

/**
 * Convert an engine's filtered-sections response into the filter shape the
 * frontend consumes (filteredBulletIndices / filteredHardSkills /
 * filteredSoftSkills).
 *
 * Matching is by object identity: the engines pass entries through unchanged,
 * so the surviving entries in `engineResponse` are the SAME objects as in the
 * request. Locked sections are skipped by the engines (their entries all
 * survive), and the frontend additionally refuses to apply filter state to
 * locked sections — this adapter simply reports what the engine kept.
 *
 * Semantics (must match the original pre-66cd443 engine + frontend store):
 * - Bullet section: for each top-level entry (order-sorted) that HAS child
 *   bullets, record which child indices survive. An entry whose bullets all
 *   got dropped gets `bulletIndices: []` (frontend hides all its bullets);
 *   a section with NO surviving bullets at all still gets empty per-entry
 *   arrays so the frontend hides everything in it.
 * - Skill sections: lowercased names of surviving entries.
 * @param request
 * @param engineResponse
 */
export function toFilterResponse(
  request: TailorRequest,
  engineResponse: TailorResponse,
): TailorFilterResponse {
  const filteredBulletIndices: Record<string, EntryBulletIndices[]> = {};
  const filteredHardSkills: string[] = [];
  const filteredSoftSkills: string[] = [];

  for (const section of request.resume.sections) {
    const filteredSection = engineResponse.sections.find(
      (s) => s.sectionId === section.sectionId,
    );
    const surviving = new Set(filteredSection?.entries ?? section.entries);

    if (
      section.sectionId === 'hard_skills' ||
      section.sectionId === 'soft_skills'
    ) {
      const names = section.entries
        .filter((e) => surviving.has(e))
        .map((e) => e.fields.find((f) => f.key === 'name')?.value ?? '')
        .map((name) => name.toLowerCase().trim())
        .filter(Boolean);
      if (section.sectionId === 'hard_skills') {
        filteredHardSkills.push(...names);
      } else {
        filteredSoftSkills.push(...names);
      }
      continue;
    }

    // Bullet sections: entries with parentId are child bullets. Sections
    // without any parented entries have nothing to index — leave them out
    // of the map so the frontend keeps everything visible.
    if (!section.entries.some((e) => e.parentId)) continue;

    const topLevel = section.entries
      .filter((e) => !e.parentId)
      .sort((a, b) => a.order - b.order);

    const indices: EntryBulletIndices[] = [];
    for (let entryIndex = 0; entryIndex < topLevel.length; entryIndex++) {
      const entry = topLevel[entryIndex];
      // Only entries with an explicit parentId are child bullets. (The
      // `!= null` guard matters: entries without a parentId must NOT match a
      // parent whose id is undefined — undefined === undefined would make a
      // top-level entry its own child.)
      const children = section.entries
        .filter((e) => e.parentId != null && e.parentId === entry.id)
        .sort((a, b) => a.order - b.order);
      if (children.length === 0) continue;

      const keptBulletIndices = children
        .map((child, bulletIndex) => ({ child, bulletIndex }))
        .filter(({ child }) => surviving.has(child))
        .map(({ bulletIndex }) => bulletIndex);

      indices.push({
        entryOrder: entryIndex,
        bulletIndices: keptBulletIndices,
      });
    }

    if (indices.length > 0) {
      filteredBulletIndices[section.sectionId] = indices;
    }
  }

  return {
    filteredBulletIndices,
    filteredHardSkills,
    filteredSoftSkills,
  };
}
