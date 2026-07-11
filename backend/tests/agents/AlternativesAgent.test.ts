import { AlternativesAgent } from '../../src/agents/AlternativesAgent';
import type { AgentInput } from '../../src/types/Agent';
import type { DraftPrompt, PromptNode, TaskType } from '../../src/types/Prompt';
import type { ProviderGenerateResponse } from '../../src/types/Provider';

function draft(nodesOverrides?: Partial<PromptNode>[]): DraftPrompt {
  const defaults: PromptNode[] = [
    { type: 'subject', value: 'a horse', rationale: 'main subject', alternatives: [], locked: false, position: 0, defaulted: false },
    { type: 'style_aesthetic', value: 'photorealistic', rationale: '', alternatives: [{ value: 'cinematic', rationale: 'dramatic', rank: 1 }], locked: false, position: 1, defaulted: false },
    { type: 'composition_camera', value: 'wide shot', rationale: '', alternatives: [], locked: false, position: 2, defaulted: false },
    { type: 'lighting_mood', value: 'sunset', rationale: '', alternatives: [], locked: false, position: 3, defaulted: false },
    { type: 'constraints_rules', value: 'no text', rationale: '', alternatives: [], locked: false, position: 4, defaulted: false },
  ];
  const nodes = nodesOverrides
    ? defaults.map((n) => {
        const ov = nodesOverrides.find((o) => o.type === n.type);
        return ov ? { ...n, ...ov } : n;
      })
    : defaults;
  return { nodes, assembled: 'test', platformId: 'midjourney', taskType: 'text_to_image' as TaskType, refinementCount: 0 };
}

function gen(content: string): jest.Mock {
  return jest.fn(async (): Promise<ProviderGenerateResponse> => ({
    content,
    tokensUsed: { input: 100, output: 50 },
    finishReason: 'stop',
  }));
}

function input(overrides?: Partial<AgentInput['context']>): AgentInput {
  const d = draft();
  return {
    context: {
      userId: 'user-1',
      sessionId: 'sess-1',
      platform: { platform_id: 'midjourney', display_name: 'Midjourney', max_prompt_tokens: 1000 } as any,
      userIdea: 'a horse running',
      finalDraft: d,
      ...overrides,
    },
    params: {},
  };
}

describe('AlternativesAgent (T6.3)', () => {
  it('fills gaps — generates alternatives for creative nodes with <2 alts', async () => {
    const fn = gen(JSON.stringify({
      alternatives: {
        composition_camera: [{ value: 'low angle', rationale: 'emphasizes speed', rank: 1 }, { value: 'aerial view', rationale: 'shows scale', rank: 2 }],
        lighting_mood: [{ value: 'golden hour', rationale: 'warm tones', rank: 1 }],
      },
    }));
    const agent = new AlternativesAgent(fn as any);
    const result = await agent.execute(input());
    expect(result.status).toBe('success');
    const updated = (result.data!.draft as DraftPrompt);
    const comp = updated.nodes.find((n) => n.type === 'composition_camera')!;
    expect(comp.alternatives.length).toBeGreaterThanOrEqual(2);
    const lighting = updated.nodes.find((n) => n.type === 'lighting_mood')!;
    expect(lighting.alternatives.length).toBe(1);
    // style_aesthetic already has 1 alt and wasn't targeted → unchanged
    const style = updated.nodes.find((n) => n.type === 'style_aesthetic')!;
    expect(style.alternatives).toHaveLength(1);
  });

  it('skips nodes that already have ≥2 alternatives', async () => {
    const fn = gen(JSON.stringify({ alternatives: {} }));
    const agent = new AlternativesAgent(fn as any);
    // Give ALL creative nodes ≥2 alternatives so no target nodes remain
    const d = draft([
      { type: 'subject', alternatives: [{ value: 'a', rationale: 'r', rank: 1 }, { value: 'b', rationale: 'r', rank: 2 }] } as any,
      { type: 'style_aesthetic', alternatives: [{ value: 'c', rationale: 'r', rank: 1 }, { value: 'd', rationale: 'r', rank: 2 }] } as any,
      { type: 'composition_camera', alternatives: [{ value: 'e', rationale: 'r', rank: 1 }, { value: 'f', rationale: 'r', rank: 2 }] } as any,
      { type: 'lighting_mood', alternatives: [{ value: 'g', rationale: 'r', rank: 1 }, { value: 'h', rationale: 'r', rank: 2 }] } as any,
    ]);
    const result = await agent.execute(input({ finalDraft: d }));
    expect(result.status).toBe('success');
    expect((result.data!.draft as DraftPrompt).nodes.find((n) => n.type === 'subject')!.alternatives).toHaveLength(2);
    expect(fn).not.toHaveBeenCalled();
  });

  it('respects locked nodes — does not generate alternatives for them', async () => {
    const fn = gen(JSON.stringify({
      alternatives: { composition_camera: [{ value: 'low angle', rationale: 'better', rank: 1 }] },
    }));
    const agent = new AlternativesAgent(fn as any);
    const d = draft([{ type: 'composition_camera', locked: true } as any]);
    const result = await agent.execute(input({ finalDraft: d }));
    expect(result.status).toBe('success');
    const updated = (result.data!.draft as DraftPrompt);
    const comp = updated.nodes.find((n) => n.type === 'composition_camera')!;
    expect(comp.locked).toBe(true);
    expect(comp.alternatives).toHaveLength(0); // unchanged
  });

  it('returns partial (draft untouched) on malformed JSON output', async () => {
    const fn = gen('not json');
    const agent = new AlternativesAgent(fn as any);
    const result = await agent.execute(input());
    expect(result.status).toBe('partial');
    expect((result.data!.draft as DraftPrompt).nodes).toHaveLength(5);
  });

  it('returns partial (draft untouched) on provider error', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('provider down'));
    const agent = new AlternativesAgent(fn as any);
    const result = await agent.execute(input());
    expect(result.status).toBe('partial');
    expect(result.tokensUsed).toBe(0);
  });

  it('is a no-op when no creative nodes have <2 alternatives', async () => {
    const fn = gen('{}');
    const agent = new AlternativesAgent(fn as any);
    const d = draft([
      { type: 'subject', alternatives: [{ value: 'a', rationale: 'r', rank: 1 }, { value: 'b', rationale: 'r', rank: 2 }] } as any,
      { type: 'style_aesthetic', alternatives: [{ value: 'c', rationale: 'r', rank: 1 }, { value: 'd', rationale: 'r', rank: 2 }] } as any,
      { type: 'composition_camera', alternatives: [{ value: 'e', rationale: 'r', rank: 1 }, { value: 'f', rationale: 'r', rank: 2 }] } as any,
      { type: 'lighting_mood', alternatives: [{ value: 'g', rationale: 'r', rank: 1 }, { value: 'h', rationale: 'r', rank: 2 }] } as any,
    ]);
    const result = await agent.execute(input({ finalDraft: d }));
    expect(result.status).toBe('success');
    expect(fn).not.toHaveBeenCalled();
  });

  it('caps alternatives at 4 per node', async () => {
    const fn = gen(JSON.stringify({
      alternatives: {
        lighting_mood: [
          { value: 'a', rationale: '1', rank: 1 },
          { value: 'b', rationale: '2', rank: 2 },
          { value: 'c', rationale: '3', rank: 3 },
          { value: 'd', rationale: '4', rank: 4 },
          { value: 'e', rationale: '5', rank: 5 },
        ],
      },
    }));
    const agent = new AlternativesAgent(fn as any);
    const result = await agent.execute(input());
    expect(result.status).toBe('success');
    const updated = (result.data!.draft as DraftPrompt);
    const lighting = updated.nodes.find((n) => n.type === 'lighting_mood')!;
    expect(lighting.alternatives.length).toBeLessThanOrEqual(4);
  });
});
