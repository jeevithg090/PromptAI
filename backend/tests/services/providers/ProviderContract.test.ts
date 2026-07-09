import { MockAdapter } from '../../../src/services/providers/MockAdapter';
import { OpenCodeZenAdapter } from '../../../src/services/providers/OpenCodeZenAdapter';
import { GroqAdapter } from '../../../src/services/providers/GroqAdapter';
import { CerebrasAdapter } from '../../../src/services/providers/CerebrasAdapter';
import { config, type Env } from '../../../src/config/env';
import type { ProviderAdapter, ProviderGenerateRequest } from '../../../src/types/Provider';

/**
 * Contract tests — spec §9.1 success criterion: "a second mock adapter
 * passes the same contract tests as the real one." Every adapter must
 * satisfy the same shape regardless of what's behind them.
 */
function mockFetchOnce(body: unknown, ok = true, status = 200): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

const sampleRequest: Omit<ProviderGenerateRequest, 'apiKeyOverride'> = {
  model: 'test-model',
  messages: [{ role: 'user', content: 'classify this idea' }],
};

describe('ProviderAdapter contract (§9.1)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function runContractTests(name: string, makeAdapter: () => ProviderAdapter, withFetchMock = false) {
    describe(name, () => {
      it('returns content, tokensUsed, and a valid finishReason', async () => {
        if (withFetchMock) {
          mockFetchOnce({
            choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 3 },
          });
        }
        const adapter = makeAdapter();
        const result = await adapter.generate({ ...sampleRequest, apiKeyOverride: 'test-key' });

        expect(typeof result.content).toBe('string');
        expect(result.content.length).toBeGreaterThan(0);
        expect(typeof result.tokensUsed.input).toBe('number');
        expect(typeof result.tokensUsed.output).toBe('number');
        expect(['stop', 'length', 'error']).toContain(result.finishReason);
      });

      it('exposes a stable `name` field', () => {
        expect(typeof makeAdapter().name).toBe('string');
      });
    });
  }

  runContractTests('MockAdapter', () => new MockAdapter());
  runContractTests('OpenCodeZenAdapter', () => new OpenCodeZenAdapter(), true);
  runContractTests('GroqAdapter', () => new GroqAdapter(), true);
  runContractTests('CerebrasAdapter', () => new CerebrasAdapter(), true);

  // The three OpenAI-compatible adapters share callOpenAICompatibleChat() —
  // one table-driven pass proves that shared code behaves identically for
  // each, rather than tripling near-identical assertions.
  const openAICompatible: Array<{
    name: string;
    make: () => ProviderAdapter;
    envKey: keyof Env;
    errorMatch: RegExp;
  }> = [
    { name: 'OpenCodeZenAdapter', make: () => new OpenCodeZenAdapter(), envKey: 'OPENCODE_API_KEY', errorMatch: /OPENCODE_API_KEY/ },
    { name: 'GroqAdapter', make: () => new GroqAdapter(), envKey: 'GROQ_API_KEY', errorMatch: /GROQ_API_KEY/ },
    { name: 'CerebrasAdapter', make: () => new CerebrasAdapter(), envKey: 'CEREBRAS_API_KEY', errorMatch: /CEREBRAS_API_KEY/ },
  ];

  describe.each(openAICompatible)('$name (OpenAI-compatible)', ({ make, envKey, errorMatch }) => {
    it('maps a non-stop finish_reason correctly', async () => {
      mockFetchOnce({
        choices: [{ message: { content: 'truncated...' }, finish_reason: 'length' }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });
      const result = await make().generate({ ...sampleRequest, apiKeyOverride: 'test-key' });
      expect(result.finishReason).toBe('length');
    });

    it('throws when no API key is configured or overridden', async () => {
      // tests/setup.ts sets a dummy OPENCODE_API_KEY for pipeline tests — clear whichever key applies here.
      const saved = config[envKey];
      (config as Record<string, unknown>)[envKey] = undefined;
      try {
        await expect(make().generate(sampleRequest)).rejects.toThrow(errorMatch);
      } finally {
        (config as Record<string, unknown>)[envKey] = saved;
      }
    });

    it('throws on a non-ok HTTP response', async () => {
      mockFetchOnce({ error: 'bad request' }, false, 400);
      await expect(make().generate({ ...sampleRequest, apiKeyOverride: 'test-key' })).rejects.toThrow(/request failed/);
    });
  });
});
