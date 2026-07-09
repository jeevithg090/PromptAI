import { DraftingAgent, loadStrategyProfiles } from '../../src/agents/DraftingAgent';
import { TASK_TYPES, type DraftPrompt } from '../../src/types/Prompt';
import type { AgentInput, PipelineContext } from '../../src/types/Agent';
import type { Platform } from '../../src/types/Platform';
import type { ProviderGenerateResponse } from '../../src/types/Provider';

/** T2.8 tests — the core generator, mocked provider. */
const gemini: Platform = {
  platform_id: 'google_gemini',
  display_name: 'Google Gemini',
  modalities: ['text', 'image'],
  url_patterns: [],
  dom_fingerprint_selectors: [],
  input_selector_candidates: [],
  docs_url: 'https://ai.google.dev/gemini-api/docs',
  quirks: ['Negative prompts are unreliable — phrase exclusions positively'],
  syntax_rules: ['Plain natural language'],
  max_prompt_tokens: 4000,
  tos_reviewed: true,
};

const horseDraftJson = JSON.stringify({
  nodes: [
    { type: 'subject', value: 'a chestnut horse', rationale: 'from user idea', alternatives: [{ value: 'a wild mustang', rationale: 'more dramatic', rank: 1 }] },
    { type: 'action_behavior', value: 'galloping through shallow water', alternatives: [] },
    { type: 'style_aesthetic', value: 'photorealistic photography', rationale: 'user chose photorealistic; grounded in [1]', alternatives: [{ value: 'cinematic film still', rationale: 'adds drama', rank: 1 }, { value: 'oil painting', rationale: 'classic', rank: 2 }] },
    { type: 'composition_camera', value: 'wide shot', alternatives: [{ value: 'low angle close-up', rationale: 'power', rank: 1 }] },
    { type: 'lighting_mood', value: 'golden hour backlight', alternatives: [] },
  ],
});

function provider(...contents: string[]): jest.Mock {
  const fn = jest.fn();
  for (const c of contents) {
    fn.mockResolvedValueOnce({
      content: c,
      tokensUsed: { input: 200, output: 150 },
      finishReason: 'stop',
    } satisfies ProviderGenerateResponse);
  }
  return fn;
}

function input(overrides: Partial<PipelineContext> = {}): AgentInput {
  return {
    context: {
      userId: 'u1',
      sessionId: 's1',
      platform: gemini,
      userIdea: 'create an image of a horse running',
      taskType: 'text_to_image',
      entities: { subject: 'a horse', action: 'running' },
      clarifications: { style: 'photorealistic', composition: 'wide shot' },
      pkbChunks: [
        {
          id: 'k1',
          kind: 'pkb',
          platformId: 'google_gemini',
          content: 'Photography vocabulary steers Gemini image style reliably.',
          sourceUrl: 'https://ai.google.dev',
          ingestedAt: '2026-07-07T00:00:00Z',
          trustScore: 1,
        },
      ],
      ...overrides,
    },
    params: {},
  };
}

function draftOf(result: { data?: Record<string, unknown> }): DraftPrompt {
  return result.data?.draft as DraftPrompt;
}

describe('DraftingAgent (§10.3, §13)', () => {
  it('horse example: well-formed nodes in profile order with alternatives, serialized for the platform', async () => {
    const gen = provider(horseDraftJson);
    const result = await new DraftingAgent(gen as never).execute(input());

    expect(result.status).toBe('success');
    const draft = draftOf(result);
    expect(draft.nodes.map((n) => n.type)).toEqual([
      'subject', 'action_behavior', 'style_aesthetic', 'composition_camera', 'lighting_mood',
    ]);
    expect(draft.nodes.map((n) => n.position)).toEqual([0, 1, 2, 3, 4]);
    const style = draft.nodes.find((n) => n.type === 'style_aesthetic');
    expect(style?.alternatives.length).toBeGreaterThanOrEqual(2);
    expect(draft.assembled).toContain('a chestnut horse');
    expect(draft.platformId).toBe('google_gemini');
    expect(draft.refinementCount).toBe(0);
    expect(draft.evaluation).toBeUndefined(); // Critic (T2.9) adds it
  });

  it('calls the large tier with the profile temperature and grounds the system prompt in PKB + quirks', async () => {
    const gen = provider(horseDraftJson);
    await new DraftingAgent(gen as never).execute(input());

    const [step, complexity, req] = gen.mock.calls[0];
    expect(step).toBe('drafting');
    expect(complexity).toBe('large');
    expect(req.temperature).toBe(0.7); // text_to_image profile
    expect(req.systemPrompt).toContain('Photography vocabulary steers Gemini');
    expect(req.systemPrompt).toContain('Negative prompts are unreliable');
    expect(req.messages[0].content).toContain('photorealistic'); // clarifications forwarded
  });

  it('justGenerate marks unconfirmed nodes as defaulted, confirmed ones not (§11.2)', async () => {
    const gen = provider(horseDraftJson);
    const result = await new DraftingAgent(gen as never).execute(
      input({ justGenerate: true, clarifications: undefined })
    );

    const draft = draftOf(result);
    const byType = Object.fromEntries(draft.nodes.map((n) => [n.type, n.defaulted]));
    expect(byType.subject).toBe(false); // entity-confirmed
    expect(byType.action_behavior).toBe(false); // entity-confirmed
    expect(byType.style_aesthetic).toBe(true); // never confirmed → assumed
    expect(byType.lighting_mood).toBe(true);
  });

  it('retries once on malformed output, then falls back to a template (§29.7, T3.3)', async () => {
    const gen = provider('not json at all', '{"nodes": []}');
    const result = await new DraftingAgent(gen as never).execute(input());
    expect(result.status).toBe('partial');
    expect(result.error).toMatch(/fallback/);
    expect(gen).toHaveBeenCalledTimes(2);
    // Fallback draft: all nodes defaulted, assembled string exists.
    const d = draftOf(result);
    expect(d.nodes.length).toBeGreaterThan(0);
    expect(d.nodes.every((n) => n.defaulted)).toBe(true);
    expect(d.assembled.length).toBeGreaterThan(0);
  });

  it('retries on provider outage, then falls back to a template (§29.7, T3.3)', async () => {
    const gen = jest.fn().mockRejectedValue(new Error('provider down'));
    const result = await new DraftingAgent(gen as never).execute(input());
    expect(result.status).toBe('partial');
    expect(result.error).toMatch(/fallback/);
    expect(gen).toHaveBeenCalledTimes(2); // both attempts fail before fallback
    // Fallback draft: all nodes defaulted.
    const d = draftOf(result);
    expect(d.nodes.every((n) => n.defaulted)).toBe(true);
  });

  it('every task type has a strategy profile (config completeness)', () => {
    const profiles = loadStrategyProfiles().profiles;
    for (const t of TASK_TYPES) {
      expect({ taskType: t, present: Boolean(profiles[t]) }).toEqual({ taskType: t, present: true });
    }
  });
});
