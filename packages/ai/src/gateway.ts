/**
 * The one adapter from a route (catalog/routes.yaml) to AI SDK call settings on
 * Vercel AI Gateway (blueprint §6 "Routing"). Nothing else in this package
 * knows gateway or provider option names.
 */
import { createGateway, type GatewayProviderOptions } from '@ai-sdk/gateway';
import type { LanguageModel } from 'ai';
import type { Route } from './routes.ts';

/** Where models come from: the gateway in production, a mock in tests. */
export type Transport = { languageModel(modelId: string): Exclude<LanguageModel, string> };

/** The production transport. The key is explicit: no environment or OIDC fallback. */
export function gatewayTransport(apiKey: string): Transport {
  return createGateway({ apiKey });
}

/**
 * Call settings for a route; the caller sends them to `route.models[0]`. Sampling
 * parameters are never set: Claude rejects them (API version 2026-10-21), and no
 * route needs them.
 */
export function callSettings(route: Route) {
  const { mode, effort } = route.thinking;
  const fallbacks = route.models.slice(1);
  const gateway = {
    zeroDataRetention: true,                  // ZDR providers only, fallbacks included
    caching: 'auto',                          // cache markers for the stable prefix (Anthropic needs them)
    ...(fallbacks.length > 0 && { models: fallbacks }),   // tried on failure only; a refusal is a success
  } as const satisfies GatewayProviderOptions;
  return {
    maxOutputTokens: route.maxOutputTokens,   // counts thinking
    reasoning: mode === 'off' ? 'none' : effort,   // portable mapping for non-Claude models (e.g. OpenAI)
    providerOptions: {
      gateway,
      // Exact Claude settings; they take precedence over `reasoning` on Anthropic models.
      anthropic: { thinking: { type: mode === 'off' ? 'disabled' : mode }, effort },
    },
  } as const;
}
