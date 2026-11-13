import { serve } from '@hono/node-server';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import type { ForgeRequestParsed, ForgeResponse } from '@promptai/contract';
import { createApp, jsonLog } from './app.ts';
import { createEventStore, migrate, type Sql } from './event-store.ts';

// TODO(auth): remove this guard once /v1 routes verify the caller (app.ts).
if (process.env.NODE_ENV === 'production') {
  console.error('apps/server has no auth yet; refusing to start with NODE_ENV=production.');
  process.exit(1);
}

/**
 * STUB FORGE: local runs only. Deterministic, no LLM: echoes the text as the
 * brief under the "generic" tool. The lead replaces it with @promptai/core's
 * forge() after merge.
 */
async function stubForge(req: ForgeRequestParsed): Promise<ForgeResponse> {
  return {
    toolId: 'generic',
    toolName: 'Generic',
    brief: req.text,
    assumptions: [],
    unsourced: [],
    coverage: { covered: 0, total: 0 },
    usage: { llmCalls: 0, ms: 0 },
  };
}

/** DATABASE_URL is assumed migrated. Without it, an in-memory PGlite is migrated here (data is lost on exit). */
async function database(): Promise<Sql> {
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    // An idle client losing its connection (restart, failover) emits 'error' on
    // the pool; unhandled, that crashes the process. The next query reconnects.
    pool.on('error', (err) => jsonLog({ level: 'warn', msg: 'pg_idle_client_error', code: (err as { code?: unknown }).code }));
    return pool;
  }
  const db = new PGlite();
  await migrate(db);
  return db;
}

const app = createApp({ forge: stubForge, events: createEventStore(await database()) });
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  jsonLog({ level: 'info', msg: 'listening', port: info.port, db: process.env.DATABASE_URL ? 'postgres' : 'pglite-memory' });
});
