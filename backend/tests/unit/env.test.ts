/**
 * Regression test: blank values in .env (e.g. `SUPABASE_JWKS_URL=` with
 * nothing after the `=`) must be treated as unset, not as an invalid URL.
 * Caught live on 2026-07-07 when a real Supabase project's .env had several
 * blank optional fields and `config/env.ts` crashed the whole process.
 */
describe('env config (§32.3)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('does not throw when optional URL/string fields are set to empty string', () => {
    process.env.SUPABASE_JWKS_URL = '';
    process.env.SUPABASE_URL = '';
    process.env.DATABASE_URL = '';
    process.env.ANTHROPIC_API_KEY = '';
    process.env.PORT = '';
    process.env.DEV_AUTH_BYPASS = '';

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { config } = require('../../src/config/env');
    expect(config.SUPABASE_JWKS_URL).toBeUndefined();
    expect(config.SUPABASE_URL).toBeUndefined();
    expect(config.DATABASE_URL).toBeUndefined();
    expect(config.PORT).toBe(3001); // falls back to default
    expect(config.DEV_AUTH_BYPASS).toBe(false); // falls back to default
  });

  it('still validates a genuinely malformed URL', () => {
    process.env.SUPABASE_JWKS_URL = 'not-a-url';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    expect(() => require('../../src/config/env')).toThrow();
  });

  // T3.7: the load-testing mock seam must never serve real traffic.
  it('refuses PROVIDER_FORCE_MOCK=true in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.DEV_AUTH_BYPASS = 'false'; // test setup sets this true; the DEV_AUTH_BYPASS guard would fire first
    process.env.PROVIDER_FORCE_MOCK = 'true';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    expect(() => require('../../src/config/env')).toThrow(/PROVIDER_FORCE_MOCK.*production/);
  });

  it('allows PROVIDER_FORCE_MOCK=true outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.PROVIDER_FORCE_MOCK = 'true';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { config } = require('../../src/config/env');
    expect(config.PROVIDER_FORCE_MOCK).toBe(true);
  });
});
