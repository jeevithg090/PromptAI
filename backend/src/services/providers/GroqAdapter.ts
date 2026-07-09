import { config } from '../../config/env';
import { callOpenAICompatibleChat } from './openAICompatible';
import type { ProviderAdapter, ProviderGenerateRequest, ProviderGenerateResponse } from '../../types/Provider';

/**
 * Groq adapter — default provider as of 2026-07-07 (user decision, switched
 * from OpenCode Zen/DeepSeek to fix reasoning-model latency, see task.md
 * T2.9 perf note). LPU-hosted OPEN-WEIGHT models (Llama, Mixtral, Gemma) —
 * NOT reasoning models, so no hidden-token latency tax. 500+ tok/s.
 * Free tier: no card, 30 req/min. https://console.groq.com
 */
export class GroqAdapter implements ProviderAdapter {
  name = 'groq';

  async generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse> {
    const apiKey = request.apiKeyOverride ?? config.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }
    return callOpenAICompatibleChat('groq', config.GROQ_BASE_URL, apiKey, request);
  }
}
