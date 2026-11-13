import type { eventSchema } from '@promptai/contract';

/**
 * The one method `pg.Pool` and PGlite share, so the same SQL runs on Postgres
 * in production and on PGlite in tests.
 */
export interface Sql {
  query(text: string, params?: unknown[]): Promise<unknown>;
}

export type StoredEvent = ReturnType<typeof eventSchema.parse>;

export interface EventStore {
  /** Stores the caller's events idempotently by id: an id already stored is skipped, not an error. */
  insert(events: readonly StoredEvent[], pid: string): Promise<void>;
}

export function createEventStore(sql: Sql): EventStore {
  return {
    async insert(events, pid) {
      if (events.length === 0) return;
      // Sorted by id so concurrent batches that overlap take their row locks in
      // the same order and cannot deadlock each other.
      const key = (e: StoredEvent) => e.id.toLowerCase();
      const sorted = [...events].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
      const params: unknown[] = [pid];
      const rows = sorted.map((e, i) => {
        params.push(e.id, e.type, e.at, JSON.stringify(e.props));
        const p = 1 + i * 4;
        return `($${p + 1}::uuid, $1::uuid, $${p + 2}, $${p + 3}::timestamptz, $${p + 4}::jsonb)`;
      });
      await sql.query(`insert into events (id, pid, type, at, props) values ${rows.join(', ')} on conflict (id) do nothing`, params);
    },
  };
}

const TRANSIENT_SQLSTATES = new Set(['40P01', '40001', '55P03']);
const SOCKET_ERRORS = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN']);

/**
 * Deadlock, serialization failure, lock timeout, or a lost connection: the
 * write may succeed if retried, so the client must retry (blueprint §12,
 * acknowledgement rule).
 */
export function isTransientDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // Drizzle wraps the driver's error, SQLSTATE and all, in `cause`. Judge the
  // cause alone: the wrapper's message embeds the query's parameters.
  if (err.cause instanceof Error) return isTransientDbError(err.cause);
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string') {
    // Class 08 is connection_exception; 57P01 is admin_shutdown (restart or failover).
    return TRANSIENT_SQLSTATES.has(code) || code.startsWith('08') || code === '57P01' || SOCKET_ERRORS.has(code);
  }
  // node-postgres reports a dropped or timed-out connection without a code.
  return /^Connection terminated|timeout exceeded when trying to connect|connection error/.test(err.message);
}
