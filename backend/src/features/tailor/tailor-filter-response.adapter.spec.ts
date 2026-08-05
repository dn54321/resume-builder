import { toFilterResponse } from './tailor-filter-response.adapter';
import type { TailorRequest } from './models/tailor-request.model';
import type { TailorResponse } from './models/tailor-response.model';
import type { SectionEntryDto } from '../resumes/dto/create-resume.dto';

/**
 * Unit tests for the engine → frontend response adapter (RES-92).
 *
 * The engines return filtered `sections`; the frontend consumes
 * filteredBulletIndices / filteredHardSkills / filteredSoftSkills. Matching
 * is by object identity (engines pass entries through unchanged), so these
 * tests reuse the SAME entry objects between request and engine response.
 */

/**
 *
 * @param order
 * @param company
 * @param id
 */
function job(order: number, company: string, id: string): SectionEntryDto {
  return {
    order,
    id,
    fields: [{ key: 'company', value: company }],
    children: [],
  };
}

/**
 *
 * @param order
 * @param parentId
 * @param text
 */
function bullet(
  order: number,
  parentId: string,
  text: string,
): SectionEntryDto {
  return {
    order,
    parentId,
    fields: [{ key: 'text', value: text }],
    children: [],
  };
}

/**
 *
 * @param order
 * @param name
 */
function skill(order: number, name: string): SectionEntryDto {
  return { order, fields: [{ key: 'name', value: name }], children: [] };
}

/**
 *
 * @param sections
 */
function makeRequest(
  sections: TailorRequest['resume']['sections'],
): TailorRequest {
  return { jobDescription: 'React developer', resume: { sections } };
}

describe('toFilterResponse', () => {
  it('maps surviving parented bullets to per-entry indices', () => {
    const job1 = job(0, 'Acme', 'j1');
    const bulletA = bullet(1, 'j1', 'Built React apps');
    const bulletB = bullet(2, 'j1', 'Coffee logistics');
    const request = makeRequest([
      { sectionId: 'experience', order: 0, entries: [job1, bulletA, bulletB] },
    ]);

    // Engine kept the job + only the React bullet.
    const engineResponse: TailorResponse = {
      sections: [{ sectionId: 'experience', entries: [job1, bulletA] }],
    };

    const result = toFilterResponse(request, engineResponse);

    expect(result.filteredBulletIndices).toEqual({
      experience: [{ entryOrder: 0, bulletIndices: [0] }],
    });
    expect(result.filteredHardSkills).toEqual([]);
    expect(result.filteredSoftSkills).toEqual([]);
  });

  it('records empty bulletIndices for an entry whose bullets all got dropped', () => {
    const job1 = job(0, 'Acme', 'j1');
    const bulletA = bullet(1, 'j1', 'Coffee logistics');
    const bulletB = bullet(2, 'j1', 'Pasta operations');
    const request = makeRequest([
      { sectionId: 'experience', order: 0, entries: [job1, bulletA, bulletB] },
    ]);

    // Engine dropped BOTH bullets (no JD matches) — job survives.
    const engineResponse: TailorResponse = {
      sections: [{ sectionId: 'experience', entries: [job1] }],
    };

    const result = toFilterResponse(request, engineResponse);

    // Frontend hides all bullets of the entry.
    expect(result.filteredBulletIndices).toEqual({
      experience: [{ entryOrder: 0, bulletIndices: [] }],
    });
  });

  it('treats a section missing from the engine response as fully surviving', () => {
    const job1 = job(0, 'Acme', 'j1');
    const bulletA = bullet(1, 'j1', 'Built React apps');
    const request = makeRequest([
      { sectionId: 'experience', order: 0, entries: [job1, bulletA] },
    ]);

    const engineResponse: TailorResponse = { sections: [] };

    const result = toFilterResponse(request, engineResponse);

    expect(result.filteredBulletIndices).toEqual({
      experience: [{ entryOrder: 0, bulletIndices: [0] }],
    });
  });

  it('handles multiple top-level entries independently', () => {
    const job1 = job(0, 'Acme', 'j1');
    const job2 = job(10, 'Globex', 'j2');
    const b1 = bullet(1, 'j1', 'Built React apps');
    const b2 = bullet(2, 'j1', 'Coffee logistics');
    const b3 = bullet(11, 'j2', 'Django backend');
    const b4 = bullet(12, 'j2', 'React Native work');
    const request = makeRequest([
      {
        sectionId: 'experience',
        order: 0,
        entries: [job1, b1, b2, job2, b3, b4],
      },
    ]);

    const engineResponse: TailorResponse = {
      sections: [{ sectionId: 'experience', entries: [job1, b1, job2, b4] }],
    };

    const result = toFilterResponse(request, engineResponse);

    expect(result.filteredBulletIndices).toEqual({
      experience: [
        { entryOrder: 0, bulletIndices: [0] },
        { entryOrder: 1, bulletIndices: [1] },
      ],
    });
  });

  it('maps surviving hard and soft skills to lowercased name lists', () => {
    const react = skill(0, 'React');
    const excel = skill(1, 'Excel');
    const teamwork = skill(2, 'Teamwork');
    const request = makeRequest([
      { sectionId: 'hard_skills', order: 0, entries: [react, excel] },
      { sectionId: 'soft_skills', order: 1, entries: [teamwork] },
    ]);

    const engineResponse: TailorResponse = {
      sections: [
        { sectionId: 'hard_skills', entries: [react] },
        { sectionId: 'soft_skills', entries: [teamwork] },
      ],
    };

    const result = toFilterResponse(request, engineResponse);

    expect(result.filteredHardSkills).toEqual(['react']);
    expect(result.filteredSoftSkills).toEqual(['teamwork']);
    expect(result.filteredBulletIndices).toEqual({});
  });

  it('omits non-bullet sections without parented entries', () => {
    const contact = {
      order: 0,
      fields: [{ key: 'fullName', value: 'Jane Doe' }],
      children: [],
    };
    const request = makeRequest([
      { sectionId: 'name_contact', order: 0, entries: [contact] },
    ]);

    const engineResponse: TailorResponse = {
      sections: [{ sectionId: 'name_contact', entries: [contact] }],
    };

    const result = toFilterResponse(request, engineResponse);

    expect(result.filteredBulletIndices).toEqual({});
  });

  it('reports a locked section as fully surviving (engine skipped it)', () => {
    const job1 = job(0, 'Acme', 'j1');
    const bulletA = bullet(1, 'j1', 'Coffee logistics');
    const request = makeRequest([
      {
        sectionId: 'experience',
        order: 0,
        locked: true,
        entries: [job1, bulletA],
      },
    ]);

    // Locked sections pass through unchanged — every entry survives.
    const engineResponse: TailorResponse = {
      sections: [{ sectionId: 'experience', entries: [job1, bulletA] }],
    };

    const result = toFilterResponse(request, engineResponse);

    // The adapter reports what the engine kept (all); the FRONTEND is what
    // refuses to apply filter state to locked sections (store.applyTailorFilter
    // + isBulletRelevant/isSkillRelevant short-circuits).
    expect(result.filteredBulletIndices).toEqual({
      experience: [{ entryOrder: 0, bulletIndices: [0] }],
    });
  });

  it('drops skill entries that have no name field (?? fallback)', () => {
    const withName = skill(0, 'React');
    // Surviving skill entry whose `name` field is missing entirely → the
    // `?? ''` fallback yields '' and the entry is filtered out of the list.
    const noName = {
      order: 1,
      fields: [{ key: 'level', value: 'Senior' }],
      children: [],
    };
    const request = makeRequest([
      { sectionId: 'hard_skills', order: 0, entries: [withName, noName] },
    ]);

    const engineResponse: TailorResponse = {
      sections: [{ sectionId: 'hard_skills', entries: [withName, noName] }],
    };

    const result = toFilterResponse(request, engineResponse);

    expect(result.filteredHardSkills).toEqual(['react']);
    expect(result.filteredSoftSkills).toEqual([]);
  });

  it('skips a top-level entry that has no children (continue path)', () => {
    const job1 = job(0, 'Acme', 'j1');
    const bulletA = bullet(1, 'j1', 'Built React apps');
    // A second top-level job with NO bullets — its children lookup is empty,
    // so the adapter skips it instead of emitting an empty index record.
    const job2 = job(10, 'Globex', 'j2');
    const request = makeRequest([
      {
        sectionId: 'experience',
        order: 0,
        entries: [job1, bulletA, job2],
      },
    ]);

    const engineResponse: TailorResponse = {
      sections: [{ sectionId: 'experience', entries: [job1, bulletA, job2] }],
    };

    const result = toFilterResponse(request, engineResponse);

    // Only the job WITH bullets gets an index record.
    expect(result.filteredBulletIndices).toEqual({
      experience: [{ entryOrder: 0, bulletIndices: [0] }],
    });
  });

  it('omits a bullet section where every top-level entry has no children', () => {
    // Both bullets reference a parent id that does not exist in the section,
    // so no top-level entry matches them → indices stays empty → the section
    // is left out of the map (frontend keeps everything visible).
    const orphan1 = bullet(1, 'ghost-parent', 'Coffee logistics');
    const orphan2 = bullet(2, 'ghost-parent', 'Pasta operations');
    const request = makeRequest([
      { sectionId: 'experience', order: 0, entries: [orphan1, orphan2] },
    ]);

    const engineResponse: TailorResponse = {
      sections: [{ sectionId: 'experience', entries: [orphan1, orphan2] }],
    };

    const result = toFilterResponse(request, engineResponse);

    expect(result.filteredBulletIndices).toEqual({});
  });
});
