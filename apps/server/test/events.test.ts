import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { createEventStore, isTransientDbError, type EventStore, type StoredEvent } from '../src/event-store.ts';
import { eventId, okForge, pgError, pglite, quiet, storedEvents } from './helpers.ts';

const at = '2026-11-13T10:00:00.123Z';
const post = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const appWith = (events: EventStore) => createApp({ forge: async () => okForge, events, log: quiet });
const failing = (err: unknown): EventStore => ({
  insert: async () => {
    throw err;
  },
});

describe('POST /v1/events', () => {
  let db: Awaited<ReturnType<typeof pglite>>;
  beforeEach(async () => {
    db = await pglite();
  });

  it('stores valid events, rejects invalid ones, and treats a duplicate as accepted', async () => {
    const app = appWith(db.store);
    const a = { id: eventId(1, 1), type: 'brief.inserted', at, props: { tool: 'cursor', chips: 2, ok: true, none: null } };
    const b = { id: eventId(1, 2), type: 'brief.kept', at };
    const res = await app.request('/v1/events', post({ events: [a, b, { id: 'nope', type: 'x', at }, 42] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      accepted: [a.id, b.id],
      rejected: [
        { id: 'nope', reason: expect.stringContaining('id') },
        { id: null, reason: expect.any(String) },
      ],
    });

    const again = await app.request('/v1/events', post({ events: [a] }));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ accepted: [a.id], rejected: [] });

    expect(await storedEvents(db.db)).toEqual([
      { id: a.id, type: a.type, at: new Date(at), props: a.props },
      { id: b.id, type: b.type, at: new Date(at), props: {} },
    ]);
  });

  it('rejects, rather than 500s on, events the contract allows but Postgres cannot store', async () => {
    const app = appWith(db.store);
    const bad: StoredEvent[] = [
      { id: eventId(2, 1), type: 'a\u0000b', at, props: {} },
      { id: eventId(2, 2), type: 'a', at, props: { k: 'a\u0000' } },
      { id: eventId(2, 3), type: 'a', at, props: { ['k\u0000']: 'v' } },
      { id: eventId(2, 4), type: 'a', at, props: { k: 'a\ud800' } },
      { id: eventId(2, 5), type: 'a', at: '0000-01-01T00:00:00Z', props: {} },
    ];
    const good = { id: eventId(2, 6), type: 'a', at, props: { k: 'emoji 😀' } };
    const res = await app.request('/v1/events', post({ events: [...bad, good] }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: string[]; rejected: { id: string }[] };
    expect(body.accepted).toEqual([good.id]);
    expect(body.rejected.map((r) => r.id)).toEqual(bad.map((e) => e.id));
    // Each of these really is refused by Postgres when it reaches the store.
    for (const e of bad) await expect(db.store.insert([e])).rejects.toThrow();
  });

  it('400s on a malformed batch', async () => {
    const app = appWith(db.store);
    expect((await app.request('/v1/events', post({ events: [] }))).status).toBe(400);
    expect((await app.request('/v1/events', post({}))).status).toBe(400);
    expect((await app.request('/v1/events', post({ events: Array(101).fill({}) }))).status).toBe(400);
  });

  it.each(['40P01', '40001', '55P03', '08006', 'ECONNRESET'])('503s the whole batch on transient %s', async (code) => {
    const res = await appWith(failing(pgError(code))).request('/v1/events', post({ events: [{ id: eventId(3, 1), type: 'a', at }] }));
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('1');
  });

  it('503s on a dropped connection without a SQLSTATE', async () => {
    const res = await appWith(failing(new Error('Connection terminated unexpectedly'))).request(
      '/v1/events',
      post({ events: [{ id: eventId(3, 2), type: 'a', at }] }),
    );
    expect(res.status).toBe(503);
  });

  it('500s on any other store error', async () => {
    const res = await appWith(failing(pgError('42P01'))).request('/v1/events', post({ events: [{ id: eventId(3, 3), type: 'a', at }] }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'store_failed' });
  });
});

describe('createEventStore', () => {
  it('inserts in id order, so concurrent overlapping batches lock rows in the same order', async () => {
    const params: unknown[][] = [];
    const store = createEventStore({ query: async (_text, p) => void params.push(p ?? []) });
    const ids = [eventId(0xab, 3).toUpperCase(), eventId(0xab, 1), eventId(0xab, 2)];
    await store.insert(ids.map((id) => ({ id, type: 'a', at, props: {} })));
    expect(params[0]?.filter((_, i) => i % 4 === 0)).toEqual([ids[1], ids[2], ids[0]]);
  });
});

describe('isTransientDbError', () => {
  it('classifies SQLSTATEs and connection errors', () => {
    for (const code of ['40P01', '40001', '55P03', '08000', '08006', '57P01', 'ECONNREFUSED']) expect(isTransientDbError(pgError(code))).toBe(true);
    for (const code of ['23505', '22P02', '42P01', '57014']) expect(isTransientDbError(pgError(code))).toBe(false);
    expect(isTransientDbError(new Error('timeout exceeded when trying to connect'))).toBe(true);
    expect(isTransientDbError(new Error('boom'))).toBe(false);
    expect(isTransientDbError('40P01')).toBe(false);
  });
});
