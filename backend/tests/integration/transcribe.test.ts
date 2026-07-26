import { buildApp } from '../../src/handlers/routes';
import { config } from '../../src/config/env';
import { logger } from '../../src/utils/logger';

process.env.DEV_AUTH_BYPASS = 'true';

/** F1.3 — POST /transcribe (voice dictation). Provider mocked at fetch. */
function audioForm(bytes: number[], mime = 'audio/webm'): FormData {
  const form = new FormData();
  form.append('audio', new Blob([new Uint8Array(bytes)], { type: mime }), 'clip.webm');
  return form;
}

function mockWhisper(text: string): void {
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ text }),
    text: async () => JSON.stringify({ text }),
  } as Response);
}

describe('POST /transcribe (F1.3)', () => {
  const app = buildApp();
  const auth = { Authorization: 'Bearer dev' };

  afterEach(() => jest.restoreAllMocks());

  it('returns the transcript for a valid audio upload', async () => {
    mockWhisper('a chestnut horse galloping');
    const res = await app.request('/transcribe', { method: 'POST', headers: auth, body: audioForm([1, 2, 3, 4]) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string };
    expect(body.text).toBe('a chestnut horse galloping');
  });

  it('never logs the transcript text (§19.1)', async () => {
    mockWhisper('SECRET_TRANSCRIPT_TOKEN');
    const infoSpy = jest.spyOn(logger, 'info');
    const warnSpy = jest.spyOn(logger, 'warn');
    await app.request('/transcribe', { method: 'POST', headers: auth, body: audioForm([1, 2, 3, 4]) });
    const allLogArgs = JSON.stringify([...infoSpy.mock.calls, ...warnSpy.mock.calls]);
    expect(allLogArgs).not.toContain('SECRET_TRANSCRIPT_TOKEN');
  });

  it('rejects a disallowed mime type with 415', async () => {
    mockWhisper('x');
    const res = await app.request('/transcribe', { method: 'POST', headers: auth, body: audioForm([1, 2], 'application/json') });
    expect(res.status).toBe(415);
  });

  it('rejects audio over 5MB with 413', async () => {
    mockWhisper('x');
    const big = new Array(5 * 1024 * 1024 + 10).fill(0);
    const res = await app.request('/transcribe', { method: 'POST', headers: auth, body: audioForm(big) });
    expect(res.status).toBe(413);
  });

  it('returns 404 when STT is disabled', async () => {
    const prev = config.STT_ENABLED;
    (config as { STT_ENABLED: boolean }).STT_ENABLED = false;
    try {
      const res = await app.request('/transcribe', { method: 'POST', headers: auth, body: audioForm([1, 2]) });
      expect(res.status).toBe(404);
    } finally {
      (config as { STT_ENABLED: boolean }).STT_ENABLED = prev;
    }
  });

  it('enforces the per-user daily cap with 429', async () => {
    mockWhisper('ok');
    // Fresh app → fresh in-memory cap map (isolated from the other tests).
    const freshApp = buildApp();
    const prev = config.STT_REQUESTS_PER_DAY;
    (config as { STT_REQUESTS_PER_DAY: number }).STT_REQUESTS_PER_DAY = 1;
    try {
      const first = await freshApp.request('/transcribe', { method: 'POST', headers: auth, body: audioForm([1, 2]) });
      expect(first.status).toBe(200);
      const second = await freshApp.request('/transcribe', { method: 'POST', headers: auth, body: audioForm([3, 4]) });
      expect(second.status).toBe(429);
      expect(((await second.json()) as { status: string }).status).toBe('stt_limit');
    } finally {
      (config as { STT_REQUESTS_PER_DAY: number }).STT_REQUESTS_PER_DAY = prev;
    }
  });

  it('returns 503 (not 500) when the provider is down', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('provider down'));
    const res = await app.request('/transcribe', { method: 'POST', headers: auth, body: audioForm([9, 9]) });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { status: string }).status).toBe('stt_unavailable');
  });

  it('GET /features reports the stt flag (public)', async () => {
    const res = await app.request('/features');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stt: boolean };
    expect(typeof body.stt).toBe('boolean');
  });
});
