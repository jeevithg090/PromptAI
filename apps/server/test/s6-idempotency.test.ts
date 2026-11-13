/**
 * Phase 0 spike S6 (blueprint §19): idempotency and retry for /v1/events.
 * Verify line: "10k interleavings converge" — every event stored exactly once,
 * nothing lost, under transient faults before and after the write.
 */
import { isDeepStrictEqual } from 'node:util';
import fc from 'fast-check';
import type { PGlite } from '@electric-sql/pglite';
import type { EventBatchResponse } from '@promptai/contract';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import type { EventStore } from '../src/event-store.ts';
import { ackingTransient, eventId, faulty, okForge, pglite, quiet, rng, storedEvents, type Fault } from './helpers.ts';

type Mode = 'acknowledgement-rule' | 'ack-transient-2xx';
type Wire = { id: string; type: string; at: string; props?: Record<string, number> };
const valid = (e: Wire) => e.type !== '';
const NONE: Fault = { when: 'none' };
const MAX_ROUNDS = 100;

/** A device's queue. Every tenth-ish event is permanently invalid, so it must be rejected (acknowledged), never stored. */
function device(n: number, kinds: readonly boolean[]): Wire[] {
  return kinds.map((ok, i) => {
    const at = new Date(Date.UTC(2026, 10, 13, 10, 0, 0, i)).toISOString();
    return ok ? { id: eventId(n, i), type: 'brief.inserted', at, props: { device: n, i } } : { id: eventId(n, i), type: '', at };
  });
}

/** Overlapping windows over the whole queue: stride <= size, so consecutive batches share events. */
function windows<T>(items: readonly T[], size: number, stride: number): T[][] {
  const out: T[][] = [];
  for (let start = 0; ; start += stride) {
    out.push(items.slice(start, start + size));
    if (start + size >= items.length) return out;
  }
}

type Stats = { requests: number; rounds: number };

/**
 * One device's client: each round sends every un-acked event in overlapping
 * batches, all in flight at once; anything not acknowledged (503) is retried
 * next round. An event is acknowledged when it is in `accepted` or `rejected`.
 */
async function drain(app: ReturnType<typeof createApp>, events: readonly Wire[], size: number, stride: number, stats: Stats) {
  let pending = events;
  for (let round = 1; pending.length > 0; round++) {
    if (round > MAX_ROUNDS) throw new Error(`device did not converge in ${MAX_ROUNDS} rounds`);
    stats.rounds = Math.max(stats.rounds, round);
    const acked = new Set<string>();
    await Promise.all(
      windows(pending, size, stride).map(async (batch) => {
        stats.requests++;
        const res = await app.request('/v1/events', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ events: batch }),
        });
        if (res.status === 503) return;
        if (res.status !== 200) throw new Error(`unexpected status ${res.status}`);
        const body = (await res.json()) as EventBatchResponse;
        for (const id of body.accepted) acked.add(id);
        for (const r of body.rejected) if (r.id !== null) acked.add(r.id);
      }),
    );
    pending = pending.filter((e) => !acked.has(e.id));
  }
}

/** Compares the table with what the devices sent. */
async function audit(db: PGlite, sent: readonly Wire[]) {
  const rows = await storedEvents(db);
  const want = new Map(sent.filter(valid).map((e) => [e.id, e]));
  const ids = rows.map((r) => r.id);
  const corrupted = rows.filter((r) => {
    const e = want.get(r.id);
    return e !== undefined && (r.type !== e.type || r.at.toISOString() !== e.at || !isDeepStrictEqual(r.props, e.props ?? {}));
  });
  return {
    stored: rows.length,
    lost: [...want.keys()].filter((id) => !ids.includes(id)).length,
    duplicated: rows.length - new Set(ids).size,
    unexpected: ids.filter((id) => !want.has(id)).length,
    corrupted: corrupted.length,
  };
}

function assertExactlyOnce(result: Awaited<ReturnType<typeof audit>>) {
  const { lost, duplicated, unexpected, corrupted } = result;
  if (lost + duplicated + unexpected + corrupted > 0) throw new Error(`invariant broken: ${JSON.stringify(result)}`);
}

const faultArb: fc.Arbitrary<Fault> = fc.oneof(
  { weight: 2, arbitrary: fc.constant(NONE) },
  { weight: 3, arbitrary: fc.record({ when: fc.constantFrom('before' as const, 'after' as const), code: fc.constantFrom('40P01' as const, '40001' as const) }) },
);
type Totals = ReturnType<typeof newTotals>;
const newTotals = () => ({ runs: 0, reordered: 0, requests: 0, writes: 0, before: 0, after: 0, maxRounds: 0 });

const deviceArb = fc.record({
  kinds: fc.array(fc.oneof({ weight: 9, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }), { minLength: 1, maxLength: 10 }),
  size: fc.integer({ min: 1, max: 5 }),
  overlap: fc.integer({ min: 0, max: 4 }),
});

describe('S6: /v1/events idempotency and retry', () => {
  let db: Awaited<ReturnType<typeof pglite>>;
  beforeAll(async () => {
    db = await pglite();
  });

  /**
   * One run is one interleaving: two devices, their batching, a fault plan, and
   * the order fast-check's scheduler lets the concurrent store writes through.
   * Faults are consumed in write order, then writes succeed, so the plan is finite.
   * Its realized trace (write order, batch contents, fault) is the interleaving's
   * identity; a run whose trace was already seen is checked but skipped via
   * fc.pre, so numRuns counts distinct interleavings only.
   */
  function property(mode: Mode, totals: Totals) {
    const seen = new Set<string>();
    return fc.asyncProperty(fc.scheduler(), deviceArb, deviceArb, fc.array(faultArb, { maxLength: 12 }), async (s, a, b, faults) => {
      await db.db.query('truncate events');
      const trace: string[] = [];
      let used = 0;
      const withFaults = faulty(db.store, (events) => {
        const fault = faults[used++] ?? NONE;
        trace.push(`${events.map((e) => e.id.slice(7, 8) + e.id.slice(-2)).join(',')}:${fault.when}`);
        if (fault.when !== 'none') totals[fault.when]++;
        return fault;
      });
      // Writes queue at this gate in arrival order; the scheduler picks which goes next.
      let arrived = 0;
      const released: number[] = [];
      const scheduled: EventStore = {
        async insert(events) {
          const n = arrived++;
          await s.schedule(Promise.resolve(), 'write');
          released.push(n);
          totals.writes++;
          return withFaults.insert(events);
        },
      };
      const app = createApp({ forge: async () => okForge, events: mode === 'ack-transient-2xx' ? ackingTransient(scheduled) : scheduled, log: quiet });
      const A = device(1, a.kinds);
      const B = device(2, b.kinds);
      const stats: Stats = { requests: 0, rounds: 0 };
      await s.waitFor(
        Promise.all([drain(app, A, a.size, Math.max(1, a.size - a.overlap), stats), drain(app, B, b.size, Math.max(1, b.size - b.overlap), stats)]),
      );
      totals.runs++;
      totals.requests += stats.requests;
      totals.maxRounds = Math.max(totals.maxRounds, stats.rounds);
      if (released.some((n, i) => n !== i)) totals.reordered++;
      assertExactlyOnce(await audit(db.db, [...A, ...B]));

      const key = trace.join('|');
      fc.pre(!seen.has(key));
      seen.add(key);
    });
  }

  it('10,000 distinct interleavings converge: every event stored exactly once, none lost', async () => {
    const totals = newTotals();
    const start = performance.now();
    await fc.assert(property('acknowledgement-rule', totals), { numRuns: 10_000 });
    const seconds = ((performance.now() - start) / 1000).toFixed(1);
    console.log(`S6 property: 10000 distinct interleavings (${totals.runs} runs incl. repeats; ${totals.reordered} with writes reordered out of arrival order), ${totals.requests} requests, ${totals.writes} store writes, faults ${totals.before} before / ${totals.after} after the write, max ${totals.maxRounds} rounds, ${seconds}s`);
    expect(totals.before).toBeGreaterThan(0);
    expect(totals.after).toBeGreaterThan(0);
    expect(totals.reordered).toBeGreaterThan(1_000);
  }, 600_000);

  it('negative control: acknowledging transient failures with 2xx loses events', async () => {
    const totals = newTotals();
    const result = await fc.check(property('ack-transient-2xx', totals), { numRuns: 10_000 });
    console.log(`S6 negative control (property): failed after ${result.numRuns} runs; shrunk counterexample: ${String(result.errorInstance)}`);
    expect(result.failed).toBe(true);
    expect(String(result.errorInstance)).toMatch(/"lost":[1-9]/);
  }, 600_000);

  /**
   * Two devices reconnect at once and flush 1,000 events each: overlapping
   * batches of 50, all in flight together, with a seeded 40% transient fault
   * rate split evenly before and after the write.
   */
  async function reconnect(mode: Mode) {
    await db.db.query('truncate events');
    const random = rng(0x5eed);
    let before = 0;
    let after = 0;
    const store = faulty(db.store, () => {
      const r = random();
      const code = random() < 0.5 ? '40P01' : '40001';
      if (r < 0.2) return before++, { when: 'before', code };
      if (r < 0.4) return after++, { when: 'after', code };
      return NONE;
    });
    const app = createApp({ forge: async () => okForge, events: mode === 'ack-transient-2xx' ? ackingTransient(store) : store, log: quiet });
    const all = Array<boolean>(1000).fill(true);
    const A = device(1, all);
    const B = device(2, all);
    const stats: Stats = { requests: 0, rounds: 0 };
    const start = performance.now();
    await Promise.all([drain(app, A, 50, 40, stats), drain(app, B, 50, 40, stats)]);
    const ms = Math.round(performance.now() - start);
    const result = await audit(db.db, [...A, ...B]);
    console.log(`S6 reconnect [${mode}]: ${JSON.stringify(result)}, ${stats.requests} requests, max ${stats.rounds} rounds, faults ${before} before / ${after} after, ${ms}ms`);
    return result;
  }

  it('concurrent reconnect: two devices x 1,000 events, 0 drops, 0 duplicates', async () => {
    const result = await reconnect('acknowledgement-rule');
    expect(result).toEqual({ stored: 2000, lost: 0, duplicated: 0, unexpected: 0, corrupted: 0 });
  }, 120_000);

  it('negative control: the same reconnect schedule, acknowledged with 2xx on transient errors, loses events', async () => {
    const result = await reconnect('ack-transient-2xx');
    expect(result.lost).toBeGreaterThan(0);
    expect(result.stored).toBe(2000 - result.lost);
  }, 120_000);
});
