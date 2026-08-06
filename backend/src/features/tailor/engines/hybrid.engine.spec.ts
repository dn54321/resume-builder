import { HybridEngine } from './hybrid.engine';
import { LlmEngine } from './llm.engine';
import type { TailorRequest } from '../models/tailor-request.model';
import type { SectionEntryDto } from '../../resumes/dto/create-resume.dto';

// ─── Mock LlmEngine.match ──────────────────────────────────────────

// We spy on the LlmEngine prototype so we can verify the hybrid engine
// delegates to LLM after keyword pre-filtering.
const llmMatchSpy = jest.spyOn(LlmEngine.prototype, 'match');

// ─── Mock fetch globally (in case LlmEngine internally calls fetch in real
//     implementation — hybrid engine's LlmEngine will have its match mocked
//     so fetch should never be called in these tests)
const mockFetch = jest.fn<Promise<Response>, [string, RequestInit?]>();
global.fetch = mockFetch as typeof global.fetch;

// ─── Helpers ──────────────────────────────────────────────────────

/**
 *
 * @param order
 * @param value
 */
function bulletEntry(order: number, value: string): SectionEntryDto {
  return { order, fields: [{ key: 'bullet', value }], children: [] };
}

/**
 *
 * @param order
 * @param value
 */
function skillEntry(order: number, value: string): SectionEntryDto {
  return { order, fields: [{ key: 'skill', value }], children: [] };
}

/**
 *
 * @param order
 * @param key
 * @param value
 */
function passthroughEntry(
  order: number,
  key: string,
  value: string,
): SectionEntryDto {
  return { order, fields: [{ key, value }], children: [] };
}

/**
 *
 * @param jd
 * @param entries
 */
function makeRequest(jd: string, entries: SectionEntryDto[]): TailorRequest {
  return {
    jobDescription: jd,
    resume: {
      sections: [{ sectionId: 'experience', order: 0, entries }],
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('HybridEngine', () => {
  const bulletCap = 3;
  const llmConfig = { apiKey: 'sk-test', model: 'gpt-4o-mini' };
  let engine: HybridEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new HybridEngine(llmConfig, bulletCap);
    // Default: LLM pass-through (returns whatever it receives)
    llmMatchSpy.mockImplementation((request: TailorRequest) =>
      Promise.resolve({
        sections: request.resume.sections.map((s) => ({
          sectionId: s.sectionId,
          entries: s.entries,
        })),
      }),
    );
  });

  // ── Keyword pre-filtering ──────────────────────────────────

  it('creates keyword engine with 2x bulletCap for pre-filtering', async () => {
    const jd = 'React TypeScript developer';
    const entries: SectionEntryDto[] = [];
    // 8 bullets — keyword with cap=6 should keep top 6
    for (let i = 0; i < 8; i++) {
      entries.push(
        bulletEntry(i, i < 2 ? 'React development' : 'Unrelated work'),
      );
    }

    // The pre-filter should keep only the React-related bullets
    // Then LLM passes them through
    await engine.match(makeRequest(jd, entries));

    // After keyword pre-filter (2x cap = 6) passes top 6
    // LLM mock passes them all through
    expect(llmMatchSpy).toHaveBeenCalledTimes(1);

    // The pre-filtered request passed to LLM should have at most 6 entries
    const llmRequest = llmMatchSpy.mock.calls[0][0];
    const preFilteredCount = llmRequest.resume.sections[0].entries.length;
    expect(preFilteredCount).toBeLessThanOrEqual(6);
    expect(preFilteredCount).toBeGreaterThanOrEqual(2);
  });

  it('keyword pre-filter removes low-scoring entries before LLM', async () => {
    const jd = 'React developer';
    const entries = [
      bulletEntry(0, 'Built React applications'),
      bulletEntry(1, 'Managed coffee supply chain'),
      bulletEntry(2, 'React Native development'),
      bulletEntry(3, 'Accounting software migration'),
      bulletEntry(4, 'React component library'),
      bulletEntry(5, 'Pet sitting business'),
      bulletEntry(6, 'React hooks development'),
      bulletEntry(7, 'Bakery management'),
    ];

    await engine.match(makeRequest(jd, entries));

    // Keyword pre-filter with 2x cap = 6 keeps top 6
    // Top 6 should all contain React mentions (4 React + 2 irrelevant that get through)
    const llmRequest = llmMatchSpy.mock.calls[0][0];
    expect(llmRequest.resume.sections[0].entries.length).toBeLessThanOrEqual(6);
  });

  // ── LLM re-ranking ─────────────────────────────────────────

  it('delegates pre-filtered results to LLM for final ranking', async () => {
    llmMatchSpy.mockImplementation((request: TailorRequest) => {
      // Simulate LLM picking only the first entry
      const filtered = request.resume.sections.map((s) => ({
        sectionId: s.sectionId,
        entries: [s.entries[0]],
      }));
      return Promise.resolve({ sections: filtered });
    });

    const jd = 'React developer';
    const entries = [
      bulletEntry(0, 'Built React applications'),
      bulletEntry(1, 'React Native development'),
      bulletEntry(2, 'React component library'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // LLM was called with pre-filtered entries
    expect(llmMatchSpy).toHaveBeenCalledTimes(1);

    // Result should reflect LLM's selection
    expect(result.sections[0].entries).toHaveLength(1);
    expect(result.sections[0].entries[0].order).toBe(0);
  });

  // ── Pass-through entries ───────────────────────────────────

  it('retains pass-through entries through both stages', async () => {
    const jd = 'React developer';
    const entries = [
      passthroughEntry(0, 'company', 'Acme Corp'),
      bulletEntry(1, 'Built React applications'),
      bulletEntry(2, 'React Native work'),
      passthroughEntry(3, 'title', 'Engineer'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // Pass-through entries should be in the result
    const company = result.sections[0].entries.find(
      (e) => e.fields[0].key === 'company',
    );
    const title = result.sections[0].entries.find(
      (e) => e.fields[0].key === 'title',
    );
    expect(company).toBeDefined();
    expect(title).toBeDefined();
  });

  // ── Empty JD ───────────────────────────────────────────────

  it('returns all entries unfiltered when JD is empty', async () => {
    const entries = [
      bulletEntry(0, 'Built React apps'),
      bulletEntry(1, 'Managed coffee'),
      bulletEntry(2, 'More bullets'),
    ];

    // LLM spy should pass-through
    const result = await engine.match(makeRequest('', entries));

    // All entries returned
    expect(result.sections[0].entries).toHaveLength(3);
  });

  // ── Multiple sections ──────────────────────────────────────

  it('processes multiple sections through both stages', async () => {
    const request: TailorRequest = {
      jobDescription: 'React developer with TypeScript',
      resume: {
        sections: [
          {
            sectionId: 'experience',
            order: 0,
            entries: [
              bulletEntry(0, 'Built React apps'),
              bulletEntry(1, 'Unrelated work'),
            ],
          },
          {
            sectionId: 'skills',
            order: 1,
            entries: [skillEntry(0, 'React'), skillEntry(1, 'Excel')],
          },
        ],
      },
    };

    const result = await engine.match(request);

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].sectionId).toBe('experience');
    expect(result.sections[1].sectionId).toBe('skills');
  });

  // ── Section mismatch handling ──────────────────────────────

  it('handles sections that keyword filters to zero entries', async () => {
    const jd = 'Python Django developer';
    const entries = [
      bulletEntry(0, 'Built React apps'),
      bulletEntry(1, 'React Native work'),
    ];

    // Both entries have 0 keyword score for Python/Django — the keyword
    // pre-filter drops them (RES-92 restored relevance-only filtering), so
    // the LLM re-rank step receives an empty section.
    const result = await engine.match(makeRequest(jd, entries));

    // Section still present, but with zero entries (nothing survived pre-filter).
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].entries).toHaveLength(0);
  });

  // ── Locked sections ────────────────────────────────────────

  it('passes a locked section through unchanged (no keyword filtering)', async () => {
    const jd = 'React developer';
    const entries = [
      bulletEntry(0, 'Managed coffee supply chain'),
      bulletEntry(1, 'Accounting software migration'),
      bulletEntry(2, 'Bakery management'),
    ];
    const request: TailorRequest = {
      jobDescription: jd,
      resume: {
        sections: [
          {
            sectionId: 'experience',
            order: 0,
            locked: true,
            entries,
          },
        ],
      },
    };

    const result = await engine.match(request);

    // Every entry survives — the locked section is never keyword-filtered.
    expect(result.sections[0].entries).toHaveLength(3);
    expect(result.sections[0].entries.map((e) => e.order)).toEqual([0, 1, 2]);

    // The LLM receives the locked section with ALL entries intact so its
    // own locked guard can skip it.
    const llmRequest = llmMatchSpy.mock.calls[0][0];
    expect(llmRequest.resume.sections[0].locked).toBe(true);
    expect(llmRequest.resume.sections[0].entries).toHaveLength(3);
  });

  it('filters unlocked sections while locked sections stay intact', async () => {
    const jd = 'React developer';
    const request: TailorRequest = {
      jobDescription: jd,
      resume: {
        sections: [
          {
            sectionId: 'experience',
            order: 0,
            locked: true,
            entries: [
              bulletEntry(0, 'Managed coffee supply chain'),
              bulletEntry(1, 'Bakery management'),
            ],
          },
          {
            sectionId: 'projects',
            order: 1,
            entries: [
              bulletEntry(0, 'Built React dashboards'),
              bulletEntry(1, 'Planned office potlucks'),
            ],
          },
        ],
      },
    };

    const result = await engine.match(request);

    const lockedSection = result.sections.find(
      (s) => s.sectionId === 'experience',
    );
    const unlockedSection = result.sections.find(
      (s) => s.sectionId === 'projects',
    );

    // Locked section: both entries pass through untouched.
    expect(lockedSection?.entries).toHaveLength(2);
    expect(lockedSection?.entries.map((e) => e.fields[0].value)).toEqual([
      'Managed coffee supply chain',
      'Bakery management',
    ]);

    // Unlocked section: keyword pre-filter still narrows the entry set
    // before the LLM re-rank.
    expect(unlockedSection?.entries.length).toBeGreaterThan(0);
    expect(unlockedSection?.entries.length).toBeLessThanOrEqual(2);
  });

  // ── Locked entries (RES-97) ───────────────────────────────

  it('keeps locked entries through the hybrid pipeline even when the LLM re-rank drops everything else', async () => {
    // Worst-case LLM: drops every UNLOCKED entry it is given. The locked
    // entry must still survive the keyword pre-filter AND the re-rank.
    llmMatchSpy.mockImplementation((request: TailorRequest) =>
      Promise.resolve({
        sections: request.resume.sections.map((s) => ({
          sectionId: s.sectionId,
          entries: s.entries.filter((e) => e.locked === true),
        })),
      }),
    );

    const jd = 'React developer';
    const entries = [
      { ...bulletEntry(0, 'Managed coffee supply chain'), locked: true },
      bulletEntry(1, 'Built React dashboards'),
      bulletEntry(2, 'Planned office potlucks'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // Only the locked entry survives — it passed the keyword pre-filter
    // (keyword engine's locked pass-through) and the hostile LLM re-rank.
    expect(result.sections[0].entries.map((e) => e.fields[0].value)).toEqual([
      'Managed coffee supply chain',
    ]);
  });

  // ── Order preservation ─────────────────────────────────────

  it('preserves entry order through hybrid pipeline', async () => {
    const jd = 'React developer';
    const entries = [
      passthroughEntry(0, 'company', 'Acme'),
      bulletEntry(1, 'Built React apps'),
      passthroughEntry(2, 'title', 'Engineer'),
      bulletEntry(3, 'React work'),
      passthroughEntry(4, 'date', '2020'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    const orders = result.sections[0].entries.map((e) => e.order);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]).toBeGreaterThan(orders[i - 1]);
    }
  });
});
