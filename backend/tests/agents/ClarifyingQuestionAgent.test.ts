import { ClarifyingQuestionAgent, loadClarificationTaxonomy } from '../../src/agents/ClarifyingQuestionAgent';
import { Supervisor } from '../../src/services/Supervisor';
import type { Agent, AgentInput, PipelineContext } from '../../src/types/Agent';
import type { ClarifyingQuestion } from '../../src/types/Prompt';
import type { Platform } from '../../src/types/Platform';

/** T2.7 tests — taxonomy conformance (docs/clarification-taxonomy.md), cap, stopping. */
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

function input(overrides: Partial<PipelineContext> = {}): AgentInput {
  return {
    context: {
      userId: 'u1',
      sessionId: 's1',
      platform,
      userIdea: 'create an image of a horse running',
      taskType: 'text_to_image',
      entities: { subject: 'a horse', action: 'running' },
      ...overrides,
    },
    params: {},
  };
}

function questionsOf(data: Record<string, unknown> | undefined): ClarifyingQuestion[] {
  return (data?.questions ?? []) as ClarifyingQuestion[];
}

describe('ClarifyingQuestionAgent (§11, T0.3 taxonomy)', () => {
  const agent = new ClarifyingQuestionAgent();

  it('horse/Gemini example: skips the entity-answered subject, asks P1→P2 in order, respects the cap', async () => {
    const result = await agent.execute(input());
    const qs = questionsOf(result.data);

    // subject pre-answered by the intent entity; next by priority: style (P1), then P2s, capped at 4.
    expect(qs.map((q) => q.id)).toEqual(['style', 'setting', 'composition', 'lighting']);
    expect(qs.length).toBeLessThanOrEqual(4);
    expect(result.data?.can_generate_now).toBe(true);
    expect(result.data?.questions_remaining_estimate).toBe(2); // aspect_ratio + avoid (P3) deferred
  });

  it('never re-asks a question already answered in a clarification round', async () => {
    const result = await agent.execute(input({ clarifications: { style: 'photorealistic', setting: 'a beach' } }));
    const ids = questionsOf(result.data).map((q) => q.id);
    expect(ids).not.toContain('style');
    expect(ids).not.toContain('setting');
    expect(ids).toEqual(['composition', 'lighting', 'aspect_ratio', 'avoid']);
  });

  it('stops entirely when only P3 questions remain (low information gain)', async () => {
    const result = await agent.execute(
      input({
        entities: { subject: 'a horse', style: 'photorealistic', setting: 'beach', composition: 'wide shot', lighting: 'golden hour' },
      })
    );
    expect(questionsOf(result.data)).toEqual([]);
    expect(result.status).toBe('success');
  });

  it('returns no questions for an unknown/missing task type instead of failing', async () => {
    const result = await agent.execute(input({ taskType: undefined }));
    expect(result.status).toBe('success');
    expect(questionsOf(result.data)).toEqual([]);
  });

  it('every MCQ in the whole taxonomy carries the "Other" escape hatch (core rule 3)', () => {
    const taxonomy = loadClarificationTaxonomy();
    for (const [taskType, templates] of Object.entries(taxonomy.task_types)) {
      for (const t of templates) {
        if (t.type === 'mcq') {
          expect({ taskType, id: t.id, allow_other: t.allow_other }).toEqual({ taskType, id: t.id, allow_other: true });
          expect(t.options && t.options.length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('covers all six task types from the taxonomy', () => {
    expect(Object.keys(loadClarificationTaxonomy().task_types).sort()).toEqual([
      'chat_persona',
      'extraction_classification',
      'long_form_writing',
      'reasoning_code',
      'text_to_image',
      'text_to_video',
    ]);
  });
});

describe('Supervisor merges clarify output into context (§32.2)', () => {
  it('sets context.pendingQuestions after the clarify step', async () => {
    const stub = (name: string): Agent => ({ name, async execute() { return { status: 'success', tokensUsed: 0 }; } });
    const intentStub: Agent = {
      name: 'intent',
      async execute() {
        return { status: 'success', data: { task_type: 'text_to_image', entities: { subject: 'a horse' } }, tokensUsed: 0 };
      },
    };

    const ctx: PipelineContext = {
      userId: 'u1',
      sessionId: 's1',
      platform,
      userIdea: 'create an image of a horse running',
    };

    const result = await new Supervisor({
      intent: intentStub,
      docRetrieval: stub('docRetrieval'),
      clarify: new ClarifyingQuestionAgent(),
      draft: stub('draft'),
      critic: stub('critic'),
      alternatives: stub('alternatives'),
    }).run(ctx);

    // With questions surfaced and no justGenerate, the Supervisor pauses (§11, T2.12).
    expect(result.finalState).toBe('awaiting_clarification');
    expect(ctx.pendingQuestions?.length).toBeGreaterThan(0);
    expect(ctx.pendingQuestions?.[0]?.id).toBe('style');
  });

  it('proceeds past clarification to ready_for_review when justGenerate is set', async () => {
    const stub = (name: string): Agent => ({ name, async execute() { return { status: 'success', tokensUsed: 0 }; } });
    const intentStub: Agent = {
      name: 'intent',
      async execute() {
        return { status: 'success', data: { task_type: 'text_to_image', entities: { subject: 'a horse' } }, tokensUsed: 0 };
      },
    };
    const ctx: PipelineContext = {
      userId: 'u1',
      sessionId: 's1',
      platform,
      userIdea: 'create an image of a horse running',
      justGenerate: true,
    };

    const result = await new Supervisor({
      intent: intentStub,
      docRetrieval: stub('docRetrieval'),
      clarify: new ClarifyingQuestionAgent(),
      draft: stub('draft'),
      critic: stub('critic'),
      alternatives: stub('alternatives'),
    }).run(ctx);

    expect(result.finalState).toBe('ready_for_review');
  });
});
