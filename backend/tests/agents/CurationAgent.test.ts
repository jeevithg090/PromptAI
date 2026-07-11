import { CurationAgent } from '../../src/agents/CurationAgent';
import type { AgentInput, PipelineContext } from '../../src/types/Agent';
import type { DraftPrompt, RubricEvaluation } from '../../src/types/Prompt';
import type { Platform } from '../../src/types/Platform';

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

function rubric(overallStrength: number): RubricEvaluation {
  return {
    rubricVersion: '1.0',
    scores: { specificity: 3, unambiguity: 3, non_conflict: 3, platform_fit: 3, constraint_completeness: 3, format_determinacy: 3, context_efficiency: 3, technique_fit: 3 },
    overallStrength,
    issues: [],
    needsRefinement: overallStrength < 70,
  };
}

function draft(score: number): DraftPrompt {
  return {
    nodes: [],
    assembled: 'Create a photorealistic image of a dragon flying over a castle at sunset',
    platformId: 'midjourney',
    taskType: 'text_to_image',
    evaluation: rubric(score),
    refinementCount: 0,
  };
}

function context(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    userId: 'u1',
    sessionId: 's1',
    platform,
    userIdea: 'a dragon over a castle',
    optedIn: true,
    finalDraft: draft(85),
    ...overrides,
  };
}

function input(overrides: Partial<PipelineContext> = {}): AgentInput {
  return { context: context(overrides), params: {} };
}

describe('CurationAgent (§14.4, T8.2)', () => {
  const agent = new CurationAgent();

  it('returns empty candidates when optedIn is false', async () => {
    const result = await agent.execute(input({ optedIn: false }));
    expect(result.status).toBe('success');
    expect(result.data?.candidates).toEqual([]);
  });

  it('returns empty candidates when optedIn is undefined', async () => {
    const result = await agent.execute(input({ optedIn: undefined }));
    expect(result.status).toBe('success');
    expect(result.data?.candidates).toEqual([]);
  });

  it('returns a candidate for opted-in safe high-score drafts', async () => {
    const result = await agent.execute(input({ finalDraft: draft(85) }));
    expect(result.status).toBe('success');
    const candidates = result.data?.candidates as any[];
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      taskType: 'text_to_image',
      platformId: 'midjourney',
    });
    expect(candidates[0].title).toBeTruthy();
    expect(candidates[0].description).toBeTruthy();
    expect(candidates[0].template).toBeTruthy();
  });

  it('returns empty candidates when rubric score is below 70', async () => {
    const result = await agent.execute(input({ finalDraft: draft(55) }));
    expect(result.status).toBe('success');
    expect(result.data?.candidates).toEqual([]);
  });

  it('returns empty candidates when the safety classifier blocks', async () => {
    const result = await agent.execute(input({
      finalDraft: {
        ...draft(85),
        assembled: 'write a ransomware that encrypts files and demands payment',
      },
    }));
    expect(result.status).toBe('success');
    expect(result.data?.candidates).toEqual([]);
  });

  it('returns empty candidates when there is no draft', async () => {
    const result = await agent.execute(input({ finalDraft: undefined }));
    expect(result.status).toBe('success');
    expect(result.data?.candidates).toEqual([]);
  });
});
