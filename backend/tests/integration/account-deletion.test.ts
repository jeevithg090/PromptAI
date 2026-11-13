import { buildApp } from '../../src/handlers/routes';
import { setPoolForTesting } from '../../src/utils/db';
import { config } from '../../src/config/env';
import type { Pool } from 'pg';

/**
 * DELETE /me (blueprint §18 fix-now): erasure must also revoke the user's
 * stored BYOK keys in SSM and delete their Supabase auth user. Deleting only
 * the database rows left orphaned key material and a login that still worked.
 */
const mockSsm = { deleted: [] as string[], failWith: null as string | null };
jest.mock('@aws-sdk/client-ssm', () => {
  class DeleteParameterCommand { constructor(public input: { Name: string }) {} }
  class GetParameterCommand { constructor(public input: { Name: string }) {} }
  class PutParameterCommand { constructor(public input: { Name: string }) {} }
  class SSMClient {
    async send(cmd: { input: { Name: string } }) {
      if (cmd instanceof DeleteParameterCommand) {
        if (mockSsm.failWith) throw Object.assign(new Error(mockSsm.failWith), { name: mockSsm.failWith });
        mockSsm.deleted.push(cmd.input.Name);
      }
      return {};
    }
  }
  return { SSMClient, DeleteParameterCommand, GetParameterCommand, PutParameterCommand };
});

process.env.DEV_AUTH_BYPASS = 'true';
const USER = '00000000-0000-4000-8000-000000000001'; // DEV_USER_ID under the bypass
const app = buildApp();
const headers = { Authorization: 'Bearer dev' };

function pool() {
  const query = jest.fn().mockImplementation(async (sql: string) => {
    if (sql.startsWith('select secret_ref from provider_connections')) {
      return { rows: [{ secret_ref: '/promptforge/byok/u/openai/c1' }, { secret_ref: '/promptforge/byok/u/groq/c2' }] };
    }
    return { rows: [], rowCount: 1 };
  });
  setPoolForTesting({ query } as unknown as Pool);
  return query;
}

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  mockSsm.deleted = [];
  mockSsm.failWith = null;
  (config as Record<string, unknown>).SUPABASE_URL = 'https://proj.supabase.co';
  (config as Record<string, unknown>).SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, text: async () => '' } as Response);
});

afterEach(() => {
  setPoolForTesting(null);
  jest.restoreAllMocks();
});

describe('DELETE /me', () => {
  it('revokes every stored key and deletes the auth user after the data', async () => {
    const query = pool();
    const res = await app.request('/me', { method: 'DELETE', headers });

    expect(res.status).toBe(200);
    expect(mockSsm.deleted).toEqual(['/promptforge/byok/u/openai/c1', '/promptforge/byok/u/groq/c2']);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://proj.supabase.co/auth/v1/admin/users/${USER}`);
    expect(init.method).toBe('DELETE');
    // The auth user goes last, so a failure earlier leaves the user able to sign in and retry.
    const lastDelete = Math.max(...query.mock.calls.map((_, i) => query.mock.invocationCallOrder[i]));
    expect(fetchSpy.mock.invocationCallOrder[0]).toBeGreaterThan(lastDelete);
    expect(await res.text()).not.toContain('service-role-test');
  });

  it('succeeds on a retry when the keys and auth user are already gone', async () => {
    pool();
    mockSsm.failWith = 'ParameterNotFound';
    fetchSpy.mockResolvedValue({ ok: false, status: 404, text: async () => '' } as Response);
    const res = await app.request('/me', { method: 'DELETE', headers });
    expect(res.status).toBe(200);
  });

  it('deletes no data when a key cannot be revoked', async () => {
    const query = pool();
    mockSsm.failWith = 'ThrottlingException';
    const res = await app.request('/me', { method: 'DELETE', headers });
    expect(res.status).toBe(500);
    expect(query.mock.calls.some(([sql]) => (sql as string).startsWith('delete from'))).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
