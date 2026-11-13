import { buildApp } from '../../src/handlers/routes';
import { setPoolForTesting } from '../../src/utils/db';
import { systemPromptOf, dualCompletion as completion } from '../helpers/providerMock';
import type { Pool } from 'pg';

/**
 * BYOK routing (blueprint §18 fix-now). A connection's key may only be sent to
 * the provider it belongs to. The pipeline routes its steps by
 * config/model-routing.json (Groq today), so an OpenAI key must be rejected
 * up front, never sent to Groq as a Bearer token.
 */
jest.mock('@aws-sdk/client-ssm', () => {
  class GetParameterCommand { constructor(public input: { Name: string }) {} }
  class PutParameterCommand { constructor(public input: { Name: string }) {} }
  class DeleteParameterCommand { constructor(public input: { Name: string }) {} }
  class SSMClient {
    async send() {
      return { Parameter: { Value: 'user-own-key' } };
    }
  }
  return { SSMClient, GetParameterCommand, PutParameterCommand, DeleteParameterCommand };
});

process.env.DEV_AUTH_BYPASS = 'true';

const app = buildApp();
const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer dev' };

function poolWithConnection(conn: { provider: string; secret_ref: string } | null) {
  const query = jest.fn().mockImplementation(async (sql: string) => {
    if (sql.includes('from provider_connections where id')) return { rows: conn ? [conn] : [] };
    return { rows: [], rowCount: 1 };
  });
  setPoolForTesting({ query } as unknown as Pool);
}

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
    const system = systemPromptOf(init as RequestInit);
    const payload = system.includes('intent classifier')
      ? completion({ task_type: 'text_to_image', entities: { subject: 'a horse' }, platform_hint: null, confidence: 0.95 })
      : completion({ nodes: [{ type: 'subject', value: 'a horse', alternatives: [] }] });
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) } as Response;
  });
});

afterEach(() => {
  setPoolForTesting(null);
  jest.restoreAllMocks();
});

/** URLs of every fetch that carried the user's own key. */
const urlsGivenUserKey = () =>
  fetchSpy.mock.calls
    .filter(([, init]) => ((init as RequestInit)?.headers as Record<string, string> | undefined)?.Authorization === 'Bearer user-own-key')
    .map(([url]) => String(url));

const draft = (body: Record<string, unknown>) =>
  app.request('/draft', {
    method: 'POST',
    headers,
    body: JSON.stringify({ platform_id: 'google_gemini', idea: 'an image of a horse', just_generate: true, ...body }),
  });

describe('BYOK routing', () => {
  it('rejects a key whose provider does not serve the pipeline, and never sends it', async () => {
    poolWithConnection({ provider: 'openai', secret_ref: '/pf/byok/u/c1' });
    const res = await draft({ connection_id: '00000000-0000-4000-8000-000000000001' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('byok_provider_mismatch');
    expect(urlsGivenUserKey()).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an unknown or revoked connection instead of silently using the server key', async () => {
    poolWithConnection(null);
    const res = await draft({ connection_id: '00000000-0000-4000-8000-000000000002' });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('byok_connection_not_found');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends a key only to its own provider when the provider serves every step', async () => {
    poolWithConnection({ provider: 'groq', secret_ref: '/pf/byok/u/c3' });
    const res = await draft({ connection_id: '00000000-0000-4000-8000-000000000003' });
    expect(res.status).toBe(200);
    const urls = urlsGivenUserKey();
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toContain('api.groq.com');
  });
});
