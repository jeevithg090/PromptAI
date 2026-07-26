import { config } from '../../config/env';
import { logger } from '../../utils/logger';

/**
 * Shared caller for Google Gemini's NATIVE generateContent endpoint (not the
 * OpenAI-compatible shim). The native endpoint is what exposes the features we
 * need that the shim does not: strict JSON via responseSchema/responseMimeType,
 * per-call thinking budgets, and the url_context / google_search tools used by
 * GroundingService. Kept in one place so the chat adapter and GroundingService
 * share request-building, 429 backoff, and response parsing (mirrors
 * openAICompatible.ts for the Bearer-style providers).
 *
 * Free-tier keys are RPM-limited — we saw 429 RESOURCE_EXHAUSTED on back-to-back
 * calls in testing — so a single Retry-After-aware backoff retry is built in.
 */

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiPart {
  text?: string;
}

export interface GeminiContent {
  role?: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiTool {
  // Only the shapes we use; the API accepts either (or both) empty-object tools.
  url_context?: Record<string, never>;
  google_search?: Record<string, never>;
}

export interface GeminiNativeRequest {
  model: string;
  systemInstruction?: string;
  contents: GeminiContent[];
  maxOutputTokens?: number;
  temperature?: number;
  /** 'application/json' asks for strict JSON output. */
  responseMimeType?: string;
  /** JSON schema the model must conform to (native structured output). */
  responseSchema?: Record<string, unknown>;
  /** Token budget for internal reasoning. 0 disables thinking (fastest, most deterministic). */
  thinkingBudget?: number;
  tools?: GeminiTool[];
  /** BYOK override; falls back to config.GEMINI_API_KEY. */
  apiKey?: string;
}

export interface GeminiNativeResponse {
  /** Concatenated text of all non-thought parts. */
  text: string;
  tokensUsed: { input: number; output: number };
  finishReason: 'stop' | 'length' | 'error';
  /** Present when tools were used (url_context / google_search). */
  urlContextMetadata?: unknown;
  groundingMetadata?: unknown;
  raw: unknown;
}

interface RawGeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
    urlContextMetadata?: unknown;
    groundingMetadata?: unknown;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { code: number; status: string; message: string };
}

function resolveKey(apiKey?: string): string {
  const key = apiKey ?? config.GEMINI_API_KEY;
  if (!key) throw new Error('Gemini adapter requires GEMINI_API_KEY (or a BYOK override)');
  return key;
}

function mapFinishReason(reason: string | undefined): 'stop' | 'length' | 'error' {
  if (reason === 'STOP') return 'stop';
  if (reason === 'MAX_TOKENS') return 'length';
  return reason ? 'error' : 'stop';
}

/** One POST to generateContent; no retry (callGeminiNative wraps this with backoff). */
async function postOnce(req: GeminiNativeRequest): Promise<{ ok: boolean; status: number; retryAfterMs: number; body: RawGeminiResponse }> {
  const key = resolveKey(req.apiKey);

  const generationConfig: Record<string, unknown> = {};
  if (req.maxOutputTokens != null) generationConfig.maxOutputTokens = req.maxOutputTokens;
  if (req.temperature != null) generationConfig.temperature = req.temperature;
  if (req.responseMimeType) generationConfig.responseMimeType = req.responseMimeType;
  if (req.responseSchema) generationConfig.responseSchema = req.responseSchema;
  // Only send a thinking budget when it's POSITIVE. Thinking-always-on models
  // (e.g. gemini-3.5-flash, which `gemini-flash-latest` can resolve to) reject
  // thinkingBudget:0 with HTTP 400 — omitting it lets the model use its default.
  if (req.thinkingBudget != null && req.thinkingBudget > 0) {
    generationConfig.thinkingConfig = { thinkingBudget: req.thinkingBudget };
  }

  const body: Record<string, unknown> = { contents: req.contents };
  if (req.systemInstruction) body.systemInstruction = { parts: [{ text: req.systemInstruction }] };
  if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;
  if (req.tools?.length) body.tools = req.tools;

  const res = await fetch(`${BASE_URL}/models/${req.model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
    body: JSON.stringify(body),
  });

  const parsed = (await res.json().catch(() => ({}))) as RawGeminiResponse;
  // Defensive: some fetch mocks omit a headers object entirely.
  const retryAfterHeader = res.headers?.get?.('retry-after') ?? null;
  const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;
  return { ok: res.ok, status: res.status, retryAfterMs, body: parsed };
}

/**
 * Call the native Gemini endpoint with one 429-aware backoff retry.
 * Throws on non-retryable errors or an exhausted retry (callers degrade gracefully).
 */
export async function callGeminiNative(req: GeminiNativeRequest): Promise<GeminiNativeResponse> {
  const started = Date.now();
  let attempt = 0;
  const MAX_ATTEMPTS = 2;

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    const { ok, status, retryAfterMs, body } = await postOnce(req);

    if (ok) {
      const candidate = body.candidates?.[0];
      if (!candidate) {
        // No candidate usually means a safety block or empty generation.
        throw new Error('Gemini returned no candidates (possible safety block)');
      }
      const text = (candidate.content?.parts ?? [])
        .map((p) => p.text ?? '')
        .join('')
        .trim();

      logger.info({
        type: 'provider:gemini_native_call',
        model: req.model,
        durationMs: Date.now() - started,
        tokensUsed: (body.usageMetadata?.promptTokenCount ?? 0) + (body.usageMetadata?.candidatesTokenCount ?? 0),
        grounded: Boolean(req.tools?.length),
      });

      return {
        text,
        tokensUsed: {
          input: body.usageMetadata?.promptTokenCount ?? 0,
          output: body.usageMetadata?.candidatesTokenCount ?? 0,
        },
        finishReason: mapFinishReason(candidate.finishReason),
        urlContextMetadata: candidate.urlContextMetadata,
        groundingMetadata: candidate.groundingMetadata,
        raw: body,
      };
    }

    // 429 (rate limit) or 503 (transient) → one backoff retry.
    const retryable = status === 429 || status === 503;
    if (retryable && attempt < MAX_ATTEMPTS) {
      const waitMs = retryAfterMs || 1500;
      logger.warn({ type: 'provider:gemini_backoff', status, waitMs, attempt });
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    const msg = body.error?.message ?? `HTTP ${status}`;
    logger.error({ type: 'provider:gemini_native_error', status, message: msg.slice(0, 200) });
    throw new Error(`Gemini request failed: ${status} ${msg.slice(0, 200)}`);
  }

  throw new Error('Gemini request failed after retries');
}
