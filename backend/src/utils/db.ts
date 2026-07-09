import { Pool } from 'pg';
import { config } from '../config/env';

/**
 * Lazy shared Postgres pool (Supabase via the shared pooler — see .env note:
 * the direct db.<ref> host has DNS issues from dev machines; the pooler is
 * the reliable path). Lambda-friendly: small pool, created on first use,
 * reused across warm invocations.
 */
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    if (!config.DATABASE_URL) {
      throw new Error('DATABASE_URL not configured');
    }
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3, // Lambdalith: one concurrent request per instance; keep it tiny
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

/** Test seam — inject a fake pool. */
export function setPoolForTesting(p: Pool | null): void {
  pool = p;
}
