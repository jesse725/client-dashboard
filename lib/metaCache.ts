import { getDb } from './db';
import { metaErrorMessage } from './meta';

// Meta calls are the flaky part of this app: expired tokens, rate limits and
// timeouts all just throw. Every Client Success load used to make two fresh calls
// per client (plus more for each client dashboard opened), which is also what
// pushes an app over Meta's rate limits in the first place — and when a call did
// fail, the page swapped the real spend for a manual/estimated figure.
//
// So each answer is kept: reused for `ttlMs` (no repeat calls), and if a refresh
// fails, the last good one is returned marked `stale` (with the reason) instead of
// nothing.

export interface Cached<T> {
  value: T;
  fetchedAt: number; // epoch ms of the Meta response this came from
  stale: boolean; // a refresh failed; this is the previous good answer
  error: string | null; // why the refresh failed (only when stale)
}

export const META_TTL_MS = 10 * 60 * 1000;
// A stale figure is better than an estimate for a while, not forever.
const MAX_STALE_MS = 3 * 24 * 60 * 60 * 1000;

// Concurrent requests for the same thing (a tracker load and a client dashboard
// open at once) share one Meta call.
const inFlight = new Map<string, Promise<Cached<any>>>();

export async function cachedMeta<T>(
  key: string,
  opts: { ttlMs?: number; refresh?: boolean },
  load: () => Promise<T>
): Promise<Cached<T>> {
  const db = getDb();
  const row = db.prepare('SELECT payload, fetched_at FROM meta_cache WHERE key = ?').get(key) as { payload: string; fetched_at: number } | undefined;
  const now = Date.now();
  const fresh = row && !opts.refresh && now - row.fetched_at < (opts.ttlMs ?? META_TTL_MS);
  if (row && fresh) return { value: JSON.parse(row.payload) as T, fetchedAt: row.fetched_at, stale: false, error: null };

  const pending = inFlight.get(key);
  if (pending) return pending;

  const run = (async (): Promise<Cached<T>> => {
    try {
      const value = await load();
      const fetchedAt = Date.now();
      db.prepare(`
        INSERT INTO meta_cache (key, payload, fetched_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at
      `).run(key, JSON.stringify(value), fetchedAt);
      return { value, fetchedAt, stale: false, error: null };
    } catch (e) {
      if (row && now - row.fetched_at < MAX_STALE_MS) {
        return { value: JSON.parse(row.payload) as T, fetchedAt: row.fetched_at, stale: true, error: metaErrorMessage(e) };
      }
      throw e;
    }
  })().finally(() => { inFlight.delete(key); });

  inFlight.set(key, run);
  return run;
}

// "3 minutes ago" / "5 hours ago" / "2 days ago"
export function ageLabel(epochMs: number, now: number = Date.now()): string {
  const mins = Math.max(0, Math.round((now - epochMs) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}
