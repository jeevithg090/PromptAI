import { RUBRIC_DIMENSIONS, RUBRIC_WEIGHTS, type NodeType, type RubricDimension } from '../types/Prompt';
import type { PipelineContext } from '../types/Agent';
import type {
  DesignedNode,
  DesignedResponse,
  GovernorPresentation,
  StrengthBand,
  StrengthPresentation,
} from '../types/Response';

/**
 * Response Design Layer — spec §8 L6, §9.3, §10.5.
 * Pure transformation, NEVER an LLM call: shapes the quality-checked draft +
 * evaluation + governor report + retrieved knowledge into the single
 * user-facing presentation the web/extension render. All "why this works"
 * grounding comes from the PKB/MPKB the draft was actually built on (§10.5),
 * so explanations are honest, not invented.
 */

/** Friendly labels for node types (§13.1) — UI display only. */
const NODE_LABELS: Record<NodeType, string> = {
  subject: 'Subject',
  action_behavior: 'Action / Behavior',
  setting_context: 'Setting / Context',
  style_aesthetic: 'Style / Aesthetic',
  composition_camera: 'Composition / Camera',
  lighting_mood: 'Lighting / Mood',
  persona_role: 'Persona / Role',
  constraints_rules: 'Constraints / Rules',
  technical_parameters: 'Technical Parameters',
  negative_prompt: 'Negative Prompt',
  output_format: 'Output Format',
};

/** Friendly labels for rubric dimensions (docs/quality-rubric.md) — UI display only. */
const DIMENSION_LABELS: Record<RubricDimension, string> = {
  specificity: 'Specificity',
  unambiguity: 'Unambiguity',
  non_conflict: 'Non-conflict',
  platform_fit: 'Platform fit',
  constraint_completeness: 'Constraint completeness',
  format_determinacy: 'Format determinacy',
  context_efficiency: 'Context efficiency',
  technique_fit: 'Technique fit',
};

/** Score → band (docs/quality-rubric.md §user-facing bands). */
export function scoreBand(score: number): StrengthBand {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Strong';
  if (score >= 40) return 'Solid';
  return 'Needs work';
}

function designStrength(context: PipelineContext): StrengthPresentation | undefined {
  const ev = context.finalDraft?.evaluation ?? context.evaluation;
  if (!ev) return undefined;
  return {
    score: ev.overallStrength,
    band: scoreBand(ev.overallStrength),
    dimensions: RUBRIC_DIMENSIONS.map((d) => ({
      dimension: d,
      label: DIMENSION_LABELS[d],
      score: ev.scores[d],
      weight: RUBRIC_WEIGHTS[d],
    })),
  };
}

function designGovernor(context: PipelineContext): GovernorPresentation {
  const r = context.governorReport;
  if (!r) {
    return { tokenCount: 0, maxPromptTokens: context.platform.max_prompt_tokens, withinLimit: true, nearLimit: false, suggestions: [] };
  }
  return {
    tokenCount: r.tokenCount,
    maxPromptTokens: r.maxPromptTokens,
    withinLimit: !r.exceedsPlatformLength,
    nearLimit: r.nearLimit,
    suggestions: r.suggestions,
  };
}

/**
 * "Why this works" — grounded in the actual PKB/MPKB chunks that fed the
 * draft (§10.5). These are real platform best-practices the draft followed,
 * not generic filler. Deduplicated, capped, highest-trust first.
 */
function designWhyThisWorks(context: PipelineContext): string[] {
  const chunks = context.pkbChunks ?? [];
  const seen = new Set<string>();
  const lessons: string[] = [];
  for (const c of [...chunks].sort((a, b) => b.trustScore - a.trustScore)) {
    const text = c.content.trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      lessons.push(text);
    }
    if (lessons.length >= 4) break;
  }
  return lessons;
}

export function design(context: PipelineContext): DesignedResponse | null {
  const draft = context.finalDraft;
  if (!draft) return null;

  const nodes: DesignedNode[] = draft.nodes.map((n) => ({
    type: n.type,
    label: NODE_LABELS[n.type],
    value: n.value,
    rationale: n.rationale,
    alternatives: n.alternatives,
    locked: n.locked,
    position: n.position,
    defaulted: n.defaulted,
  }));

  const ev = draft.evaluation ?? context.evaluation;

  return {
    platformId: draft.platformId,
    platformName: context.platform.display_name,
    taskType: draft.taskType,
    assembled: draft.assembled,
    nodes,
    strength: designStrength(context),
    whyThisWorks: designWhyThisWorks(context),
    improvementHints: ev?.issues ?? [],
    governor: designGovernor(context),
    defaultedNodeTypes: nodes.filter((n) => n.defaulted).map((n) => n.type),
    refinementCount: draft.refinementCount,
  };
}
