import { z } from 'zod';

/**
 * Feedback types — spec §29.2, §10.7, T3.5.
 *
 * `outcome_signals` is anonymized and aggregate-only by design (§10.7):
 * no user_id, no session_id, no free-text prompt content. The `detail`
 * field is validated then dropped — there is no column for it in the
 * outcome_signals table (§10.7).
 */

export const feedbackSchema = z.object({
  session_id: z.string().uuid().optional(),
  task_type: z.string().min(1),
  platform_id: z.string().min(1),
  rubric_scores: z.record(z.string(), z.union([z.literal(1), z.literal(2), z.literal(3)])).optional(),
  edit_count: z.number().int().min(0).optional(),
  reused: z.boolean().optional(),
  outcome: z.enum(['worked', 'didnt_work', 'mixed']),
  /** Capped at 500 chars, validated, then dropped — no DB column for it (§10.7). */
  detail: z.string().max(500).optional(),
});

export type FeedbackBody = z.infer<typeof feedbackSchema>;

export const OUTCOMES = ['worked', 'didnt_work', 'mixed'] as const;
export type Outcome = (typeof OUTCOMES)[number];