import { getPool } from '../utils/db';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import type { TransitionRecord } from './Supervisor';

/**
 * Token budget enforcement — spec §16, §22.4, §31.4 Step 22 (T3.2).
 *
 * Two layers:
 * 1. Monthly per-user budget — checked BEFORE any model call in runPipeline.
 *    Fail-open for availability: a DB outage or missing user row allows the
 *    request (budgets are a cost control, not a security boundary).
 * 2. Per-session token cap — checked inside the Supervisor after each agent
 *    step. Runaway-loop protection: if a session burns more than the cap,
 *    the pipeline halts with an error-level log (the alert hook, §22.4).
 */

export interface BudgetCheckResult {
  allowed: boolean;
  used: number;
  budget: number;
}

/**
 * Check the user's monthly token budget against usage this month.
 * Queries usage_events (sum of tokens_used this month) + app_users.monthly_token_budget.
 * Fail-open: DB errors or missing user rows → allowed=true (§22.4).
 */
export async function checkMonthlyBudget(userId: string): Promise<BudgetCheckResult> {
  try {
    const pool = getPool();
    // Sum tokens used this month.
    const usageRes = await pool.query(
      `select coalesce(sum(tokens_used), 0) as used from usage_events
       where user_id = $1 and created_at >= date_trunc('month', now())`,
      [userId]
    );
    const used = Number(usageRes.rows[0]?.used ?? 0);

    // Get the user's monthly budget.
    const userRes = await pool.query(
      `select monthly_token_budget from app_users where id = $1`,
      [userId]
    );
    if (userRes.rows.length === 0) {
      // No user row (dev-bypass users, missing rows) — fail-open.
      logger.warn({ type: 'budget:check_skipped', userId, reason: 'user row not found' });
      return { allowed: true, used, budget: 0 };
    }
    const budget = Number(userRes.rows[0]?.monthly_token_budget ?? 10000);
    return { allowed: used < budget, used, budget };
  } catch (error) {
    // DB error — fail-open for availability (§22.4).
    logger.warn({
      type: 'budget:check_skipped',
      userId,
      reason: error instanceof Error ? error.message : String(error),
    });
    return { allowed: true, used: 0, budget: 0 };
  }
}

/**
 * Check the per-session token cap against the trace so far.
 * Pure function — no DB, no LLM. Used by the Supervisor for runaway protection.
 */
export function checkSessionCap(trace: TransitionRecord[]): { exceeded: boolean; used: number; cap: number } {
  const cap = config.MAX_TOKENS_PER_SESSION;
  const used = trace.reduce((sum, t) => sum + (t.tokensUsed ?? 0), 0);
  return { exceeded: used > cap, used, cap };
}
