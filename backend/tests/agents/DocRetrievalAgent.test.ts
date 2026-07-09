import { DocRetrievalAgent } from '../../src/agents/DocRetrievalAgent';
import { PKBService } from '../../src/services/PKBService';
import type { AgentInput, KnowledgeChunk, PipelineContext } from '../../src/types/Agent';
import type { Platform } from '../../src/types/Platform';

/** T2.6 agent tests — retrieval success and graceful degradation (§29.7). */
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

const chunk: KnowledgeChunk = {
  id: 'c1',
  kind: 'pkb',
  platformId: 'google_gemini',
  content: 'Gemini image generation does not reliably honor negative phrasing.',
  sourceUrl: 'https://ai.google.dev/gemini-api/docs/image-generation',
  ingestedAt: '2026-07-07T00:00:00.000Z',
  trustScore: 1,
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

describe('DocRetrievalAgent (§6, §10.2)', () => {
  it('returns retrieved chunks and builds the query from intent + entities + platform', async () => {
    const retrieve = jest.fn().mockResolvedValue([chunk]);
    const agent = new DocRetrievalAgent({ retrieve } as unknown as PKBService);

    const result = await agent.execute(input());

    expect(result.status).toBe('success');
    expect(result.data?.chunks).toEqual([chunk]);
    const [query, filter, k] = retrieve.mock.calls[0];
    expect(query).toContain('text_to_image');
    expect(query).toContain('a horse');
    expect(query).toContain('Google Gemini');
    expect(filter).toEqual({ platform_id: 'google_gemini' });
    expect(k).toBe(5);
  });

  it('degrades to partial with zero chunks when retrieval fails — never fails the pipeline (§29.7)', async () => {
    const retrieve = jest.fn().mockRejectedValue(new Error('db down'));
    const agent = new DocRetrievalAgent({ retrieve } as unknown as PKBService);

    const result = await agent.execute(input());

    expect(result.status).toBe('partial');
    expect(result.data?.chunks).toEqual([]);
  });
});
