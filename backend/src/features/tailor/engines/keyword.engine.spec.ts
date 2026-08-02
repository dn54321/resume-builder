import { KeywordEngine } from './keyword.engine';
import type { TailorRequest } from '../models/tailor-request.model';

/**
 *
 * @param overrides
 */
function makeResume(
  overrides: Partial<TailorRequest['resume']> = {},
): TailorRequest['resume'] {
  return {
    layout: 'standard',
    name: 'Test Resume',
    sections: [
      {
        sectionId: 'experience',
        column: 'right',
        order: 0,
        entries: [
          {
            order: 0,
            parentId: null,
            fields: [
              { key: 'company', value: 'Acme Corp', order: 0 },
              { key: 'title', value: 'Software Engineer', order: 1 },
            ],
            children: [
              {
                order: 0,
                parentId: 'entry-1',
                fields: [
                  {
                    key: 'text',
                    value: 'Built React frontend applications',
                    order: 0,
                  },
                ],
              },
              {
                order: 1,
                parentId: 'entry-1',
                fields: [
                  {
                    key: 'text',
                    value: 'Managed cloud infrastructure on AWS',
                    order: 0,
                  },
                ],
              },
              {
                order: 2,
                parentId: 'entry-1',
                fields: [
                  {
                    key: 'text',
                    value: 'Led team meetings every week',
                    order: 0,
                  },
                ],
              },
            ],
          },
          {
            order: 1,
            parentId: null,
            fields: [
              { key: 'company', value: 'Beta Inc', order: 0 },
              { key: 'title', value: 'Junior Developer', order: 1 },
            ],
            children: [
              {
                order: 0,
                parentId: 'entry-2',
                fields: [
                  { key: 'text', value: 'Wrote Python unit tests', order: 0 },
                ],
              },
            ],
          },
        ],
      },
      {
        sectionId: 'hard_skills',
        column: 'right',
        order: 1,
        entries: [
          {
            order: 0,
            parentId: null,
            fields: [{ key: 'name', value: 'React', order: 0 }],
          },
          {
            order: 1,
            parentId: null,
            fields: [{ key: 'name', value: 'Python', order: 0 }],
          },
          {
            order: 2,
            parentId: null,
            fields: [{ key: 'name', value: 'AWS', order: 0 }],
          },
          {
            order: 3,
            parentId: null,
            fields: [{ key: 'name', value: 'Excel', order: 0 }],
          },
        ],
      },
      {
        sectionId: 'soft_skills',
        column: 'right',
        order: 2,
        entries: [
          {
            order: 0,
            parentId: null,
            fields: [{ key: 'name', value: 'Communication', order: 0 }],
          },
          {
            order: 1,
            parentId: null,
            fields: [{ key: 'name', value: 'Team Leadership', order: 0 }],
          },
        ],
      },
      ...(overrides.sections ?? []),
    ],
    ...overrides,
  };
}

describe('KeywordEngine', () => {
  let engine: KeywordEngine;

  beforeEach(() => {
    engine = new KeywordEngine();
  });

  describe('match', () => {
    it('returns empty filter when JD is empty', () => {
      const request: TailorRequest = {
        jobDescription: '',
        resume: makeResume(),
      };

      const result = engine.match(request, 5);
      expect(result.filteredBulletIndices).toEqual({});
      expect(result.filteredHardSkills).toEqual([]);
      expect(result.filteredSoftSkills).toEqual([]);
    });

    it('returns empty filter when JD is whitespace only', () => {
      const request: TailorRequest = {
        jobDescription: '   \n  ',
        resume: makeResume(),
      };

      const result = engine.match(request, 5);
      expect(result.filteredBulletIndices).toEqual({});
      expect(result.filteredHardSkills).toEqual([]);
      expect(result.filteredSoftSkills).toEqual([]);
    });

    it('scores bullets by JD token overlap', () => {
      const request: TailorRequest = {
        jobDescription:
          'We need a React frontend developer with AWS experience',
        resume: makeResume(),
      };

      const result = engine.match(request, 5);

      // experience section should have filtered bullets
      expect(result.filteredBulletIndices['experience']).toBeDefined();
      const expIndices = result.filteredBulletIndices['experience'];
      expect(expIndices.length).toBeGreaterThan(0);

      // Find entry 0 (Acme Corp)
      const entry0 = expIndices.find((e) => e.entryOrder === 0);
      expect(entry0).toBeDefined();
      // The "Built React frontend applications" bullet (index 0) should be relevant
      expect(entry0!.bulletIndices).toContain(0);
      // The "Managed cloud infrastructure on AWS" bullet (index 1) should be relevant
      expect(entry0!.bulletIndices).toContain(1);
      // The "Led team meetings every week" bullet (index 2) should NOT be relevant
      expect(entry0!.bulletIndices).not.toContain(2);
    });

    it('filters hard skills by JD relevance', () => {
      const request: TailorRequest = {
        jobDescription:
          'We need a React frontend developer with AWS experience',
        resume: makeResume(),
      };

      const result = engine.match(request, 5);

      // React and AWS should be relevant
      expect(result.filteredHardSkills).toContain('react');
      expect(result.filteredHardSkills).toContain('aws');
      // Python and Excel should not be relevant
      expect(result.filteredHardSkills).not.toContain('python');
      expect(result.filteredHardSkills).not.toContain('excel');
    });

    it('caps bullets per entry at BULLET_CAP', () => {
      // Create a resume with an entry that has many bullets
      const resume = makeResume({
        sections: [
          {
            sectionId: 'experience',
            column: 'right',
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [{ key: 'company', value: 'TestCo', order: 0 }],
                children: [
                  {
                    order: 0,
                    parentId: 'e1',
                    fields: [
                      { key: 'text', value: 'Crafted React apps', order: 0 },
                    ],
                  },
                  {
                    order: 1,
                    parentId: 'e1',
                    fields: [
                      { key: 'text', value: 'Built React dashboard', order: 0 },
                    ],
                  },
                  {
                    order: 2,
                    parentId: 'e1',
                    fields: [
                      { key: 'text', value: 'React testing setup', order: 0 },
                    ],
                  },
                  {
                    order: 3,
                    parentId: 'e1',
                    fields: [
                      {
                        key: 'text',
                        value: 'React deployment pipeline',
                        order: 0,
                      },
                    ],
                  },
                  {
                    order: 4,
                    parentId: 'e1',
                    fields: [
                      {
                        key: 'text',
                        value: 'React mentoring program',
                        order: 0,
                      },
                    ],
                  },
                  {
                    order: 5,
                    parentId: 'e1',
                    fields: [
                      { key: 'text', value: 'React documentation', order: 0 },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      const request: TailorRequest = {
        jobDescription:
          'Looking for a React developer to build frontend applications',
        resume,
      };

      const cap = 3;
      const result = engine.match(request, cap);

      const expIndices = result.filteredBulletIndices['experience'];
      expect(expIndices).toBeDefined();
      // Should have at most `cap` bullets per entry
      if (expIndices && expIndices.length > 0 && expIndices[0]) {
        expect(expIndices[0].bulletIndices.length).toBeLessThanOrEqual(cap);
      }
    });

    it('caps hard skills at BULLET_CAP', () => {
      const resume = makeResume({
        sections: [
          {
            sectionId: 'hard_skills',
            column: 'right',
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [{ key: 'name', value: 'React', order: 0 }],
              },
              {
                order: 1,
                parentId: null,
                fields: [{ key: 'name', value: 'Frontend', order: 0 }],
              },
              {
                order: 2,
                parentId: null,
                fields: [{ key: 'name', value: 'JavaScript', order: 0 }],
              },
              {
                order: 3,
                parentId: null,
                fields: [{ key: 'name', value: 'TypeScript', order: 0 }],
              },
              {
                order: 4,
                parentId: null,
                fields: [{ key: 'name', value: 'Node', order: 0 }],
              },
              {
                order: 5,
                parentId: null,
                fields: [{ key: 'name', value: 'Tailwind', order: 0 }],
              },
            ],
          },
        ],
      });

      const request: TailorRequest = {
        jobDescription:
          'React Frontend TypeScript JavaScript Node Tailwind Developer',
        resume,
      };

      const cap = 3;
      const result = engine.match(request, cap);

      // All skills match, but capped at 3
      expect(result.filteredHardSkills.length).toBeLessThanOrEqual(cap);
      // The first 3 should be the highest-scoring ones (all should score similarly)
      expect(result.filteredHardSkills.length).toBe(3);
    });

    it('handles resume with no sections gracefully', () => {
      const request: TailorRequest = {
        jobDescription: 'React developer',
        resume: { layout: 'standard', name: 'Empty', sections: [] },
      };

      const result = engine.match(request, 5);
      expect(result.filteredBulletIndices).toEqual({});
      expect(result.filteredHardSkills).toEqual([]);
      expect(result.filteredSoftSkills).toEqual([]);
    });

    it('handles sections with empty entries', () => {
      const request: TailorRequest = {
        jobDescription: 'React developer',
        resume: {
          layout: 'standard',
          name: 'Test',
          sections: [
            {
              sectionId: 'experience',
              column: 'right',
              order: 0,
              entries: [],
            },
            {
              sectionId: 'hard_skills',
              column: 'right',
              order: 1,
              entries: [],
            },
          ],
        },
      };

      const result = engine.match(request, 5);
      expect(result.filteredBulletIndices).toEqual({});
      expect(result.filteredHardSkills).toEqual([]);
    });

    it('handles entries with no children for bullet sections', () => {
      const request: TailorRequest = {
        jobDescription: 'React developer',
        resume: {
          layout: 'standard',
          name: 'Test',
          sections: [
            {
              sectionId: 'experience',
              column: 'right',
              order: 0,
              entries: [
                {
                  order: 0,
                  parentId: null,
                  fields: [{ key: 'company', value: 'Acme', order: 0 }],
                  // No children
                },
              ],
            },
          ],
        },
      };

      const result = engine.match(request, 5);
      // Should not throw, and should have empty filter
      expect(result.filteredBulletIndices).toEqual({});
    });

    it('sorts bullet indices ascending within each entry', () => {
      const resume = makeResume({
        sections: [
          {
            sectionId: 'experience',
            column: 'right',
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [{ key: 'company', value: 'TestCo', order: 0 }],
                children: [
                  {
                    order: 0,
                    parentId: 'e1',
                    fields: [{ key: 'text', value: 'Made coffee', order: 0 }],
                  },
                  {
                    order: 1,
                    parentId: 'e1',
                    fields: [
                      {
                        key: 'text',
                        value: 'Built React components',
                        order: 0,
                      },
                    ],
                  },
                  {
                    order: 2,
                    parentId: 'e1',
                    fields: [
                      { key: 'text', value: 'Cleaned office', order: 0 },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      const request: TailorRequest = {
        jobDescription:
          'A developer who builds React components and also makes coffee and cleans',
        resume,
      };

      const result = engine.match(request, 5);
      const expIndices = result.filteredBulletIndices['experience'];
      expect(expIndices).toBeDefined();

      if (expIndices && expIndices[0]) {
        // bulletIndices should be sorted ascending
        const indices = expIndices[0].bulletIndices;
        for (let i = 1; i < indices.length; i++) {
          expect(indices[i]).toBeGreaterThan(indices[i - 1]);
        }
      }
    });

    it('returns empty indices for entries with bullets when no bullet matches JD', () => {
      const resume = makeResume({
        sections: [
          {
            sectionId: 'experience',
            column: 'right',
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [{ key: 'company', value: 'TestCo', order: 0 }],
                children: [
                  {
                    order: 0,
                    parentId: 'e1',
                    fields: [{ key: 'text', value: 'Made coffee', order: 0 }],
                  },
                ],
              },
            ],
          },
        ],
      });

      const request: TailorRequest = {
        jobDescription: 'We need an astronaut to go to Mars',
        resume,
      };

      const result = engine.match(request, 5);
      const expIndices = result.filteredBulletIndices['experience'];
      expect(expIndices).toBeDefined();
      if (expIndices && expIndices[0]) {
        expect(expIndices[0].bulletIndices).toEqual([]);
      }
    });

    it('scores soft skills by name overlap', () => {
      const request: TailorRequest = {
        jobDescription:
          'We need someone with strong leadership and team management skills',
        resume: makeResume(),
      };

      const result = engine.match(request, 5);

      // 'Team Leadership' should match 'leadership' and 'team'
      expect(result.filteredSoftSkills).toContain('team leadership');
      // 'Communication' should not match the JD
      expect(result.filteredSoftSkills).not.toContain('communication');
    });

    it('lowercases skill names before matching', () => {
      const resume = makeResume({
        sections: [
          {
            sectionId: 'hard_skills',
            column: 'right',
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [{ key: 'name', value: 'TypeScript', order: 0 }],
              },
            ],
          },
        ],
      });

      const request: TailorRequest = {
        jobDescription: 'Looking for a typescript developer',
        resume,
      };

      const result = engine.match(request, 5);
      expect(result.filteredHardSkills).toContain('typescript');
    });

    it('ignores stop words when tokenizing JD', () => {
      const request: TailorRequest = {
        jobDescription:
          'We are looking for a very experienced React developer with excellent AWS skills',
        resume: makeResume(),
      };

      const result = engine.match(request, 5);

      // 'react' and 'aws' should match — stop words like 'very', 'a', 'for' ignored
      expect(result.filteredHardSkills).toContain('react');
      expect(result.filteredHardSkills).toContain('aws');
    });

    it('handles punctuation in JD', () => {
      const request: TailorRequest = {
        jobDescription: 'Need: React, AWS, and TypeScript! (required)',
        resume: makeResume(),
      };

      const result = engine.match(request, 5);
      expect(result.filteredHardSkills).toContain('react');
      expect(result.filteredHardSkills).toContain('aws');
    });
  });
});
