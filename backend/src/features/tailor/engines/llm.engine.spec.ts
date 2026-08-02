import { LlmEngine } from './llm.engine';
import type { TailorRequest } from '../models/tailor-request.model';
import type { SectionEntryDto } from '../../resumes/dto/create-resume.dto';

// ─── Mock fetch globally ──────────────────────────────────────────

const mockFetch = jest.fn<Promise<Response>, [string, RequestInit?]>();
global.fetch = mockFetch as typeof global.fetch;

// ─── Helpers ──────────────────────────────────────────────────────

/**
 *
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
 *
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

/**
 *
 * @param content
 * @param status
 */
function makeMockResponse(content: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
    text: () => Promise.resolve(content),
  } as unknown as Response;
}

// ─── Tests ────────────────────────────────────────────────────────

describe('LlmEngine', () => {
  const bulletCap = 3;
  const config = { apiKey: 'sk-test', model: 'gpt-4o-mini' };
  let engine: LlmEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new LlmEngine(config, bulletCap);
  });

  // ── Successful LLM call ────────────────────────────────────

  it('calls LLM API with correct prompt and parses JSON response', async () => {
    mockFetch.mockResolvedValueOnce(
      makeMockResponse('{"bulletIndices": [0, 2], "skillIndices": [1]}'),
    );

    const jd = 'React developer with TypeScript experience';
    const entries = [
      bulletEntry(0, 'Built React applications'),
      skillEntry(1, 'React'),
      bulletEntry(2, 'Wrote TypeScript definitions'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // Should have called fetch once
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify the request body
    const callArgs = mockFetch.mock.calls[0];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const requestBody = JSON.parse(callArgs[1]!.body as string);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(requestBody.model).toBe('gpt-4o-mini');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(requestBody.messages).toHaveLength(2);

    // Prompt should mention job description and entries
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const userContent: string = requestBody.messages[1].content;
    expect(userContent).toContain('React developer');
    expect(userContent).toContain('bulletIndices');
    expect(userContent).toContain('skillIndices');

    // Result should contain the selected entries
    expect(result.sections).toHaveLength(1);
    const resultEntries = result.sections[0].entries;
    expect(resultEntries).toHaveLength(3);
  });

  it('filters entries to only those returned by LLM', async () => {
    mockFetch.mockResolvedValueOnce(
      makeMockResponse('{"bulletIndices": [0], "skillIndices": []}'),
    );

    const jd = 'React developer';
    const entries = [
      bulletEntry(0, 'Built React apps'),
      bulletEntry(1, 'Managed coffee supply'),
      skillEntry(2, 'React'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // Only entry[0] should be in result (bullet at index 0)
    // Skill at index 2 is NOT included because skillIndices is empty
    const resultEntries = result.sections[0].entries;
    expect(resultEntries).toHaveLength(1);
    expect(resultEntries[0].fields[0].value).toBe('Built React apps');
  });

  // ── Pass-through entries ───────────────────────────────────

  it('passes non-bullet, non-skill fields through unchanged', async () => {
    // The LLM prompt numbers only bullet/skill entries sequentially.
    // In the entries below, only entry[1] is a bullet → it is index 0 in the prompt.
    mockFetch.mockResolvedValueOnce(
      makeMockResponse('{"bulletIndices": [0], "skillIndices": []}'),
    );

    const jd = 'React developer';
    const entries = [
      passthroughEntry(0, 'company', 'Acme Corp'),
      bulletEntry(1, 'Built React apps'),
      passthroughEntry(2, 'title', 'Engineer'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // 2 pass-through + 1 bullet = 3
    expect(result.sections[0].entries).toHaveLength(3);

    const company = result.sections[0].entries.find(
      (e) => e.fields[0].key === 'company',
    );
    expect(company).toBeDefined();
  });

  // ── Empty JD ───────────────────────────────────────────────

  it('returns all entries unfiltered when JD is empty', async () => {
    const entries = [
      bulletEntry(0, 'Built React apps'),
      bulletEntry(1, 'Managed coffee'),
      passthroughEntry(2, 'company', 'Acme'),
    ];

    const result = await engine.match(makeRequest('', entries));

    // Should not call the LLM API at all
    expect(mockFetch).not.toHaveBeenCalled();

    // All entries should be present
    expect(result.sections[0].entries).toHaveLength(3);
  });

  // ── Multiple sections ──────────────────────────────────────

  it('processes multiple sections independently', async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeMockResponse('{"bulletIndices": [0], "skillIndices": []}'),
      )
      .mockResolvedValueOnce(
        makeMockResponse('{"bulletIndices": [], "skillIndices": [0, 1]}'),
      );

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

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].sectionId).toBe('experience');
    expect(result.sections[1].sectionId).toBe('skills');
  });

  // ── LLM error handling ─────────────────────────────────────

  it('throws when LLM API returns a non-200 status', async () => {
    mockFetch.mockResolvedValueOnce(makeMockResponse('Unauthorized', 401));

    const jd = 'React developer';
    const entries = [bulletEntry(0, 'Built React apps')];

    await expect(engine.match(makeRequest(jd, entries))).rejects.toThrow(
      'LLM API returned 401',
    );
  });

  it('throws when LLM response does not contain valid JSON', async () => {
    mockFetch.mockResolvedValueOnce(
      makeMockResponse('Here are my thoughts: not JSON at all'),
    );

    const jd = 'React developer';
    const entries = [bulletEntry(0, 'Built React apps')];

    await expect(engine.match(makeRequest(jd, entries))).rejects.toThrow(
      'LLM response did not contain valid JSON',
    );
  });

  it('throws when JSON response is missing required keys', async () => {
    mockFetch.mockResolvedValueOnce(makeMockResponse('{"foo": "bar"}'));

    const jd = 'React developer';
    const entries = [bulletEntry(0, 'Built React apps')];

    await expect(engine.match(makeRequest(jd, entries))).rejects.toThrow(
      'LLM response missing bulletIndices or skillIndices',
    );
  });

  it('filters out non-numeric values from LLM response indices', async () => {
    mockFetch.mockResolvedValueOnce(
      makeMockResponse(
        '{"bulletIndices": [0, "bad", 2], "skillIndices": [null, 1]}',
      ),
    );

    const jd = 'React developer';
    const entries = [
      bulletEntry(0, 'Entry A'),
      bulletEntry(1, 'Entry B'),
      bulletEntry(2, 'Entry C'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // Only indices 0 and 2 should be valid (0 and 2 from bulletIndices numbers)
    // skillIndices[0] is null (filtered), skillIndices[1] is 1 (valid)
    // So entries at indices 0, 1, 2: all selected
    expect(result.sections[0].entries).toHaveLength(3);
  });

  it('ignores out-of-range indices from LLM response', async () => {
    mockFetch.mockResolvedValueOnce(
      makeMockResponse('{"bulletIndices": [0, 999, -1], "skillIndices": []}'),
    );

    const jd = 'React developer';
    const entries = [bulletEntry(0, 'Valid entry')];

    const result = await engine.match(makeRequest(jd, entries));

    // Only index 0 is valid (999 and -1 are out of range)
    expect(result.sections[0].entries).toHaveLength(1);
  });

  // ── Config defaults ────────────────────────────────────────

  it('uses default baseUrl when not provided', async () => {
    mockFetch.mockResolvedValueOnce(
      makeMockResponse('{"bulletIndices": [], "skillIndices": []}'),
    );

    const jd = 'React developer';
    const entries = [bulletEntry(0, 'Entry')];

    await engine.match(makeRequest(jd, entries));

    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('uses custom baseUrl when provided', async () => {
    mockFetch.mockResolvedValueOnce(
      makeMockResponse('{"bulletIndices": [], "skillIndices": []}'),
    );

    const customEngine = new LlmEngine(
      { apiKey: 'sk-test', model: 'gpt-4', baseUrl: 'https://custom.llm/api' },
      bulletCap,
    );

    const jd = 'React developer';
    const entries = [bulletEntry(0, 'Entry')];

    await customEngine.match(makeRequest(jd, entries));

    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toBe('https://custom.llm/api/chat/completions');
  });

  it('handles LLM JSON wrapped in markdown code fences', async () => {
    mockFetch.mockResolvedValueOnce(
      makeMockResponse(
        '```json\n{"bulletIndices": [0], "skillIndices": []}\n```',
      ),
    );

    const jd = 'React developer';
    const entries = [bulletEntry(0, 'Built React apps')];

    const result = await engine.match(makeRequest(jd, entries));
    expect(result.sections[0].entries).toHaveLength(1);
  });

  // ── Empty categorizable entries ────────────────────────────

  it('returns all entries when section has no bullet/skill entries', async () => {
    const entries = [
      passthroughEntry(0, 'company', 'Acme'),
      passthroughEntry(1, 'title', 'Engineer'),
    ];

    const result = await engine.match(makeRequest('React dev', entries));

    // No LLM call needed — all pass-through
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.sections[0].entries).toHaveLength(2);
  });

  it('preserves entry order after LLM filtering', async () => {
    // LLM indices are based on categorized array, not original entry indices.
    // categorized: [bullet(1) at idx 0, bullet(2) at idx 1, skill(3) at idx 2]
    mockFetch.mockResolvedValueOnce(
      makeMockResponse('{"bulletIndices": [1, 0], "skillIndices": [2]}'),
    );

    const jd = 'React developer';
    const entries = [
      passthroughEntry(0, 'company', 'Acme'),
      bulletEntry(1, 'Non-relevant bullet'),
      bulletEntry(2, 'Built React apps'),
      skillEntry(3, 'React'),
    ];

    const result = await engine.match(makeRequest(jd, entries));

    // 1 pass-through + 2 bullets + 1 skill = 4
    expect(result.sections[0].entries).toHaveLength(4);

    // Entries should be ordered by original order
    const orders = result.sections[0].entries.map((e) => e.order);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]).toBeGreaterThan(orders[i - 1]);
    }
  });

  it('uses custom BULLET_CAP in prompt', async () => {
    mockFetch.mockResolvedValueOnce(
      makeMockResponse('{"bulletIndices": [], "skillIndices": []}'),
    );

    const customEngine = new LlmEngine(config, 10);
    const jd = 'React developer';
    const entries = [bulletEntry(0, 'Entry')];

    await customEngine.match(makeRequest(jd, entries));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsedBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const userContent: string = parsedBody.messages[1].content;
    expect(userContent).toContain('at most 10');
  });
});
