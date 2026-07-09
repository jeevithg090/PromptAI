import { z } from 'zod';

/**
 * Model & Platform Recommendation types — spec §15.
 * The Model Capability Matrix (§15.1) is perishable KB data; recommendation
 * logic (§15.2) ranks against task constraints and shows the trade-off, not a
 * single winner.
 */
export const MODALITIES = ['text', 'code', 'image', 'video'] as const;
export type Modality = (typeof MODALITIES)[number];

export const modelCapabilitySchema = z.object({
  model_id: z.string(),
  display_name: z.string(),
  provider: z.string(),
  modalities: z.array(z.enum(MODALITIES)),
  context_window: z.number().int().nonnegative(),
  /** Relative bucket 1 (cheapest) … 5 (priciest). Not a live price (§15.1). */
  cost_tier: z.number().int().min(1).max(5),
  /** Relative bucket 1 (fastest) … 5 (slowest). */
  latency_tier: z.number().int().min(1).max(5),
  strengths: z.array(z.string()),
  notes: z.string().optional(),
});
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;

export const capabilityMatrixSchema = z.object({
  schema_version: z.string(),
  note: z.string().optional(),
  last_verified: z.string(),
  models: z.array(modelCapabilitySchema),
});
export type CapabilityMatrix = z.infer<typeof capabilityMatrixSchema>;

/** What the caller is optimizing for. Weights let the UI express user priorities. */
export interface RecommendationRequest {
  modality: Modality;
  /** 0–1 each — how much the user cares about that axis. Defaults balanced. */
  prioritizeQuality?: number;
  prioritizeCost?: number;
  prioritizeLatency?: number;
  /** Rough expected prompt+output size; filters out models whose context can't hold it. */
  minContextWindow?: number;
  /** Optional free-text task strengths to match against (e.g. "reasoning", "long-context"). */
  desiredStrengths?: string[];
}

export interface Recommendation {
  model: ModelCapability;
  score: number; // 0–100, higher = better fit
  /** Human-readable trade-off line (§15.2 — never present a bare winner). */
  tradeoff: string;
}
