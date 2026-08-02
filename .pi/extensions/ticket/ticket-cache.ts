/**
 * Ticket data cache — persists fetched TicketInfo objects to disk
 * so buildGraph can restore the full graph without hitting Linear API.
 *
 * Separate from the GraphQL response cache (cache.ts). This caches
 * processed TicketInfo structs keyed by identifier.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TicketInfo } from './types';

const CACHE_FILE = path.join(
  process.env.PI_TICKET_CACHE_DIR ??
    path.join(getTicketDir(), 'cache'),
  'tickets.json',
);

function getTicketDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, '.pi', 'tickets');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dir = path.join(process.cwd(), '.pi', 'tickets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureDir(): void {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
}

interface TicketCache {
  /** Tickets keyed by identifier (e.g. "RES-29"). */
  tickets: Record<string, TicketInfo>;
  /** Children map: parentId → child identifiers. */
  children: Record<string, string[]>;
  /** Last update timestamp. */
  updatedAt: string;
}

let cache: TicketCache | null = null;

function load(): TicketCache {
  if (cache) return cache;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) as TicketCache;
      return cache;
    }
  } catch { /* corrupt or missing */ }
  cache = { tickets: {}, children: {}, updatedAt: new Date(0).toISOString() };
  return cache;
}

function save(): void {
  if (!cache) return;
  ensureDir();
  cache.updatedAt = new Date().toISOString();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

/** Store a fetched ticket in the cache. */
export function cacheTicket(ticket: TicketInfo): void {
  const c = load();
  c.tickets[ticket.identifier] = { ...ticket };

  // Index children
  if (ticket.parentId) {
    if (!c.children[ticket.parentId]) {
      c.children[ticket.parentId] = [];
    }
    if (!c.children[ticket.parentId].includes(ticket.identifier)) {
      c.children[ticket.parentId].push(ticket.identifier);
    }
  }

  save();
}

/** Store multiple tickets at once. */
export function cacheTickets(tickets: TicketInfo[]): void {
  for (const t of tickets) {
    cacheTicket(t);
  }
}

/** Get a cached ticket by identifier. */
export function getCachedTicket(identifier: string): TicketInfo | null {
  const c = load();
  return c.tickets[identifier] ?? null;
}

/** Get children identifiers for a parent ticket. */
export function getCachedChildren(parentId: string): string[] {
  const c = load();
  return c.children[parentId] ?? [];
}

/** Check if we have a ticket cached. */
export function hasCachedTicket(identifier: string): boolean {
  return load().tickets[identifier] !== undefined;
}

/** Get all cached ticket identifiers. */
export function getAllCachedIds(): string[] {
  return Object.keys(load().tickets);
}

/** Get the cache age in milliseconds. */
export function cacheAge(): number {
  const c = load();
  return Date.now() - new Date(c.updatedAt).getTime();
}

/** Clear the ticket cache. */
export function clearTicketCache(): void {
  cache = { tickets: {}, children: {}, updatedAt: new Date().toISOString() };
  try { fs.unlinkSync(CACHE_FILE); } catch { /* doesn't exist */ }
}

/** Get cache stats. */
export function ticketCacheStats(): { tickets: number; children: number; ageMs: number } {
  const c = load();
  return {
    tickets: Object.keys(c.tickets).length,
    children: Object.keys(c.children).length,
    ageMs: cacheAge(),
  };
}
