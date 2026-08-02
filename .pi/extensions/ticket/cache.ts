/**
 * Linear API cache — eliminates redundant API calls across server restarts.
 *
 * All ticket/team/state data fetched from Linear is cached to disk with a
 * configurable TTL. On restart, cached data is used instead of re-fetching,
 * avoiding rate limit exhaustion.
 *
 * Cache invalidation:
 *   - Default TTL: 15 minutes (stale data is refreshed in background)
 *   - Explicit refresh: pass `forceRefresh: true` to bypass cache
 *   - Cache is keyed by query + variables hash
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// ─── Config ──────────────────────────────────────────────────────────

const CACHE_DIR = path.join(
  process.env.PI_TICKET_CACHE_DIR ??
    path.join(getTicketDir(), 'cache'),
);

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ─── Helpers ─────────────────────────────────────────────────────────

function getTicketDir(): string {
  // Try to find repo root, fall back to cwd
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, '.pi', 'tickets');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback
  dir = path.join(process.cwd(), '.pi', 'tickets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function hashQuery(query: string, variables?: Record<string, unknown>): string {
  const input = JSON.stringify({ query, variables: variables ?? {} });
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
  ttl: number;
}

function ensureCacheDir(): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePath(key: string): string {
  return path.join(CACHE_DIR, `${key}.json`);
}

function readCache(key: string): CacheEntry | null {
  const p = cachePath(key);
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf-8');
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function writeCache(key: string, entry: CacheEntry): void {
  ensureCacheDir();
  fs.writeFileSync(cachePath(key), JSON.stringify(entry, null, 2), 'utf-8');
}

function isExpired(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt > entry.ttl;
}

// ─── Public API ──────────────────────────────────────────────────────

export interface CacheOptions {
  /** Override default TTL (milliseconds). */
  ttl?: number;
  /** Force a fresh fetch, ignoring any cached data. */
  forceRefresh?: boolean;
}

/**
 * Fetch from Linear with disk caching.
 *
 * Uses the same shape as the raw fetch: takes a GraphQL query string and
 * optional variables, returns the parsed JSON data. Caches the entire
 * response keyed by query+variables hash.
 */
export async function cachedGraphql(
  query: string,
  variables?: Record<string, unknown>,
  options: CacheOptions = {},
): Promise<any> {
  const key = hashQuery(query, variables);
  const ttl = options.ttl ?? DEFAULT_TTL_MS;

  // Return cached data if fresh
  if (!options.forceRefresh) {
    const cached = readCache(key);
    if (cached && !isExpired(cached)) {
      return cached.data;
    }
  }

  // Fetch fresh data
  const apiKey = getLinearApiKey();
  const resp = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await resp.json() as any;
  if (json.errors) {
    throw new Error(`Linear API error: ${JSON.stringify(json.errors)}`);
  }

  // Cache the result
  writeCache(key, {
    data: json.data,
    fetchedAt: Date.now(),
    ttl,
  });

  return json.data;
}

/**
 * Get a cached value or fetch it, with stale-while-revalidate behavior.
 *
 * Always returns cached data immediately if available (even if expired),
 * then triggers a background refresh. Useful for startup where we want
 * fast loads but still get fresh data eventually.
 */
export function cachedGraphqlStaleWhileRevalidate(
  query: string,
  variables?: Record<string, unknown>,
  options: CacheOptions = {},
  onRefresh?: (data: any) => void,
): { data: any; stale: boolean } {
  const key = hashQuery(query, variables);
  const ttl = options.ttl ?? DEFAULT_TTL_MS;

  const cached = readCache(key);
  const hasFresh = cached && !isExpired(cached);

  if (cached) {
    // If stale, trigger background refresh
    if (!hasFresh) {
      cachedGraphql(query, variables, { ...options, forceRefresh: true })
        .then((freshData) => onRefresh?.(freshData))
        .catch(() => { /* background refresh failure is non-fatal */ });
    }
    return { data: cached.data, stale: !hasFresh };
  }

  // No cache at all — must fetch synchronously
  // (We can't make this async since we need the return value)
  throw new Error('No cached data available — use cachedGraphql for initial fetch');
}

/**
 * Invalidate all cached entries.
 */
export function invalidateCache(): void {
  if (!fs.existsSync(CACHE_DIR)) return;
  for (const file of fs.readdirSync(CACHE_DIR)) {
    if (file.endsWith('.json')) {
      fs.unlinkSync(path.join(CACHE_DIR, file));
    }
  }
}

/**
 * Invalidate cache entries older than the given age (milliseconds).
 */
export function invalidateStaleCache(maxAgeMs: number = DEFAULT_TTL_MS): number {
  if (!fs.existsSync(CACHE_DIR)) return 0;
  let removed = 0;
  const cutoff = Date.now() - maxAgeMs;
  for (const file of fs.readdirSync(CACHE_DIR)) {
    if (!file.endsWith('.json')) continue;
    const p = path.join(CACHE_DIR, file);
    try {
      const entry = JSON.parse(fs.readFileSync(p, 'utf-8')) as CacheEntry;
      if (entry.fetchedAt < cutoff) {
        fs.unlinkSync(p);
        removed++;
      }
    } catch {
      // Corrupt cache file — remove it
      fs.unlinkSync(p);
      removed++;
    }
  }
  return removed;
}

/**
 * Get cache statistics.
 */
export function cacheStats(): { entries: number; oldestMs: number; newestMs: number } {
  if (!fs.existsSync(CACHE_DIR)) return { entries: 0, oldestMs: 0, newestMs: 0 };
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  let oldest = Infinity;
  let newest = 0;
  for (const file of files) {
    try {
      const entry = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf-8')) as CacheEntry;
      if (entry.fetchedAt < oldest) oldest = entry.fetchedAt;
      if (entry.fetchedAt > newest) newest = entry.fetchedAt;
    } catch { /* skip corrupt */ }
  }
  return {
    entries: files.length,
    oldestMs: oldest === Infinity ? 0 : Date.now() - oldest,
    newestMs: newest === 0 ? 0 : Date.now() - newest,
  };
}

// ─── Internal ────────────────────────────────────────────────────────

function getLinearApiKey(): string {
  const envKey = process.env.LINEAR_API_KEY;
  if (envKey) return envKey;

  // Try reading from pi-linear credentials
  try {
    const os = require('node:os');
    const credPath = path.join(os.homedir(), '.pi', 'agent', 'extensions', 'linear', 'credentials.json');
    if (fs.existsSync(credPath)) {
      const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
      const active = creds.activeWorkspace;
      if (active && creds.workspaces?.[active]?.apiKey) {
        return creds.workspaces[active].apiKey;
      }
      const first = Object.keys(creds.workspaces ?? {})[0];
      if (first) return creds.workspaces[first].apiKey;
    }
  } catch {
    // ignore
  }
  throw new Error('No LINEAR_API_KEY found. Set LINEAR_API_KEY env var or run /linear-auth.');
}

export function getCachedApiKey(): string {
  return getLinearApiKey();
}
