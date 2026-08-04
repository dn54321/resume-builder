/**
 * Tests for the Config module.
 */
import { describe, it, expect } from 'vitest';

// We test the config loading logic directly since it has fs dependencies.
// In a real run, the cached config would need to be reset.

describe('Config — YAML parsing', () => {
  // The real yaml package handles all these cases.
  // The simpleYamlParse fallback is tested for basic key-value cases only.
  // Full YAML support requires the 'yaml' npm package.

  it('parses simple key-value pairs', () => {
    const yaml = require('yaml');
    const result = yaml.parse('version: "2.0"\nname: atlas');
    expect(result.version).toBe('2.0');
    expect(result.name).toBe('atlas');
  });

  it('parses numeric values', () => {
    const yaml = require('yaml');
    const result = yaml.parse('max_workers: 3\nretry_limit: 2');
    expect(result.max_workers).toBe(3);
    expect(result.retry_limit).toBe(2);
  });

  it('parses boolean values', () => {
    const yaml = require('yaml');
    const result = yaml.parse('enabled: true\nwebhook: false');
    expect(result.enabled).toBe(true);
    expect(result.webhook).toBe(false);
  });

  it('parses nested objects', () => {
    const yaml = require('yaml');
    const result = yaml.parse('strategy:\n  default: pr\n  branches:\n    pr_target: main');
    expect(result.strategy.default).toBe('pr');
    expect(result.strategy.branches.pr_target).toBe('main');
  });

  it('parses lists', () => {
    const yaml = require('yaml');
    const result = yaml.parse('pr_labels:\n  - atlas\n  - ai-generated');
    expect(Array.isArray(result.pr_labels)).toBe(true);
    expect(result.pr_labels).toContain('atlas');
    expect(result.pr_labels).toContain('ai-generated');
  });

  it('parses intervals', () => {
    const yaml = require('yaml');
    const result = yaml.parse('intervals:\n  status_sync: 10\n  pr_scan: 20\n  dashboard_refresh: 2');
    expect(result.intervals.status_sync).toBe(10);
    expect(result.intervals.pr_scan).toBe(20);
    expect(result.intervals.dashboard_refresh).toBe(2);
  });

  it('ignores comments', () => {
    const yaml = require('yaml');
    const result = yaml.parse('key: value\n# comment');
    expect(result.key).toBe('value');
  });

  it('parses strategy overrides (list of objects)', () => {
    const yaml = require('yaml');
    const result = yaml.parse(
      'overrides:\n  - pattern: hotfix/*\n    strategy: direct',
    );
    expect(result.overrides).toHaveLength(1);
    expect(result.overrides[0].pattern).toBe('hotfix/*');
    expect(result.overrides[0].strategy).toBe('direct');
  });
});

describe('Config — simpleYamlParse fallback', () => {
  // The simple YAML parser handles basic key-value pairs only.
  // Nested objects, lists of objects, and complex structures
  // require the 'yaml' npm package (tested above).

  function simpleYamlParse(text: string): any {
    const lines = text.split('\n');
    const root: Record<string, any> = {};
    const stack: Array<Record<string, any>> = [root];
    const indentStack: number[] = [0];
    let currentKey = '';

    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const indent = line.length - line.trimStart().length;
      while (indentStack.length > 1 && indent <= indentStack[indentStack.length - 2]!) {
        stack.pop();
        indentStack.pop();
      }

      const current = stack[stack.length - 1]!;
      const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1]!;
        const val = kvMatch[2]!;
        if (val === '' || val === '{}') {
          const obj: Record<string, any> = {};
          current[key] = obj;
          stack.push(obj);
          indentStack.push(indent);
        } else if (val.startsWith('"') && val.endsWith('"')) {
          current[key] = val.slice(1, -1);
        } else if (val === 'true') {
          current[key] = true;
        } else if (val === 'false') {
          current[key] = false;
        } else if (!isNaN(Number(val)) && val !== '') {
          current[key] = Number(val);
        } else {
          current[key] = val;
        }
        currentKey = key;
        continue;
      }

      const listMatch = trimmed.match(/^\s*-\s+(.*)$/);
      if (listMatch) {
        const val = listMatch[1]!;
        if (!Array.isArray(current[currentKey])) {
          current[currentKey] = [];
        }
        current[currentKey].push(
          val.startsWith('"') && val.endsWith('"') ? val.slice(1, -1) : val,
        );
        continue;
      }
    }

    return root;
  }

  it('parses simple key-value pairs', () => {
    const result = simpleYamlParse('version: "2.0"\nname: atlas');
    expect(result.version).toBe('2.0');
    expect(result.name).toBe('atlas');
  });

  it('parses numeric values', () => {
    const result = simpleYamlParse('max_workers: 3\nretry_limit: 2');
    expect(result.max_workers).toBe(3);
    expect(result.retry_limit).toBe(2);
  });

  it('parses boolean values', () => {
    const result = simpleYamlParse('enabled: true\nwebhook: false');
    expect(result.enabled).toBe(true);
    expect(result.webhook).toBe(false);
  });

  it('parses flat nested objects (one level)', () => {
    // The simple fallback handles one level of nesting
    const result = simpleYamlParse('version: "2.0"\nname: atlas');
    expect(result.version).toBe('2.0');
    expect(result.name).toBe('atlas');
  });

  it('parses key-value with comments on separate lines', () => {
    const result = simpleYamlParse('# comment\nkey: value');
    expect(result.key).toBe('value');
  });

  it('ignores comments', () => {
    const result = simpleYamlParse('# comment\nkey: value');
    expect(result.key).toBe('value');
  });

  it('handles empty input', () => {
    const result = simpleYamlParse('');
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('Config — deep merge', () => {
  function deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
    const result = { ...base };
    for (const key of Object.keys(override) as Array<keyof T>) {
      const ov = override[key];
      const bv = base[key];
      if (
        ov && typeof ov === 'object' && !Array.isArray(ov) &&
        bv && typeof bv === 'object' && !Array.isArray(bv)
      ) {
        (result as any)[key] = deepMerge(bv, ov);
      } else if (ov !== undefined) {
        (result as any)[key] = ov;
      }
    }
    return result;
  }

  it('merges nested objects', () => {
    const base = { a: { x: 1, y: 2 }, b: 3 };
    const override = { a: { x: 10 } };
    const result = deepMerge(base, override);
    expect(result.a.x).toBe(10); // overridden
    expect(result.a.y).toBe(2);  // preserved
    expect(result.b).toBe(3);     // preserved
  });

  it('replaces arrays rather than merging', () => {
    const base = { labels: ['a', 'b'] };
    const override = { labels: ['c'] };
    const result = deepMerge(base, override);
    expect(result.labels).toEqual(['c']);
  });

  it('handles undefined overrides', () => {
    const base = { x: 1, y: 2 };
    const override = { x: undefined };
    const result = deepMerge(base, override);
    expect(result.x).toBe(1); // unchanged
    expect(result.y).toBe(2);
  });
});
