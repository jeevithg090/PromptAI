import { PGlite } from '@electric-sql/pglite';
import type { ForgeResponse } from '@promptai/contract';
import type { Log } from '../src/app.ts';
import { createEventStore, isTransientDbError, migrate, type EventStore, type StoredEvent } from '../src/event-store.ts';

export const quiet: Log = () => {};

export const okForge: ForgeResponse = {
  toolId: 'generic',
  toolName: 'Generic',
  brief: 'b',
  assumptions: [],
  unsourced: [],
  coverage: { covered: 0, total: 0 },
  usage: { llmCalls: 0, ms: 0 },
};

/** A fresh in-memory PGlite with the migrations applied. */
export async function pglite() {
  const db = new PGlite();
  await migrate(db);
  return { db, store: createEventStore(db) };
}

/** An error shaped like node-postgres's, carrying a SQLSTATE. */
export function pgError(code: string): Error {
  return Object.assign(new Error(`simulated ${code}`), { code });
}

/** Deterministic PRNG (mulberry32) for seeded schedules. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A fault on one store call. 'before': the transaction aborts (deadlock or
 * serialization failure) and nothing is written. 'after': the write commits,
 * then the response is lost, so the client sees a failure for a stored batch.
 */
export type Fault = { when: 'none' } | { when: 'before' | 'after'; code: '40P01' | '40001' };

export function faulty(real: EventStore, nextFault: (events: readonly StoredEvent[]) => Fault): EventStore {
  return {
    async insert(events) {
      const fault = nextFault(events);
      if (fault.when === 'before') throw pgError(fault.code);
      await real.insert(events);
      if (fault.when === 'after') throw pgError(fault.code);
    },
  };
}

/**
 * NEGATIVE CONTROL, the old behaviour: a transient failure is swallowed, so
 * the route acknowledges a write that may never have happened.
 */
export function ackingTransient(store: EventStore): EventStore {
  return {
    async insert(events) {
      try {
        await store.insert(events);
      } catch (err) {
        if (!isTransientDbError(err)) throw err;
      }
    },
  };
}

/** A valid UUIDv7-shaped id, unique per (device, n). */
export function eventId(device: number, n: number): string {
  return `${device.toString(16).padStart(8, '0')}-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
}

/** Ids and content of every stored event, for checking the invariant. */
export async function storedEvents(db: PGlite) {
  const { rows } = await db.query<{ id: string; type: string; at: Date; props: Record<string, unknown> }>(
    'select id::text, type, at, props from events order by id',
  );
  return rows;
}
