import { setProgress, getProgress, _clearProgress } from '../../src/services/SessionProgress';
import { buildApp } from '../../src/handlers/routes';

process.env.DEV_AUTH_BYPASS = 'true';

describe('SessionProgress (F2.1)', () => {
  beforeEach(() => _clearProgress());

  it('records and reads back the latest state for the owner', () => {
    setProgress('s1', 'u1', 'drafting');
    setProgress('s1', 'u1', 'critiqued');
    expect(getProgress('s1', 'u1')?.state).toBe('critiqued');
  });

  it('returns null for a different user (no cross-user leak)', () => {
    setProgress('s1', 'u1', 'drafting');
    expect(getProgress('s1', 'u2')).toBeNull();
  });

  it('returns null for an unknown session', () => {
    expect(getProgress('nope', 'u1')).toBeNull();
  });

  it('GET /draft/:id/status returns the state for the owner and 404 otherwise', async () => {
    const app = buildApp();
    setProgress('sess-a', '00000000-0000-4000-8000-000000000001', 'docs_retrieved');
    const ok = await app.request('/draft/sess-a/status', { headers: { Authorization: 'Bearer dev' } });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { state: string }).state).toBe('docs_retrieved');

    const miss = await app.request('/draft/unknown/status', { headers: { Authorization: 'Bearer dev' } });
    expect(miss.status).toBe(404);
  });
});
