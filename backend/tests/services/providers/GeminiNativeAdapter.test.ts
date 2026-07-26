import { GeminiNativeAdapter } from '../../../src/services/providers/GeminiNativeAdapter';
import { config } from '../../../src/config/env';

/** finalplan §A1 / §6.1 — native Gemini chat adapter. Fetch mocked; no real network. */
describe('GeminiNativeAdapter', () => {
  const savedKey = config.GEMINI_API_KEY;

  beforeEach(() => {
    (config as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = 'test-gemini-key';
  });

  afterEach(() => {
    (config as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = savedKey;
    jest.restoreAllMocks();
  });

  function okResponse(text: string, finishReason = 'STOP') {
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        candidates: [{ content: { parts: [{ text }] }, finishReason }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }),
      text: async () => '',
    } as unknown as Response;
  }

  it('maps systemPrompt → systemInstruction and assistant → model role', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse('hi'));
    await new GeminiNativeAdapter().generate({
      model: 'gemini-flash-latest',
      systemPrompt: 'be terse',
      messages: [{ role: 'assistant', content: 'prior' }, { role: 'user', content: 'go' }],
    });
    const body = JSON.parse((spy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'be terse' }] });
    expect(body.contents[0].role).toBe('model');
    expect(body.contents[1].role).toBe('user');
  });

  it('requests JSON output and disables thinking by default', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse('{"nodes":[]}'));
    const res = await new GeminiNativeAdapter().generate({
      model: 'gemini-flash-latest',
      messages: [{ role: 'user', content: 'draft' }],
      responseFormat: 'json',
      maxTokens: 800,
      temperature: 0.4,
    });
    const body = JSON.parse((spy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    // thinkingBudget 0 (the default) must NOT be sent — thinking-always-on models 400 on it.
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
    expect(body.generationConfig.maxOutputTokens).toBe(800);
    expect(res.content).toBe('{"nodes":[]}');
    expect(res.finishReason).toBe('stop');
  });

  it('retries once on 429 then succeeds', async () => {
    const spy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => null },
        json: async () => ({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'rate' } }),
        text: async () => '',
      } as unknown as Response)
      .mockResolvedValueOnce(okResponse('recovered'));
    const res = await new GeminiNativeAdapter().generate({
      model: 'gemini-flash-latest',
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(res.content).toBe('recovered');
  });

  it('maps MAX_TOKENS finishReason to length', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(okResponse('partial', 'MAX_TOKENS'));
    const res = await new GeminiNativeAdapter().generate({
      model: 'gemini-flash-latest',
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(res.finishReason).toBe('length');
  });

  it('throws without an API key', async () => {
    (config as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = undefined;
    await expect(
      new GeminiNativeAdapter().generate({ model: 'gemini-flash-latest', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/GEMINI_API_KEY/);
  });
});
