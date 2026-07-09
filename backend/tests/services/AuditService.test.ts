import { audit } from '../../src/services/AuditService';
import { setPoolForTesting } from '../../src/utils/db';
import type { Pool } from 'pg';

/**
 * AuditService tests — spec §27.1, T3.1.
 * Verifies the insert shape, best-effort failure handling, and the
 * detail-length sanitization guard. Uses a fake pool via setPoolForTesting.
 */
describe('AuditService (§27.1, T3.1)', () => {
  afterEach(() => setPoolForTesting(null));

  function fakePool(): { query: jest.Mock } {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    setPoolForTesting({ query } as unknown as Pool);
    return { query };
  }

  it('inserts the expected row shape with all fields', async () => {
    const { query } = fakePool();
    await audit({
      actor: 'user-1',
      action: 'pipeline:transition',
      status: 'success',
      sessionId: 'sess-1',
      detail: { from: 'created', to: 'context_resolved', agent: 'ContextAgent', durationMs: 5, tokensUsed: 0 },
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/insert into audit_log/);
    expect(params[0]).toBe('user-1');
    expect(params[1]).toBe('pipeline:transition');
    expect(params[2]).toBe('success');
    expect(params[3]).toBe('sess-1');
    expect(JSON.parse(params[4])).toEqual({
      from: 'created',
      to: 'context_resolved',
      agent: 'ContextAgent',
      durationMs: 5,
      tokensUsed: 0,
    });
  });

  it('swallows DB failure (pool.query rejects → no throw)', async () => {
    const query = jest.fn().mockRejectedValue(new Error('connection refused'));
    setPoolForTesting({ query } as unknown as Pool);

    await expect(
      audit({ actor: 'u', action: 'test', status: 'success' })
    ).resolves.toBeUndefined();
  });

  it('swallows getPool() failure when DATABASE_URL is unset', async () => {
    // No fake pool set — getPool() throws because DATABASE_URL is not configured in tests.
    setPoolForTesting(null);

    await expect(
      audit({ actor: 'u', action: 'test', status: 'success' })
    ).resolves.toBeUndefined();
  });

  it('strips detail values longer than 500 chars (privacy guard)', async () => {
    const { query } = fakePool();
    const longValue = 'x'.repeat(501);

    await audit({
      actor: 'u',
      action: 'test',
      status: 'success',
      detail: { short: 'ok', leaked: longValue },
    });

    const [, params] = query.mock.calls[0];
    const detail = JSON.parse(params[4]);
    expect(detail).toHaveProperty('short', 'ok');
    expect(detail).not.toHaveProperty('leaked'); // stripped entirely
  });

  it('keeps detail values at exactly 500 chars (boundary)', async () => {
    const { query } = fakePool();
    const boundaryValue = 'x'.repeat(500);

    await audit({
      actor: 'u',
      action: 'test',
      status: 'success',
      detail: { boundary: boundaryValue },
    });

    const [, params] = query.mock.calls[0];
    const detail = JSON.parse(params[4]);
    expect(detail).toHaveProperty('boundary', boundaryValue);
  });

  it('handles undefined detail and sessionId (nulls in SQL)', async () => {
    const { query } = fakePool();

    await audit({ actor: 'anon', action: 'auth:rejected', status: 'failure' });

    const [, params] = query.mock.calls[0];
    expect(params[3]).toBeNull(); // sessionId → null
    expect(params[4]).toBeNull(); // detail → null
  });
});
