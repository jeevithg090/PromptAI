import { generate } from '../../../src/services/providers';
import * as registry from '../../../src/services/providers/ProviderRegistry';
import { config } from '../../../src/config/env';
import type { ProviderAdapter, ProviderGenerateResponse } from '../../../src/types/Provider';

/** Tests the truncation-aware retry in the generate() entry point. */
function resp(finishReason: ProviderGenerateResponse['finishReason'], content = 'x'): ProviderGenerateResponse {
  return { content, tokensUsed: { input: 10, output: 10 }, finishReason };
}

describe('generate() reasoning-model truncation retry', () => {
  afterEach(() => jest.restoreAllMocks());

  it('retries once with a doubled budget when the first call is truncated', async () => {
    const gen = jest
      .fn()
      .mockResolvedValueOnce(resp('length', 'truncated'))
      .mockResolvedValueOnce(resp('stop', 'complete'));
    jest.spyOn(registry, 'getProvider').mockReturnValue({ name: 'mock', generate: gen } as ProviderAdapter);

    const out = await generate('drafting', 'large', { messages: [{ role: 'user', content: 'hi' }], maxTokens: 1000 });

    expect(out.content).toBe('complete');
    expect(gen).toHaveBeenCalledTimes(2);
    expect(gen.mock.calls[0][0].maxTokens).toBe(1000);
    expect(gen.mock.calls[1][0].maxTokens).toBe(2000); // doubled
  });

  it('does not retry when the first call finishes normally', async () => {
    const gen = jest.fn().mockResolvedValueOnce(resp('stop', 'done'));
    jest.spyOn(registry, 'getProvider').mockReturnValue({ name: 'mock', generate: gen } as ProviderAdapter);

    const out = await generate('intent_classification', 'small', { messages: [{ role: 'user', content: 'hi' }], maxTokens: 500 });

    expect(out.content).toBe('done');
    expect(gen).toHaveBeenCalledTimes(1);
  });
});

/** T3.7 load-testing seam: PROVIDER_FORCE_MOCK forces every call to the mock adapter. */
describe('generate() PROVIDER_FORCE_MOCK dispatch', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    config.PROVIDER_FORCE_MOCK = false;
  });

  it('dispatches to the mock provider (not the routed one) when the flag is set', async () => {
    config.PROVIDER_FORCE_MOCK = true;
    const gen = jest.fn().mockResolvedValue(resp('stop', 'mocked'));
    const getProvider = jest
      .spyOn(registry, 'getProvider')
      .mockReturnValue({ name: 'mock', generate: gen } as ProviderAdapter);

    const out = await generate('drafting', 'large', { messages: [{ role: 'user', content: 'hi' }], maxTokens: 1000 });

    expect(out.content).toBe('mocked');
    // Routed provider for 'drafting'/'large' is Groq; force-mock must ignore it and ask for 'mock'.
    expect(getProvider).toHaveBeenCalledWith('mock');
    expect(getProvider).not.toHaveBeenCalledWith('groq');
  });

  it('uses the routed provider when the flag is off', async () => {
    config.PROVIDER_FORCE_MOCK = false;
    const gen = jest.fn().mockResolvedValue(resp('stop', 'routed'));
    const getProvider = jest
      .spyOn(registry, 'getProvider')
      .mockReturnValue({ name: 'groq', generate: gen } as ProviderAdapter);

    await generate('drafting', 'large', { messages: [{ role: 'user', content: 'hi' }], maxTokens: 1000 });

    expect(getProvider).not.toHaveBeenCalledWith('mock');
  });
});
