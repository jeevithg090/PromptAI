import { GroundingService } from '../../src/services/GroundingService';
import { config } from '../../src/config/env';

/** finalplan §A2 / §6.1 — doc grounding. Fetch mocked; no real network. */
describe('GroundingService', () => {
  const platform = {
    platform_id: 'midjourney',
    display_name: 'Midjourney',
    docs_url: 'https://docs.midjourney.com/prompt-basics',
  };
  const savedKey = config.GEMINI_API_KEY;

  beforeEach(() => {
    (config as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = 'test-gemini-key';
  });
  afterEach(() => {
    (config as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = savedKey;
    jest.restoreAllMocks();
  });

  function geminiText(text: string, urlMetadata?: unknown) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP', ...(urlMetadata ? { urlContextMetadata: urlMetadata } : {}) }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
      }),
      text: async () => '',
    } as unknown as Response;
  }

  it('extracts rules via url_context and returns doc-grounded chunks', async () => {
    const rules = JSON.stringify([
      { rule: 'Put parameters at the end', quote: '--ar goes last', source_url: 'https://docs.midjourney.com/parameters' },
      { rule: 'Image prompts go first', quote: 'URLs at the start' },
    ]);
    jest.spyOn(global, 'fetch').mockResolvedValue(
      geminiText(rules, { urlMetadata: [{ retrievedUrl: 'https://docs.midjourney.com/prompt-basics', urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS' }] }),
    );

    const chunks = await new GroundingService().ground(platform, 'aspect ratio for landscape');
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.kind).toBe('pkb');
    expect(chunks[0]!.id).toMatch(/^grounded-midjourney-/);
    expect(chunks[0]!.content).toContain('Put parameters at the end');
    expect(chunks[0]!.sourceUrl).toBe('https://docs.midjourney.com/parameters');
    expect(chunks[0]!.trustScore).toBe(0.9);
    // A rule without source_url falls back to the docs URL.
    expect(chunks[1]!.sourceUrl).toBe('https://docs.midjourney.com/prompt-basics');
  });

  it('falls back to fetching the HTML when url_context retrieval fails', async () => {
    const spy = jest.spyOn(global, 'fetch');
    // 1st call (url_context) → retrieval error, empty rules.
    spy.mockResolvedValueOnce(
      geminiText('[]', { urlMetadata: [{ retrievedUrl: 'https://docs.midjourney.com/prompt-basics', urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_ERROR' }] }),
    );
    // 2nd call (DocIngest.fetchDoc) → returns HTML.
    spy.mockResolvedValueOnce({ ok: true, text: async () => '<p>Prompts follow a strict order: image, text, parameters.</p>' } as Response);
    // 3rd call (inline extraction) → rules.
    spy.mockResolvedValueOnce(geminiText(JSON.stringify([{ rule: 'Follow the strict prompt order' }])));

    const chunks = await new GroundingService().ground(platform, 'prompt structure');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toContain('Follow the strict prompt order');
    expect(chunks[0]!.trustScore).toBe(0.75); // fetch-fallback trust
  });

  it('returns [] (never throws) on a malformed model response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(geminiText('not json at all'));
    await expect(new GroundingService().ground(platform, 'x')).resolves.toEqual([]);
  });

  it('returns [] (never throws) when the provider errors', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    await expect(new GroundingService().ground(platform, 'x')).resolves.toEqual([]);
  });

  it('returns [] when no docs_url is configured', async () => {
    const chunks = await new GroundingService().ground({ platform_id: 'x', display_name: 'X', docs_url: undefined }, 'q');
    expect(chunks).toEqual([]);
  });
});
