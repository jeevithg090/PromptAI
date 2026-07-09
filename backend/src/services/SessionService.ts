import { getPool } from '../utils/db';
import { logger } from '../utils/logger';
import type { PipelineContext } from '../types/Agent';
import type { PipelineState, TransitionRecord } from './Supervisor';

/**
 * Session persistence + usage metering — spec §18, §19.1, §10.7 (T2.12).
 *
 * PRIVACY: stores METADATA ONLY — final_state, strength score, rubric
 * sub-scores (numbers), refinement count, platform. NO prompt content, idea,
 * or clarification text is written here; content-at-rest encryption is T7.1
 * (E2EE with client keys), and until then the server stays content-stateless
 * (the clarify round-trip carries content client-side). usage_events records
 * per-step token counts with NO content (§19.1) for budgeting/analytics.
 *
 * Both operations are BEST-EFFORT: a persistence/metering failure (e.g. no DB
 * configured in local/test runs) is logged and swallowed — it must never fail
 * the user's draft.
 */
export async function persistSessionMetadata(context: PipelineContext, finalState: PipelineState): Promise<void> {
  try {
    const ev = context.finalDraft?.evaluation ?? context.evaluation;
    await getPool().query(
      `insert into sessions (id, user_id, project_id, platform_id, final_state, strength_score, rubric_scores, refinement_count)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do update set
         final_state = excluded.final_state,
         strength_score = excluded.strength_score,
         rubric_scores = excluded.rubric_scores,
         refinement_count = excluded.refinement_count`,
      [
        context.sessionId,
        context.userId,
        context.projectId ?? null,
        context.platform.platform_id,
        finalState,
        ev?.overallStrength ?? null,
        ev ? JSON.stringify(ev.scores) : null,
        context.finalDraft?.refinementCount ?? 0,
      ]
    );
    logger.info({ type: 'session:persisted', sessionId: context.sessionId, status: 'success' });
  } catch (error) {
    logger.warn({
      type: 'session:persist_skipped',
      sessionId: context.sessionId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function meterUsage(context: PipelineContext, trace: TransitionRecord[]): Promise<void> {
  const billable = trace.filter((t) => (t.tokensUsed ?? 0) > 0);
  if (billable.length === 0) return;
  try {
    const pool = getPool();
    // One row per pipeline step that spent tokens — no content (§19.1).
    for (const t of billable) {
      await pool.query(
        `insert into usage_events (user_id, session_id, pipeline_step, tokens_used) values ($1,$2,$3,$4)`,
        [context.userId, context.sessionId, t.agent, t.tokensUsed]
      );
    }
    logger.info({ type: 'usage:metered', sessionId: context.sessionId, steps: billable.length });
  } catch (error) {
    logger.warn({
      type: 'usage:meter_skipped',
      sessionId: context.sessionId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
