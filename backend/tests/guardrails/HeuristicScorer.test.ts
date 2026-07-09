import { heuristicEvaluation } from '../../src/guardrails/HeuristicScorer';
import type { DraftPrompt, PromptNode } from '../../src/types/Prompt';

/**
 * HeuristicScorer tests — spec §29.7, T3.3.
 * Verifies the deterministic scoring rules for each rubric dimension.
 */
function node(type: PromptNode['type'], value: string): PromptNode {
  return { type, value, alternatives: [], locked: false, position: 0, defaulted: false };
}

function draft(nodes: PromptNode[], assembled?: string): DraftPrompt {
  return {
    nodes,
    assembled: assembled ?? nodes.map((n) => n.value).join(', '),
    platformId: 'google_gemini',
    taskType: 'text_to_image',
    refinementCount: 0,
  };
}

describe('HeuristicScorer (§29.7, T3.3)', () => {
  it('marks the rubric version as heuristic with an issues note', () => {
    const ev = heuristicEvaluation(draft([node('subject', 'a horse')]));
    expect(ev.rubricVersion).toBe('v1.0-heuristic');
    expect(ev.issues).toContain('Scored heuristically — quality model unavailable');
    expect(ev.needsRefinement).toBe(false);
  });

  it('scores specificity 3 for long, concrete node values', () => {
    const ev = heuristicEvaluation(draft([
      node('subject', 'a majestic chestnut horse galloping through water'),
      node('style_aesthetic', 'photorealistic photography with dramatic lighting'),
    ]));
    expect(ev.scores.specificity).toBe(3);
  });

  it('scores specificity 1 when placeholder patterns are present', () => {
    const ev = heuristicEvaluation(draft([node('subject', '<your subject here>')]));
    expect(ev.scores.specificity).toBe(1);
  });

  it('scores specificity 2 for short values without vague words', () => {
    const ev = heuristicEvaluation(draft([node('subject', 'a horse')]));
    expect(ev.scores.specificity).toBe(2);
  });

  it('penalizes vague words (nice, good, interesting, thing)', () => {
    const ev = heuristicEvaluation(draft([
      node('subject', 'a nice interesting thing about horses that is good'),
    ]));
    // avg length > 25 but has vague words → not 3; no placeholder → not 1 → 2
    expect(ev.scores.specificity).toBe(2);
  });

  it('scores platform_fit 3 when ≥60% of required_nodes are present', () => {
    const ev = heuristicEvaluation(
      draft([node('subject', 'x'), node('action_behavior', 'y'), node('style_aesthetic', 'z')]),
      { requiredNodes: ['subject', 'action_behavior', 'style_aesthetic', 'setting_context', 'lighting_mood'] }
    );
    // 3 of 5 = 60% → 3
    expect(ev.scores.platform_fit).toBe(3);
  });

  it('scores platform_fit 2 when <60% of required_nodes are present', () => {
    const ev = heuristicEvaluation(
      draft([node('subject', 'x')]),
      { requiredNodes: ['subject', 'action_behavior', 'style_aesthetic', 'setting_context'] }
    );
    // 1 of 4 = 25% → 2
    expect(ev.scores.platform_fit).toBe(2);
  });

  it('scores constraint_completeness 3 when a constraints/technical/negative node exists', () => {
    const ev = heuristicEvaluation(draft([node('subject', 'x'), node('negative_prompt', 'no text')]));
    expect(ev.scores.constraint_completeness).toBe(3);
  });

  it('scores constraint_completeness 2 when no constraint-type node exists', () => {
    const ev = heuristicEvaluation(draft([node('subject', 'x'), node('style_aesthetic', 'y')]));
    expect(ev.scores.constraint_completeness).toBe(2);
  });

  it('scores format_determinacy 3 when output_format or technical_parameters exists', () => {
    const ev = heuristicEvaluation(draft([node('subject', 'x'), node('output_format', 'JSON')]));
    expect(ev.scores.format_determinacy).toBe(3);
  });

  it('scores context_efficiency 3 when assembled is well under the platform limit', () => {
    const ev = heuristicEvaluation(
      draft([node('subject', 'short')], 'short'),
      { maxPromptTokens: 4000 }
    );
    // 5 chars < 80% of 4000*4 = 12800 → 3
    expect(ev.scores.context_efficiency).toBe(3);
  });

  it('scores context_efficiency 2 when assembled exceeds 80% of the limit', () => {
    const longStr = 'x'.repeat(13000);
    const ev = heuristicEvaluation(
      draft([node('subject', longStr)], longStr),
      { maxPromptTokens: 4000 }
    );
    // 13000 > 80% of 4000*4 = 12800 → 2
    expect(ev.scores.context_efficiency).toBe(2);
  });

  it('computes overallStrength via the shared computeStrength', () => {
    const ev = heuristicEvaluation(draft([node('subject', 'a horse')]));
    expect(ev.overallStrength).toBeGreaterThanOrEqual(0);
    expect(ev.overallStrength).toBeLessThanOrEqual(100);
  });
});
