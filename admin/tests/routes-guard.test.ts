// Regression: adminAuth was imported into src/index.ts but never mounted, so
// every /admin/* route was silently open. This test asserts the guard is in
// place on real routes and that /admin/health remains public for probes.

jest.mock('../src/config/env.js', () => ({
  getEnv: jest.fn(() => ({
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_KEY: 'test-key',
    ADMIN_ALLOWED_EMAILS: 'admin@example.com',
    PORT: 3002,
  })),
}));

jest.mock('../src/utils/db.js', () => ({
  getDb: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: { message: 'nope' } }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

describe('admin app route guards', () => {
  // index.ts calls serve() when NODE_ENV !== 'production'. Force production
  // here so importing the module doesn't leave a real socket open.
  process.env.NODE_ENV = 'production';

  it('rejects unauthenticated calls to /admin/library/pending', async () => {
    const mod = await import('../src/index.js');
    const res = await mod.handler(new Request('http://x/admin/library/pending'));
    expect(res.status).toBe(401);
  });

  it('leaves /admin/health open for probes', async () => {
    const mod = await import('../src/index.js');
    const res = await mod.handler(new Request('http://x/admin/health'));
    expect(res.status).toBe(200);
  });
});
