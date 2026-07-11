import { config } from '../../config/env';
import { callOpenAICompatibleChat } from './openAICompatible';
import type { ProviderAdapter, ProviderGenerateRequest, ProviderGenerateResponse } from '../../types/Provider';

/**
 * OpenAI chat adapter — used via BYOK (the platform defaults to using
 * the user's own API key; there is no shared platform key).
 */
export class OpenAIAdapter implements ProviderAdapter {
  name = 'openai';

  async generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse> {
    const apiKey = request.apiKeyOverride;
    if (!apiKey) {
      throw new Error('OpenAI adapter requires an API key (use BYOK)');
    }
    return callOpenAICompatibleChat('openai', 'https://api.openai.com/v1', apiKey, request);
  }
}
