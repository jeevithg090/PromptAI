/**
 * The client side of POST /v1/events (blueprint §12): content-free events,
 * persisted, batched and retried until the server acknowledges them. Runs in
 * the browser (IndexedDB store) and in the Electron main process (a file under
 * userData), so it touches no DOM or Node API itself.
 *
 * Acknowledgement rule: ids in `accepted` or `rejected` leave the queue;
 * a 503, another transient status or a network error keeps the batch and
 * retries with exponential backoff; a batch the server refuses outright is dropped.
 */
import { eventSchema, type AppEvent, type EventType } from '@promptai/contract';
import type { EventsResult } from '../api/client.ts';

export type EventProps = Record<string, string | number | boolean | null>;

export interface QueueStore {
  load(): Promise<AppEvent[]>;
  save(events: AppEvent[]): Promise<void>;
}

export interface EventQueueOptions {
  send(events: AppEvent[]): Promise<EventsResult>;
  store?: QueueStore;
  now?: () => number;
  random?: () => number;
  setTimer?: (fn: () => void, ms: number) => () => void;
  /** Coalesces events tracked close together into one POST. */
  batchDelayMs?: number;
  log?: (message: string) => void;
}

export const MAX_BATCH = 100;
export const MAX_QUEUED = 1_000;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

/**
 * Props carry ids, enums, counts and timings, never what the user wrote. A
 * string prop must look like an id or a code (no spaces, ASCII, ≤100 chars),
 * so free text cannot slip into an event by accident.
 */
const SAFE_STRING = /^[\w.:@-]{0,100}$/;

export function assertContentFree(props: EventProps) {
  for (const [key, value] of Object.entries(props)) {
    if (!SAFE_STRING.test(key) || (typeof value === 'string' && !SAFE_STRING.test(value))) {
      throw new Error(`event prop ${JSON.stringify(key)} is not content-free`);
    }
  }
}

/** RFC 9562 UUIDv7: a millisecond timestamp, then randomness. The id is the server's idempotency key. */
export function uuidv7(ms = Date.now()): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let t = ms;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function createEventQueue(opts: EventQueueOptions) {
  const now = opts.now ?? Date.now;
  const random = opts.random ?? Math.random;
  const setTimer =
    opts.setTimer ??
    ((fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      return () => clearTimeout(t);
    });
  const batchDelayMs = opts.batchDelayMs ?? 250;
  const log = opts.log ?? (() => {});

  let pending: AppEvent[] = [];
  let attempt = 0;
  let cancelTimer: (() => void) | null = null;
  let flushing: Promise<void> | null = null;
  let writes = Promise.resolve();

  const loaded = (opts.store?.load() ?? Promise.resolve([]))
    .then((stored) => {
      pending = [...stored, ...pending].slice(-MAX_QUEUED);
      if (pending.length > 0) schedule(0);
    })
    .catch((err: unknown) => log(`could not load queued events: ${String(err)}`));

  function persist(): Promise<void> {
    const snapshot = [...pending];
    writes = writes.then(() => opts.store?.save(snapshot)).catch((err: unknown) => log(`could not save queued events: ${String(err)}`));
    return writes;
  }

  function schedule(ms: number) {
    if (cancelTimer) return;
    cancelTimer = setTimer(() => {
      cancelTimer = null;
      void flush();
    }, ms);
  }

  function backoff(): number {
    const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1));
    return Math.round(base * (0.8 + 0.4 * random()));
  }

  function forget(ids: Set<string>) {
    pending = pending.filter((e) => !ids.has(e.id));
  }

  async function run() {
    await loaded;
    while (pending.length > 0) {
      const batch = pending.slice(0, MAX_BATCH);
      const result = await opts.send(batch);
      if (result.ok) {
        const done = new Set([...result.accepted, ...result.rejected.flatMap((r) => (r.id ? [r.id] : []))]);
        for (const r of result.rejected) log(`the server rejected event ${r.id}: ${r.reason}`);
        forget(done);
        await persist();
        attempt = 0;
        // Ids the server didn't mention stay queued; try them later rather than spin.
        if (!batch.some((e) => done.has(e.id))) {
          attempt++;
          schedule(backoff());
          return;
        }
      } else if (result.retry) {
        attempt++;
        schedule(result.retryAfterMs ?? backoff());
        return;
      } else {
        log(`dropped ${batch.length} events the server refused (${result.status})`);
        forget(new Set(batch.map((e) => e.id)));
        await persist();
      }
    }
  }

  function flush(): Promise<void> {
    flushing ??= run().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  return {
    /** Queues one event and schedules a send. Throws if a prop could carry content. */
    track(type: EventType, props: EventProps = {}): AppEvent {
      assertContentFree(props);
      const event = eventSchema.parse({ id: uuidv7(now()), type, at: new Date(now()).toISOString(), props }) as AppEvent;
      pending.push(event);
      if (pending.length > MAX_QUEUED) pending = pending.slice(-MAX_QUEUED);
      void persist();
      schedule(batchDelayMs);
      return event;
    },
    flush,
    /** Events not yet acknowledged, oldest first. */
    pending: () => [...pending],
    /** Resolves once the stored queue has been read. */
    ready: () => loaded,
  };
}

export type EventQueue = ReturnType<typeof createEventQueue>;
