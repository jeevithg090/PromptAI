import { describe, expect, it, vi } from 'vitest';
import { ApiError, createHttpApi } from './client.ts';
import { createFakeApi, sampleDraft } from './fake.ts';

const BASE = 'http://localhost:8787';
const ARTIFACT = {
  id: '0190f5a2-7c1e-7d3a-9b2f-4f1e2d3c4b5a',
  kind: 'brief',
  toolId: 'claude',
  title: 'Launch email',
  body: 'Write a launch email.',
  version: 1,
  visibility: 'private',
  createdAt: '2026-11-13T10:00:00.000Z',
  updatedAt: '2026-11-13T10:00:00.000Z',
};

function client(respond: (url: string, init: RequestInit) => Response | Promise<Response>, token: string | null = 'tok') {
  const fetch = vi.fn(async (url: string, init: RequestInit) => respond(url, init));
  return { api: createHttpApi({ baseUrl: BASE, fetch: fetch as unknown as typeof globalThis.fetch, token: () => token }), fetch };
}

describe('http client', () => {
  it('sends the device id on the guest challenge only', async () => {
    const challenge = { parameters: { algorithm: 'SHA-256', nonce: 'n', salt: 's', cost: 1 } };
    const fetch = vi.fn(async (url: string, _init: RequestInit) => (url.endsWith('/v1/guest/challenge') ? Response.json(challenge) : Response.json({ ageConfirmed: true })));
    const api = createHttpApi({ baseUrl: BASE, fetch: fetch as unknown as typeof globalThis.fetch, deviceId: () => 'device-1234' });
    await api.guestChallenge();
    await api.confirmAge('1990-05-14');
    const headers = fetch.mock.calls.map(([, init]) => (init as RequestInit).headers as Record<string, string>);
    expect(headers[0]!['x-device-id']).toBe('device-1234');
    expect(headers[1]!['x-device-id']).toBeUndefined();
  });

  it('sends the bearer token and JSON to each contract route', async () => {
    const { api, fetch } = client((url) => (url.endsWith('/v1/me/age') ? Response.json({ ageConfirmed: true }) : new Response(null, { status: 204 })));
    await expect(api.confirmAge('1990-05-14')).resolves.toBe(true);
    await api.setConsent([{ purpose: 'llm_processing', granted: false, version: 'v1' }]);
    await api.deleteBrief(ARTIFACT.id);
    await api.deleteAccount();
    const calls = fetch.mock.calls.map(([url, init]) => [init.method, url.replace(BASE, ''), (init.headers as Record<string, string>).authorization, init.body ?? null]);
    expect(calls).toEqual([
      ['POST', '/v1/me/age', 'Bearer tok', '{"dob":"1990-05-14"}'],
      ['PUT', '/v1/me/consent', 'Bearer tok', '{"entries":[{"purpose":"llm_processing","granted":false,"version":"v1"}]}'],
      ['DELETE', `/v1/me/library/${ARTIFACT.id}`, 'Bearer tok', null],
      ['DELETE', '/v1/me', 'Bearer tok', null],
    ]);
  });

  it('reads lists as a bare array or { items }, and refuses what the contract does not allow', async () => {
    const bare = client(() => Response.json([ARTIFACT])).api;
    const wrapped = client(() => Response.json({ items: [ARTIFACT] })).api;
    await expect(bare.library()).resolves.toHaveLength(1);
    await expect(wrapped.library()).resolves.toEqual([ARTIFACT]);
    const junk = client(() => Response.json({ items: [{ ...ARTIFACT, visibility: 'public' }] })).api;
    await expect(junk.library()).rejects.toThrow(/cannot read/);
  });

  it('turns HTTP and network failures into ApiError', async () => {
    const forbidden = client(() => Response.json({ error: 'account_required' }, { status: 403 })).api;
    await expect(forbidden.saveBrief({ kind: 'brief', toolId: 'x', title: 't', body: 'b' })).rejects.toMatchObject({ status: 403, code: 'account_required' });
    const offline = client(() => Promise.reject(new TypeError('fetch failed'))).api;
    const err = await offline.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: null, message: expect.stringContaining("couldn't reach") });
  });

  it('parses a forge response with fields, issues and the coverage map', async () => {
    const draft = sampleDraft({ text: 'x' });
    const { api } = client(() => Response.json(draft));
    const got = await api.forge({ text: 'write a launch email', surface: 'web' });
    expect(got.fields.map((f) => f.id)).toEqual(['subject', 'body']);
    expect(got.coverage.items.map((i) => i.by)).toEqual(['said', 'assumed', 'assumed', 'missing']);
    expect(got.decisionId).toBe(draft.decisionId);
  });

  it('maps /v1/events answers onto the acknowledgement rule', async () => {
    const events = [{ id: '0190f5a2-7c1e-7d3a-9b2f-4f1e2d3c4b5a', type: 'brief.shown', at: '2026-11-13T10:00:00.000Z', props: {} }];
    const ok = client(() => Response.json({ accepted: [events[0]!.id], rejected: [] })).api;
    await expect(ok.sendEvents(events)).resolves.toEqual({ ok: true, accepted: [events[0]!.id], rejected: [] });
    const busy = client(() => Response.json({ error: 'transient' }, { status: 503, headers: { 'retry-after': '2' } })).api;
    await expect(busy.sendEvents(events)).resolves.toEqual({ ok: false, retry: true, status: 503, retryAfterMs: 2000 });
    const bad = client(() => Response.json({ error: 'invalid_request' }, { status: 400 })).api;
    await expect(bad.sendEvents(events)).resolves.toEqual({ ok: false, retry: false, status: 400 });
    const offline = client(() => Promise.reject(new TypeError('fetch failed'))).api;
    await expect(offline.sendEvents(events)).resolves.toEqual({ ok: false, retry: true, status: null });
  });
});

describe('fake api', () => {
  it('keeps the server rules the app relies on', async () => {
    const api = createFakeApi({ now: () => new Date('2026-11-13T00:00:00Z') });
    await expect(api.guest(btoa('{}'))).rejects.toMatchObject({ status: 400 });
    expect(await api.confirmAge('2010-01-01')).toBe(false);
    expect(await api.confirmAge('2008-11-13')).toBe(true); // 18 today
    await expect(api.saveBrief({ kind: 'brief', toolId: 'claude', title: 't', body: 'b' })).rejects.toMatchObject({ status: 403 });
    expect(await api.memory()).toEqual([]); // guests have no memory
  });
});
