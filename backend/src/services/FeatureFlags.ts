/**
 * Feature flags / kill-switches read from the DB at request time and cached
 * in-memory for 60s (§21.2, T7.5). Managed by the admin control plane.
 *
 * Consumer code checks flags via `isEnabled(key)` — never imports the DB
 * directly so the DB adapter can be swapped without touching every callsite.
 */
import { getPool } from '../utils/db';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: boolean;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
let allCache: { entries: Record<string, boolean>; fetchedAt: number } | null = null;

async function fetchAll(): Promise<Record<string, boolean>> {
  try {
    const pool = getPool();
    const res = await pool.query('select key, value from feature_flags');
    const map: Record<string, boolean> = {};
    for (const row of res.rows) {
      map[row.key] = row.value === true || row.value === 'true';
    }
    return map;
  } catch {
    // No DB available — default all flags to enabled (fail-open).
    return {};
  }
}

function isCacheValid(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < CACHE_TTL_MS;
}

/**
 * Check if a single feature flag is enabled.
 * Flags default to `true` if not found (fail-open — only explicit kill-switches disable).
 */
export async function isEnabled(key: string): Promise<boolean> {
  const cached = cache.get(key);
  if (cached && isCacheValid(cached.fetchedAt)) {
    return cached.value;
  }
  const all = await fetchAll();
  const now = Date.now();
  for (const [k, v] of Object.entries(all)) {
    cache.set(k, { value: v, fetchedAt: now });
  }
  return all[key] ?? true;
}

/**
 * Warm the cache on startup (call from server init).
 */
export async function warmCache(): Promise<void> {
  const all = await fetchAll();
  const now = Date.now();
  for (const [k, v] of Object.entries(all)) {
    cache.set(k, { value: v, fetchedAt: now });
  }
  allCache = { entries: all, fetchedAt: now };
}

/**
 * Invalidate the cache (call from a webhook/route if flags are updated externally).
 */
export function invalidateCache(): void {
  cache.clear();
  allCache = null;
}
