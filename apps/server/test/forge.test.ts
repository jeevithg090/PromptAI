import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgeResponseSchema, type ForgeResponse } from '@promptai/contract';
import type { Db } from '@promptai/db';
import { createApp, FORGE_TIMEOUT_MS, type AppDeps, type Log } from '../src/app.ts';
import type { Caller } from '../src/auth.ts';
import { account, as, okForge, pglite, quiet } from './helpers.ts';

const noEvents: AppDeps['events'] = { insert: async () => {} };

let db: Db;
let caller: Caller;
beforeAll(async () => {
  db = (await pglite()).orm;
});
beforeEach(async () => {
  caller = await account(db);
});

function app(forge: AppDeps['forge'], log: Log = quiet) {
  return createApp({ forge, events: noEvents, db, auth: as(caller), log });
}

const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await app(async () => okForge).request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('POST /v1/forge', () => {
  it('returns the validated forge result for a parsed request', async () => {
    const forge = vi.fn(async () => okForge);
    const res = await app(forge).request('/v1/forge', post({ text: '  write a haiku  ' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...forgeResponseSchema.parse(okForge), decisionId: expect.any(String) });
    expect(forge).toHaveBeenCalledWith({ text: 'write a haiku', surface: 'web', locale: 'en', answers: {}, incognito: false }, { counts: [], memories: [], toolUsage: [], allowModel: false });
  });

  it('400s with issues on an invalid request, without calling forge', async () => {
    const forge = vi.fn(async () => okForge);
    const res = await app(forge).request('/v1/forge', post({ text: '   ' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { path: string[] }[] };
    expect(body.error).toBe('invalid_request');
    expect(body.issues[0]?.path).toEqual(['text']);
    expect(forge).not.toHaveBeenCalled();
  });

  it('400s on a body that is not JSON', async () => {
    const res = await app(async () => okForge).request('/v1/forge', post('{nope'));
    expect(res.status).toBe(400);
  });

  it('504s at exactly the hard timeout', async () => {
    vi.useFakeTimers();
    const pending = Promise.resolve(app(() => new Promise<ForgeResponse>(() => {})).request('/v1/forge', post({ text: 'slow' })));
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(FORGE_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const res = await pending;
    expect(FORGE_TIMEOUT_MS).toBe(25_000);
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: 'timeout' });
  });

  it('500s when forge returns a schema-invalid result', async () => {
    const bad = { ...okForge, coverage: { covered: -1, total: 0 } };
    const res = await app(async () => bad).request('/v1/forge', post({ text: 'hi' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'invalid_forge_response' });
  });

  it('500s when forge throws', async () => {
    const res = await app(async () => {
      throw new Error('boom');
    }).request('/v1/forge', post({ text: 'hi' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'forge_failed' });
  });

  it('sets a request id and logs JSON lines without request content', async () => {
    const lines: unknown[] = [];
    const secret = 'my secret launch plan';
    const res = await app(
      async () => {
        throw new Error(secret);
      },
      (entry) => lines.push(entry),
    ).request('/v1/forge', post({ text: secret }));
    const id = res.headers.get('x-request-id');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(lines).toContainEqual(expect.objectContaining({ msg: 'request', requestId: id, path: '/v1/forge', status: 500 }));
    expect(lines).toContainEqual(expect.objectContaining({ msg: 'forge_failed', requestId: id, error: 'Error' }));
    expect(JSON.stringify(lines)).not.toContain('secret');
  });
});
