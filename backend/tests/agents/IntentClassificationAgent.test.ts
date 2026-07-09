import { IntentClassificationAgent } from '../../src/agents/IntentClassificationAgent';
import { Supervisor } from '../../src/services/Supervisor';
import type { Agent, AgentInput, PipelineContext } from '../../src/types/Agent';
import type { Platform } from '../../src/types/Platform';
import type { ProviderGenerateResponse } from '../../src/types/Provider';

/**
 * T2.5 tests — §7.1, §31.3 Step 12.
 * The provider is mocked (contract-level determinism); the 10-example set
 * checks the classify→parse→validate→map flow. Live model accuracy is a
 * separate smoke script (needs OPENCODE_API_KEY).
 */
const geminiPlatform: Platform = {
  platform_id: 'google_gemini',
  display_name: 'Google Gemini',
  modalities: ['text', 'image', 'video', 'code'],
  url_patterns: [],
  dom_fingerprint_selectors: [],
  input_selector_candidates: [],
  docs_url: 'https://ai.google.dev/gemini-api/docs',
  quirks: [],
  syntax_rules: [],
  max_prompt_tokens: 4000,
  tos_reviewed: true,
};

function context(idea: string): PipelineContext {
  return { userId: 'u1', sessionId: 's1', platform: geminiPlatform, userIdea: idea };
}

function input(idea: string): AgentInput {
  return { context: context(idea), params: {} };
}

/** A generateFn that returns a canned response (optionally per-call). */
function cannedProvider(...responses: string[]): jest.Mock {
  const fn = jest.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      content: r,
      tokensUsed: { input: 50, output: 30 },
      finishReason: 'stop',
    } satisfies ProviderGenerateResponse);
  }
  return fn;
}

function intentJson(taskType: string, entities: Record<string, string> = {}, confidence = 0.95): string {
  return JSON.stringify({ task_type: taskType, entities, platform_hint: null, confidence });
}

describe('IntentClassificationAgent (§7.1)', () => {
  // The 10-example classification set (task.md T2.5 success criterion).
  const examples: Array<{ idea: string; expected: string; entities?: Record<string, string> }> = [
    { idea: 'create an image of a horse running', expected: 'text_to_image', entities: { subject: 'a horse', action: 'running' } },
    { idea: 'a 10-second clip of waves crashing at sunset', expected: 'text_to_video' },
    { idea: 'act as a friendly Spanish tutor for beginners', expected: 'chat_persona' },
    { idea: 'write a python function that merges two sorted lists', expected: 'reasoning_code' },
    { idea: 'pull all email addresses out of this text dump', expected: 'extraction_classification' },
    { idea: 'a 2000-word blog post about urban beekeeping', expected: 'long_form_writing' },
    { idea: 'logo concept: minimalist fox, flat design', expected: 'text_to_image' },
    { idea: 'debug why my react component rerenders forever', expected: 'reasoning_code' },
    { idea: 'classify these support tickets by urgency', expected: 'extraction_classification' },
    { idea: 'an epic fantasy short story about a lighthouse keeper', expected: 'long_form_writing' },
  ];

  it.each(examples)('classifies "$idea" as $expected', async ({ idea, expected, entities }) => {
    const provider = cannedProvider(intentJson(expected, entities ?? {}));
    const agent = new IntentClassificationAgent(provider as never);
    const result = await agent.execute(input(idea));

    expect(result.status).toBe('success');
    expect(result.data?.task_type).toBe(expected);
    if (entities) expect(result.data?.entities).toEqual(entities);
    // Small tier via the router — the agent must ask for the right step/complexity.
    expect(provider).toHaveBeenCalledWith('intent_classification', 'small', expect.objectContaining({ responseFormat: 'json' }));
  });

  it('accepts markdown-fenced JSON (common model quirk)', async () => {
    const provider = cannedProvider('```json\n' + intentJson('text_to_image') + '\n```');
    const result = await new IntentClassificationAgent(provider as never).execute(input('a cat photo'));
    expect(result.status).toBe('success');
    expect(result.data?.task_type).toBe('text_to_image');
  });

  it('retries once on malformed output, then succeeds', async () => {
    const provider = cannedProvider('sorry, I cannot output JSON', intentJson('chat_persona'));
    const result = await new IntentClassificationAgent(provider as never).execute(input('be my coach'));
    expect(result.status).toBe('success');
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('fails gracefully (no throw) after two malformed responses', async () => {
    const provider = cannedProvider('not json', '{"task_type": "not_a_real_type", "confidence": 2}');
    const result = await new IntentClassificationAgent(provider as never).execute(input('anything'));
    expect(result.status).toBe('failure');
    expect(result.error).toMatch(/malformed/);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('fails gracefully (no throw, no retry) when the provider errors', async () => {
    const provider = jest.fn().mockRejectedValue(new Error('provider down'));
    const result = await new IntentClassificationAgent(provider as never).execute(input('anything'));
    expect(result.status).toBe('failure');
    expect(result.error).toMatch(/unavailable/);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('reports tokensUsed from the provider response', async () => {
    const provider = cannedProvider(intentJson('text_to_image'));
    const result = await new IntentClassificationAgent(provider as never).execute(input('a dog'));
    expect(result.tokensUsed).toBe(80); // 50 in + 30 out
  });
});

describe('Supervisor merges intent output into context (§32.2)', () => {
  it('sets context.taskType and context.entities after the intent step', async () => {
    const provider = cannedProvider(intentJson('text_to_image', { subject: 'a horse', action: 'running' }));
    const stub = (name: string): Agent => ({ name, async execute() { return { status: 'success', tokensUsed: 0 }; } });

    const supervisor = new Supervisor({
      intent: new IntentClassificationAgent(provider as never),
      docRetrieval: stub('docRetrieval'),
      clarify: stub('clarify'),
      draft: stub('draft'),
      critic: stub('critic'),
      alternatives: stub('alternatives'),
    });

    const ctx = context('create an image of a horse running');
    const result = await supervisor.run(ctx);

    expect(result.finalState).toBe('ready_for_review');
    expect(ctx.taskType).toBe('text_to_image');
    expect(ctx.entities).toEqual({ subject: 'a horse', action: 'running' });
  });
});
