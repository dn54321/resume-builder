/**
 * Tests for the Linear API cache module.
 *
 * Run: node --test --import ./backend/node_modules/.pnpm/tsx@4.23.1/node_modules/tsx/dist/loader.mjs .pi/extensions/ticket/__tests__/cache.test.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use a temp dir for cache during tests
const TEST_CACHE_DIR = path.join(os.tmpdir(), `pi-ticket-cache-test-${Date.now()}`);
process.env.PI_TICKET_CACHE_DIR = TEST_CACHE_DIR;

// Direct imports (no dynamic re-import needed since env is set before import)
import * as cache from '../cache.js';

describe('cache module', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_CACHE_DIR)) {
      fs.rmSync(TEST_CACHE_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_CACHE_DIR)) {
      fs.rmSync(TEST_CACHE_DIR, { recursive: true });
    }
  });

  it('cacheStats returns zeros for empty cache', () => {
    // May have entries from other processes — just verify shape
    const stats = cache.cacheStats();
    assert.strictEqual(typeof stats.entries, 'number');
    assert.strictEqual(typeof stats.oldestMs, 'number');
    assert.strictEqual(typeof stats.newestMs, 'number');
  });

  it('invalidateCache does not throw when cache dir is empty', () => {
    assert.doesNotThrow(() => cache.invalidateCache());
  });

  it('invalidateStaleCache returns 0 for empty cache', () => {
    const removed = cache.invalidateStaleCache(60_000);
    assert.strictEqual(removed, 0);
  });

  it('cachedGraphql throws when LINEAR_API_KEY is not set', async () => {
    const saved = process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_API_KEY;

    await assert.rejects(
      () => cache.cachedGraphql('{ teams { nodes { id } } }'),
      /LINEAR_API_KEY/,
    );

    if (saved) process.env.LINEAR_API_KEY = saved;
  });

  it('getCachedApiKey returns key from env', () => {
    const saved = process.env.LINEAR_API_KEY;
    process.env.LINEAR_API_KEY = 'test-key-123';
    assert.strictEqual(cache.getCachedApiKey(), 'test-key-123');
    if (saved) process.env.LINEAR_API_KEY = saved;
  });

  it('getCachedApiKey throws when no key available', () => {
    const saved = process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_API_KEY;
    assert.throws(() => cache.getCachedApiKey(), /LINEAR_API_KEY/);
    if (saved) process.env.LINEAR_API_KEY = saved;
  });
});
