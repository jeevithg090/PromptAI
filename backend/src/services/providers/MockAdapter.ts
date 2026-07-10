import type { ProviderAdapter, ProviderGenerateRequest, ProviderGenerateResponse } from '../../types/Provider';

/**
 * Deterministic mock provider — used by unit tests and by the PROVIDER_FORCE_MOCK
 * load-testing seam (T3.7). Satisfies the same ProviderAdapter contract as the
 * real adapters (§9.1) so contract tests run against both.
 *
 * It returns step-appropriate canned JSON so the FULL pipeline (intent → draft →
 * critic) can run offline with no provider calls — the marker it keys on lives in
 * each agent's system prompt, mirroring the integration-test fixtures. This lets a
 * load test measure our orchestration rather than a provider's rate limits.
 */

const INTENT_JSON = JSON.stringify({
  task_type: 'text_to_image',
  entities: { subject: 'a subject', action: 'in a scene' },
  platform_hint: null,
  confidence: 0.95,
});

const DRAFT_JSON = JSON.stringify({
  nodes: [
    { type: 'subject', value: 'a chestnut horse', alternatives: [] },
    { type: 'action_behavior', value: 'galloping through shallow water', alternatives: [] },
    {
      type: 'style_aesthetic',
      value: 'photorealistic photography',
      alternatives: [{ value: 'cinematic still', rationale: 'more dramatic mood', rank: 1 }],
    },
  ],
});

const CRITIC_JSON = JSON.stringify({
  scores: {
    specificity: 3,
    unambiguity: 3,
    non_conflict: 3,
    platform_fit: 3,
    constraint_completeness: 2,
    format_determinacy: 3,
    context_efficiency: 3,
    technique_fit: 3,
  },
  issues: [],
});

const REDRAFT_JSON = JSON.stringify({
  value: 'a refined replacement value',
  rationale: 'mock single-node redraft',
  alternatives: [{ value: 'an alternative value', rationale: 'different angle', rank: 1 }],
});

/** Picks the canned payload for a call from a marker in its system prompt. */
function cannedFor(systemPrompt: string): string {
  if (systemPrompt.includes('intent classifier')) return INTENT_JSON;
  if (systemPrompt.includes('quality critic')) return CRITIC_JSON;
  if (systemPrompt.includes('refining ONE node')) return REDRAFT_JSON;
  return DRAFT_JSON;
}

export class MockAdapter implements ProviderAdapter {
  name = 'mock';

  async generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse> {
    const content = cannedFor(request.systemPrompt ?? '');
    const inputLen = (request.systemPrompt ?? '').length +
      (request.messages[request.messages.length - 1]?.content ?? '').length;
    return {
      content,
      tokensUsed: { input: inputLen, output: content.length },
      finishReason: 'stop',
    };
  }
}
