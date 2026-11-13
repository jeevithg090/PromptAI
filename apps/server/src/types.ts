import type { Context } from 'hono';
import type { RequestIdVariables } from 'hono/request-id';
import type { ForgeRequestParsed, ForgeResponse } from '@promptai/contract';
import type { Db } from '@promptai/db';
import type { AuthAdmin, Authenticate, Caller, Guests, Quota } from './auth.ts';
import type { EventStore } from './event-store.ts';
import type { ForgeContext } from './learning.ts';
import type { Bucket } from './rate-limit.ts';

/** Types shared by app.ts and the route modules it mounts (kept apart so they don't import each other). */

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
