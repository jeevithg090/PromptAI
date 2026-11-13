/**
 * Who is calling (blueprint §12 Auth). Every /v1 route needs a bearer token:
 * a Supabase access token for an account, or a guest token this server signed
 * after an ALTCHA proof of work. Both resolve to a `profiles` row.
 */
import { createHmac, randomInt } from 'node:crypto';
import { createChallenge, verifySolution, type Challenge, type Solution } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { SignJWT, decodeJwt, decodeProtectedHeader, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { profiles, type Db } from '@promptai/db';

export type Caller = typeof profiles.$inferSelect;
export type AuthFailure = 'missing' | 'malformed' | 'expired' | 'invalid';
export type AuthResult = { ok: true; caller: Caller } | { ok: false; reason: AuthFailure };
/** Resolves an Authorization header to a caller. A deleted profile still resolves (its tombstone), so the route can refuse it. */
export type Authenticate = (authorization: string | undefined) => Promise<AuthResult>;

export interface SupabaseAuthConfig {
  /** The project's asymmetric signing keys, e.g. `createRemoteJWKSet(SUPABASE_JWKS_URL)`. */
  jwks?: JWTVerifyGetKey;
  /** The project's legacy HS256 JWT secret. */
  jwtSecret?: string;
  /** Expected `iss` (`${SUPABASE_URL}/auth/v1`); checked when set. */
  issuer?: string;
}

export type Quota = { forgesPerDay: number | null; dictationMinutesPerDay: number | null };

export interface GuestConfig {
  /** Root secret. HMAC subkeys sign guest tokens and ALTCHA challenges, and hash device ids. */
  secret: string;
  /** Proof-of-work difficulty: PBKDF2 iterations per attempt, and the range the answer is drawn from. */
  pow?: { cost: number; counter: readonly [number, number] };
  tokenTtlS?: number;
  challengeTtlS?: number;
  now?: () => number;
}

const GUEST_ISSUER = 'promptai';
const GUEST_AUDIENCE = 'promptai:guest';
/** altcha-lib's recommended PBKDF2 settings; calibrate on real devices. */
const DEFAULT_POW = { cost: 5_000, counter: [5_000, 10_000] } as const;
const DEVICE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const subkey = (secret: string, label: string) => createHmac('sha256', secret).update(`promptai/${label}`).digest();

/**
 * Guest mode: device-bound, no memory, a daily quota. The device id is bound
 * into the signed challenge, so a solved challenge can only ever produce a
 * token for that device's one guest profile; replaying it gains nothing, and
 * no replay store is needed.
 */
export function createGuests(db: Db, cfg: GuestConfig) {
  const now = cfg.now ?? Date.now;
  const pow = cfg.pow ?? DEFAULT_POW;
  const tokenTtlS = cfg.tokenTtlS ?? 24 * 3600;
  const challengeTtlS = cfg.challengeTtlS ?? 5 * 60;
  const jwtKey = subkey(cfg.secret, 'guest-jwt');
  const altchaKey = subkey(cfg.secret, 'altcha').toString('hex');
  const altchaKeySig = subkey(cfg.secret, 'altcha-key').toString('hex');
  const deviceKey = subkey(cfg.secret, 'device');

  return {
    /** GET /v1/guest/challenge. Null when the device id is missing or malformed. */
    async challenge(deviceId: string | undefined): Promise<Challenge | null> {
      if (!deviceId || !DEVICE_ID.test(deviceId)) return null;
      const dh = createHmac('sha256', deviceKey).update(deviceId).digest('base64url');
      return createChallenge({
        algorithm: 'PBKDF2/SHA-256',
        cost: pow.cost,
        counter: randomInt(pow.counter[0], pow.counter[1] + 1),
        deriveKey,
        hmacSignatureSecret: altchaKey,
        hmacKeySignatureSecret: altchaKeySig,
        expiresAt: Math.floor(now() / 1000) + challengeTtlS,
        data: { dh },
      });
    },

    /** POST /v1/guest: a verified solution becomes a token for the device's guest profile. Null when the proof fails. */
    async redeem(altcha: string): Promise<{ token: string; expiresAt: string } | null> {
      let payload: { challenge?: Challenge; solution?: Solution };
      try {
        payload = JSON.parse(Buffer.from(altcha, 'base64').toString('utf8')) as typeof payload;
      } catch {
        return null;
      }
      if (typeof payload?.challenge?.parameters !== 'object' || payload.solution === undefined) return null;
      const result = await verifySolution({
        challenge: payload.challenge,
        solution: payload.solution,
        deriveKey,
        hmacSignatureSecret: altchaKey,
        hmacKeySignatureSecret: altchaKeySig,
      }).catch(() => null);
      const dh = payload.challenge.parameters.data?.dh;
      if (!result?.verified || typeof dh !== 'string') return null;

      const profile = await guestProfile(db, dh);
      const iat = Math.floor(now() / 1000);
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer(GUEST_ISSUER)
        .setAudience(GUEST_AUDIENCE)
        .setSubject(profile.id)
        .setIssuedAt(iat)
        .setExpirationTime(iat + tokenTtlS)
        .sign(jwtKey);
      return { token, expiresAt: new Date((iat + tokenTtlS) * 1000).toISOString() };
    },

    /** The guest profile id a token names, after checking its signature and expiry. */
    async verify(token: string): Promise<{ ok: true; profileId: string } | { ok: false; reason: AuthFailure }> {
      try {
        const { payload } = await jwtVerify(token, jwtKey, {
          issuer: GUEST_ISSUER,
          audience: GUEST_AUDIENCE,
          algorithms: ['HS256'],
          currentDate: new Date(now()),
        });
        return typeof payload.sub === 'string' && UUID.test(payload.sub) ? { ok: true, profileId: payload.sub } : { ok: false, reason: 'invalid' };
      } catch (err) {
        return { ok: false, reason: err instanceof errors.JWTExpired ? 'expired' : 'invalid' };
      }
    },
  };
}
export type Guests = ReturnType<typeof createGuests>;

/** The device's live guest profile, created on first use. */
async function guestProfile(db: Db, deviceHash: string): Promise<Caller> {
  const live = and(eq(profiles.deviceHash, deviceHash), isNull(profiles.deletedAt));
  const [found] = await db.select().from(profiles).where(live);
  if (found) return found;
  const [created] = await db
    .insert(profiles)
    .values({ kind: 'guest', deviceHash })
    .onConflictDoNothing({ target: profiles.deviceHash, where: sql`${profiles.deletedAt} is null` })
    .returning();
  if (created) return created;
  const [raced] = await db.select().from(profiles).where(live);
  if (!raced) throw new Error('guest profile vanished');
  return raced;
}

/** The account profile for a Supabase user, created on first use. */
async function accountProfile(db: Db, authUserId: string): Promise<Caller> {
  const [found] = await db.select().from(profiles).where(eq(profiles.authUserId, authUserId));
  if (found) return found;
  const [created] = await db
    .insert(profiles)
    .values({ kind: 'account', authUserId })
    .onConflictDoNothing({ target: profiles.authUserId })
    .returning();
  if (created) return created;
  const [raced] = await db.select().from(profiles).where(eq(profiles.authUserId, authUserId));
  if (!raced) throw new Error('account profile vanished');
  return raced;
}

/**
 * With no Supabase config (local dev), only guest tokens are accepted: no
 * request is ever unauthenticated, and accounts need a real project.
 */
export function createAuth(opts: { db: Db; guests: Guests; supabase?: SupabaseAuthConfig; now?: () => number }): Authenticate {
  const { db, guests, supabase } = opts;
  const now = opts.now ?? Date.now;
  const secret = supabase?.jwtSecret ? new TextEncoder().encode(supabase.jwtSecret) : undefined;

  async function verifySupabase(token: string): Promise<{ ok: true; payload: JWTPayload } | { ok: false; reason: AuthFailure }> {
    const options = { audience: 'authenticated', issuer: supabase?.issuer, clockTolerance: 30, currentDate: new Date(now()) };
    try {
      const { alg } = decodeProtectedHeader(token);
      if (alg === 'HS256' && secret) return { ok: true, payload: (await jwtVerify(token, secret, { ...options, algorithms: ['HS256'] })).payload };
      if (alg !== 'HS256' && supabase?.jwks) {
        return { ok: true, payload: (await jwtVerify(token, supabase.jwks, { ...options, algorithms: ['ES256', 'RS256', 'EdDSA'] })).payload };
      }
      return { ok: false, reason: 'invalid' };
    } catch (err) {
      return { ok: false, reason: err instanceof errors.JWTExpired ? 'expired' : 'invalid' };
    }
  }

  return async (authorization) => {
    const token = /^Bearer\s+([\w.~+/-]+=*)$/i.exec(authorization ?? '')?.[1];
    if (!token) return { ok: false, reason: 'missing' };
    let iss: string | undefined;
    try {
      iss = decodeJwt(token).iss;
    } catch {
      return { ok: false, reason: 'malformed' };
    }

    if (iss === GUEST_ISSUER) {
      const v = await guests.verify(token);
      if (!v.ok) return v;
      const [caller] = await db.select().from(profiles).where(and(eq(profiles.id, v.profileId), eq(profiles.kind, 'guest')));
      return caller ? { ok: true, caller } : { ok: false, reason: 'invalid' };
    }

    if (!supabase) return { ok: false, reason: 'invalid' };
    const v = await verifySupabase(token);
    if (!v.ok) return v;
    // The anon and service_role keys are JWTs signed with the same secret: only
    // a signed-in user's token has role `authenticated` and a user id. Supabase
    // anonymous sign-ins are refused too: guests use guest mode and its quota.
    const { sub, role, is_anonymous } = v.payload as JWTPayload & { role?: unknown; is_anonymous?: unknown };
    if (role !== 'authenticated' || typeof sub !== 'string' || !UUID.test(sub) || is_anonymous === true) return { ok: false, reason: 'invalid' };
    return { ok: true, caller: await accountProfile(db, sub.toLowerCase()) };
  };
}

/** Supabase's admin API, used to delete the auth user with the account (the legacy backend's AuthAdmin pattern). */
export function createAuthAdmin(cfg: { url: string; serviceRoleKey: string }) {
  return {
    /** A 404 counts as done, so a retried account deletion succeeds. */
    async deleteUser(authUserId: string): Promise<void> {
      const res = await fetch(`${cfg.url}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
        method: 'DELETE',
        headers: { apikey: cfg.serviceRoleKey, Authorization: `Bearer ${cfg.serviceRoleKey}` },
      });
      if (!res.ok && res.status !== 404) throw new Error(`Supabase auth user delete failed: ${res.status}`);
    },
  };
}
export type AuthAdmin = ReturnType<typeof createAuthAdmin>;
