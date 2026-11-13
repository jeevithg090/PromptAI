import path from 'node:path';
import { serve } from '@hono/node-server';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { forge, type Clock } from '@promptai/core';
import { createApp, jsonLog } from './app.ts';
import { loadCatalog } from './catalog.ts';
import { createEventStore, migrate, type Sql } from './event-store.ts';

// TODO(auth): remove this guard once /v1 routes verify the caller (app.ts).
if (process.env.NODE_ENV === 'production') {
  console.error('apps/server has no auth yet; refusing to start with NODE_ENV=production.');
  process.exit(1);
}

/** Core takes time through a port so it stays pure; this is the real one. */
const systemClock: Clock = {
  now: () => performance.now(),
  after: (ms) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    });
    return { promise, cancel: () => clearTimeout(timer) };
  },
};

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

// No LLM port yet: forge runs its deterministic path (card render, chips, checks)
// until a model provider is configured.
const cards = await loadCatalog(path.resolve(import.meta.dirname, '../../../catalog'));
const app = createApp({
  forge: (req) => forge(req, { cards, clock: systemClock }),
  events: createEventStore(await database()),
});
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  jsonLog({ level: 'info', msg: 'listening', port: info.port, cards: cards.length, db: process.env.DATABASE_URL ? 'postgres' : 'pglite-memory' });
});
