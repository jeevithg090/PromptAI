import { config } from '../../config/env';
import { callOpenAICompatibleChat } from './openAICompatible';
import type { ProviderAdapter, ProviderGenerateRequest, ProviderGenerateResponse } from '../../types/Provider';

/**
 * OpenCode Zen adapter (§9.1–9.3). OpenAI-compatible gateway fronting
 * several vendors' models — see config/model-routing.json for the model
 * chosen per pipeline step. No agent talks to this class directly (§32.2).
 */
export class OpenCodeZenAdapter implements ProviderAdapter {
  name = 'opencode_zen';

  async generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse> {
    const apiKey = request.apiKeyOverride ?? config.OPENCODE_API_KEY;
    if (!apiKey) {
      throw new Error('OPENCODE_API_KEY not configured');
    }
    return callOpenAICompatibleChat('opencode_zen', config.OPENCODE_BASE_URL, apiKey, request);
  }
}
