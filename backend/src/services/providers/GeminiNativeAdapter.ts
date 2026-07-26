import { config } from '../../config/env';
import { callGeminiNative, type GeminiContent } from './geminiNative';
import type { ProviderAdapter, ProviderGenerateRequest, ProviderGenerateResponse } from '../../types/Provider';

/**
 * Google Gemini chat adapter using the NATIVE generateContent endpoint
 * (provider id: 'gemini'). Chosen over the OpenAI-compatible GoogleChatAdapter
 * for the pipeline's drafting/critic steps because the native endpoint gives us
 * strict JSON output and per-call thinking budgets (finalplan §A1).
 *
 * Thinking is disabled by default (thinkingBudget 0) for deterministic,
 * low-latency JSON — override with GEMINI_THINKING_BUDGET when a step benefits
 * from reasoning. Uses the server key (config.GEMINI_API_KEY) unless the request
 * carries a BYOK override.
 */
export class GeminiNativeAdapter implements ProviderAdapter {
  name = 'gemini';

  async generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse> {
    // Gemini has no "system" role — systemInstruction carries the system prompt,
    // and user/assistant turns map to user/model contents.
    const contents: GeminiContent[] = request.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const res = await callGeminiNative({
      model: request.model,
      systemInstruction: request.systemPrompt,
      contents,
      maxOutputTokens: request.maxTokens,
      temperature: request.temperature,
      responseMimeType: request.responseFormat === 'json' ? 'application/json' : undefined,
      thinkingBudget: config.GEMINI_THINKING_BUDGET,
      apiKey: request.apiKeyOverride,
    });

    return {
      content: res.text,
      tokensUsed: res.tokensUsed,
      finishReason: res.finishReason,
    };
  }
}
