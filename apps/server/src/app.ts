import { Hono } from 'hono';
import { requestId, type RequestIdVariables } from 'hono/request-id';
import {
  eventBatchSchema,
  eventSchema,
  forgeRequestSchema,
  forgeResponseSchema,
  type EventBatchResponse,
  type ForgeRequestParsed,
  type ForgeResponse,
} from '@promptai/contract';
import { isTransientDbError, type EventStore, type StoredEvent } from './event-store.ts';

/** One structured log line. Never put request or response content in it. */
export type Log = (entry: { level: 'info' | 'warn' | 'error'; msg: string; [key: string]: unknown }) => void;

export interface AppDeps {
  /** The forge pipeline (@promptai/core, wired in by the lead after merge). */
  forge: (req: ForgeRequestParsed) => Promise<ForgeResponse>;
  events: EventStore;
  log?: Log;
}

/** Hard limit on one forge request (blueprint §11 budgets forge itself at 20 s). */
export const FORGE_TIMEOUT_MS = 25_000;

const jsonLog: Log = (entry) => process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);

/** Error name and code only: messages can carry the data that caused them. */
const errorFields = (err: unknown) => ({ error: err instanceof Error ? err.name : typeof err, code: (err as { code?: unknown } | null)?.code });

const TIMED_OUT = Symbol('timed out');

export function createApp(deps: AppDeps) {
  const log = deps.log ?? jsonLog;
  const app = new Hono<{ Variables: RequestIdVariables }>();

  app.use(requestId());
  app.use(async (c, next) => {
    const start = performance.now();
    await next();
    log({ level: 'info', msg: 'request', requestId: c.get('requestId'), method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - start) });
  });
  app.onError((err, c) => {
    log({ level: 'error', msg: 'unhandled', requestId: c.get('requestId'), ...errorFields(err) });
    return c.json({ error: 'internal' }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  // TODO(auth): every /v1 route is unauthenticated. Verify the Supabase session
  // (or guest token) here before any route below; main.ts refuses to start in
  // production until this exists.

  app.post('/v1/forge', async (c) => {
    const parsed = forgeRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 400);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), FORGE_TIMEOUT_MS);
    });
    const work = deps.forge(parsed.data);
    work.catch(() => {}); // a rejection after the 504 has gone out must not crash the process
    let result: ForgeResponse | typeof TIMED_OUT;
    try {
      result = await Promise.race([work, timeout]);
    } catch (err) {
      log({ level: 'error', msg: 'forge_failed', requestId: c.get('requestId'), ...errorFields(err) });
      return c.json({ error: 'forge_failed' }, 500);
    } finally {
      clearTimeout(timer);
    }
    if (result === TIMED_OUT) {
      log({ level: 'warn', msg: 'forge_timeout', requestId: c.get('requestId') });
      return c.json({ error: 'timeout' }, 504);
    }

    const response = forgeResponseSchema.safeParse(result);
    if (!response.success) {
      log({ level: 'error', msg: 'forge_invalid_response', requestId: c.get('requestId'), issues: response.error.issues.length });
      return c.json({ error: 'invalid_forge_response' }, 500);
    }
    return c.json(response.data);
  });

  app.post('/v1/events', async (c) => {
    const batch = eventBatchSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!batch.success) return c.json({ error: 'invalid_request', issues: batch.error.issues }, 400);

    const valid: StoredEvent[] = [];
    const rejected: EventBatchResponse['rejected'] = [];
    for (const raw of batch.data.events) {
      const event = eventSchema.safeParse(raw);
      const reason = event.success
        ? unstorable(event.data)
        : event.error.issues.map((i) => `${i.path.join('.') || 'event'}: ${i.message}`).join('; ');
      if (reason === null && event.success) valid.push(event.data);
      else rejected.push({ id: idOf(raw), reason: reason ?? 'invalid' });
    }

    try {
      if (valid.length > 0) await deps.events.insert(valid);
    } catch (err) {
      // Acknowledgement rule (blueprint §12): never 2xx a write that may not
      // have happened. A transient error fails the whole batch so the client
      // retries it; the retry is safe because inserts are idempotent by id.
      if (isTransientDbError(err)) {
        log({ level: 'warn', msg: 'events_transient', requestId: c.get('requestId'), ...errorFields(err) });
        c.header('Retry-After', '1');
        return c.json({ error: 'transient', retry: true }, 503);
      }
      log({ level: 'error', msg: 'events_store_failed', requestId: c.get('requestId'), ...errorFields(err) });
      return c.json({ error: 'store_failed' }, 500);
    }
    return c.json({ accepted: valid.map((e) => e.id), rejected } satisfies EventBatchResponse);
  });

  return app;
}

function idOf(raw: unknown): string | null {
  const id = (raw as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? id : null;
}

/**
 * Values the contract allows but Postgres refuses (22021, 22P05, 22P02, 22008).
 * Without this check one such event fails its whole batch with a 500 on every
 * retry and the client's queue stalls; as a rejection it is acknowledged.
 */
function unstorable(e: StoredEvent): string | null {
  const strings = [e.type, ...Object.keys(e.props), ...Object.values(e.props).filter((v) => typeof v === 'string')];
  if (strings.some((s) => /[\u0000\p{Cs}]/u.test(s))) return 'contains a NUL or an unpaired surrogate, which Postgres cannot store';
  if (e.at.startsWith('0000')) return 'at: year 0000 is out of range';
  return null;
}
