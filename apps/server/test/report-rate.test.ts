import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { reports } from '@promptai/db';
import { DEFAULT_LIMITS, type Limits } from '../src/app.ts';
import { tokenBuckets } from '../src/rate-limit.ts';
import { world } from './world.ts';

const withRate = (rate: Partial<Limits['rate']>): Limits => ({ ...DEFAULT_LIMITS, rate: { ...DEFAULT_LIMITS.rate, ...rate } });

describe('POST /v1/report', () => {
  it('stores a reason code and the optional note against the caller’s draft or artifact, nothing more', async () => {
    const w = await world();
    const { token, id } = await w.adultAccount();
    const { decisionId } = (await w.call('POST', '/v1/forge', token, { text: 'draft me something awful' })).body;
    const artifact = await w.call('POST', '/v1/me/library', token, { kind: 'brief', toolId: 'claude', title: 't', body: 'b' });

    const one = await w.call('POST', '/v1/report', token, { decisionId, reason: 'wrong_or_harmful', note: 'It invented a statistic.' });
    expect(one.status).toBe(201);
    expect(one.body).toEqual({ id: expect.any(String) });
    expect((await w.call('POST', '/v1/report', token, { artifactId: artifact.body.id, reason: 'copyright' })).status).toBe(201);

    const rows = await w.orm.select().from(reports).orderBy(reports.createdAt);
    expect(rows).toEqual([
      { id: one.body.id, userId: id, decisionId, artifactId: null, reason: 'wrong_or_harmful', note: 'It invented a statistic.', status: 'open', createdAt: expect.any(Date) },
      expect.objectContaining({ artifactId: artifact.body.id, reason: 'copyright', note: null }),
    ]);
    expect(JSON.stringify(rows)).not.toContain('awful');
  });

  it('refuses a report without a target, about someone else’s output, or with a long note', async () => {
    const w = await world();
    const me = await w.adultAccount();
    const other = await w.adultAccount();
    const { decisionId } = (await w.call('POST', '/v1/forge', other.token, { text: 'a' })).body;
    expect((await w.call('POST', '/v1/report', me.token, { reason: 'spam' })).status).toBe(400);
    expect((await w.call('POST', '/v1/report', me.token, { decisionId, reason: 'spam' })).status).toBe(404);
    expect((await w.call('POST', '/v1/report', me.token, { decisionId: randomUUID(), reason: 'spam' })).status).toBe(404);
    expect((await w.call('POST', '/v1/report', other.token, { decisionId, reason: 'spam', note: 'x'.repeat(501) })).status).toBe(400);
    expect(await w.orm.$count(reports)).toBe(0);
  });

  it('is rate-limited per caller', async () => {
    const w = await world({ limits: withRate({ report: { capacity: 2, perSecond: 1 / 600 } }) });
    const a = await w.adultAccount();
    const b = await w.adultAccount();
    const { decisionId } = (await w.call('POST', '/v1/forge', a.token, { text: 'a' })).body;
    const report = (token: string) => w.call('POST', '/v1/report', token, { decisionId, reason: 'other' });
    expect((await report(a.token)).status).toBe(201);
    expect((await report(a.token)).status).toBe(201);
    const limited = await report(a.token);
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: 'rate_limited' });
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    // Another caller has their own bucket (their report is a 404: not their decision).
    expect((await report(b.token)).status).toBe(404);
  });
});

describe('rate limits', () => {
  it('limit every /v1 call per caller', async () => {
    const w = await world({ limits: withRate({ api: { capacity: 3, perSecond: 0.001 } }) });
    const { token } = await w.adultAccount(); // two calls: the age gate and GET /v1/me
    expect((await w.call('GET', '/v1/me', token)).status).toBe(200);
    expect((await w.call('GET', '/v1/me', token)).status).toBe(429);
    const other = await w.guestToken();
    expect((await w.call('GET', '/v1/me', other)).status).toBe(200);
  });

  it('limit guest issuance per client IP', async () => {
    const w = await world({ limits: withRate({ guest: { capacity: 3, perSecond: 0.001 } }), deps: { clientIp: (c) => c.req.header('x-test-ip') ?? '?' } });
    const challenge = (ip: string) => w.call('GET', '/v1/guest/challenge', undefined, undefined, { 'x-device-id': 'device-12345678', 'x-test-ip': ip });
    expect((await challenge('10.0.0.1')).status).toBe(200);
    expect((await challenge('10.0.0.1')).status).toBe(200);
    expect((await challenge('10.0.0.1')).status).toBe(200);
    expect((await challenge('10.0.0.1')).status).toBe(429);
    expect((await challenge('10.0.0.2')).status).toBe(200);
  });

  it('token buckets refill at their rate up to their capacity', () => {
    let now = 0;
    const bucket = tokenBuckets({ capacity: 2, perSecond: 0.5 }, () => now);
    expect([bucket.take('k'), bucket.take('k'), bucket.take('k')]).toEqual([0, 0, 2]);
    now = 1_000;
    expect(bucket.take('k')).toBe(1); // half a token back: one more second to go
    now = 2_000;
    expect(bucket.take('k')).toBe(0);
    now = 60_000;
    expect([bucket.take('k'), bucket.take('k'), bucket.take('k')]).toEqual([0, 0, 2]);
    expect(bucket.take('other')).toBe(0);
  });
});
