import { rateLimitMiddleware, resetBuckets } from '../../src/middleware/rateLimit';
import { setPoolForTesting } from '../../src/utils/db';
import type { Pool } from 'pg';
import type { Context } from 'hono';
import type { AppEnv } from '../../src/types/Http';

/**
 * Rate limit middleware tests — spec §23.4, §16, T3.2.
 * Tests the Postgres fixed-window counter path and the in-memory fallback.
 */
describe('rateLimitMiddleware (§23.4, T3.2)', () => {
  afterEach(() => {
    setPoolForTesting(null);
    resetBuckets();
  });

  /** Minimal mock Hono context for middleware testing. */
  function mockCtx(userId: string): { c: Context<AppEnv>; next: jest.Mock } {
    const next = jest.fn().mockResolvedValue(undefined);
    const c = {
      get: jest.fn().mockReturnValue(userId),
      req: { header: jest.fn().mockReturnValue(null) },
      json: jest.fn().mockImplementation((body: unknown, status: number) => ({ status, body })),
    } as unknown as Context<AppEnv>;
    return { c, next };
  }

  it('allows the request when the Postgres counter is under the limit', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ count: 1 }] });
    setPoolForTesting({ query } as unknown as Pool);

    const { c, next } = mockCtx('user-1');
    await rateLimitMiddleware(c, next);

    expect(next).toHaveBeenCalled();
    // Verify the upsert-increment SQL shape.
    expect(query.mock.calls[0][0]).toMatch(/insert into rate_limits/);
    expect(query.mock.calls[0][0]).toMatch(/on conflict.*do update set count/);
  });

  it('denies with 429 when the Postgres counter exceeds the limit', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ count: 31 }] });
    setPoolForTesting({ query } as unknown as Pool);

    const { c, next } = mockCtx('user-1');
    await rateLimitMiddleware(c, next);

    expect(next).not.toHaveBeenCalled();
    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('rate limit') }),
      429
    );
  });

  it('falls back to in-memory on DB error and allows under-limit requests', async () => {
    setPoolForTesting(null); // no pool — getPool() throws → in-memory fallback

    const { c, next } = mockCtx('user-fallback');
    await rateLimitMiddleware(c, next);

    expect(next).toHaveBeenCalled();
  });

  it('in-memory fallback denies after exhausting the bucket', async () => {
    setPoolForTesting(null);
    const userId = 'user-exhaust';
    // config.RATE_LIMIT_REQUESTS_PER_MINUTE defaults to 30 in tests.
    // Exhaust the bucket with 30 requests, then the 31st should be denied.
    for (let i = 0; i < 30; i++) {
      const { c, next } = mockCtx(userId);
      await rateLimitMiddleware(c, next);
      expect(next).toHaveBeenCalled();
    }
    // 31st request → denied.
    const { c, next } = mockCtx(userId);
    await rateLimitMiddleware(c, next);
    expect(next).not.toHaveBeenCalled();
    expect(c.json).toHaveBeenCalledWith(expect.any(Object), 429);
  });
});
