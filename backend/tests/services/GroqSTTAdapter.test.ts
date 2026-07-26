import { GroqSTTAdapter } from '../../src/services/providers/GroqSTTAdapter';

/** F1.3 — Groq Whisper STT adapter, mocked at the fetch boundary. */
describe('GroqSTTAdapter (F1.3)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('POSTs multipart to /audio/transcriptions with the routed model and returns the transcript', async () => {
    let capturedUrl = '';
    let capturedBody: unknown;
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedBody = (init as RequestInit).body;
      return {
        ok: true,
        status: 200,
        json: async () => ({ text: 'a horse running through water' }),
        text: async () => JSON.stringify({ text: 'a horse running through water' }),
      } as Response;
    });

    const adapter = new GroqSTTAdapter();
    const result = await adapter.transcribe({ audio: Buffer.from([1, 2, 3, 4]), mimeType: 'audio/webm' });

    expect(result.text).toBe('a horse running through water');
    expect(capturedUrl).toContain('/audio/transcriptions');
    // Body is a FormData carrying the model from config/model-routing.json.
    expect(capturedBody).toBeInstanceOf(FormData);
    expect((capturedBody as FormData).get('model')).toBe('whisper-large-v3-turbo');
  });

  it('throws (typed) when the provider returns an HTTP error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'upstream error',
    } as Response);
    const adapter = new GroqSTTAdapter();
    await expect(adapter.transcribe({ audio: Buffer.from([1]), mimeType: 'audio/webm' })).rejects.toThrow(/transcription failed/i);
  });

  it('throws a clear error when GROQ_API_KEY is unset', async () => {
    const prev = process.env.GROQ_API_KEY;
    // config is loaded once; simulate by clearing the module cache is heavy — instead
    // assert the branch by temporarily blanking the resolved config value.
    const { config } = await import('../../src/config/env');
    const original = config.GROQ_API_KEY;
    (config as { GROQ_API_KEY?: string }).GROQ_API_KEY = undefined;
    try {
      const adapter = new GroqSTTAdapter();
      await expect(adapter.transcribe({ audio: Buffer.from([1]), mimeType: 'audio/webm' })).rejects.toThrow(/GROQ_API_KEY/);
    } finally {
      (config as { GROQ_API_KEY?: string }).GROQ_API_KEY = original;
      process.env.GROQ_API_KEY = prev;
    }
  });
});
