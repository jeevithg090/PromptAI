/**
 * Token buckets keyed by caller or IP. State lives in this process, so with
 * N instances a client gets up to N times the rate; that is fine for one or
 * two instances, and the bucket moves to Postgres or Redis if that changes.
 */
export type Bucket = { capacity: number; perSecond: number };

/** Above this many keys, full buckets (idle callers) are dropped. */
const PRUNE_AT = 50_000;

export function tokenBuckets(cfg: Bucket, now: () => number = Date.now) {
  const state = new Map<string, { tokens: number; at: number }>();
  const refill = (s: { tokens: number; at: number }, t: number) => Math.min(cfg.capacity, s.tokens + ((t - s.at) / 1000) * cfg.perSecond);

  return {
    /** Takes one token. Returns 0 when allowed, else the whole seconds to wait. */
    take(key: string): number {
      const t = now();
      const s = state.get(key) ?? { tokens: cfg.capacity, at: t };
      const tokens = refill(s, t);
      if (tokens < 1) {
        state.set(key, { tokens, at: t });
        return Math.max(1, Math.ceil((1 - tokens) / cfg.perSecond));
      }
      state.set(key, { tokens: tokens - 1, at: t });
      if (state.size > PRUNE_AT) for (const [k, v] of state) if (refill(v, t) >= cfg.capacity) state.delete(k);
      return 0;
    },
  };
}
