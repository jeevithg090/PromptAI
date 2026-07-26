import { design, scoreBand } from '../../src/services/ResponseDesign';
import { govern } from '../../src/guardrails/TokenGovernor';
import type { PipelineContext, KnowledgeChunk } from '../../src/types/Agent';
import type { DraftPrompt, PromptNode, RubricEvaluation } from '../../src/types/Prompt';
import type { Platform } from '../../src/types/Platform';

/** T2.10 tests — pure presentation transform (§8 L6, §10.5). */
const platform: Platform = {
  platform_id: 'google_gemini',
  display_name: 'Google Gemini',
  modalities: ['text', 'image'],
  url_patterns: [],
  dom_fingerprint_selectors: [],
  input_selector_candidates: [],
  docs_url: 'https://ai.google.dev/gemini-api/docs',
  quirks: [],
  syntax_rules: [],
  max_prompt_tokens: 4000,
  tos_reviewed: true,
};

function node(type: PromptNode['type'], value: string, position: number, extra: Partial<PromptNode> = {}): PromptNode {
  return { type, value, rationale: `why ${type}`, alternatives: [], locked: false, position, defaulted: false, ...extra };
}

const evaluation: RubricEvaluation = {
  rubricVersion: 'v1.0',
  scores: {
    specificity: 3, unambiguity: 2, non_conflict: 3, platform_fit: 2,
    constraint_completeness: 2, format_determinacy: 3, context_efficiency: 2, technique_fit: 3,
  },
  overallStrength: 78,
  issues: ['subject could be more specific'],
  needsRefinement: false,
};

const chunks: KnowledgeChunk[] = [
  { id: 'k1', kind: 'pkb', platformId: 'google_gemini', content: 'Use photography vocabulary for Gemini image style.', sourceUrl: 'https://ai.google.dev', ingestedAt: '2026-07-07T00:00:00Z', trustScore: 1 },
  { id: 'k2', kind: 'mpkb', modelFamily: 'llm_general', content: 'Few-shot examples dominate instructions.', sourceUrl: 'https://arxiv.org', ingestedAt: '2026-07-07T00:00:00Z', trustScore: 0.8 },
  { id: 'k3', kind: 'pkb', platformId: 'google_gemini', content: 'Use photography vocabulary for Gemini image style.', sourceUrl: 'https://ai.google.dev', ingestedAt: '2026-07-07T00:00:00Z', trustScore: 0.9 }, // dup content
];

function baseContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  const nodes = [
    node('subject', 'a chestnut horse', 0),
    node('style_aesthetic', 'photorealistic', 1, { alternatives: [{ value: 'oil painting', rationale: 'classic', rank: 1 }] }),
    node('lighting_mood', 'golden hour', 2, { defaulted: true }),
  ];
  const draft: DraftPrompt = {
    nodes,
    assembled: 'a chestnut horse, photorealistic, golden hour.',
    platformId: 'google_gemini',
    taskType: 'text_to_image',
    evaluation,
    refinementCount: 1,
  };
  const context: PipelineContext = {
    userId: 'u1',
    sessionId: 's1',
    platform,
    userIdea: 'a horse',
    taskType: 'text_to_image',
    finalDraft: draft,
    pkbChunks: chunks,
    governorReport: govern(draft.assembled, platform),
    ...overrides,
  };
  return context;
}

describe('scoreBand (docs/quality-rubric.md bands)', () => {
  it.each([
    [0, 'Needs work'],
    [39, 'Needs work'],
    [40, 'Solid'],
    [69, 'Solid'],
    [70, 'Strong'],
    [89, 'Strong'],
    [90, 'Excellent'],
    [100, 'Excellent'],
  ])('%i → %s', (score, band) => {
    expect(scoreBand(score)).toBe(band);
  });
});

describe('ResponseDesign.design (§8 L6, §10.5)', () => {
  it('shapes nodes with friendly labels, preserving values/alternatives/flags', () => {
    const result = design(baseContext())!;
    expect(result.nodes).toHaveLength(3);
    const style = result.nodes.find((n) => n.type === 'style_aesthetic')!;
    expect(style.label).toBe('Style / Aesthetic');
    expect(style.value).toBe('photorealistic');
    expect(style.alternatives[0]?.value).toBe('oil painting');
  });

  it('presents the strength score with band and all 8 weighted dimensions', () => {
    const result = design(baseContext())!;
    expect(result.strength?.score).toBe(78);
    expect(result.strength?.band).toBe('Strong');
    expect(result.strength?.dimensions).toHaveLength(8);
    const spec = result.strength?.dimensions.find((d) => d.dimension === 'specificity');
    expect(spec).toEqual({ dimension: 'specificity', label: 'Specificity', score: 3, weight: 20 });
  });

  it('grounds "why this works" in the retrieved PKB, deduplicated and trust-ordered', () => {
    const result = design(baseContext())!;
    expect(result.whyThisWorks[0]).toBe('Use photography vocabulary for Gemini image style.'); // trust 1.0 first
    expect(result.whyThisWorks).toContain('Few-shot examples dominate instructions.');
    // The duplicate-content chunk (k3) is collapsed.
    expect(result.whyThisWorks.filter((w) => w.startsWith('Use photography'))).toHaveLength(1);
  });

  it('surfaces the Critic issues as improvement hints', () => {
    expect(design(baseContext())!.improvementHints).toEqual(['subject could be more specific']);
  });

  it('reports governance (token count within the platform ceiling)', () => {
    const result = design(baseContext())!;
    expect(result.governor.withinLimit).toBe(true);
    expect(result.governor.maxPromptTokens).toBe(4000);
    expect(result.governor.tokenCount).toBeGreaterThan(0);
  });

  it('flags defaulted node types (§11.2)', () => {
    expect(design(baseContext())!.defaultedNodeTypes).toEqual(['lighting_mood']);
  });

  it('still designs a presentation when the Critic degraded (no evaluation)', () => {
    const ctx = baseContext();
    ctx.finalDraft!.evaluation = undefined;
    ctx.evaluation = undefined;
    const result = design(ctx)!;
    expect(result.strength).toBeUndefined();
    expect(result.nodes.length).toBe(3); // rest of the presentation still renders
    expect(result.improvementHints).toEqual([]);
  });

  it('returns null when there is no draft to present', () => {
    expect(design({ userId: 'u1', sessionId: 's1', platform, userIdea: 'x' })).toBeNull();
  });

  it('surfaces a length warning when the prompt exceeds the platform ceiling', () => {
    const ctx = baseContext();
    const longText = 'word '.repeat(5000);
    ctx.finalDraft!.assembled = longText;
    ctx.governorReport = govern(longText, platform);
    const result = design(ctx)!;
    expect(result.governor.withinLimit).toBe(false);
    expect(result.governor.suggestions.length).toBeGreaterThan(0);
  });
});

describe('grounding (V1.6)', () => {
  it('resolves [P/M] refs to sources with domains and snippets', () => {
    const res = design(baseContext())!;
    expect(res.grounding).toBeDefined();
    const { sources, lessons } = res.grounding!;
    // Numbering matches chunkRefs: k1→P1, k2→M1, k3→P2 (order preserved, kind-scoped counters).
    expect(sources.map((s) => s.ref)).toEqual(['P1', 'M1', 'P2']);
    expect(sources[0]!.domain).toBe('ai.google.dev');
    expect(sources[0]!.snippet).toContain('photography vocabulary');
    // Lessons dedupe identical content and keep a resolvable ref.
    expect(lessons.length).toBe(2);
    expect(lessons.every((l) => l.ref && sources.some((s) => s.ref === l.ref))).toBe(true);
  });

  it('is absent when nothing was retrieved', () => {
    const res = design(baseContext({ pkbChunks: [] }))!;
    expect(res.grounding).toBeUndefined();
  });
});
