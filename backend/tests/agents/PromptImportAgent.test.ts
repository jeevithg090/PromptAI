import { PromptImportAgent } from '../../src/agents/PromptImportAgent';
import type { DraftPrompt } from '../../src/types/Prompt';
import type { AgentInput, PipelineContext } from '../../src/types/Agent';
import type { Platform } from '../../src/types/Platform';
import type { ProviderGenerateResponse } from '../../src/types/Provider';

/** F1.1 tests — the enhance-mode prompt importer, mocked provider. */
const gemini: Platform = {
  platform_id: 'google_gemini',
  display_name: 'Google Gemini',
  modalities: ['text', 'image'],
  url_patterns: [],
  dom_fingerprint_selectors: [],
  input_selector_candidates: [],
  docs_url: 'https://ai.google.dev/gemini-api/docs',
  quirks: [],
  syntax_rules: ['Plain natural language'],
  max_prompt_tokens: 4000,
  tos_reviewed: true,
};

const importJson = JSON.stringify({
  task_type: 'text_to_image',
  platform_hint: 'midjourney',
  nodes: [
    { type: 'subject', value: 'a lone astronaut', rationale: 'named subject', alternatives: [] },
    { type: 'setting_context', value: 'on the surface of the moon', alternatives: [] },
    { type: 'lighting_mood', value: 'earthrise glow', alternatives: [] },
  ],
});

function provider(...results: Array<string | Error>): jest.Mock {
  const fn = jest.fn();
  for (const r of results) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r);
    else
      fn.mockResolvedValueOnce({
        content: r,
        tokensUsed: { input: 200, output: 150 },
        finishReason: 'stop',
      } satisfies ProviderGenerateResponse);
  }
  return fn;
}

function input(text: string, overrides: Partial<PipelineContext> = {}): AgentInput {
  return {
    context: {
      userId: 'u1',
      sessionId: 's1',
      platform: gemini,
      userIdea: text,
      mode: 'enhance',
      ...overrides,
    },
    params: {},
  };
}

function draftOf(result: { data?: Record<string, unknown> }): DraftPrompt {
  return result.data?.draft as DraftPrompt;
}

describe('PromptImportAgent (F1.1)', () => {
  it('parses a finished prompt into typed nodes + task_type + platform_hint', async () => {
    const gen = provider(importJson);
    const result = await new PromptImportAgent(gen as never).execute(
      input('a lone astronaut on the moon, earthrise glow, cinematic')
    );
    expect(result.status).toBe('success');
    expect(result.data?.task_type).toBe('text_to_image');
    expect(result.data?.platform_hint).toBe('midjourney');
    const draft = draftOf(result);
    expect(draft.nodes.map((n) => n.type)).toContain('subject');
    expect(draft.nodes.length).toBe(3);
    // The importer uses the large tier (parsing real prompts is the hard step).
    expect((gen as jest.Mock).mock.calls[0][1]).toBe('large');
    expect((gen as jest.Mock).mock.calls[0][0]).toBe('prompt_import');
  });

  it('retries once on malformed output, then succeeds', async () => {
    const gen = provider('not json at all', importJson);
    const result = await new PromptImportAgent(gen as never).execute(input('some finished prompt text'));
    expect(result.status).toBe('success');
    expect((gen as jest.Mock)).toHaveBeenCalledTimes(2);
  });

  it('fails gracefully (never throws) when the provider is down on both attempts', async () => {
    const gen = provider(new Error('provider down'), new Error('provider down'));
    const result = await new PromptImportAgent(gen as never).execute(input('finished prompt'));
    expect(result.status).toBe('failure');
    expect(result.error).toBeDefined();
  });

  it('fails gracefully on double-malformed output', async () => {
    const gen = provider('garbage', 'still garbage');
    const result = await new PromptImportAgent(gen as never).execute(input('finished prompt'));
    expect(result.status).toBe('failure');
  });

  it('rejects empty text without calling the provider', async () => {
    const gen = provider(importJson);
    const result = await new PromptImportAgent(gen as never).execute(input('   '));
    expect(result.status).toBe('failure');
    expect((gen as jest.Mock)).not.toHaveBeenCalled();
  });
});
