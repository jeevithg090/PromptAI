import { z } from 'zod';

/**
 * Provider abstraction — spec §9.1–9.3, §7.3.
 * Every model call in the pipeline goes through this interface; no agent
 * imports a provider SDK directly (§32.2). Swapping providers/models for a
 * pipeline step is a config edit to the routing table, not a code change.
 */

export interface ProviderMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ProviderGenerateRequest {
  /** Resolved by ModelRouter — the provider-specific model id, e.g. "deepseek-v4-flash". */
  model: string;
  systemPrompt?: string;
  messages: ProviderMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Ask the provider to return strict JSON where supported (§13, structured agent outputs). */
  responseFormat?: 'text' | 'json';
  /** BYOK slot (§7.6, Phase 7) — per-user key overriding the platform default. Unused until Phase 7. */
  apiKeyOverride?: string;
}

export interface ProviderGenerateResponse {
  content: string;
  tokensUsed: { input: number; output: number };
  finishReason: 'stop' | 'length' | 'error';
}

export interface ProviderAdapter {
  name: string;
  generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse>;
}

/**
 * Embedding provider seam — spec §6 (PKB retrieval). Separate from chat
 * because the default chat gateway (OpenCode Zen) has no embeddings
 * endpoint; default embeddings provider is Google Gemini (user decision,
 * 2026-07-07 — free tier, 1536-dim output matches the DB schema).
 */
export interface EmbeddingProvider {
  name: string;
  /** kind steers provider-side task optimization: indexing documents vs. embedding a search query. */
  embed(texts: string[], kind: 'document' | 'query'): Promise<number[][]>;
}

/**
 * Image generation provider seam — separate from chat completions (§12.2, T6.2).
 * The visual preview route calls this directly; it is NOT a ProviderAdapter
 * (which is for text-based chat completions through the ModelRouter).
 */
export interface ImageProvider {
  name: string;
  generateImage(prompt: string): Promise<{ imageBase64: string; mime: string }>;
}

/** Complexity tier for a pipeline step — small/fast vs. stronger models, spec §7.3. */
export type ModelComplexity = 'small' | 'large';

const modelRouteSchema = z.object({
  provider: z.string(),
  model_id: z.string(),
});

export const routingTableSchema = z.object({
  schema_version: z.string(),
  default: modelRouteSchema,
  routes: z.array(
    modelRouteSchema.extend({
      pipeline_step: z.string(),
      complexity: z.enum(['small', 'large']),
    })
  ),
});

export type ModelRoute = z.infer<typeof modelRouteSchema>;
export type RoutingTable = z.infer<typeof routingTableSchema>;
