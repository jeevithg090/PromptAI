// Runs before any test module (and therefore before config/env.ts parses
// process.env). Sets the dev-auth bypass so HTTP integration tests can reach
// protected routes without Supabase credentials.
process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';
// Real agents (T2.5+) hit the provider layer; tests always mock global.fetch,
// but the adapters check for a key before fetching — give them all a dummy.
process.env.GROQ_API_KEY = 'test-key-never-used-for-real-calls';
process.env.CEREBRAS_API_KEY = 'test-key-never-used-for-real-calls';
process.env.OPENCODE_API_KEY = 'test-key-never-used-for-real-calls';
