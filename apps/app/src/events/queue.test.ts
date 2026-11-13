import { describe, expect, it, vi } from 'vitest';
import type { AppEvent } from '@promptai/contract';
import type { EventsResult } from '../api/client.ts';
import { assertContentFree, createEventQueue, MAX_BATCH, uuidv7, type QueueStore } from './queue.ts';

/** Timers the test fires by hand. */
function clock() {
  const timers: { fn: () => void; ms: number }[] = [];
  return {
    setTimer: (fn: () => void, ms: number) => {
      const t = { fn, ms };
      timers.push(t);
      return () => timers.splice(timers.indexOf(t), 1);
    },
    timers,
    /** Fires the earliest timer and waits for the flush it starts. */
    async fire(queue: { flush(): Promise<void> }) {
      const t = timers.shift();
      t?.fn();
      await queue.flush();
    },
  };
}

function memoryStore(initial: AppEvent[] = []): QueueStore & { saved: AppEvent[] } {
  const store = {
    saved: initial,
    load: async () => [...initial],
    save: async (events: AppEvent[]) => {
      store.saved = events;
    },
  };
  return store;
}

const accept = (events: AppEvent[]): EventsResult => ({ ok: true, accepted: events.map((e) => e.id), rejected: [] });

describe('events queue', () => {
  it('only takes ids, enums, counts and timings as props', () => {
    expect(() => assertContentFree({ decisionId: '0190f5a2-7c1e-7d3a-9b2f-4f1e2d3c4b5a', toolId: 'claude', covered: 3, worked: true, x: null })).not.toThrow();
    expect(() => assertContentFree({ slotId: 'write a launch email' })).toThrow(/not content-free/);
    expect(() => assertContentFree({ 'free text key': 1 })).toThrow(/not content-free/);
  });

  it('makes UUIDv7 ids that sort by time', () => {
    const a = uuidv7(Date.parse('2026-11-13T10:00:00Z'));
    const b = uuidv7(Date.parse('2026-11-13T10:00:01Z'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });

  it('batches, sends and forgets what the server acknowledged, rejected ones included', async () => {
    const c = clock();
    const store = memoryStore();
    const send = vi.fn(async (events: AppEvent[]): Promise<EventsResult> => ({ ok: true, accepted: [events[0]!.id], rejected: [{ id: events[1]!.id, reason: 'invalid' }] }));
    const queue = createEventQueue({ send, store, setTimer: c.setTimer });
    await queue.ready();
    queue.track('brief.shown', { decisionId: 'd1' });
    queue.track('brief.copied', { decisionId: 'd1' });
    expect(c.timers).toHaveLength(1); // one send for both
    await c.fire(queue);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].map((e) => e.type)).toEqual(['brief.shown', 'brief.copied']);
    expect(queue.pending()).toEqual([]);
    expect(store.saved).toEqual([]);
  });

  it('keeps the batch and backs off on 503 and network errors, honouring Retry-After', async () => {
    const c = clock();
    const results: EventsResult[] = [
      { ok: false, retry: true, status: 503, retryAfterMs: 1000 },
      { ok: false, retry: true, status: null },
      { ok: false, retry: true, status: null },
    ];
    const send = vi.fn(async (events: AppEvent[]) => results.shift() ?? accept(events));
    const queue = createEventQueue({ send, setTimer: c.setTimer, random: () => 0.5 });
    await queue.ready();
    queue.track('outcome.rated', { rating: 'worked' });
    await c.fire(queue);
    expect(c.timers.map((t) => t.ms)).toEqual([1000]); // Retry-After
    await c.fire(queue);
    expect(c.timers.map((t) => t.ms)).toEqual([2000]); // 1 s × 2^1 (jitter centred)
    await c.fire(queue);
    expect(c.timers.map((t) => t.ms)).toEqual([4000]);
    expect(queue.pending()).toHaveLength(1);
    await c.fire(queue);
    expect(queue.pending()).toEqual([]);
    expect(send).toHaveBeenCalledTimes(4);
    expect(new Set(send.mock.calls.map(([e]) => e[0]!.id)).size).toBe(1); // the same event, retried
  });

  it('drops a batch the server refuses outright, so the queue never stalls', async () => {
    const c = clock();
    const log = vi.fn();
    const queue = createEventQueue({ send: async () => ({ ok: false, retry: false, status: 400 }), setTimer: c.setTimer, log });
    await queue.ready();
    queue.track('brief.dismissed');
    await c.fire(queue);
    expect(queue.pending()).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('dropped 1'));
  });

  it('survives a restart: stored events are sent first, in batches of 100', async () => {
    const c = clock();
    const stored = Array.from({ length: MAX_BATCH + 5 }, (_, i) => ({ id: uuidv7(1_000 + i), type: 'brief.shown', at: '2026-11-13T10:00:00.000Z', props: {} }));
    const send = vi.fn(async (events: AppEvent[]) => accept(events));
    const queue = createEventQueue({ send, store: memoryStore(stored), setTimer: c.setTimer });
    await queue.ready();
    await c.fire(queue);
    expect(send.mock.calls.map(([e]) => e.length)).toEqual([MAX_BATCH, 5]);
    expect(queue.pending()).toEqual([]);
  });
});
