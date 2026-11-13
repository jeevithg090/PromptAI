import { buildApp } from '../../src/handlers/routes';
import { setPoolForTesting } from '../../src/utils/db';
import { config } from '../../src/config/env';
import type { Pool } from 'pg';

/**
 * Share-link hardening (blueprint §18 fix-now): anyone can report a public
 * share with a reason code, and an admin takedown revokes it with a recorded
 * reason. Reports are content-free: a reason code only, no reporter identity.
 */
process.env.DEV_AUTH_BYPASS = 'true';
(config as Record<string, unknown>).ADMIN_API_KEY = 'test-admin-key';

const app = buildApp();
const json = { 'Content-Type': 'application/json' };
const admin = { ...json, 'x-admin-key': 'test-admin-key' };

function pool(opts: { linkExists: boolean }) {
  const query = jest.fn().mockImplementation(async (sql: string) => {
    if (sql.startsWith('insert into share_reports')) return { rows: [], rowCount: opts.linkExists ? 1 : 0 };
    if (sql.startsWith('update share_links')) return { rows: [], rowCount: opts.linkExists ? 1 : 0 };
    if (sql.includes('from share_reports')) {
      return { rows: [{ slug: 'abc', reports: '3', reasons: ['spam'], last_reported_at: new Date().toISOString() }] };
    }
    return { rows: [], rowCount: 1 };
  });
  setPoolForTesting({ query } as unknown as Pool);
  return query;
}

const sqlCalls = (query: jest.Mock, prefix: string) =>
  query.mock.calls.filter(([sql]) => (sql as string).startsWith(prefix));

afterEach(() => setPoolForTesting(null));

describe('share reports', () => {
  it('records a report with its reason code and nothing else', async () => {
    const query = pool({ linkExists: true });
    const res = await app.request('/share/abc/report', { method: 'POST', headers: json, body: JSON.stringify({ reason: 'spam' }) });
    expect(res.status).toBe(200);
    const [, params] = sqlCalls(query, 'insert into share_reports')[0];
    expect(params).toEqual(['abc', 'spam']);
  });

  it('rejects an unknown reason code', async () => {
    const query = pool({ linkExists: true });
    const res = await app.request('/share/abc/report', { method: 'POST', headers: json, body: JSON.stringify({ reason: 'meh' }) });
    expect(res.status).toBe(400);
    expect(sqlCalls(query, 'insert into share_reports')).toHaveLength(0);
  });

  it('404s for a missing or revoked link', async () => {
    pool({ linkExists: false });
    const res = await app.request('/share/gone/report', { method: 'POST', headers: json, body: JSON.stringify({ reason: 'spam' }) });
    expect(res.status).toBe(404);
  });
});

describe('admin share moderation', () => {
  it('lists reported links for admins only', async () => {
    pool({ linkExists: true });
    expect((await app.request('/admin/share-reports')).status).toBe(401);
    const res = await app.request('/admin/share-reports', { headers: admin });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reports: Array<{ slug: string }> };
    expect(body.reports[0].slug).toBe('abc');
  });

  it('takes a link down with a recorded reason code', async () => {
    const query = pool({ linkExists: true });
    const res = await app.request('/admin/share/abc/takedown', { method: 'POST', headers: admin, body: JSON.stringify({ reason: 'harassment' }) });
    expect(res.status).toBe(200);
    const [, params] = sqlCalls(query, 'update share_links')[0];
    expect(params).toEqual(['abc', 'harassment']);
  });

  it('refuses a takedown without an admin key or a valid reason', async () => {
    pool({ linkExists: true });
    const noKey = await app.request('/admin/share/abc/takedown', { method: 'POST', headers: json, body: JSON.stringify({ reason: 'spam' }) });
    expect(noKey.status).toBe(401);
    const badReason = await app.request('/admin/share/abc/takedown', { method: 'POST', headers: admin, body: JSON.stringify({}) });
    expect(badReason.status).toBe(400);
  });
});
