import { logger } from '../../utils/logger';
import type { ProviderGenerateRequest, ProviderGenerateResponse } from '../../types/Provider';

/**
 * Shared caller for OpenAI-compatible chat/completions endpoints — used by
 * every adapter that speaks this dialect (OpenCode Zen, Groq, Cerebras).
 * Keeps the request/response shape and error handling in one place so
 * adding a new OpenAI-compatible provider is a ~10-line adapter, not a
 * ~70-line copy-paste (§9.1).
 */
interface OpenAiChatCompletionResponse {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export async function callOpenAICompatibleChat(
  providerName: string,
  baseUrl: string,
  apiKey: string,
  request: ProviderGenerateRequest
): Promise<ProviderGenerateResponse> {
  const messages = request.systemPrompt
    ? [{ role: 'system', content: request.systemPrompt }, ...request.messages]
    : request.messages;

  const body: Record<string, unknown> = {
    model: request.model,
    messages,
    max_tokens: request.maxTokens ?? 1024,
    temperature: request.temperature ?? 0.7,
  };
  if (request.responseFormat === 'json') {
    body.response_format = { type: 'json_object' };
  }

  const started = Date.now();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    logger.error({ type: `provider:${providerName}_error`, status: res.status, durationMs: Date.now() - started });
    throw new Error(`${providerName} request failed: ${res.status} ${errorText.slice(0, 200)}`);
  }

  const data = (await res.json()) as OpenAiChatCompletionResponse;
  const choice = data.choices[0];
  if (!choice) {
    throw new Error(`${providerName} returned no choices`);
  }

  logger.info({
    type: `provider:${providerName}_call`,
    model: request.model,
    durationMs: Date.now() - started,
    tokensUsed: (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0),
  });

  const finishReason =
    choice.finish_reason === 'stop' ? 'stop' : choice.finish_reason === 'length' ? 'length' : 'error';

  return {
    content: choice.message.content,
    tokensUsed: {
      input: data.usage?.prompt_tokens ?? 0,
      output: data.usage?.completion_tokens ?? 0,
    },
    finishReason,
  };
}
