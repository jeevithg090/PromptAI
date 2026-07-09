import { z } from 'zod';

/**
 * Prompt Node taxonomy — spec §13.1.
 * A finalized prompt is an ordered collection of typed, independently
 * editable/swappable nodes (§10.6: independently addressable for localized correction).
 */
export const NODE_TYPES = [
  'subject',
  'action_behavior',
  'setting_context',
  'style_aesthetic',
  'composition_camera',
  'lighting_mood',
  'persona_role',
  'constraints_rules',
  'technical_parameters',
  'negative_prompt',
  'output_format',
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

/** A ranked alternative value for a node, with plain-language rationale (§10.5, §13.2). */
export const nodeAlternativeSchema = z.object({
  value: z.string(),
  rationale: z.string(),
  rank: z.number().int().min(1),
});
export type NodeAlternative = z.infer<typeof nodeAlternativeSchema>;

export const promptNodeSchema = z.object({
  type: z.enum(NODE_TYPES),
  value: z.string(),
  /** Why this value was chosen — grounded in PKB/MPKB (§10.5). */
  rationale: z.string().optional(),
  alternatives: z.array(nodeAlternativeSchema).max(4).default([]),
  locked: z.boolean().default(false),
  position: z.number().int().min(0),
  /** True when "just generate now" filled this node with a default the user never confirmed. */
  defaulted: z.boolean().default(false),
});
export type PromptNode = z.infer<typeof promptNodeSchema>;

/** Rubric dimensions — must stay in lockstep with docs/quality-rubric.md (§10.1). */
export const RUBRIC_DIMENSIONS = [
  'specificity',
  'unambiguity',
  'non_conflict',
  'platform_fit',
  'constraint_completeness',
  'format_determinacy',
  'context_efficiency',
  'technique_fit',
] as const;
export type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number];

/** Per-dimension weights for the 0–100 strength score. Sum = 100. */
export const RUBRIC_WEIGHTS: Record<RubricDimension, number> = {
  specificity: 20,
  unambiguity: 15,
  non_conflict: 15,
  platform_fit: 15,
  constraint_completeness: 15,
  format_determinacy: 8,
  context_efficiency: 6,
  technique_fit: 6,
};

/** Each dimension scored 1–3 (1 = failing → triggers refinement, §10.4). */
export type RubricScores = Record<RubricDimension, 1 | 2 | 3>;

export interface RubricEvaluation {
  rubricVersion: string;
  scores: RubricScores;
  /** 0–100, derived from scores via RUBRIC_WEIGHTS (docs/quality-rubric.md). */
  overallStrength: number;
  /** Specific, actionable issue strings naming the node(s) at fault. */
  issues: string[];
  needsRefinement: boolean;
}

/** Compute the 0–100 strength score exactly as docs/quality-rubric.md defines it. */
export function computeStrength(scores: RubricScores): number {
  let total = 0;
  for (const dim of RUBRIC_DIMENSIONS) {
    total += ((scores[dim] - 1) / 2) * RUBRIC_WEIGHTS[dim];
  }
  return Math.round(total);
}

export const TASK_TYPES = [
  'text_to_image',
  'text_to_video',
  'chat_persona',
  'reasoning_code',
  'extraction_classification',
  'long_form_writing',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

/** The user-facing drafted prompt — output of the Response Design Layer (§8 L6, §9.3). */
export interface DraftPrompt {
  nodes: PromptNode[];
  /** Platform-serialized final string, assembled per registry syntax rules (§13.3). */
  assembled: string;
  platformId: string;
  taskType: TaskType;
  /** Absent until the Critic (T2.9) scores the draft; always present in the final pipeline output. */
  evaluation?: RubricEvaluation;
  refinementCount: number;
}

/** Clarifying question contract — must match docs/clarification-taxonomy.md. */
export const clarifyingQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.enum(['mcq', 'free_text']),
  options: z.array(z.string()).optional(),
  allow_other: z.boolean().default(true),
  maps_to_node: z.enum(NODE_TYPES),
  priority: z.number().int().min(1).max(3),
});
export type ClarifyingQuestion = z.infer<typeof clarifyingQuestionSchema>;
