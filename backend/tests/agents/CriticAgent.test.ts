import { CriticAgent } from '../../src/agents/CriticAgent';
import { RUBRIC_DIMENSIONS, type DraftPrompt, type PromptNode, type RubricEvaluation } from '../../src/types/Prompt';
import type { AgentInput, PipelineContext } from '../../src/types/Agent';
import type { Platform } from '../../src/types/Platform';
import type { ProviderGenerateResponse } from '../../src/types/Provider';

/** T2.9 tests — rubric scoring + bounded refine loop, mocked provider. */
const gemini: Platform = {
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

function node(type: PromptNode['type'], value: string, position: number, locked = false): PromptNode {
  return { type, value, alternatives: [], locked, position, defaulted: false };
}

function draft(nodes: PromptNode[]): DraftPrompt {
  return { nodes, assembled: nodes.map((n) => n.value).join(', '), platformId: 'google_gemini', taskType: 'text_to_image', refinementCount: 0 };
}

function ctx(d: DraftPrompt): AgentInput {
  const context: PipelineContext = {
    userId: 'u1',
    sessionId: 's1',
    platform: gemini,
    userIdea: 'a horse',
    taskType: 'text_to_image',
    finalDraft: d,
  };
  return { context, params: {} };
}

function scores(v: 1 | 2 | 3, overrides: Partial<Record<string, 1 | 2 | 3>> = {}): Record<string, number> {
  const base = Object.fromEntries(RUBRIC_DIMENSIONS.map((dim) => [dim, v]));
  return { ...base, ...overrides };
}

/** Queue of canned provider responses (scoring JSON or refine-nodes JSON). */
function provider(...contents: string[]): jest.Mock {
  const fn = jest.fn();
  for (const c of contents) {
    fn.mockResolvedValueOnce({
      content: c,
      tokensUsed: { input: 100, output: 60 },
      finishReason: 'stop',
    } satisfies ProviderGenerateResponse);
  }
  return fn;
}

function scoreJson(s: Record<string, number>, issues: string[] = []): string {
  return JSON.stringify({ scores: s, issues });
}

function evalOf(result: { data?: Record<string, unknown> }): RubricEvaluation {
  return result.data?.evaluation as RubricEvaluation;
}

const strongDraft = draft([
  node('subject', 'a chestnut horse mid-gallop, dust trailing from its hooves', 0),
  node('style_aesthetic', 'photorealistic, cinematic wide shot', 1),
]);
const weakDraft = draft([node('subject', 'a nice horse', 0)]);

describe('CriticAgent (§10.1, §10.4)', () => {
  it('a strong draft scores high and needs no refinement', async () => {
    const gen = provider(scoreJson(scores(3)));
    const result = await new CriticAgent(gen as never).execute(ctx(strongDraft));

    expect(result.status).toBe('success');
    const ev = evalOf(result);
    expect(ev.overallStrength).toBe(100);
    expect(ev.needsRefinement).toBe(false);
    expect(gen).toHaveBeenCalledTimes(1); // no refine passes
  });

  it('a vague draft scores low on specificity and triggers refinement', async () => {
    // pass 1: specificity=1 (fails) → refine → re-score all 3s (fixed).
    const gen = provider(
      scoreJson(scores(2, { specificity: 1 }), ['subject node is vague ("a nice horse")']),
      JSON.stringify({ nodes: [{ type: 'subject', value: 'a chestnut horse mid-gallop at golden hour', alternatives: [] }] }),
      scoreJson(scores(3))
    );
    const result = await new CriticAgent(gen as never).execute(ctx(weakDraft));

    expect(result.status).toBe('success');
    const ev = evalOf(result);
    expect(ev.needsRefinement).toBe(false);
    expect(ev.overallStrength).toBe(100);
    const finalDraft = result.data?.draft as DraftPrompt;
    expect(finalDraft.refinementCount).toBe(1);
    expect(finalDraft.nodes[0]?.value).toContain('chestnut horse');
    expect(gen).toHaveBeenCalledTimes(3); // score, refine, re-score
  });

  it('never exceeds the refinement cap even if the draft keeps failing', async () => {
    // Every score fails; cap is 2 → score + (refine+score)×2 = 5 calls, then stop.
    const failing = scoreJson(scores(2, { non_conflict: 1 }), ['style conflicts with setting']);
    const refineNodes = JSON.stringify({ nodes: [{ type: 'subject', value: 'a horse, still conflicted', alternatives: [] }] });
    const gen = provider(failing, refineNodes, failing, refineNodes, failing);

    const result = await new CriticAgent(gen as never).execute(ctx(weakDraft));

    expect(result.status).toBe('success');
    const finalDraft = result.data?.draft as DraftPrompt;
    expect(finalDraft.refinementCount).toBe(2); // hard cap
    expect(evalOf(result).needsRefinement).toBe(true); // still failing, but we stopped
    expect(gen).toHaveBeenCalledTimes(5);
  });

  it('runs the Critic on the large tier', async () => {
    const gen = provider(scoreJson(scores(3)));
    await new CriticAgent(gen as never).execute(ctx(strongDraft));
    expect(gen.mock.calls[0][1]).toBe('large');
  });

  it('preserves locked nodes across refinement (§13.2)', async () => {
    const withLock = draft([node('subject', 'LOCKED SUBJECT', 0, true), node('style_aesthetic', 'vague', 1)]);
    const gen = provider(
      scoreJson(scores(2, { specificity: 1 }), ['style is vague']),
      JSON.stringify({ nodes: [{ type: 'subject', value: 'model tried to change locked', alternatives: [] }, { type: 'style_aesthetic', value: 'photorealistic cinematic', alternatives: [] }] }),
      scoreJson(scores(3))
    );
    const result = await new CriticAgent(gen as never).execute(ctx(withLock));

    const finalDraft = result.data?.draft as DraftPrompt;
    const subject = finalDraft.nodes.find((n) => n.type === 'subject');
    expect(subject?.value).toBe('LOCKED SUBJECT'); // refine did not overwrite the locked node
  });

  it('degrades to partial with heuristic scoring when the quality model is unavailable (§29.7, T3.3)', async () => {
    const gen = jest.fn().mockRejectedValue(new Error('provider down'));
    const result = await new CriticAgent(gen as never).execute(ctx(strongDraft));
    expect(result.status).toBe('partial');
    expect((result.data?.draft as DraftPrompt).assembled).toBe(strongDraft.assembled);
    // Heuristic fallback: the draft now carries a deterministic evaluation.
    const evaluation = result.data?.evaluation as RubricEvaluation;
    expect(evaluation.rubricVersion).toBe('v1.0-heuristic');
    expect(evaluation.issues).toContain('Scored heuristically — quality model unavailable');
  });

  it('fails cleanly when there is no draft to score', async () => {
    const gen = provider();
    const noDraft: AgentInput = { context: { userId: 'u1', sessionId: 's1', platform: gemini, userIdea: 'x' }, params: {} };
    const result = await new CriticAgent(gen as never).execute(noDraft);
    expect(result.status).toBe('failure');
  });
});
