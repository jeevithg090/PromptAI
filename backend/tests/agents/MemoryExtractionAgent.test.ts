import { MemoryExtractionAgent } from '../../src/agents/MemoryExtractionAgent';
import type { AgentInput, MemoryEntry, PipelineContext } from '../../src/types/Agent';
import type { DraftPrompt, PromptNode } from '../../src/types/Prompt';
import type { Platform } from '../../src/types/Platform';
import type { ProviderGenerateResponse } from '../../src/types/Provider';

/** T2.11 tests — session-end preference extraction, never auto-saved (§17.2). */
const platform: Platform = {
  platform_id: 'midjourney',
  display_name: 'Midjourney',
  modalities: ['image'],
  url_patterns: [],
  dom_fingerprint_selectors: [],
  input_selector_candidates: [],
  docs_url: 'https://docs.midjourney.com',
  quirks: [],
  syntax_rules: [],
  max_prompt_tokens: 350,
  tos_reviewed: true,
};

function node(type: PromptNode['type'], value: string, position: number): PromptNode {
  return { type, value, alternatives: [], locked: false, position, defaulted: false };
}

function context(overrides: Partial<PipelineContext> = {}): PipelineContext {
  const draft: DraftPrompt = {
    nodes: [node('subject', 'a horse', 0), node('style_aesthetic', 'photorealistic', 1)],
    assembled: 'a horse, photorealistic',
    platformId: 'midjourney',
    taskType: 'text_to_image',
    refinementCount: 0,
  };
  return {
    userId: 'u1',
    sessionId: 's1',
    platform,
    userIdea: 'a horse',
    taskType: 'text_to_image',
    clarifications: { style: 'photorealistic' },
    finalDraft: draft,
    ...overrides,
  };
}

function input(overrides: Partial<PipelineContext> = {}): AgentInput {
  return { context: context(overrides), params: {} };
}

function provider(...contents: string[]): jest.Mock {
  const fn = jest.fn();
  for (const c of contents) {
    fn.mockResolvedValueOnce({
      content: c,
      tokensUsed: { input: 80, output: 20 },
      finishReason: 'stop',
    } satisfies ProviderGenerateResponse);
  }
  return fn;
}

function proposalsOf(result: { data?: Record<string, unknown> }): MemoryEntry[] {
  return (result.data?.proposals ?? []) as MemoryEntry[];
}

describe('MemoryExtractionAgent (§17.2)', () => {
  it('proposes durable preferences as PENDING, never active', async () => {
    const gen = provider(
      JSON.stringify({ preferences: [{ statement: 'prefers photorealistic image styles', confidence: 0.9 }] })
    );
    const result = await new MemoryExtractionAgent(gen as never).execute(input());

    expect(result.status).toBe('success');
    const proposals = proposalsOf(result);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.statement).toBe('prefers photorealistic image styles');
    expect(proposals[0]?.status).toBe('pending_confirmation'); // never auto-active
    expect(proposals[0]?.source).toBe('agent_proposed');
    expect(proposals[0]?.scope).toBe('global');
    expect(proposals[0]?.id).toBeTruthy();
  });

  it('runs on the small tier', async () => {
    const gen = provider(JSON.stringify({ preferences: [] }));
    await new MemoryExtractionAgent(gen as never).execute(input());
    expect(gen.mock.calls[0][1]).toBe('small');
  });

  it('drops low-confidence proposals below the floor', async () => {
    const gen = provider(
      JSON.stringify({
        preferences: [
          { statement: 'prefers photorealistic styles', confidence: 0.9 },
          { statement: 'might like landscapes maybe', confidence: 0.4 },
        ],
      })
    );
    const proposals = proposalsOf(await new MemoryExtractionAgent(gen as never).execute(input()));
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.statement).toContain('photorealistic');
  });

  it('scopes proposals to a project when projectId is present', async () => {
    const gen = provider(JSON.stringify({ preferences: [{ statement: 'likes concise output', confidence: 0.8 }] }));
    const proposals = proposalsOf(await new MemoryExtractionAgent(gen as never).execute(input({ projectId: 'proj-42' })));
    expect(proposals[0]?.scope).toBe('proj-42');
  });

  it('returns an empty proposal set (not a failure) when nothing durable is found', async () => {
    const gen = provider(JSON.stringify({ preferences: [] }));
    const result = await new MemoryExtractionAgent(gen as never).execute(input());
    expect(result.status).toBe('success');
    expect(proposalsOf(result)).toEqual([]);
  });

  it('is non-fatal on a provider outage — success with no proposals', async () => {
    const gen = jest.fn().mockRejectedValue(new Error('provider down'));
    const result = await new MemoryExtractionAgent(gen as never).execute(input());
    expect(result.status).toBe('success');
    expect(proposalsOf(result)).toEqual([]);
  });

  it('is non-fatal on malformed output — success with no proposals', async () => {
    const gen = provider('not json at all');
    const result = await new MemoryExtractionAgent(gen as never).execute(input());
    expect(result.status).toBe('success');
    expect(proposalsOf(result)).toEqual([]);
  });
});
