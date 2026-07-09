import { resolveRoute } from '../ModelRouter';
import { getProvider } from './ProviderRegistry';
import { logger } from '../../utils/logger';
import { config } from '../../config/env';
import type { ModelComplexity, ProviderGenerateRequest, ProviderGenerateResponse } from '../../types/Provider';

/**
 * The one entry point agents use for model calls (§32.2 — no agent imports
 * a provider SDK or ModelRouter directly). Resolves {pipeline_step,
 * complexity} to a provider+model via the routing table, then dispatches.
 *
 * Reasoning-model safety net: routed models (DeepSeek V4 etc.) spend hidden
 * reasoning tokens against max_tokens, so a fixed budget can truncate the
 * real output (finish_reason=length) unpredictably — even on simple inputs.
 * When that happens we transparently retry once with a doubled budget, so
 * callers get complete output without every agent hand-tuning token counts.
 */
const TRUNCATION_RETRY_MULTIPLIER = 2;

export async function generate(
  pipelineStep: string,
  complexity: ModelComplexity,
  request: Omit<ProviderGenerateRequest, 'model'>
): Promise<ProviderGenerateResponse> {
  const route = resolveRoute(pipelineStep, complexity);
  // Load-testing seam (T3.7): force the deterministic mock adapter so a load
  // test measures our orchestration, not a provider's free-tier rate limits.
  // env.ts refuses PROVIDER_FORCE_MOCK in production, so this can't serve real traffic.
  const provider = config.PROVIDER_FORCE_MOCK ? getProvider('mock') : getProvider(route.provider);

  const first = await provider.generate({ ...request, model: route.model_id });
  if (first.finishReason !== 'length') return first;

  const boostedTokens = Math.round((request.maxTokens ?? 1024) * TRUNCATION_RETRY_MULTIPLIER);
  logger.warn({
    type: 'provider:truncation_retry',
    pipelineStep,
    model: route.model_id,
    boostedTokens,
  });
  return provider.generate({ ...request, model: route.model_id, maxTokens: boostedTokens });
}

export { getProvider } from './ProviderRegistry';
export { resolveRoute, loadRoutingTable } from '../ModelRouter';
