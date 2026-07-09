import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { logger } from '../utils/logger';

/**
 * Migration runner — spec §32.6.
 * Applies pending migrations/*.sql files, in filename order, each inside its
 * own transaction, tracked in `schema_migrations`. Idempotent: re-running is
 * a no-op once everything is applied.
 *
 * Requires DATABASE_URL (a direct Postgres connection string — Supabase
 * dashboard: Settings -> Database -> Connection string). This is distinct
 * from SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY, which only reach the REST/
 * Auth API and cannot run DDL.
 */
async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logger.error({
      type: 'migrate:missing_database_url',
      message:
        'DATABASE_URL is not set. Get it from the Supabase dashboard: Settings -> Database -> ' +
        'Connection string (URI). Add it to backend/.env as DATABASE_URL=... then re-run `npm run migrate`.',
    });
    process.exitCode = 1;
    return;
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const { rows } = await client.query<{ name: string }>('select name from schema_migrations');
    const applied = new Set(rows.map((r) => r.name));

    const migrationsDir = path.resolve(__dirname, '..', '..', 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      logger.info({ type: 'migrate:applying', file });

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('COMMIT');
        appliedCount += 1;
        logger.info({ type: 'migrate:applied', file });
      } catch (error) {
        await client.query('ROLLBACK');
        logger.error({
          type: 'migrate:failed',
          file,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    logger.info({
      type: 'migrate:complete',
      totalFiles: files.length,
      newlyApplied: appliedCount,
      alreadyApplied: files.length - appliedCount,
    });
  } finally {
    await client.end();
  }
}

migrate().catch(() => {
  process.exitCode = 1;
});
