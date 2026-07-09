import type { ProviderAdapter, ProviderGenerateRequest, ProviderGenerateResponse } from '../../types/Provider';

/**
 * Deterministic mock provider — used by unit tests and any pipeline step
 * that needs to run offline. Satisfies the same ProviderAdapter contract as
 * OpenCodeZenAdapter (§9.1) so contract tests run against both.
 */
export class MockAdapter implements ProviderAdapter {
  name = 'mock';

  async generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse> {
    const lastMessage = request.messages[request.messages.length - 1]?.content ?? '';
    return {
      content: `[mock response to: ${lastMessage.slice(0, 50)}]`,
      tokensUsed: { input: lastMessage.length, output: 10 },
      finishReason: 'stop',
    };
  }
}
