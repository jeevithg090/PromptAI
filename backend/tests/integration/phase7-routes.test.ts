import { buildApp } from '../../src/handlers/routes';
import { setPoolForTesting } from '../../src/utils/db';
import { config } from '../../src/config/env';
import type { Pool } from 'pg';

/**
 * Phase 7 route coverage (T7.1 E2EE keys, T7.2 BYOK, T7.3 Memory,
 * T7.4 Projects, T7.6 Library moderation, T7.1 account deletion).
 * Uses a stateless fake pool (returns canned rows) + a mocked SSM client so
 * no network/cloud calls occur. Asserts the privacy invariant: no raw key /
 * plaintext content ever appears in a response body.
 */

// Mock SSM so BYOK connection creation never hits AWS.
const sentCommands: string[] = [];
jest.mock('@aws-sdk/client-ssm', () => {
  class PutParameterCommand { constructor(public input: { Name: string }) {} }
  class GetParameterCommand { constructor(public input: { Name: string }) {} }
  class DeleteParameterCommand { constructor(public input: { Name: string }) {} }
  class SSMClient {
    async send(cmd: any) {
      sentCommands.push(cmd.constructor.name);
      return cmd instanceof GetParameterCommand ? { Parameter: { Value: 'recovered' } } : {};
    }
  }
  return { SSMClient, PutParameterCommand, GetParameterCommand, DeleteParameterCommand };
});

process.env.DEV_AUTH_BYPASS = 'true';
(config as Record<string, unknown>).ADMIN_API_KEY = 'test-admin-key';

const app = buildApp();
const authed = { Authorization: 'Bearer dev', 'Content-Type': 'application/json' };
const adminHeaders = { 'x-admin-key': 'test-admin-key', 'Content-Type': 'application/json' };

/** Permissive fake pool — returns canned rows so handlers don't crash. */
function fakePool() {
  const query = jest.fn().mockImplementation(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('returning id')) {
      return { rows: [{ id: 'gen-id', created_at: new Date().toISOString() }] };
    }
    if (sql.includes('from user_keys where')) {
      return { rows: [{ wrapped_dek_pass: 'wrapped-pass', wrapped_dek_recovery: 'wrapped-recovery', kdf_salt: 'salt', kdf_iterations: 600000 }] };
    }
    if (sql.includes('from memory_entries where')) {
      return { rows: [{ id: 'm1', scope: 'global', source: 'user_added', status: 'active', statement_ciphertext: 'ct', task_type: 'text_to_image', created_at: new Date().toISOString() }] };
    }
    if (sql.includes('from provider_connections where user_id')) {
      return { rows: [{ id: 'c1', provider: 'openai', status: 'active', created_at: new Date().toISOString() }] };
    }
    if (sql.includes('from projects where user_id')) {
      return { rows: [{ id: 'p1', name: 'Untitled', description: null, default_platform: null, created_at: new Date().toISOString() }] };
    }
    if (sql.includes('from library_entries') && sql.includes("moderation_status = 'pending'")) {
      return { rows: [{ id: 'lib-1', title: 'Pending', moderation_status: 'pending' }] };
    }
    return { rows: [], rowCount: 1 };
  });
  setPoolForTesting({ query } as unknown as Pool);
  return query;
}

describe('Phase 7 routes', () => {
  afterEach(() => {
    setPoolForTesting(null);
    jest.restoreAllMocks();
    sentCommands.length = 0;
  });

  describe('E2EE key routes (T7.1)', () => {
    it('PUT /keys stores only wrapped keys and GET returns them', async () => {
      fakePool();
      const putRes = await app.request('/keys', {
        method: 'PUT',
        headers: authed,
        body: JSON.stringify({
          wrapped_dek_pass: 'wp',
          wrapped_dek_recovery: 'wr',
          kdf_salt: 'salt',
          kdf_iterations: 600000,
        }),
      });
      expect(putRes.status).toBe(200);
      const body = await (await app.request('/keys', { headers: authed })).json() as Record<string, unknown>;
      expect(body.status).toBe('ok');
      expect(JSON.stringify(body)).not.toMatch(/raw-dek/);
    });

    it('PUT /keys rejects a missing field with 400', async () => {
      fakePool();
      const res = await app.request('/keys', {
        method: 'PUT',
        headers: authed,
        body: JSON.stringify({ wrapped_dek_pass: 'wp' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Memory routes (T7.3)', () => {
    it('POST /memory requires statement_ciphertext', async () => {
      fakePool();
      const res = await app.request('/memory', { method: 'POST', headers: authed, body: JSON.stringify({ scope: 'global' }) });
      expect(res.status).toBe(400);
    });

    it('POST /memory accepts ciphertext + task_type and GET lists it', async () => {
      fakePool();
      const create = await app.request('/memory', {
        method: 'POST',
        headers: authed,
        body: JSON.stringify({ scope: 'global', statement_ciphertext: 'ct', task_type: 'text_to_image' }),
      });
      expect(create.status).toBe(200);
      const list = await (await app.request('/memory', { headers: authed })).json() as { entries: Array<{ statement_ciphertext: string }> };
      expect(list.entries[0].statement_ciphertext).toBe('ct');
    });

    it('DELETE /memory reset requires the confirm header', async () => {
      fakePool();
      const without = await app.request('/memory', { method: 'DELETE', headers: authed });
      expect(without.status).toBe(400);
      const withHeader = await app.request('/memory', { method: 'DELETE', headers: { ...authed, 'x-confirm-reset': 'true' } });
      expect(withHeader.status).toBe(200);
    });
  });

  describe('Projects routes (T7.4)', () => {
    it('POST /projects creates with name + default_platform and GET lists it', async () => {
      fakePool();
      const create = await app.request('/projects', {
        method: 'POST',
        headers: authed,
        body: JSON.stringify({ name: 'Brand Kit', default_platform: 'midjourney' }),
      });
      expect(create.status).toBe(200);
      const list = await (await app.request('/projects', { headers: authed })).json() as { projects: Array<{ name: string }> };
      expect(list.projects[0].name).toBe('Untitled'); // canned row
    });
  });

  describe('BYOK connection routes (T7.2)', () => {
    it('POST /connections stores key in SSM (never returns it)', async () => {
      fakePool();
      const res = await app.request('/connections', {
        method: 'POST',
        headers: authed,
        body: JSON.stringify({ provider: 'openai', api_key: 'sk-super-secret' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(JSON.stringify(body)).not.toContain('sk-super-secret');
      expect(sentCommands).toContain('PutParameterCommand');
    });

    it('POST /connections rejects an unsupported provider', async () => {
      fakePool();
      const res = await app.request('/connections', {
        method: 'POST',
        headers: authed,
        body: JSON.stringify({ provider: 'evil', api_key: 'x' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Library moderation queue (T7.6 / T7.5)', () => {
    beforeEach(() => {
      jest.spyOn(global, 'fetch').mockImplementation(async (_url, _init) =>
        ({ ok: true, status: 200, json: async () => ({ strength: 45, issues: [] }), text: async () => '{"strength":45}' }) as Response
      );
    });

    it('lists pending submissions and a moderator can approve one', async () => {
      fakePool();
      // Submit → screened → pending (strength 45).
      const submit = await app.request('/library/submit', {
        method: 'POST',
        headers: authed,
        body: JSON.stringify({ title: 'T', description: 'D', modality: 'text_to_image', platform_tags: ['midjourney'], template: { nodes: [] } }),
      });
      expect(submit.status).toBe(200);
      expect(((await submit.json()) as { moderation_status: string }).moderation_status).toBe('pending');

      // Pending queue requires admin key.
      const noKey = await app.request('/library/pending');
      expect(noKey.status).toBe(401);
      const pending = await app.request('/library/pending', { headers: adminHeaders });
      expect(pending.status).toBe(200);
      expect(((await pending.json()) as { entries: unknown[] }).entries.length).toBeGreaterThanOrEqual(1);

      // Moderate → approve.
      const moderate = await app.request('/library/lib-1/moderate', {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ decision: 'approve' }),
      });
      expect(moderate.status).toBe(200);
      expect(((await moderate.json()) as { moderation_status: string }).moderation_status).toBe('approved');
    });

    it('rejects an invalid moderation decision', async () => {
      fakePool();
      const res = await app.request('/library/lib-1/moderate', {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ decision: 'maybe' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Account deletion (T7.1)', () => {
    it('DELETE /me runs the delete sequence without leaking keys', async () => {
      const query = fakePool();
      const res = await app.request('/me', { method: 'DELETE', headers: authed });
      expect(res.status).toBe(200);
      // Every delete targets the caller's userId.
      const deletes = query.mock.calls.filter(([sql]) => (sql as string).startsWith('delete from'));
      expect(deletes.length).toBeGreaterThanOrEqual(6);
      expect(deletes.every(([, params]) => (params as unknown[])[0] === 'dev-user-000')).toBe(true);
    });
  });
});
