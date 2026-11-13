/**
 * Outcome improvement analysis (§10.7, T7.9).
 * Aggregates outcome signals to flag under-performing strategy profiles
 * and stale MPKB categories.
 *
 * Usage: npm run analyze:outcomes
 */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const WORKED_RATE_FLOOR = 0.6;
const MIN_SAMPLES = 20;

const DIMENSION_TO_MPKB: Record<string, string> = {
  platform_fit: 'syntax/phrasing',
  technique_fit: 'technique_fit',
  constraint_completeness: 'constraints',
  specificity: 'specificity',
};

interface AnalysisRow {
  task_type: string;
  platform_id: string;
  worked_count: number;
  total_count: number;
  avg_score_when_worked: number;
  avg_score_when_not: number;
  top_underperforming_dimension: string | null;
}

async function analyze(): Promise<void> {
  // outcome_signals stores the outcome in `feedback` and has no strength_score;
  // use each row's mean rubric score (1–3), ignoring rows without scores.
  const res = await pool.query(`
    select
      task_type,
      platform_id,
      count(*) filter (where feedback = 'worked') as worked_count,
      count(*) as total_count,
      avg(s.mean_score) filter (where feedback = 'worked') as avg_score_when_worked,
      avg(s.mean_score) filter (where feedback <> 'worked') as avg_score_when_not
    from outcome_signals o
    left join lateral (
      select avg(value::numeric) as mean_score from jsonb_each_text(o.rubric_scores)
    ) s on true
    where created_at > now() - interval '3 months'
    group by task_type, platform_id
  `);

  const flags: Array<{ kind: string; target: string; reason: string; metrics: unknown }> = [];

  for (const row of res.rows) {
    const workedCount = Number(row.worked_count);
    const totalCount = Number(row.total_count);
    if (totalCount < MIN_SAMPLES) continue;
    const workedRate = workedCount / totalCount;
    if (workedRate < WORKED_RATE_FLOOR) {
      flags.push({
        kind: 'strategy_profile',
        target: row.task_type,
        reason: `Worked rate ${(workedRate * 100).toFixed(1)}% for task_type=${row.task_type} on ${row.platform_id} (n=${totalCount}, threshold=${MIN_SAMPLES})`,
        metrics: {
          worked_rate: workedRate,
          worked_count: workedCount,
          total_count: totalCount,
          avg_score_worked: row.avg_score_when_worked,
          avg_score_not: row.avg_score_when_not,
        },
      });
    }
  }

  // Insert new flags (skip if same target already has an open flag).
  for (const f of flags) {
    await pool.query(
      `insert into improvement_flags (kind, target, reason, metrics)
       select $1, $2, $3, $4
       where not exists (
         select 1 from improvement_flags where kind = $1 and target = $2 and status = 'open'
       )`,
      [f.kind, f.target, f.reason, JSON.stringify(f.metrics)]
    );
  }

  console.log(`Analysis complete. ${flags.length} flags generated.`);
  await pool.end();
}

analyze().catch((err) => {
  console.error('Analysis failed:', err);
  process.exit(1);
});
