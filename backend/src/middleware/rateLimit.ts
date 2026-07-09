import type { Context, Next } from 'hono';
import { config } from '../config/env';
import { getPool } from '../utils/db';
import { logger } from '../utils/logger';
import type { AppEnv } from '../types/Http';

/**
 * Per-user rate limiting — spec §23.4, §16, T3.2.
 *
 * Fixed-window counter in Postgres (holds across Lambda instances): upsert-
 * increment on the current minute window; deny with 429 when count exceeds
 * RATE_LIMIT_REQUESTS_PER_MINUTE. Falls back to in-memory token-bucket on DB
 * error (availability over strictness — limits are a cost/abuse control, not
 * a security boundary).
 *
 * Note: user_id is `text` (dev-bypass ids are not uuids).
 */

// ---- In-memory fallback (kept from v1 — used when Postgres is unavailable) ----
interface Bucket {
  tokens: number;
  lastRefill: number;
}
const buckets = new Map<string, Bucket>();

export function resetBuckets(): void {
  buckets.clear();
}

/** Truncate a Date to the current minute (the fixed-window boundary). */
function windowStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000);
}

export async function rateLimitMiddleware(c: Context<AppEnv>, next: Next) {
  const userId = c.get('userId');
  const key = userId ?? c.req.header('x-forwarded-for') ?? 'anonymous';
  const limit = config.RATE_LIMIT_REQUESTS_PER_MINUTE;

  try {
    // Postgres fixed-window counter: upsert-increment on the current minute.
    const pool = getPool();
    const res = await pool.query(
      `insert into rate_limits (user_id, window_start, count)
       values ($1, $2, 1)
       on conflict (user_id, window_start) do update set count = rate_limits.count + 1
       returning count`,
      [key, windowStart(new Date())]
    );
    const count = Number(res.rows[0]?.count ?? 0);
    if (count > limit) {
      return c.json({ error: 'rate limit exceeded — try again shortly' }, 429);
    }
    return next();
  } catch (error) {
    // DB error → fall back to in-memory token bucket (availability over strictness).
    logger.warn({
      type: 'ratelimit:db_fallback',
      key,
      reason: error instanceof Error ? error.message : String(error),
    });
    return inMemoryRateLimit(c, key, limit, next);
  }
}

/** In-memory token-bucket fallback (from v1). */
function inMemoryRateLimit(c: Context<AppEnv>, key: string, capacity: number, next: Next) {
  const refillPerMs = capacity / 60_000;
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: capacity, lastRefill: now };
  bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.lastRefill) * refillPerMs);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return c.json({ error: 'rate limit exceeded — try again shortly' }, 429);
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return next();
}
