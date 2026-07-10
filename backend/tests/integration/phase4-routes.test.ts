import { buildApp } from '../../src/handlers/routes';
import { setPoolForTesting } from '../../src/utils/db';
import { config } from '../../src/config/env';
import type { Pool } from 'pg';

/**
 * Regression guard (T4 review, 2026-07-10): the web-helper routes are added to
 * the `authed` sub-app, which is mounted with `app.route('/', authed)`. Hono
 * copies a sub-app's routes at mount time, so the mount MUST happen after every
 * route is registered — otherwise these routes silently 404. This test asserts
 * they are reachable (any non-404 status proves they're mounted).
 */
process.env.DEV_AUTH_BYPASS = 'true';

const app = buildApp();
const authed = { Authorization: 'Bearer dev', 'Content-Type': 'application/json' };

/** Canned OpenAI-compatible completion, routed by a marker in the system prompt. */
function completion(content: unknown): unknown {
  return {
    choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 60, completion_tokens: 40 },
  };
}
function mockProvider() {
  jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
    const body = JSON.parse((init as RequestInit).body as string) as { messages?: Array<{ role: string; content: string }> };
    const system = body.messages?.find((m) => m.role === 'system')?.content ?? '';
    let payload: unknown;
    if (system.includes('refining ONE node')) {
      payload = completion({ value: 'a crimson bicycle', rationale: 'sharper', alternatives: [] });
    } else if (system.includes('intent classifier')) {
      payload = completion({ task_type: 'text_to_image', entities: { subject: 'a horse' }, platform_hint: null, confidence: 0.95 });
    } else if (system.includes('quality critic')) {
      payload = completion({ scores: { specificity: 3, unambiguity: 3, non_conflict: 3, platform_fit: 3, constraint_completeness: 2, format_determinacy: 3, context_efficiency: 3, technique_fit: 3 }, issues: [] });
    } else {
      payload = completion({ nodes: [{ type: 'subject', value: 'a chestnut horse', alternatives: [] }] });
    }
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) } as Response;
  });
}

describe('Phase 4 web-helper routes are mounted (not 404)', () => {
  it('POST /serialize serializes nodes (pure, no DB)', async () => {
    const res = await app.request('/serialize', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ platform_id: 'midjourney', nodes: [{ type: 'subject', value: 'a red bicycle' }] }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { assembled: string }).assembled).toContain('a red bicycle');
  });

  it('POST /fanout serializes across platforms (pure, no DB)', async () => {
    const res = await app.request('/fanout', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ nodes: [{ type: 'subject', value: 'a red bicycle' }], platform_ids: ['midjourney', 'google_gemini'] }),
    });
    expect(res.status).toBe(200);
  });

  it.each(['/sessions', '/export'])('GET %s is mounted (not 404)', async (path) => {
    const res = await app.request(path, { headers: authed });
    expect(res.status).not.toBe(404);
  });

  it.each(['/serialize', '/redraft-node', '/me/bootstrap'])('POST %s is mounted (not 404)', async (path) => {
    const res = await app.request(path, { method: 'POST', headers: authed, body: '{}' });
    expect(res.status).not.toBe(404);
  });
});

describe('POST /redraft-node (T4.5)', () => {
  afterEach(() => jest.restoreAllMocks());

  const nodes = [
    { type: 'subject', value: 'a red bicycle' },
    { type: 'style_aesthetic', value: 'flat vector art', locked: true },
  ];

  it('regenerates a node (mocked provider)', async () => {
    mockProvider();
    const res = await app.request('/redraft-node', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ platform_id: 'midjourney', task_type: 'text_to_image', nodes, target_node_type: 'subject' }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { value: string }).value).toBe('a crimson bicycle');
  });

  it('refuses a locked node with 400', async () => {
    const res = await app.request('/redraft-node', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ platform_id: 'midjourney', task_type: 'text_to_image', nodes, target_node_type: 'style_aesthetic' }),
    });
    expect(res.status).toBe(400);
  });

  it('404s an unknown platform', async () => {
    const res = await app.request('/redraft-node', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ platform_id: 'nope', task_type: 'text_to_image', nodes, target_node_type: 'subject' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('Demo flow (T4.3)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    config.DEMO_ENABLED = true;
  });

  it('GET /demo/examples lists curated examples from config', async () => {
    const res = await app.request('/demo/examples');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { examples: Array<{ example_id: string }> };
    expect(body.examples.length).toBeGreaterThanOrEqual(6);
    expect(body.examples.every((e) => e.example_id)).toBe(true);
  });

  it('POST /demo/draft runs a curated example to a scored draft', async () => {
    mockProvider();
    const res = await app.request('/demo/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ example_id: 'horse-sunset' }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { final_state: string }).final_state).toBe('ready_for_review');
  });

  it('rejects an unknown example_id with 400', async () => {
    const res = await app.request('/demo/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ example_id: 'does-not-exist' }),
    });
    expect(res.status).toBe(400);
  });

  it('404s when DEMO_ENABLED is false', async () => {
    config.DEMO_ENABLED = false;
    const res = await app.request('/demo/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ example_id: 'horse-sunset' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DB-backed web routes with a fake pool (T4.2/T4.7)', () => {
  afterEach(() => setPoolForTesting(null));

  it('GET /sessions returns the caller\'s sessions', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 's1', platform_id: 'midjourney', final_state: 'ready_for_review', strength_score: 90 }] });
    setPoolForTesting({ query } as unknown as Pool);
    const res = await app.request('/sessions', { headers: authed });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessions: unknown[] };
    expect(body.sessions).toHaveLength(1);
    // ownership filter: the sessions query is scoped to the caller's userId
    const sessionsCall = query.mock.calls.find(([sql]) => (sql as string).includes('from sessions'));
    expect(sessionsCall?.[1]).toContain('dev-user-000');
  });

  it('GET /export returns metadata-only export shape', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    setPoolForTesting({ query } as unknown as Pool);
    const res = await app.request('/export', { headers: authed });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { export: { note: string; sessions: unknown[]; prompts: unknown[] } };
    expect(body.export.note).toMatch(/pre-E2EE/);
    expect(Array.isArray(body.export.sessions)).toBe(true);
  });

  it('POST /me/bootstrap upserts idempotently and passes the JWT email (null under dev-bypass)', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    setPoolForTesting({ query } as unknown as Pool);
    const res = await app.request('/me/bootstrap', { method: 'POST', headers: authed });
    expect(res.status).toBe(200);
    // find the app_users insert (the rate limiter also queries via the same pool)
    const insertCall = query.mock.calls.find(([sql]) => (sql as string).includes('app_users'));
    const params = insertCall?.[1] as unknown[];
    expect(params[0]).toBe('dev-user-000'); // id
    expect(params[1]).toBeNull(); // email — null under dev-bypass (no hardcoded placeholder)
  });
});
