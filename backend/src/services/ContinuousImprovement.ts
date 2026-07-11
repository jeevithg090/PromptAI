import { getPool } from '../utils/db';
import { logger } from '../utils/logger';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { RUBRIC_DIMENSIONS, type RubricDimension } from '../types/Prompt';

export interface ImprovementSuggestion {
  type: 'tune_strategy_profile' | 'update_mpkb' | 'flag_moderation';
  taskType?: string;
  platformId?: string;
  dimension?: string;
  currentAvgScore: number;
  targetAvgScore: number;
  rationale: string;
  n: number;
}

const STRATEGY_PROFILES_PATH = resolve(__dirname, '../../../config/strategy-profiles.json');

export async function analyzeImprovements(): Promise<ImprovementSuggestion[]> {
  try {
    const pool = getPool();
    const res = await pool.query(
      `select task_type, platform_id, feedback, rubric_scores
       from outcome_signals
       where created_at >= now() - interval '90 days'
         and rubric_scores is not null
         and feedback in ('worked','didnt_work')`,
      []
    );

    const groups = new Map<string, {
      taskType: string;
      platformId: string | null;
      rows: Array<{ feedback: string; scores: Partial<Record<RubricDimension, number>> }>;
    }>();

    for (const row of res.rows) {
      const key = `${row.task_type}|${row.platform_id ?? ''}`;
      if (!groups.has(key)) {
        groups.set(key, { taskType: row.task_type, platformId: row.platform_id, rows: [] });
      }
      const scores = typeof row.rubric_scores === 'string'
        ? JSON.parse(row.rubric_scores)
        : (row.rubric_scores ?? {});
      groups.get(key)!.rows.push({ feedback: row.feedback, scores });
    }

    const suggestions: ImprovementSuggestion[] = [];

    for (const [, group] of groups) {
      const total = group.rows.length;
      if (total < 10) continue;

      const didntWork = group.rows.filter(r => r.feedback === 'didnt_work');
      const didntWorkShare = didntWork.length / total;
      if (didntWorkShare <= 0.3) continue;

      suggestions.push({
        type: 'flag_moderation',
        taskType: group.taskType,
        platformId: group.platformId ?? undefined,
        rationale: `${group.taskType} on ${group.platformId ?? 'any'} has ${(didntWorkShare * 100).toFixed(0)}% failure rate (n=${total})`,
        currentAvgScore: 0,
        targetAvgScore: 0,
        n: total,
      });

      for (const dim of RUBRIC_DIMENSIONS) {
        const scores = didntWork
          .map(r => r.scores[dim])
          .filter((s): s is number => s !== undefined);
        if (scores.length === 0) continue;
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        if (avgScore <= 1.5) {
          suggestions.push({
            type: 'tune_strategy_profile',
            taskType: group.taskType,
            platformId: group.platformId ?? undefined,
            dimension: dim,
            currentAvgScore: avgScore,
            targetAvgScore: 2.0,
            rationale: `Dimension '${dim}' averages ${avgScore.toFixed(2)} in failing ${group.taskType} outcomes — below 1.5 threshold`,
            n: scores.length,
          });
        }
      }
    }

    return suggestions;
  } catch (error) {
    logger.warn({
      type: 'improvement:analysis_skipped',
      reason: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export function autotuneStrategyProfile(
  taskType: string,
  dimension: string
): Record<string, unknown> {
  const raw = readFileSync(STRATEGY_PROFILES_PATH, 'utf-8');
  const profiles = JSON.parse(raw);
  const profile = profiles.profiles?.[taskType];
  if (!profile) {
    throw new Error(`Unknown task type '${taskType}' in strategy-profiles.json`);
  }

  const tuneNote = `[auto-tuned ${new Date().toISOString().slice(0, 10)}] Increase emphasis on '${dimension}' — underperforming in outcomes.`;
  profile.guidance = profile.guidance
    ? `${profile.guidance}\n\n${tuneNote}`
    : tuneNote;

  profile.autotune_log ??= [];
  profile.autotune_log.push({ dimension, tuned_at: new Date().toISOString() });

  logger.info({
    type: 'improvement:profile_tuned',
    taskType,
    dimension,
    note: tuneNote,
  });

  return profile;
}
