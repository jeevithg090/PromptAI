/**
 * In-memory pipeline-progress registry (F2.1). The Supervisor writes the
 * current state here on every transition; clients short-poll
 * GET /draft/:sessionId/status to show honest step labels instead of fake
 * rotating text. Memory-only (no DB) — this is a perceived-latency feature, not
 * a correctness one; across Lambda instances a miss just falls back to the
 * generic spinner (documented in the route). Entries expire after 10 minutes.
 */
interface ProgressEntry {
  userId: string;
  state: string;
  updatedAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const registry = new Map<string, ProgressEntry>();

function sweep(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, entry] of registry) {
    if (entry.updatedAt < cutoff) registry.delete(id);
  }
}

/** Record the current pipeline state for a session (fire-and-forget, no await). */
export function setProgress(sessionId: string, userId: string, state: string): void {
  if (!sessionId || !userId) return;
  registry.set(sessionId, { userId, state, updatedAt: Date.now() });
  if (registry.size > 500) sweep(); // opportunistic cleanup
}

/** Read progress for a session, enforcing ownership. Returns null on miss/expiry/mismatch. */
export function getProgress(sessionId: string, userId: string): { state: string; updatedAt: number } | null {
  const entry = registry.get(sessionId);
  if (!entry) return null;
  if (entry.updatedAt < Date.now() - TTL_MS) { registry.delete(sessionId); return null; }
  if (entry.userId !== userId) return null; // no cross-user leak
  return { state: entry.state, updatedAt: entry.updatedAt };
}

/** Test helper. */
export function _clearProgress(): void {
  registry.clear();
}
