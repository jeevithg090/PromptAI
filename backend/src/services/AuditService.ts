import { getPool } from '../utils/db';
import { logger } from '../utils/logger';

/**
 * Immutable audit logging — spec §27.1, §22.3, §31.4 Step 21 (T3.1).
 *
 * Every significant event (pipeline transitions, safety decisions, auth
 * failures, admin-relevant actions) lands in the append-only `audit_log`
 * table so an engineer can reconstruct any session end-to-end from stored
 * data alone (exposed via GET /sessions/:id/trace).
 *
 * Writes are BEST-EFFORT: an audit outage must never fail a user request
 * (mirrors the pattern in SessionService.ts). Call sites use fire-and-forget
 * `void audit(...)` so latency is unaffected.
 *
 * PRIVACY (§19.1): `detail` is metadata only — never prompt content, idea
 * text, clarification answers, or memory statements. A runtime guard strips
 * any detail value longer than 500 chars as a defense against accidental
 * content logging.
 */

/** Maximum allowed length for any string value in `detail`. */
const MAX_DETAIL_VALUE_LENGTH = 500;

export interface AuditEvent {
  /** User id, admin id, or 'anonymous'/'system' for system events. */
  actor: string;
  /** Event category, e.g. 'pipeline:transition', 'safety:decision', 'auth:rejected'. */
  action: string;
  /** Outcome of the event. */
  status: 'success' | 'failure' | 'blocked';
  /** Session id (uuid) when the event belongs to a pipeline session. */
  sessionId?: string;
  /** Metadata only — counts, durations, categories. Never content. */
  detail?: Record<string, unknown>;
}

/**
 * Write an audit event to the append-only `audit_log` table.
 * Never throws — DB failures are logged and swallowed (§27.1).
 * Call with `void audit(...)` for fire-and-forget semantics.
 */
export async function audit(event: AuditEvent): Promise<void> {
  try {
    const detail = event.detail ? sanitizeDetail(event.detail) : undefined;
    await getPool().query(
      `insert into audit_log (actor, action, status, session_id, detail)
       values ($1, $2, $3, $4, $5)`,
      [
        event.actor,
        event.action,
        event.status,
        event.sessionId ?? null,
        detail ? JSON.stringify(detail) : null,
      ]
    );
  } catch (error) {
    // An audit outage must never fail a user request.
    logger.warn({
      type: 'audit:write_skipped',
      action: event.action,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Sanitize detail values — strip any string longer than the limit, as a
 * defense against accidental content logging (§19.1). Logs a warning for
 * each stripped key so the leak is visible without exposing the value.
 */
function sanitizeDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (typeof value === 'string' && value.length > MAX_DETAIL_VALUE_LENGTH) {
      logger.warn({
        type: 'audit:detail_stripped',
        key,
        length: value.length,
        reason: 'value exceeds max length — possible content leak',
      });
      continue; // strip the key entirely — never store truncated content
    }
    sanitized[key] = value;
  }
  return sanitized;
}
