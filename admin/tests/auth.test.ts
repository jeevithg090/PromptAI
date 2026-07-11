import { Hono } from 'hono';

jest.mock('../src/config/env.js', () => ({
  getEnv: jest.fn(() => ({
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_KEY: 'test-key',
    ADMIN_ALLOWED_EMAILS: 'admin@example.com',
    PORT: 3002,
  })),
}));

jest.mock('../src/utils/db.js', () => {
  const mockGetUser = jest.fn();
  return {
    getDb: jest.fn(() => ({
      auth: { getUser: mockGetUser },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    })),
    __mockGetUser: mockGetUser,
  };
});

describe('Auth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject requests without Authorization header', async () => {
    const { adminAuth } = await import('../src/middleware/auth.js');
    const app = new Hono();
    app.use('/admin/*', adminAuth);
    app.get('/admin/test', (c) => c.json({ ok: true }));

    const res = await app.request('/admin/test');
    expect(res.status).toBe(401);
  });

  it('should reject requests with non-Bearer Authorization header', async () => {
    const { adminAuth } = await import('../src/middleware/auth.js');
    const app = new Hono();
    app.use('/admin/*', adminAuth);
    app.get('/admin/test', (c) => c.json({ ok: true }));

    const res = await app.request('/admin/test', {
      headers: { Authorization: 'Basic token123' },
    });
    expect(res.status).toBe(401);
  });

  it('should reject invalid Bearer tokens', async () => {
    const { getDb } = jest.requireMock('../src/utils/db.js');
    const mockDb = getDb();
    mockDb.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const { adminAuth } = await import('../src/middleware/auth.js');
    const app = new Hono();
    app.use('/admin/*', adminAuth);
    app.get('/admin/test', (c) => c.json({ ok: true }));

    const res = await app.request('/admin/test', {
      headers: { Authorization: 'Bearer fake-token' },
    });
    expect(res.status).toBe(401);
  });
});
