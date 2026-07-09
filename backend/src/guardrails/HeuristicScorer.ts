import {
  RUBRIC_DIMENSIONS,
  computeStrength,
  type DraftPrompt,
  type NodeType,
  type RubricEvaluation,
  type RubricScores,
} from '../types/Prompt';

/**
 * Heuristic Scorer — spec §29.7, §31.4 Step 23 (T3.3).
 *
 * Deterministic, no-LLM fallback for the Critic Agent: when the quality model
 * is unavailable, this produces a RubricEvaluation from simple structural
 * checks so the pipeline can complete with an honest, if approximate, score.
 *
 * The `rubricVersion: 'v1.0-heuristic'` marker and issues note are mandatory
 * — heuristic scores must never be reported as if they were model scores.
 */

/** Vague filler adjectives that indicate low specificity. */
const VAGUE_WORDS = /\b(nice|good|interesting|thing)\b/i;

/** Placeholder patterns that indicate the node was never filled with real content. */
const PLACEHOLDER_PATTERN = /<[^>]+>|\[insert|\byour\b/i;

export interface HeuristicOptions {
  /** Strategy profile required_nodes — for platform_fit scoring. */
  requiredNodes?: NodeType[];
  /** Platform max_prompt_tokens — for context_efficiency scoring. */
  maxPromptTokens?: number;
}

/**
 * Produce a deterministic RubricEvaluation from structural checks on the draft.
 * Scores each dimension 1–3 per the rules in the T3.3 spec.
 */
export function heuristicEvaluation(draft: DraftPrompt, opts?: HeuristicOptions): RubricEvaluation {
  const nodeValues = draft.nodes.map((n) => n.value);
  const avgLen = nodeValues.length > 0
    ? nodeValues.reduce((sum, v) => sum + v.length, 0) / nodeValues.length
    : 0;
  const hasVague = nodeValues.some((v) => VAGUE_WORDS.test(v));
  const hasPlaceholder = nodeValues.some((v) => PLACEHOLDER_PATTERN.test(v));
  const nodeTypes = new Set(draft.nodes.map((n) => n.type));

  // specificity: 1 if placeholder-ish, 3 if avg > 25 chars and no vague words, else 2.
  const specificity: 1 | 2 | 3 = hasPlaceholder
    ? 1
    : avgLen > 25 && !hasVague
      ? 3
      : 2;

  // non_conflict: 2 — unknowable without a model (neutral).
  const non_conflict: 1 | 2 | 3 = 2;

  // platform_fit: 3 if draft has ≥ 60% of required_nodes, else 2.
  const requiredNodes = opts?.requiredNodes ?? [];
  const hasCount = requiredNodes.filter((t) => nodeTypes.has(t)).length;
  const ratio = requiredNodes.length > 0 ? hasCount / requiredNodes.length : 1;
  const platform_fit: 1 | 2 | 3 = ratio >= 0.6 ? 3 : 2;

  // constraint_completeness: 3 if a constraints/technical/negative node exists.
  const hasConstraint =
    nodeTypes.has('constraints_rules') ||
    nodeTypes.has('technical_parameters') ||
    nodeTypes.has('negative_prompt');
  const constraint_completeness: 1 | 2 | 3 = hasConstraint ? 3 : 2;

  // format_determinacy: 3 if output_format or technical_parameters exists.
  const hasFormat = nodeTypes.has('output_format') || nodeTypes.has('technical_parameters');
  const format_determinacy: 1 | 2 | 3 = hasFormat ? 3 : 2;

  // context_efficiency: 3 if assembled length < 80% of max_prompt_tokens * 4 chars.
  const maxChars = (opts?.maxPromptTokens ?? 4000) * 4;
  const context_efficiency: 1 | 2 | 3 = draft.assembled.length < maxChars * 0.8 ? 3 : 2;

  // unambiguity: 2 — neutral (unknowable without a model).
  const unambiguity: 1 | 2 | 3 = 2;

  // technique_fit: 2 — neutral.
  const technique_fit: 1 | 2 | 3 = 2;

  const scores: RubricScores = {
    specificity,
    unambiguity,
    non_conflict,
    platform_fit,
    constraint_completeness,
    format_determinacy,
    context_efficiency,
    technique_fit,
  };

  return {
    rubricVersion: 'v1.0-heuristic',
    scores,
    overallStrength: computeStrength(scores),
    issues: ['Scored heuristically — quality model unavailable'],
    needsRefinement: false,
  };
}
