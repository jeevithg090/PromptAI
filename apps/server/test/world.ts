/**
 * A fully wired app on PGlite with real auth: Supabase tokens signed by a
 * local ES256 key (served as a local JWKS) or the HS256 secret, and guest
 * tokens from a cheap ALTCHA proof of work.
 */
import { randomUUID } from 'node:crypto';
import { solveChallenge, type Challenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { okForge, pglite, quiet } from './helpers.ts';
import { createApp, DEFAULT_LIMITS, type AppDeps, type Limits } from '../src/app.ts';
import { createAuth, createGuests, type SupabaseAuthConfig } from '../src/auth.ts';

const ISSUER = 'https://test-project.supabase.co/auth/v1';
const HS_SECRET = 'test-only-hs256-secret-of-at-least-32-chars';
const CHEAP_POW = { cost: 1, counter: [1, 30] } as const;

export async function signingKey(kid: string) {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  return { kid, privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg: 'ES256' } };
}
export type SigningKey = Awaited<ReturnType<typeof signingKey>>;

/** A Supabase-shaped access token. `exp` is seconds from now (negative: already expired). */
export function accountToken(
  key: SigningKey | 'hs256',
  opts: { sub?: string; exp?: number; claims?: Record<string, unknown>; audience?: string; issuer?: string } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({ role: 'authenticated', ...opts.claims })
    .setSubject(opts.sub ?? randomUUID())
    .setAudience(opts.audience ?? 'authenticated')
    .setIssuer(opts.issuer ?? ISSUER)
    .setIssuedAt(now - 60)
    .setExpirationTime(now + (opts.exp ?? 3600));
  return key === 'hs256'
    ? jwt.setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(new TextEncoder().encode(HS_SECRET))
    : jwt.setProtectedHeader({ alg: 'ES256', kid: key.kid, typ: 'JWT' }).sign(key.privateKey);
}

export async function world(opts: { limits?: Limits; supabase?: SupabaseAuthConfig | null; deps?: Partial<AppDeps>; guestNow?: () => number } = {}) {
  const { db, orm, store } = await pglite();
  const key = await signingKey('test-key');
  const supabase = opts.supabase === null ? undefined : (opts.supabase ?? { jwks: createLocalJWKSet({ keys: [key.jwk] }), jwtSecret: HS_SECRET, issuer: ISSUER });
  const guests = createGuests(orm, { secret: 'test-guest-root-secret', pow: CHEAP_POW, now: opts.guestNow });
  const app = createApp({
    forge: async () => okForge,
    events: store,
    db: orm,
    auth: createAuth({ db: orm, guests, supabase }),
    guests,
    limits: opts.limits ?? DEFAULT_LIMITS,
    log: quiet,
    ...opts.deps,
  });

  async function call(method: string, path: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await app.request(path, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    // biome-ignore lint/suspicious/noExplicitAny: tests read whatever JSON a route returned.
    return { status: res.status, headers: res.headers, body: (text ? JSON.parse(text) : null) as any };
  }

  /** Solves this server's challenge for `deviceId`; returns the altcha payload POST /v1/guest takes. */
  async function solve(deviceId: string): Promise<string> {
    const { body: challenge } = await call('GET', '/v1/guest/challenge', undefined, undefined, { 'x-device-id': deviceId });
    const solution = await solveChallenge({ challenge: challenge as Challenge, deriveKey });
    return Buffer.from(JSON.stringify({ challenge, solution })).toString('base64');
  }

  async function guestToken(deviceId = `device-${randomUUID()}`): Promise<string> {
    const res = await call('POST', '/v1/guest', undefined, { altcha: await solve(deviceId) });
    if (res.status !== 200) throw new Error(`guest token: ${res.status}`);
    return res.body.token as string;
  }

  /** An account token whose profile has passed the age gate. */
  async function adultAccount(sub = randomUUID()) {
    const token = await accountToken(key, { sub });
    await call('POST', '/v1/me/age', token, { dob: '1990-01-01' });
    const me = await call('GET', '/v1/me', token);
    return { token, sub, id: me.body.id as string };
  }

  return { app, db, orm, key, call, solve, guestToken, adultAccount };
}
