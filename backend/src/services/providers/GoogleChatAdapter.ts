import { config } from '../../config/env';
import { callOpenAICompatibleChat } from './openAICompatible';
import type { ProviderAdapter, ProviderGenerateRequest, ProviderGenerateResponse } from '../../types/Provider';

/**
 * Google Gemini chat adapter (OpenAI-compatible endpoint).
 * Uses the user's BYOK key — no shared platform key exists.
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/openai
 */
export class GoogleChatAdapter implements ProviderAdapter {
  name = 'google';

  async generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse> {
    const apiKey = request.apiKeyOverride;
    if (!apiKey) {
      throw new Error('Google chat adapter requires an API key (use BYOK)');
    }
    return callOpenAICompatibleChat('google', 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey, request);
  }
}
