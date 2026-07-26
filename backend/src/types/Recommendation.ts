import { z } from 'zod';
import type { PlatformMode } from './Platform';

export const MODALITIES = ['text', 'code', 'image', 'video', 'audio'] as const;
export type Modality = (typeof MODALITIES)[number];

export const reasoningEffortSchema = z.object({
  supported_levels: z.array(z.string()).nullable().optional(),
  default: z.string().nullable().optional(),
  parameter: z.string().nullable().optional(),
  pro_mode: z.boolean().optional(),
  pro_mode_parameter: z.string().optional(),
  adaptive_thinking: z.boolean().optional(),
  adaptive_thinking_parameter: z.string().optional(),
  thinking_always_on: z.boolean().optional(),
  dynamic_thinking: z.boolean().optional(),
  can_disable: z.boolean().optional(),
  disable_parameter: z.string().optional(),
  disable_value: z.union([z.number(), z.string()]).optional(),
  disabled_by_default: z.boolean().optional(),
  budget_min: z.number().optional(),
  budget_max: z.number().optional(),
  dynamic_budget_parameter: z.union([z.number(), z.string()]).optional(),
  notes: z.string().optional(),
}).nullable();
export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>;

export const modelCapabilitySchema = z.object({
  model_id: z.string(),
  display_name: z.string(),
  provider: z.string(),
  platform_id: z.string().optional(),
  modalities: z.array(z.enum(MODALITIES)),
  context_window: z.number().int().nonnegative(),
  max_output_tokens: z.number().int().nonnegative().optional(),
  cost_tier: z.number().int().min(1).max(5),
  latency_tier: z.number().int().min(1).max(5),
  strengths: z.array(z.string()),
  benchmark_scores: z.record(z.string()).optional(),
  reasoning_efforts: reasoningEffortSchema.optional(),
  notes: z.string().optional(),
});
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;

export const capabilityMatrixSchema = z.object({
  schema_version: z.string(),
  note: z.string().optional(),
  last_verified: z.string(),
  models: z.array(modelCapabilitySchema),
  task_profiles: z.record(z.object({
    description: z.string(),
    ideal_strengths: z.array(z.string()),
    cost_sensitivity: z.string().optional(),
    latency_sensitivity: z.string().optional(),
    quality_sensitivity: z.string().optional(),
    recommended_reasoning_effort: z.string().nullable().optional(),
  })).optional(),
});
export type CapabilityMatrix = z.infer<typeof capabilityMatrixSchema>;

export interface RecommendationRequest {
  modality: Modality;
  prioritizeQuality?: number;
  prioritizeCost?: number;
  prioritizeLatency?: number;
  minContextWindow?: number;
  desiredStrengths?: string[];
}

export interface TaskRecommendationRequest {
  task: string;
  task_type?: 'general' | 'coding' | 'reasoning' | 'image_generation' | 'video_generation' | 'classification' | 'extraction' | 'research' | 'writing' | 'long_context' | 'multimodal';
  modality?: Modality;
  prioritizeQuality?: number;
  prioritizeCost?: number;
  prioritizeLatency?: number;
}

export interface Recommendation {
  model: ModelCapability;
  score: number;
  tradeoff: string;
  match_reason: string;
}

export interface ReasoningEffortSuggestion {
  model_id: string;
  display_name: string;
  suggested_effort: string | null;
  supported_levels: string[] | null;
  default_effort: string | null;
  parameter: string | null;
  pro_mode_suggested: boolean;
  notes: string | null;
  description_suffix: string;
}

export interface TaskRecommendation {
  task_type: string;
  task_description: string;
  recommendations: Recommendation[];
  best_model: Recommendation;
  reasoning_effort: ReasoningEffortSuggestion;
  platform_mode: PlatformMode | null;
  pkb_guidance: string[];
  explanation: string;
}