import { Hono, type Context } from 'hono';
import { requestId, type RequestIdVariables } from 'hono/request-id';
import { and, eq } from 'drizzle-orm';
import {
  eventBatchSchema,
  eventSchema,
  forgeRequestSchema,
  forgeResponseSchema,
  guestTokenRequestSchema,
  reportRequestSchema,
  type EventBatchResponse,
  type ForgeRequestParsed,
  type ForgeResponse,
} from '@promptai/contract';
import { artifacts, decisions, reports, type Db } from '@promptai/db';
import type { AuthAdmin, Authenticate, Caller, Guests, Quota } from './auth.ts';
import { isTransientDbError, type EventStore, type StoredEvent } from './event-store.ts';
import { applyOutcomes, loadForgeContext, pidOf, recordDecision, type ForgeContext } from './learning.ts';
import { meRoutes } from './me.ts';
import { tokenBuckets, type Bucket } from './rate-limit.ts';
import { addUsage, nextUtcMidnight, refundForge, remaining, reserveForge, usageToday, utcDay } from './usage.ts';

/** One structured log line. Never put request or response content in it. */
export type Log = (entry: { level: 'info' | 'warn' | 'error'; msg: string; [key: string]: unknown }) => void;

export interface Limits {
  /** Daily quotas (B6: ~10 forges and 10 dictated minutes per guest device). Null is no limit. */
  quota: { guest: { forgesPerDay: number; dictationMinutesPerDay: number }; account: Quota };
  /** Daily model spend per caller, in USD, past which new forges are refused (blueprint §11). */
  costCeilingUsd: Record<Caller['kind'], number>;
  /** api: every /v1 call per caller; report: /v1/report per caller; guest: guest issuance per IP. */
  rate: { api: Bucket; report: Bucket; guest: Bucket };
}

export const DEFAULT_LIMITS: Limits = {
  quota: { guest: { forgesPerDay: 10, dictationMinutesPerDay: 10 }, account: { forgesPerDay: null, dictationMinutesPerDay: null } },
  costCeilingUsd: { guest: 0.25, account: 2 },
  rate: {
    api: { capacity: 120, perSecond: 2 },
    report: { capacity: 5, perSecond: 1 / 600 },
    guest: { capacity: 20, perSecond: 1 / 30 },
  },
};

export interface AppDeps {
  /** The forge pipeline (@promptai/core). `ctx` carries the caller's L1 counts, memories and frecency rows. */
  forge: (req: ForgeRequestParsed, ctx: ForgeContext) => Promise<ForgeResponse>;
  events: EventStore;
  db: Db;
  auth: Authenticate;
  /** Guest issuance (ALTCHA); without it the /v1/guest routes answer 404. */
  guests?: Guests;
  /** Supabase admin API; without it DELETE /v1/me skips deleting the auth user (local dev, tests). */
  authAdmin?: AuthAdmin;
  limits?: Limits;
  /** The client address for per-IP limits. Behind a proxy, read the header it sets. */
  clientIp?: (c: Context) => string;
  now?: () => Date;
  log?: Log;
}

export type AppEnv = { Variables: RequestIdVariables & { caller: Caller } };

/** Hard limit on one forge request (blueprint §11 budgets forge itself at 20 s). */
export const FORGE_TIMEOUT_MS = 25_000;

export const jsonLog: Log = (entry) => process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);

/** Error name and code only: messages can carry the data that caused them (drizzle's embed the query's parameters). */
const errorFields = (err: unknown) => {
  const code = (e: unknown) => (e as { code?: unknown } | null)?.code;
  return { error: err instanceof Error ? err.name : typeof err, code: code(err) ?? code((err as { cause?: unknown } | null)?.cause) };
};

const TIMED_OUT = Symbol('timed out');
/** Routes that hand out the token every other /v1 route needs. */
const PUBLIC = new Set(['/v1/guest/challenge', '/v1/guest']);

export function createApp(deps: AppDeps) {
  const log = deps.log ?? jsonLog;
  const now = deps.now ?? (() => new Date());
  const limits = deps.limits ?? DEFAULT_LIMITS;
  const clientIp = deps.clientIp ?? (() => 'unknown');
  const apiBucket = tokenBuckets(limits.rate.api);
  const reportBucket = tokenBuckets(limits.rate.report);
  const guestBucket = tokenBuckets(limits.rate.guest);
  const { db } = deps;
  const app = new Hono<AppEnv>();

  const limited = (c: Context, waitS: number) => {
    c.header('Retry-After', String(waitS));
    return c.json({ error: 'rate_limited' }, 429);
  };

  app.use(requestId());
  app.use(async (c, next) => {
    const start = performance.now();
    await next();
    log({ level: 'info', msg: 'request', requestId: c.get('requestId'), method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - start) });
  });
  app.onError((err, c) => {
    // Acknowledgement rule (blueprint §12): a write that hit a transient error
    // may not have happened, so the client is told to retry, never given a 2xx.
    if (isTransientDbError(err)) {
      log({ level: 'warn', msg: 'transient', requestId: c.get('requestId'), ...errorFields(err) });
      c.header('Retry-After', '1');
      return c.json({ error: 'transient', retry: true }, 503);
    }
    log({ level: 'error', msg: 'unhandled', requestId: c.get('requestId'), ...errorFields(err) });
    return c.json({ error: 'internal' }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.use('/v1/*', async (c, next) => {
    if (PUBLIC.has(c.req.path)) return next();
    const result = await deps.auth(c.req.header('authorization'));
    // An erased profile's tokens work only to retry its own deletion (me.ts).
    const erasing = c.req.method === 'DELETE' && c.req.path === '/v1/me';
    if (!result.ok || (result.caller.deletedAt && !erasing)) {
      const reason = result.ok ? 'deleted' : result.reason;
      log({ level: 'warn', msg: 'unauthorized', requestId: c.get('requestId'), reason });
      c.header('WWW-Authenticate', 'Bearer');
      return c.json({ error: 'unauthorized', reason }, 401);
    }
    const wait = apiBucket.take(result.caller.id);
    if (wait) return limited(c, wait);
    c.set('caller', result.caller);
    await next();
  });

  app.get('/v1/guest/challenge', async (c) => {
    if (!deps.guests) return c.json({ error: 'not_found' }, 404);
    const wait = guestBucket.take(clientIp(c));
    if (wait) return limited(c, wait);
    const challenge = await deps.guests.challenge(c.req.header('x-device-id'));
    if (!challenge) return c.json({ error: 'invalid_request', issues: [{ path: ['x-device-id'], message: 'an 8-128 character device id header is required' }] }, 400);
    c.header('Cache-Control', 'no-store');
    return c.json(challenge);
  });

  app.post('/v1/guest', async (c) => {
    if (!deps.guests) return c.json({ error: 'not_found' }, 404);
    const wait = guestBucket.take(clientIp(c));
    if (wait) return limited(c, wait);
    const parsed = guestTokenRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 400);
    const issued = await deps.guests.redeem(parsed.data.altcha);
    if (!issued) return c.json({ error: 'proof_failed' }, 403);
    return c.json({ ...issued, quota: limits.quota.guest });
  });

  app.post('/v1/forge', async (c) => {
    const parsed = forgeRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 400);
    const caller = c.get('caller');
    if (!caller.ageConfirmed) return c.json({ error: 'age_unconfirmed' }, 403);

    // Quota and cost ceiling (blueprint §11): only a new forge is refused. One
    // already running finishes, and the client finishes the utterance itself.
    const started = now();
    const day = utcDay(started);
    const quota = limits.quota[caller.kind];
    const used = await usageToday(db, caller.id, day);
    const refuse = (error: string, left: ReturnType<typeof remaining>) => c.json({ error, remaining: left, resetsAt: nextUtcMidnight(started) }, 429);
    if (used.cost_microusd >= limits.costCeilingUsd[caller.kind] * 1e6) return refuse('cost_ceiling', remaining(quota, used));
    if (!(await reserveForge(db, caller.id, day, quota.forgesPerDay))) return refuse('quota_exceeded', { ...remaining(quota, used), forges: 0 });

    const ctx = await loadForgeContext(db, caller, parsed.data, started).catch(async (err: unknown) => {
      await refundForge(db, caller.id, day);
      throw err;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), FORGE_TIMEOUT_MS);
    });
    const work = deps.forge(parsed.data, ctx);
    work.catch(() => {}); // a rejection after the 504 has gone out must not crash the process
    let result: ForgeResponse | typeof TIMED_OUT;
    try {
      result = await Promise.race([work, timeout]);
    } catch (err) {
      log({ level: 'error', msg: 'forge_failed', requestId: c.get('requestId'), ...errorFields(err) });
      await refundForge(db, caller.id, day);
      return c.json({ error: 'forge_failed' }, 500);
    } finally {
      clearTimeout(timer);
    }
    if (result === TIMED_OUT) {
      log({ level: 'warn', msg: 'forge_timeout', requestId: c.get('requestId') });
      await refundForge(db, caller.id, day);
      return c.json({ error: 'timeout' }, 504);
    }

    const response = forgeResponseSchema.safeParse(result);
    if (!response.success) {
      log({ level: 'error', msg: 'forge_invalid_response', requestId: c.get('requestId'), issues: response.error.issues.length });
      await refundForge(db, caller.id, day);
      return c.json({ error: 'invalid_forge_response' }, 500);
    }

    // The draft is done: losing its decision row or cost meter must not lose
    // the draft, so those failures are logged and the brief still goes out.
    let decisionId: string | undefined;
    try {
      decisionId = await recordDecision(db, caller, parsed.data, response.data);
    } catch (err) {
      log({ level: 'error', msg: 'decision_write_failed', requestId: c.get('requestId'), ...errorFields(err) });
    }
    await addUsage(db, caller.id, day, 'cost_microusd', Math.round((response.data.usage.costUsd ?? 0) * 1e6)).catch((err: unknown) =>
      log({ level: 'error', msg: 'cost_meter_failed', requestId: c.get('requestId'), ...errorFields(err) }),
    );
    const left = remaining(quota, { ...used, forges: used.forges + 1 }).forges;
    if (left !== null) c.header('X-Forges-Remaining', String(left));
    return c.json({ ...response.data, decisionId });
  });

  app.post('/v1/events', async (c) => {
    const batch = eventBatchSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!batch.success) return c.json({ error: 'invalid_request', issues: batch.error.issues }, 400);
    const caller = c.get('caller');

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
      if (valid.length > 0) {
        await deps.events.insert(valid, pidOf(caller));
        // Idempotent by event id, so it is re-applied safely when a retried
        // batch arrives (including events stored by an earlier attempt).
        await applyOutcomes(db, caller, valid, now());
      }
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

  /** "Report this output" (blueprint §13): a reason code and an optional note about one of the caller's drafts or artifacts. */
  app.post('/v1/report', async (c) => {
    const caller = c.get('caller');
    const wait = reportBucket.take(caller.id);
    if (wait) return limited(c, wait);
    const parsed = reportRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 400);
    const { decisionId, artifactId, reason, note } = parsed.data;
    if (decisionId && !(await db.$count(decisions, and(eq(decisions.id, decisionId), eq(decisions.pid, pidOf(caller)))))) return c.json({ error: 'not_found' }, 404);
    if (artifactId && !(await db.$count(artifacts, and(eq(artifacts.id, artifactId), eq(artifacts.userId, caller.id))))) return c.json({ error: 'not_found' }, 404);
    const [row] = await db
      .insert(reports)
      .values({ userId: caller.id, decisionId: decisionId ?? null, artifactId: artifactId ?? null, reason, note: note ?? null })
      .returning({ id: reports.id });
    return c.json({ id: row!.id }, 201);
  });

  app.route('/v1/me', meRoutes(deps, log, now));

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
