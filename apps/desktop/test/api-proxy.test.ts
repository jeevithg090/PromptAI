import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createApiProxy, parseApiRequest } from '../src/api-proxy.ts';
import { fileQueueStore } from '../src/events-store.ts';

describe('api proxy', () => {
  it('forwards the allowed routes with only content-type and authorization', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }, { headers: { 'retry-after': '2', 'set-cookie': 'x=1' } }));
    const proxy = createApiProxy('http://127.0.0.1:9', fetchImpl as unknown as typeof fetch);
    const reply = await proxy({ method: 'PUT', path: '/v1/me/consent', headers: { authorization: 'Bearer t', 'content-type': 'application/json', cookie: 'no' }, body: '{"entries":[]}' });
    expect(reply).toEqual({ status: 200, headers: { 'content-type': 'application/json', 'retry-after': '2' }, body: '{"ok":true}' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://127.0.0.1:9/v1/me/consent');
    expect(init.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer t' });
  });

  it('refuses routes main owns, other hosts and odd methods', () => {
    const ok = (p: string, method = 'GET') => () => parseApiRequest({ method, path: p, headers: {} });
    expect(ok('/v1/guest/challenge')).not.toThrow();
    expect(ok('/v1/me/library/0190f5a2-7c1e-7d3a-9b2f-4f1e2d3c4b5a', 'DELETE')).not.toThrow();
    expect(ok('/v1/report', 'POST')).not.toThrow();
    expect(ok('/v1/forge', 'POST')).toThrow(/route/);
    expect(ok('/v1/events', 'POST')).toThrow(/route/);
    expect(ok('//evil.example/v1/me')).toThrow(/route/);
    expect(ok('/v1/me/../../admin')).toThrow(/route/);
    expect(ok('/v1/me', 'PATCH')).toThrow(/method/);
  });
});

describe('events file store', () => {
  it('round-trips the queue and starts empty without a file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'promptai-events-'));
    const store = fileQueueStore(path.join(dir, 'events-queue.json'));
    expect(await store.load()).toEqual([]);
    const event = { id: '0190f5a2-7c1e-7d3a-9b2f-4f1e2d3c4b5a', type: 'brief.shown', at: '2026-11-13T10:00:00.000Z', props: {} };
    await store.save([event]);
    expect(await store.load()).toEqual([event]);
  });
});
