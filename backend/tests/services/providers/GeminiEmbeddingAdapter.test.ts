import { GeminiEmbeddingAdapter, EMBEDDING_DIM } from '../../../src/services/providers/GeminiEmbeddingAdapter';
import { MockEmbeddingAdapter } from '../../../src/services/providers/MockEmbeddingAdapter';
import { config } from '../../../src/config/env';

/** T2.6 embedding provider tests — §6. Fetch mocked; no real network. */
describe('GeminiEmbeddingAdapter', () => {
  const savedKey = config.GEMINI_API_KEY;

  beforeEach(() => {
    (config as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = 'test-gemini-key';
  });

  afterEach(() => {
    (config as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = savedKey;
    jest.restoreAllMocks();
  });

  it('L2-normalizes returned vectors (non-default dimensionality is not normalized by Google)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ embedding: { values: [3, 4, 0] } }),
      text: async () => '',
    } as Response);

    const [vec] = await new GeminiEmbeddingAdapter().embed(['hello'], 'document');
    expect(vec).toEqual([0.6, 0.8, 0]);
  });

  it('sends RETRIEVAL_QUERY vs RETRIEVAL_DOCUMENT task types and the 1536 output dimension', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ embedding: { values: [1, 0] } }),
      text: async () => '',
    } as Response);

    await new GeminiEmbeddingAdapter().embed(['q'], 'query');
    const body = JSON.parse((spy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.taskType).toBe('RETRIEVAL_QUERY');
    expect(body.outputDimensionality).toBe(EMBEDDING_DIM);
  });

  it('throws without an API key', async () => {
    (config as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = undefined;
    await expect(new GeminiEmbeddingAdapter().embed(['x'], 'query')).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it('throws on a non-ok response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
      text: async () => 'quota exceeded',
    } as Response);
    await expect(new GeminiEmbeddingAdapter().embed(['x'], 'document')).rejects.toThrow(/429/);
  });
});

describe('MockEmbeddingAdapter', () => {
  it('is deterministic and locality-sensitive (shared words → higher similarity)', async () => {
    const mock = new MockEmbeddingAdapter();
    const [a1, a2, b] = await mock.embed(['horse running fast', 'horse running fast', 'quarterly tax report'], 'document');

    expect(a1).toEqual(a2);
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * (y[i] ?? 0), 0);
    expect(dot(a1!, a2!)).toBeGreaterThan(dot(a1!, b!));
  });
});
