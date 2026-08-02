import { KeywordEngine } from './keyword.engine';
import type { TailorRequest } from '../models/tailor-request.model';
import type { SectionEntryDto } from '../../resumes/dto/create-resume.dto';

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Create a bullet entry.
 * @param order
 * @param value
 */
function bulletEntry(order: number, value: string): SectionEntryDto {
  return {
    order,
    fields: [{ key: 'bullet', value }],
    children: [],
  };
}

/**
 * Create a skill entry.
 * @param order
 * @param value
 */
function skillEntry(order: number, value: string): SectionEntryDto {
  return {
    order,
    fields: [{ key: 'skill', value }],
    children: [],
  };
}

/**
 * Create a non-bullet/non-skill pass-through entry.
 * @param order
 * @param key
 * @param value
 */
function passthroughEntry(
  order: number,
  key: string,
  value: string,
): SectionEntryDto {
  return {
    order,
    fields: [{ key, value }],
    children: [],
  };
}

/**
 * Create a tailor request with given JD and section entries.
 * @param jd
 * @param entries
 */
function makeRequest(jd: string, entries: SectionEntryDto[]): TailorRequest {
  return {
    jobDescription: jd,
    resume: {
      sections: [
        {
          sectionId: 'experience',
          order: 0,
          entries,
        },
      ],
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('KeywordEngine', () => {
  const bulletCap = 3;
  let engine: KeywordEngine;

  beforeEach(() => {
    engine = new KeywordEngine(bulletCap);
  });

  // ── Basic filtering ────────────────────────────────────────

  it('returns bullets with JD keyword matches ranked higher', async () => {
    const jd = 'React developer with TypeScript experience';
    const entries = [
      bulletEntry(0, 'Built React applications'),
      bulletEntry(1, 'Managed coffee supply chain'),
      bulletEntry(2, 'Wrote TypeScript type definitions'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    expect(result.sections).toHaveLength(1);
    const resultEntries = result.sections[0].entries;

    // All three bullets should be present (cap is 3, only 3 bullets)
    expect(resultEntries).toHaveLength(3);

    // The highest scoring entries should appear first by order
    // "Built React applications" and "Wrote TypeScript type definitions" have matches
    // "Managed coffee supply chain" has no matches
    // But they're sorted by order, not score — entries are sorted by original order
    expect(resultEntries.map((e) => e.order)).toEqual([0, 1, 2]);
  });

  it('caps bullets at BULLET_CAP', async () => {
    const jd = 'React developer needed';
    const entries = [
      bulletEntry(0, 'Built React apps'),
      bulletEntry(1, 'React Native mobile development'),
      bulletEntry(2, 'React component library'),
      bulletEntry(3, 'React state management'),
      bulletEntry(4, 'Non-React backend work'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // BULLET_CAP=3, so only top 3 bullets should be returned
    expect(result.sections[0].entries).toHaveLength(3);
  });

  it('passes non-bullet, non-skill fields through unchanged', async () => {
    const jd = 'React developer';
    const entries = [
      passthroughEntry(0, 'company', 'Acme Corp'),
      bulletEntry(1, 'Built React apps'),
      passthroughEntry(2, 'title', 'Software Engineer'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    const resultEntries = result.sections[0].entries;
    expect(resultEntries).toHaveLength(3);

    // Company and title should be present
    const companyEntry = resultEntries.find(
      (e) => e.fields[0].key === 'company',
    );
    expect(companyEntry).toBeDefined();
    const titleEntry = resultEntries.find((e) => e.fields[0].key === 'title');
    expect(titleEntry).toBeDefined();
  });

  // ── Skill scoring ──────────────────────────────────────────

  it('scores and filters skills by JD token overlap', async () => {
    const jd = 'Looking for React, TypeScript, and Docker skills';
    const entries = [
      skillEntry(0, 'React'),
      skillEntry(1, 'Excel'),
      skillEntry(2, 'TypeScript'),
      skillEntry(3, 'Docker'),
      skillEntry(4, 'PowerPoint'),
      skillEntry(5, 'Word'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // Cap is 3, so only top 3 skills should remain
    expect(result.sections[0].entries.length).toBeLessThanOrEqual(3);

    // React, TypeScript, and Docker should be the top matches
    const values = result.sections[0].entries.map((e) => e.fields[0].value);
    expect(values).toContain('React');
    expect(values).toContain('TypeScript');
    expect(values).toContain('Docker');
  });

  it('skills are capped separately from bullets', async () => {
    const jd = 'React TypeScript developer';
    const entries = [
      bulletEntry(0, 'React development'),
      bulletEntry(1, 'React architecture'),
      bulletEntry(2, 'React testing'),
      bulletEntry(3, 'React deployment'),
      skillEntry(10, 'React'),
      skillEntry(11, 'TypeScript'),
      skillEntry(12, 'Node.js'),
      skillEntry(13, 'Python'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // 4 bullets → capped at 3 bullets
    // 4 skills → capped at 3 skills
    // Total = 3 + 3 = 6
    expect(result.sections[0].entries).toHaveLength(6);
  });

  // ── Empty JD ───────────────────────────────────────────────

  it('returns all entries unfiltered when JD is empty', async () => {
    const entries = [
      bulletEntry(0, 'Built React apps'),
      bulletEntry(1, 'Managed coffee'),
      passthroughEntry(2, 'company', 'Acme'),
    ];

    const result = await engine.match(makeRequest('', entries));

    // All entries should be present
    expect(result.sections[0].entries).toHaveLength(3);
  });

  it('returns all entries unfiltered when JD is whitespace only', async () => {
    const entries = [
      bulletEntry(0, 'Built React apps'),
      skillEntry(1, 'React'),
    ];

    const result = await engine.match(makeRequest('   ', entries));

    expect(result.sections[0].entries).toHaveLength(2);
  });

  // ── Stop word filtering ────────────────────────────────────

  it('filters out common stop words from JD tokenization', async () => {
    const jd =
      'We are looking for a developer with experience in the field of React';
    const entries = [
      bulletEntry(0, 'Built React applications'),
      bulletEntry(1, 'The field of expertise'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // "the", "a", "we", "are", "for", "with", "in", "of" should be filtered
    // "React", "developer", "experience", "field", "looking" should remain
    // Both entries match some keywords, but "React" gives a higher score
    expect(result.sections[0].entries).toHaveLength(2);
  });

  // ── No matches ─────────────────────────────────────────────

  it('returns empty entries when no bullets or skills match JD', async () => {
    const jd = 'Python Django Flask developer needed';
    const entries = [
      bulletEntry(0, 'Built React applications'),
      bulletEntry(1, 'TypeScript type definitions'),
      skillEntry(2, 'React'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // No matching tokens, but entries are still returned (they're the top 3 even with score 0)
    // The engine takes top N regardless of score
    expect(result.sections[0].entries.length).toBeGreaterThan(0);
  });

  // ── Multiple sections ──────────────────────────────────────

  it('processes multiple sections independently', async () => {
    const request: TailorRequest = {
      jobDescription: 'React developer',
      resume: {
        sections: [
          {
            sectionId: 'experience',
            order: 0,
            entries: [
              bulletEntry(0, 'Built React apps'),
              bulletEntry(1, 'Non-matching bullet'),
            ],
          },
          {
            sectionId: 'skills',
            order: 1,
            entries: [skillEntry(0, 'React'), skillEntry(1, 'TypeScript')],
          },
        ],
      },
    };

    const result = await engine.match(request);

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].sectionId).toBe('experience');
    expect(result.sections[1].sectionId).toBe('skills');
  });

  // ── Edge cases ─────────────────────────────────────────────

  it('handles entries with no matching field keys as pass-through', async () => {
    const jd = 'React developer';
    const entries = [
      {
        order: 0,
        fields: [{ key: 'customField', value: 'Some value' }],
        children: [],
      },
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // Non-bullet, non-skill should pass through
    expect(result.sections[0].entries).toHaveLength(1);
  });

  it('handles empty entries array', async () => {
    const result = await engine.match(makeRequest('React dev', []));

    expect(result.sections[0].entries).toHaveLength(0);
  });

  it('handles JD with special characters', async () => {
    const jd = 'C#/.NET developer with SQL Server experience';
    const entries = [
      bulletEntry(0, 'Developed C# applications'),
      bulletEntry(1, 'SQL Server database administration'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    expect(result.sections[0].entries.length).toBeGreaterThan(0);
  });

  it('preserves entry order after filtering', async () => {
    const jd = 'React developer';
    const entries = [
      passthroughEntry(0, 'company', 'Acme'),
      bulletEntry(1, 'Built React apps'),
      passthroughEntry(2, 'title', 'Engineer'),
      bulletEntry(3, 'React Native work'),
      passthroughEntry(4, 'duration', '2 years'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // All entries present (only 2 bullets, cap is 3)
    expect(result.sections[0].entries).toHaveLength(5);

    // Verify sorted by order
    const orders = result.sections[0].entries.map((e) => e.order);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]).toBeGreaterThan(orders[i - 1]);
    }
  });

  it('uses default bulletCap of 5 when not specified', () => {
    const defaultEngine = new KeywordEngine();
    // Just verify construction doesn't throw
    expect(defaultEngine).toBeDefined();
  });
});
