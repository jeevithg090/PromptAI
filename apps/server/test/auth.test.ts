import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '../src/app.ts';
import { accountToken, signingKey, world } from './world.ts';

/** Every route behind auth, with a body that would otherwise be valid where one is needed. */
const PROTECTED: Array<[string, string, unknown?]> = [
  ['POST', '/v1/forge', { text: 'hi' }],
  ['POST', '/v1/events', { events: [{ id: randomUUID(), type: 'a', at: '2026-11-13T10:00:00Z' }] }],
  ['POST', '/v1/report', { decisionId: randomUUID(), reason: 'spam' }],
  ['GET', '/v1/me'],
  ['DELETE', '/v1/me'],
  ['POST', '/v1/me/age', { dob: '1990-01-01' }],
  ['PUT', '/v1/me/consent', { entries: [{ purpose: 'cloud_asr', granted: true, version: 'v1' }] }],
  ['GET', '/v1/me/memory'],
  ['POST', '/v1/me/memory', { kind: 'rule', scope: 'global', scopeRef: null, sensitivity: 'normal', text: 'x' }],
  ['PATCH', `/v1/me/memory/${randomUUID()}`, { text: 'y' }],
  ['DELETE', `/v1/me/memory/${randomUUID()}`],
  ['GET', '/v1/me/library'],
  ['POST', '/v1/me/library', { kind: 'brief', toolId: 'claude', title: 't', body: 'b' }],
  ['GET', `/v1/me/library/${randomUUID()}`],
  ['PATCH', `/v1/me/library/${randomUUID()}`, { title: 't2' }],
  ['DELETE', `/v1/me/library/${randomUUID()}`],
  ['GET', '/v1/me/export'],
];

describe('account tokens (Supabase)', () => {
  it('every /v1 route refuses a request without a token', async () => {
    const w = await world();
    for (const [method, path, body] of PROTECTED) {
      const res = await w.call(method, path, undefined, body);
      expect([method, path, res.status, res.body.reason]).toEqual([method, path, 401, 'missing']);
      expect(res.headers.get('www-authenticate')).toBe('Bearer');
    }
    expect((await w.call('GET', '/health')).status).toBe(200);
  });

  it('accepts a valid ES256 token (JWKS) and a valid HS256 token (secret), creating the profile once', async () => {
    const w = await world();
    const sub = randomUUID();
    const first = await w.call('GET', '/v1/me', await accountToken(w.key, { sub }));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ kind: 'account', ageConfirmed: false, handle: null, consents: [] });
    const again = await w.call('GET', '/v1/me', await accountToken('hs256', { sub }));
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
  });

  it('refuses an expired token', async () => {
    const w = await world();
    const res = await w.call('GET', '/v1/me', await accountToken(w.key, { exp: -120 }));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized', reason: 'expired' });
  });

  it('refuses tokens signed by the wrong key, for the wrong audience or issuer, and non-user keys', async () => {
    const w = await world();
    const other = await signingKey('test-key'); // same kid, different key
    const cases = {
      wrongKey: await accountToken(other),
      wrongSecret: await new SignJWT({ role: 'authenticated' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(randomUUID())
        .setAudience('authenticated')
        .setIssuer('https://test-project.supabase.co/auth/v1')
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode('some-other-secret-that-is-long-enough')),
      wrongAudience: await accountToken(w.key, { audience: 'other' }),
      wrongIssuer: await accountToken(w.key, { issuer: 'https://evil.example/auth/v1' }),
      anonKey: await accountToken('hs256', { claims: { role: 'anon' } }),
      serviceRole: await accountToken('hs256', { claims: { role: 'service_role' } }),
      anonymousSignIn: await accountToken(w.key, { claims: { is_anonymous: true } }),
      notAUuid: await accountToken(w.key, { sub: 'user-1' }),
    };
    for (const [name, token] of Object.entries(cases)) {
      const res = await w.call('GET', '/v1/me', token);
      expect([name, res.status, res.body.reason]).toEqual([name, 401, 'invalid']);
    }
    expect((await w.call('GET', '/v1/me', 'not-a-jwt')).body.reason).toBe('malformed');
  });

  it('dev mode (no Supabase config) accepts guest tokens only', async () => {
    const w = await world({ supabase: null });
    const res = await w.call('GET', '/v1/me', await accountToken(w.key));
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('invalid');
    const guest = await w.call('GET', '/v1/me', await w.guestToken());
    expect(guest.status).toBe(200);
    expect(guest.body.kind).toBe('guest');
  });
});

describe('guest mode (ALTCHA proof of work)', () => {
  it('issues a device-bound guest token with the configured quota', async () => {
    const w = await world();
    const res = await w.call('POST', '/v1/guest', undefined, { altcha: await w.solve('device-aaaaaaaa') });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: expect.any(String), expiresAt: expect.any(String), quota: DEFAULT_LIMITS.quota.guest });
    expect(Date.parse(res.body.expiresAt) - Date.now()).toBeGreaterThan(23 * 3600_000);
    const me = await w.call('GET', '/v1/me', res.body.token);
    expect(me.body).toMatchObject({ kind: 'guest', ageConfirmed: false });

    // The same device gets the same guest profile (so the same quota); another device gets its own.
    const again = await w.call('GET', '/v1/me', await w.guestToken('device-aaaaaaaa'));
    expect(again.body.id).toBe(me.body.id);
    const other = await w.call('GET', '/v1/me', await w.guestToken('device-bbbbbbbb'));
    expect(other.body.id).not.toBe(me.body.id);
    // The device id itself is never stored, only its keyed hash.
    const { rows } = await w.db.query<{ device_hash: string }>('select device_hash from profiles');
    expect(rows.map((r) => r.device_hash).join()).not.toContain('device-');
  });

  it('needs a device id to issue a challenge', async () => {
    const w = await world();
    expect((await w.call('GET', '/v1/guest/challenge')).status).toBe(400);
    expect((await w.call('GET', '/v1/guest/challenge', undefined, undefined, { 'x-device-id': 'short' })).status).toBe(400);
  });

  it('refuses a wrong solution, a tampered challenge, an expired challenge and garbage', async () => {
    const w = await world();
    // biome-ignore lint/suspicious/noExplicitAny: the test tampers with arbitrary fields of the decoded payload.
    const decode = (altcha: string) => JSON.parse(Buffer.from(altcha, 'base64').toString()) as any;
    const encode = (p: unknown) => Buffer.from(JSON.stringify(p)).toString('base64');

    const wrong = decode(await w.solve('device-cccccccc'));
    wrong.solution.counter += 1;
    wrong.solution.derivedKey = '00'.repeat(32);
    const tampered = decode(await w.solve('device-cccccccc'));
    tampered.challenge.parameters.data.dh = 'someone-elses-device';
    const expiredWorld = await world({ guestNow: () => Date.now() - 10 * 60_000 }); // challenge TTL is 5 minutes
    const expired = await expiredWorld.solve('device-dddddddd');

    for (const altcha of [encode(wrong), encode(tampered), 'bm90IGpzb24=', encode({ challenge: {}, solution: {} })]) {
      const res = await w.call('POST', '/v1/guest', undefined, { altcha });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'proof_failed' });
    }
    expect((await expiredWorld.call('POST', '/v1/guest', undefined, { altcha: expired })).status).toBe(403);
    expect((await w.call('POST', '/v1/guest', undefined, {})).status).toBe(400);
  });

  it('refuses a guest token signed with another key or edited after signing', async () => {
    const w = await world();
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('promptai')
      .setAudience('promptai:guest')
      .setSubject(randomUUID())
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('not-the-server-key'));
    expect((await w.call('GET', '/v1/me', forged)).body.reason).toBe('invalid');
    const token = await w.guestToken();
    const [h, p, s] = token.split('.');
    const payload = JSON.parse(Buffer.from(p!, 'base64url').toString());
    const tampered = `${h}.${Buffer.from(JSON.stringify({ ...payload, sub: randomUUID() })).toString('base64url')}.${s}`;
    expect((await w.call('GET', '/v1/me', tampered)).body.reason).toBe('invalid');
  });

  it('a guest token expires after 24 hours', async () => {
    let now = Date.now();
    const w = await world({ guestNow: () => now });
    const token = await w.guestToken();
    expect((await w.call('GET', '/v1/me', token)).status).toBe(200);
    now += 24 * 3600_000 + 1000;
    const res = await w.call('GET', '/v1/me', token);
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('expired');
  });

  it('guests have no memory and keep no library (403)', async () => {
    const w = await world();
    const token = await w.guestToken();
    const memory = await w.call('POST', '/v1/me/memory', token, { kind: 'rule', scope: 'global', scopeRef: null, sensitivity: 'normal', text: 'no emoji' });
    expect(memory.status).toBe(403);
    expect(memory.body).toEqual({ error: 'account_required' });
    expect((await w.call('GET', '/v1/me/memory', token)).status).toBe(403);
    expect((await w.call('POST', '/v1/me/library', token, { kind: 'brief', toolId: 'claude', title: 't', body: 'b' })).status).toBe(403);
    expect(await w.orm.$count((await import('@promptai/db')).memoryItems)).toBe(0);
  });

  it('a guest gets the daily forge quota, then a 429 saying what remains', async () => {
    const w = await world({ limits: { ...DEFAULT_LIMITS, quota: { ...DEFAULT_LIMITS.quota, guest: { forgesPerDay: 2, dictationMinutesPerDay: 10 } } } });
    const token = await w.guestToken();
    await w.call('POST', '/v1/me/age', token, { dob: '1990-01-01' });
    const one = await w.call('POST', '/v1/forge', token, { text: 'a' });
    expect(one.status).toBe(200);
    expect(one.headers.get('x-forges-remaining')).toBe('1');
    expect((await w.call('POST', '/v1/forge', token, { text: 'b' })).status).toBe(200);
    const third = await w.call('POST', '/v1/forge', token, { text: 'c' });
    expect(third.status).toBe(429);
    expect(third.body).toEqual({ error: 'quota_exceeded', remaining: { forges: 0, dictationMinutes: 10 }, resetsAt: expect.stringMatching(/T00:00:00.000Z$/) });
  });
});
