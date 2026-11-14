/**
 * App-level authorization: every admin route except /admin/health must sit
 * behind adminAuth, and an empty email allowlist must not grant access.
 */
const mockEnv = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_KEY: 'test-key',
  ADMIN_ALLOWED_EMAILS: 'admin@example.com',
  PORT: 3002,
};

jest.mock('../src/config/env.js', () => ({ getEnv: jest.fn(() => mockEnv) }));

const mockGetUser = jest.fn();
const mockRoleLookup = jest.fn();
// Any table query other than the admin_roles lookup resolves to an empty list.
const chain: Record<string, jest.Mock> = {};
for (const m of ['select', 'eq', 'order', 'limit', 'gte', 'gt', 'not', 'upsert', 'single']) {
  chain[m] = jest.fn(() => chain);
}
chain.maybeSingle = mockRoleLookup;
(chain as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
  resolve({ data: [], error: null, count: 0 });

jest.mock('../src/utils/db.js', () => ({
  getDb: jest.fn(() => ({ auth: { getUser: mockGetUser }, from: jest.fn(() => chain) })),
}));

import { app } from '../src/app';

const PROTECTED: Array<[string, string]> = [
  ['GET', '/admin/dashboard'],
  ['GET', '/admin/features'],
  ['PUT', '/admin/features'],
  ['POST', '/admin/kill/drafting'],
  ['GET', '/admin/library/pending'],
  ['POST', '/admin/library/abc/moderate'],
  ['GET', '/admin/registry'],
  ['POST', '/admin/registry/sync'],
  ['GET', '/admin/trace/session-1'],
];

beforeEach(() => {
  mockEnv.ADMIN_ALLOWED_EMAILS = 'admin@example.com';
  mockGetUser.mockReset();
  mockRoleLookup.mockReset().mockResolvedValue({ data: null, error: null });
});

describe('admin app authorization', () => {
  it('serves /admin/health without credentials', async () => {
    const res = await app.request('/admin/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: 'pf-admin' });
  });

  it.each(PROTECTED)('rejects unauthenticated %s %s with 401', async (method, path) => {
    const res = await app.request(path, { method });
    expect(res.status).toBe(401);
  });

  it('rejects a signed-in user who is not on the allowlist and has no admin role', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'someone@example.com' } }, error: null });
    const res = await app.request('/admin/dashboard', { headers: { Authorization: 'Bearer t' } });
    expect(res.status).toBe(403);
  });

  it('does not treat an empty allowlist as "everyone is an admin"', async () => {
    mockEnv.ADMIN_ALLOWED_EMAILS = '';
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'someone@example.com' } }, error: null });
    const res = await app.request('/admin/dashboard', { headers: { Authorization: 'Bearer t' } });
    expect(res.status).toBe(403);
  });

  it('admits an allowlisted email', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'Admin@Example.com' } }, error: null });
    const res = await app.request('/admin/dashboard', { headers: { Authorization: 'Bearer t' } });
    expect(res.status).toBe(200);
  });

  it('admits a user listed in admin_roles even with an empty allowlist', async () => {
    mockEnv.ADMIN_ALLOWED_EMAILS = '';
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2', email: 'ops@example.com' } }, error: null });
    mockRoleLookup.mockResolvedValue({ data: { user_id: 'u2' }, error: null });
    const res = await app.request('/admin/dashboard', { headers: { Authorization: 'Bearer t' } });
    expect(res.status).toBe(200);
  });
});
