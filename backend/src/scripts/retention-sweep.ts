/**
 * Retention sweep script (§27, T7.8).
 * Deletes data beyond its retention horizon. Safe to run idempotently.
 *
 * Usage: npm run retention
 * Requires RETENTION_ENABLED=true to actually delete (safety gate).
 */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface SweepResult {
  table: string;
  deleted: number;
}

async function sweep(): Promise<SweepResult[]> {
  const results: SweepResult[] = [];

  // rate_limits: 7 days
  const rl = await pool.query(`delete from rate_limits where created_at < now() - interval '7 days'`);
  results.push({ table: 'rate_limits', deleted: rl.rowCount ?? 0 });

  // usage_events: 24 months
  const ue = await pool.query(`delete from usage_events where created_at < now() - interval '24 months'`);
  results.push({ table: 'usage_events', deleted: ue.rowCount ?? 0 });

  // audit_log: 36 months
  const al = await pool.query(`delete from audit_log where created_at < now() - interval '36 months'`);
  results.push({ table: 'audit_log', deleted: al.rowCount ?? 0 });

  // sessions: 24 months (cascades to prompt_versions via prompts)
  const sess = await pool.query(`delete from sessions where created_at < now() - interval '24 months'`);
  results.push({ table: 'sessions (cascade)', deleted: sess.rowCount ?? 0 });

  return results;
}

async function main() {
  if (process.env.RETENTION_ENABLED !== 'true') {
    console.error('RETENTION_ENABLED must be "true" to run. Aborting.');
    process.exit(1);
  }
  console.log('Retention sweep starting...');
  const results = await sweep();
  for (const r of results) {
    console.log(`  ${r.table}: ${r.deleted} rows deleted`);
  }
  console.log('Retention sweep complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Retention sweep failed:', err);
  process.exit(1);
});
