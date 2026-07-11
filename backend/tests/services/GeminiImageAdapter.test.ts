import { GeminiImageAdapter } from '../../src/services/providers/GeminiImageAdapter';
import { config } from '../../src/config/env';

function mockPredictResponse(base64: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      predictions: [{ bytesBase64Encoded: base64, mimeType: 'image/png' }],
    }),
    text: async () => JSON.stringify({ predictions: [{ bytesBase64Encoded: base64, mimeType: 'image/png' }] }),
  } as Response;
}

describe('GeminiImageAdapter (T6.2)', () => {
  beforeEach(() => {
    // Ensure GEMINI_API_KEY is set for tests that use it
    (config as Record<string, unknown>).GEMINI_API_KEY = 'test-key';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns imageBase64 and mime on success', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(mockPredictResponse('iVBORw0KGgo='));
    const adapter = new GeminiImageAdapter();
    const result = await adapter.generateImage('a cat');
    expect(result.imageBase64).toBe('iVBORw0KGgo=');
    expect(result.mime).toBe('image/png');
  });

  it('throws when GEMINI_API_KEY is missing', async () => {
    (config as Record<string, unknown>).GEMINI_API_KEY = undefined;
    const adapter = new GeminiImageAdapter();
    await expect(adapter.generateImage('test')).rejects.toThrow('GEMINI_API_KEY not configured');
  });

  it('throws on HTTP error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad request',
    } as Response);
    const adapter = new GeminiImageAdapter();
    await expect(adapter.generateImage('test')).rejects.toThrow('Gemini image generation failed: 400');
  });

  it('throws when response lacks predictions', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '{}',
    } as Response);
    const adapter = new GeminiImageAdapter();
    await expect(adapter.generateImage('test')).rejects.toThrow('missing image data');
  });
});
