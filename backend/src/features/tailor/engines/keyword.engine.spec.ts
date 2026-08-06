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
 * @param options - Optional section overrides (e.g. locked: true)
 * @param options.locked
 */
function makeRequest(
  jd: string,
  entries: SectionEntryDto[],
  options: { locked?: boolean } = {},
): TailorRequest {
  return {
    jobDescription: jd,
    resume: {
      sections: [
        {
          sectionId: 'experience',
          order: 0,
          locked: options.locked,
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

    // Zero-score bullets are DROPPED (only relevant bullets are kept, capped
    // per entry) — the coffee bullet has no JD token overlap.
    expect(resultEntries).toHaveLength(2);

    // The matching bullets keep their original order.
    expect(resultEntries.map((e) => e.order)).toEqual([0, 2]);
    expect(resultEntries.map((e) => e.fields[0].value)).toEqual([
      'Built React applications',
      'Wrote TypeScript type definitions',
    ]);
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

    // 4 matching bullets → capped at 3 bullets
    // 2 matching skills (React, TypeScript) → capped at 3, both kept
    // Non-matching skills (Node.js, Python) are dropped.
    // Total = 3 + 2 = 5
    expect(result.sections[0].entries).toHaveLength(5);
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

    // No matching tokens → every bullet/skill is dropped (the frontend then
    // records empty per-entry arrays so all bullets in the section are hidden).
    expect(result.sections[0].entries).toHaveLength(0);
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

  // ── Locked sections ────────────────────────────────────────

  it('returns all entries unchanged for a locked section', async () => {
    const jd = 'React developer with TypeScript experience';
    const entries = [
      bulletEntry(0, 'Built React applications'),
      bulletEntry(1, 'Managed coffee supply chain'),
      bulletEntry(2, 'Wrote TypeScript type definitions'),
    ];

    const result = await engine.match(
      makeRequest(jd, entries, { locked: true }),
    );

    // Locked sections are skipped: every entry passes through unfiltered,
    // even ones with zero JD token overlap.
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].entries).toHaveLength(3);
    expect(result.sections[0].entries.map((e) => e.order)).toEqual([0, 1, 2]);
    expect(result.sections[0].entries.map((e) => e.fields[0].value)).toEqual([
      'Built React applications',
      'Managed coffee supply chain',
      'Wrote TypeScript type definitions',
    ]);
  });

  it('leaves a locked section untouched while still filtering unlocked ones', async () => {
    const request: TailorRequest = {
      jobDescription: 'React developer',
      resume: {
        sections: [
          {
            sectionId: 'experience',
            order: 0,
            locked: true,
            entries: [
              bulletEntry(0, 'Built React apps'),
              bulletEntry(1, 'Managed coffee supply'),
            ],
          },
          {
            sectionId: 'projects',
            order: 1,
            entries: [
              bulletEntry(0, 'React dashboard'),
              bulletEntry(1, 'React state management'),
              bulletEntry(2, 'React hooks library'),
              bulletEntry(3, 'Python ETL pipeline'),
              bulletEntry(4, 'Django REST backend'),
            ],
          },
        ],
      },
    };

    const result = await engine.match(request);

    expect(result.sections).toHaveLength(2);

    // Locked section: both bullets survive regardless of JD match.
    const lockedSection = result.sections.find(
      (s) => s.sectionId === 'experience',
    )!;
    expect(lockedSection.entries).toHaveLength(2);
    expect(lockedSection.entries.map((e) => e.fields[0].value)).toEqual([
      'Built React apps',
      'Managed coffee supply',
    ]);

    // Unlocked section: bullet filtering still applies as before (cap=3
    // drops the two non-matching bullets).
    const unlockedSection = result.sections.find(
      (s) => s.sectionId === 'projects',
    )!;
    const unlockedValues = unlockedSection.entries.map(
      (e) => e.fields[0].value,
    );
    expect(unlockedValues).toHaveLength(3);
    expect(unlockedValues).toContain('React dashboard');
    expect(unlockedValues).not.toContain('Python ETL pipeline');
    expect(unlockedValues).not.toContain('Django REST backend');
  });

  it('returns all entries unchanged for a locked section with an empty JD', async () => {
    const entries = [
      bulletEntry(0, 'Built React apps'),
      skillEntry(1, 'React'),
    ];

    const result = await engine.match(
      makeRequest('', entries, { locked: true }),
    );

    expect(result.sections[0].entries).toHaveLength(2);
  });

  it('treats sections without a locked flag as unlocked', async () => {
    const jd = 'React developer';
    const entries = [
      bulletEntry(0, 'Built React apps'),
      bulletEntry(1, 'Managed coffee supply'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // No `locked` field -> unlocked -> relevance filtering applies: only the
    // React bullet matches, the coffee bullet is dropped.
    expect(result.sections[0].entries).toHaveLength(1);
    expect(result.sections[0].entries.map((e) => e.fields[0].value)).toEqual([
      'Built React apps',
    ]);
  });

  // ── Locked entries (RES-97) ───────────────────────────────

  it('keeps a locked bullet entry even with zero JD overlap', async () => {
    const jd = 'React developer with TypeScript experience';
    const entries = [
      bulletEntry(0, 'Built React applications'),
      { ...bulletEntry(1, 'Managed coffee supply chain'), locked: true },
      bulletEntry(2, 'Wrote TypeScript type definitions'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // The locked entry passes through unchanged even though "Managed coffee
    // supply chain" has no JD token overlap — Tailor must not touch it.
    const values = result.sections[0].entries.map((e) => e.fields[0].value);
    expect(values).toContain('Managed coffee supply chain');
    expect(values).toContain('Built React applications');
    expect(values).toContain('Wrote TypeScript type definitions');
  });

  it('locked entries do not count toward the bullet cap', async () => {
    const jd = 'React developer needed';
    const entries = [
      bulletEntry(0, 'Built React apps'),
      bulletEntry(1, 'React Native mobile development'),
      bulletEntry(2, 'React component library'),
      bulletEntry(3, 'React state management'),
      bulletEntry(4, 'Non-React backend work'),
      // Locked entry is always kept, on top of the cap of 3.
      { ...bulletEntry(5, 'Legacy COBOL maintenance'), locked: true },
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // 3 capped bullets + 1 locked entry that bypasses the cap
    expect(result.sections[0].entries).toHaveLength(4);
    expect(result.sections[0].entries.map((e) => e.fields[0].value)).toContain(
      'Legacy COBOL maintenance',
    );
  });

  it('keeps a locked skill entry even with zero JD overlap', async () => {
    const jd = 'Looking for React, TypeScript, and Docker skills';
    const entries = [
      skillEntry(0, 'React'),
      skillEntry(1, 'Excel'),
      skillEntry(2, 'TypeScript'),
      skillEntry(3, 'Docker'),
      skillEntry(4, 'PowerPoint'),
      { ...skillEntry(5, 'Legacy COBOL'), locked: true },
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // Cap is 3, but the locked skill is preserved on top.
    expect(result.sections[0].entries).toHaveLength(4);
    expect(result.sections[0].entries.map((e) => e.fields[0].value)).toContain(
      'Legacy COBOL',
    );
  });

  it('keeps a locked entry while still filtering the unlocked ones in the same section', async () => {
    const request: TailorRequest = {
      jobDescription: 'React developer',
      resume: {
        sections: [
          {
            sectionId: 'experience',
            order: 0,
            entries: [
              { ...bulletEntry(0, 'Built React apps'), locked: true },
              bulletEntry(1, 'Managed coffee supply'),
              bulletEntry(2, 'React dashboard'),
              bulletEntry(3, 'Python ETL pipeline'),
              bulletEntry(4, 'Django REST backend'),
            ],
          },
        ],
      },
    };

    const result = await engine.match(request);

    const values = result.sections[0].entries.map((e) => e.fields[0].value);
    // Locked entry always present, even with zero JD overlap (RES-97).
    expect(values).toContain('Built React apps');
    // Unlocked zero-overlap bullets are dropped under the RES-92 master
    // semantics (score > 0 required before the cap applies); the only
    // unlocked survivor is the React match.
    expect(values).toEqual(['Built React apps', 'React dashboard']);
  });

  it('keeps locked entries when the section itself is not flagged locked', async () => {
    const entries = [
      { ...bulletEntry(0, 'React apps'), locked: true },
      bulletEntry(1, 'Coffee supply'),
    ];

    const result = await engine.match(makeRequest('React developer', entries));

    // The unlocked zero-overlap bullet is dropped (RES-92 semantics); the
    // locked entry survives inside the otherwise unlocked section (RES-97).
    expect(result.sections[0].entries).toHaveLength(1);
    expect(result.sections[0].entries.map((e) => e.fields[0].value)).toEqual([
      'React apps',
    ]);
  });

  it('treats entries without a locked flag as unlocked', async () => {
    const jd = 'React developer';
    const entries = [
      bulletEntry(0, 'Built React apps'),
      bulletEntry(1, 'Managed coffee supply'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // No `locked` field on entries -> all are subject to normal filtering:
    // the zero-overlap bullet is dropped, the React match is kept.
    expect(result.sections[0].entries).toHaveLength(1);
  });

  it('preserves entry order when locked entries are mixed in', async () => {
    const jd = 'React developer';
    const entries = [
      { ...bulletEntry(0, 'Non-matching but locked'), locked: true },
      bulletEntry(1, 'Built React apps'),
      { ...bulletEntry(2, 'Non-matching but locked too'), locked: true },
      bulletEntry(3, 'React Native work'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // All 4 entries present (locked ones bypass the cap) and sorted by order.
    expect(result.sections[0].entries).toHaveLength(4);
    expect(result.sections[0].entries.map((e) => e.order)).toEqual([
      0, 1, 2, 3,
    ]);
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

  // ── Malformed / defensive-fallback paths ───────────────────

  it('scores a bullet entry with a null field value as zero (?? fallback)', async () => {
    // isBulletEntry() matches the key, but getBulletText() returns the null
    // value, so the `?? ''` fallback kicks in and scoreText('') returns 0 —
    // the zero-score entry is then dropped (RES-92 filter semantics).
    const jd = 'React developer';
    const entries = [
      {
        order: 0,
        fields: [{ key: 'bullet', value: null }],
        children: [],
      } as unknown as SectionEntryDto,
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // Score 0 → dropped by the relevance filter.
    expect(result.sections[0].entries).toHaveLength(0);
  });

  it('scores a skill entry with a null field value as zero (?? fallback)', async () => {
    const jd = 'React developer';
    const entries = [
      {
        order: 0,
        fields: [{ key: 'skill', value: null }],
        children: [],
      } as unknown as SectionEntryDto,
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // Score 0 → dropped by the relevance filter.
    expect(result.sections[0].entries).toHaveLength(0);
  });

  it('scores text with no word characters as zero', async () => {
    const jd = 'React developer';
    const entries = [bulletEntry(0, '!!!')];

    const result = await engine.match(makeRequest(jd, entries));

    // text '!!!' splits into zero words -> score 0 -> dropped.
    expect(result.sections[0].entries).toHaveLength(0);
  });

  it('returns null from getBulletText when no bullet field exists', () => {
    const engineInternals = engine as unknown as {
      getBulletText(entry: SectionEntryDto): string | null;
    };
    expect(
      engineInternals.getBulletText(passthroughEntry(0, 'title', 'Engineer')),
    ).toBeNull();
  });

  it('returns null from getSkillText when no skill field exists', () => {
    const engineInternals = engine as unknown as {
      getSkillText(entry: SectionEntryDto): string | null;
    };
    expect(
      engineInternals.getSkillText(passthroughEntry(0, 'title', 'Engineer')),
    ).toBeNull();
  });

  // ── Live builder payload shapes (RES-92) ────────────────────

  it('recognizes bullets stored with the `text` field key (builder BulletList shape)', async () => {
    const jd = 'React developer';
    const entries = [
      {
        order: 0,
        fields: [{ key: 'company', value: 'Acme Corp' }],
        children: [],
      },
      {
        order: 1,
        parentId: 'job-1',
        fields: [{ key: 'text', value: 'Built React apps' }],
        children: [],
      },
      {
        order: 2,
        parentId: 'job-1',
        fields: [{ key: 'text', value: 'Managed coffee supply' }],
        children: [],
      },
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // The job entry passes through; only the matching `text` bullet survives.
    const values = result.sections[0].entries.map((e) => e.fields[0].value);
    expect(values).toContain('Acme Corp');
    expect(values).toContain('Built React apps');
    expect(values).not.toContain('Managed coffee supply');
  });

  it('caps bullets PER top-level entry (parented bullets)', async () => {
    const jd = 'React developer';
    const entries: SectionEntryDto[] = [];
    // Two jobs, each with three matching bullets → cap 3 per job keeps all.
    for (let job = 0; job < 2; job++) {
      const jobId = `job-${job}`;
      entries.push({
        order: job * 10,
        fields: [{ key: 'company', value: `Company ${job}` }],
        children: [],
      });
      for (let b = 0; b < 3; b++) {
        entries.push({
          order: job * 10 + b + 1,
          parentId: jobId,
          fields: [{ key: 'text', value: `React bullet ${job}-${b}` }],
          children: [],
        });
      }
      // A non-matching bullet that must be dropped.
      entries.push({
        order: job * 10 + 4,
        parentId: jobId,
        fields: [{ key: 'text', value: 'Coffee logistics' }],
        children: [],
      });
    }

    const result = await engine.match(makeRequest(jd, entries));

    const values = result.sections[0].entries.map((e) => e.fields[0].value);
    // 2 companies pass through + 6 matching bullets (3 per job, coffee dropped)
    expect(values.filter((v) => v.startsWith('Company'))).toHaveLength(2);
    expect(values.filter((v) => v.startsWith('React bullet'))).toHaveLength(6);
    expect(values).not.toContain('Coffee logistics');
  });

  it('recognizes skills stored with the `name` field key (builder skill shape)', async () => {
    const jd = 'React and TypeScript developer';
    const entries = [
      {
        order: 0,
        fields: [{ key: 'name', value: 'React' }],
        children: [],
      },
      {
        order: 1,
        fields: [{ key: 'name', value: 'Excel' }],
        children: [],
      },
      {
        order: 2,
        fields: [{ key: 'name', value: 'TypeScript' }],
        children: [],
      },
    ];

    const result = await engine.match(makeRequest(jd, entries));

    const values = result.sections[0].entries.map((e) => e.fields[0].value);
    expect(values).toContain('React');
    expect(values).toContain('TypeScript');
    expect(values).not.toContain('Excel');
  });

  it('filters volunteer bullets against the JD like other content sections (RES-113)', async () => {
    const jd = 'community outreach coordinator';
    const entries = [
      {
        order: 0,
        fields: [{ key: 'organization', value: 'Habitat for Humanity' }],
        children: [],
      },
      {
        order: 1,
        parentId: 'v-1',
        fields: [{ key: 'text', value: 'Led community outreach events' }],
        children: [],
      },
      {
        order: 2,
        parentId: 'v-1',
        fields: [{ key: 'text', value: 'Managed coffee supply chain' }],
        children: [],
      },
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // The organization entry passes through; the matching `text` bullet
    // survives, the unrelated one is dropped — identical semantics to
    // experience/projects (RES-113 acceptance: Tailor filters volunteer
    // content like other content sections).
    const values = result.sections[0].entries.map((e) => e.fields[0].value);
    expect(values).toContain('Habitat for Humanity');
    expect(values).toContain('Led community outreach events');
    expect(values).not.toContain('Managed coffee supply chain');
  });
});
