import { getPool } from '../utils/db';
import { logger } from '../utils/logger';
import { RUBRIC_DIMENSIONS, type RubricDimension, type RubricScores } from '../types/Prompt';

/**
 * Outcome Analytics — spec §29.2, §10.7, T3.5.
 *
 * Queries `outcome_signals` (anonymized, aggregate-only — no user_id by
 * design, §10.7) to find rubric dimensions that under-perform on real
 * outcomes. Returns all 8 dimensions with their average score when the
 * outcome was 'worked' vs 'didnt_work', so the reader can judge which
 * are materially lower.
 */

export interface DimensionStats {
  dimension: RubricDimension;
  avgScoreWhenWorked: number;
  avgScoreWhenFailed: number;
  failureShare: number;
  n: number;
}

/**
 * For each rubric dimension, compare average scores across 'worked' vs
 * 'didnt_work' outcome rows. Returns all 8 dimensions with numbers.
 * `failureShare` = the dimension's share of the total failed-average gap
 * (how much this dimension contributes to the "didn't work" difference).
 */
export async function underperformingDimensions(): Promise<DimensionStats[]> {
  try {
    const pool = getPool();
    // Fetch all rows with rubric_scores (both worked and didn't_work).
    const res = await pool.query(
      `select feedback, rubric_scores from outcome_signals
       where rubric_scores is not null
         and feedback in ('worked','didnt_work')`,
      []
    );

    const workedScores: Record<string, number[]> = {};
    const failedScores: Record<string, number[]> = {};

    for (const row of res.rows) {
      const feedback = row.feedback as string;
      const scores = typeof row.rubric_scores === 'string'
        ? JSON.parse(row.rubric_scores) as Partial<RubricScores>
        : row.rubric_scores as Partial<RubricScores>;
      if (!scores) continue;

      for (const dim of RUBRIC_DIMENSIONS) {
        const score = scores[dim];
        if (score !== undefined) {
          if (feedback === 'worked') {
            (workedScores[dim] ??= []).push(score);
          } else {
            (failedScores[dim] ??= []).push(score);
          }
        }
      }
    }

    const totalGap = RUBRIC_DIMENSIONS.reduce((sum, dim) => {
      const avgW = avg(workedScores[dim] ?? []);
      const avgF = avg(failedScores[dim] ?? []);
      return sum + Math.max(0, avgW - avgF);
    }, 0);

    return RUBRIC_DIMENSIONS.map((dim) => {
      const avgW = avg(workedScores[dim] ?? []);
      const avgF = avg(failedScores[dim] ?? []);
      const gap = Math.max(0, avgW - avgF);
      return {
        dimension: dim,
        avgScoreWhenWorked: avgW,
        avgScoreWhenFailed: avgF,
        failureShare: totalGap > 0 ? gap / totalGap : 0,
        n: (workedScores[dim] ?? []).length + (failedScores[dim] ?? []).length,
      };
    });
  } catch (error) {
    logger.warn({
      type: 'analytics:outcomes_skipped',
      reason: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}