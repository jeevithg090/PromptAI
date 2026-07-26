import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config/env';
import { estimateTokens } from '../guardrails/TokenGovernor';
import { loadCapabilityMatrix } from './RecommendationService';

/**
 * Cost & Token Simulator (V2.6) — know before you run. Deterministic (no LLM):
 * estimate input tokens, then per-model cost/latency/context-fit for every
 * text-capable model in the capability matrix, using relative list prices from
 * config/model-pricing.json. Explicitly labeled an ESTIMATE, never billing truth.
 */
const pricingSchema = z.object({
  schema_version: z.string(),
  note: z.string().optional(),
  last_verified: z.string().optional(),
  models: z.array(
    z.object({
      model_id: z.string(),
      input_per_1m: z.number().optional(),
      output_per_1m: z.number().optional(),
      per_image: z.number().optional(),
      per_second: z.number().optional(),
    })
  ),
});
type Pricing = z.infer<typeof pricingSchema>;

let cached: Pricing | null = null;
function loadPricing(): Pricing {
  if (cached) return cached;
  const p = config.MODEL_PRICING_PATH ?? path.resolve(__dirname, '..', '..', '..', 'config', 'model-pricing.json');
  cached = pricingSchema.parse(JSON.parse(fs.readFileSync(p, 'utf-8')));
  return cached;
}

const LATENCY_BUCKETS = ['very fast', 'fast', 'moderate', 'slow', 'very slow'];

export interface SimRow {
  model_id: string;
  display_name: string;
  provider: string;
  input_tokens: number;
  est_output_tokens: number;
  est_cost_usd: number | null;
  latency_bucket: string;
  context_fit_pct: number;
  truncation_risk: boolean;
  notes: string;
}

export interface SimResult {
  input_tokens: number;
  disclaimer: string;
  rows: SimRow[];
  cheapest_safe_pick: string | null;
}

export function simulateCost(assembled: string, expectedOutputTokens?: number): SimResult {
  const inputTokens = estimateTokens(assembled);
  const estOutput = expectedOutputTokens ?? Math.max(256, Math.round(inputTokens * 1.5));
  const matrix = loadCapabilityMatrix();
  const pricing = loadPricing();
  const priceById = new Map(pricing.models.map((m) => [m.model_id, m]));

  const rows: SimRow[] = matrix.models
    .filter((m) => m.modalities.includes('text') || m.modalities.includes('code'))
    .map((m) => {
      const p = priceById.get(m.model_id);
      const cost =
        p && p.input_per_1m != null && p.output_per_1m != null
          ? (inputTokens / 1_000_000) * p.input_per_1m + (estOutput / 1_000_000) * p.output_per_1m
          : null;
      const contextFit = m.context_window > 0 ? Math.min(100, Math.round(((inputTokens + estOutput) / m.context_window) * 100)) : 100;
      return {
        model_id: m.model_id,
        display_name: m.display_name,
        provider: m.provider,
        input_tokens: inputTokens,
        est_output_tokens: estOutput,
        est_cost_usd: cost == null ? null : Math.round(cost * 1e6) / 1e6,
        latency_bucket: LATENCY_BUCKETS[m.latency_tier - 1] ?? 'moderate',
        context_fit_pct: contextFit,
        truncation_risk: inputTokens + estOutput > m.context_window && m.context_window > 0,
        notes: m.notes ?? '',
      };
    })
    .sort((a, b) => (a.est_cost_usd ?? Infinity) - (b.est_cost_usd ?? Infinity));

  const cheapest = rows.find((r) => !r.truncation_risk && r.est_cost_usd != null);

  return {
    input_tokens: inputTokens,
    disclaimer: 'Relative estimates for planning only — not billing truth. Prices are approximate public list prices.',
    rows,
    cheapest_safe_pick: cheapest?.model_id ?? null,
  };
}
