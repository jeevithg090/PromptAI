import { buildApp } from '../../src/handlers/routes';
import { PKBService } from '../../src/services/PKBService';
import type { EmbeddingProvider } from '../../src/types/Provider';

/**
 * Security-review controls (§27, T3.8). Verifies the hardening added in the
 * review: secure response headers, body-size cap, request-body validation, and
 * the pgvector non-finite guard. DEV_AUTH_BYPASS (tests/setup.ts) makes the
 * authed routes reachable.
 */
process.env.DEV_AUTH_BYPASS = 'true';

const app = buildApp();

const authed = { Authorization: 'Bearer dev', 'Content-Type': 'application/json' };

describe('secure response headers (T3.8)', () => {
  it('sets X-Content-Type-Options and frame protection', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    // hono secureHeaders sets X-Frame-Options: SAMEORIGIN by default.
    expect(res.headers.get('x-frame-options')).toBeTruthy();
  });
});

describe('body-size cap (T3.8 DoS)', () => {
  it('rejects a body over 100KB with 413', async () => {
    const huge = 'x'.repeat(101 * 1024);
    const res = await app.request('/draft', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ platform_id: 'midjourney', idea: huge }),
    });
    expect(res.status).toBe(413);
  });
});

describe('request body validation (T3.8 input validation)', () => {
  it('rejects /draft with a missing idea (400)', async () => {
    const res = await app.request('/draft', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ platform_id: 'midjourney' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects /draft with a non-string idea (400, no type coercion)', async () => {
    const res = await app.request('/draft', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ platform_id: 'midjourney', idea: 12345 }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects /draft/:id/clarify with a malformed clarifications map (400)', async () => {
    const res = await app.request('/draft/sess-1/clarify', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ platform_id: 'midjourney', idea: 'a horse', clarifications: 'not-an-object' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('pgvector non-finite guard (T3.8 injection defense-in-depth)', () => {
  it('throws when the embedder returns a non-finite vector', async () => {
    const badEmbedder: EmbeddingProvider = {
      name: 'bad',
      embed: async () => [[1, 2, NaN, 4]],
    };
    const pkb = new PKBService(badEmbedder);
    await expect(pkb.retrieve('q', { platform_id: 'midjourney' })).rejects.toThrow(/non-finite/);
  });
});
