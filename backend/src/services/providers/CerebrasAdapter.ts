import { config } from '../../config/env';
import { callOpenAICompatibleChat } from './openAICompatible';
import type { ProviderAdapter, ProviderGenerateRequest, ProviderGenerateResponse } from '../../types/Provider';

/**
 * Cerebras adapter — registered as an alternate route (§9.1: "swapping a
 * model for a pipeline step is a config edit"), not the default. Wafer-scale
 * inference, even faster than Groq (1,800-2,600 tok/s), but the free tier
 * caps context at 8,192 tokens — tight for PKB-grounded drafting prompts —
 * so it's a good fit for smaller/faster steps (intent, clarify) rather than
 * the default for everything. Free tier: no card, 1M tokens/day.
 * https://cloud.cerebras.ai
 */
export class CerebrasAdapter implements ProviderAdapter {
  name = 'cerebras';

  async generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse> {
    const apiKey = request.apiKeyOverride ?? config.CEREBRAS_API_KEY;
    if (!apiKey) {
      throw new Error('CEREBRAS_API_KEY not configured');
    }
    return callOpenAICompatibleChat('cerebras', config.CEREBRAS_BASE_URL, apiKey, request);
  }
}
