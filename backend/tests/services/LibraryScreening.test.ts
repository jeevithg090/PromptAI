import { screenSubmission } from '../../src/services/LibraryScreening';
import { systemPromptOf, dualCompletion } from '../helpers/providerMock';

/**
 * LibraryScreening tests (§14.2, T7.6).
 * Safety is the offline heuristic classifier (no network); the critic score
 * is a generate() call — we mock global fetch and steer the score by a marker
 * in the system prompt.
 */
function mockCritic(strength: number) {
  jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
    const system = systemPromptOf(init as RequestInit);
    const payload = system.includes('community library')
      ? { strength, issues: strength < 40 ? ['low quality'] : [] }
      : { strength, issues: [] };
    const dual = dualCompletion(payload);
    return { ok: true, status: 200, json: async () => dual, text: async () => JSON.stringify(dual) } as Response;
  });
}

describe('LibraryScreening (§14.2, T7.6)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('auto-approves a high-strength submission (≥70)', async () => {
    mockCritic(85);
    const res = await screenSubmission('Good template', 'A useful one', '{"nodes":[]}');
    expect(res.approved).toBe(true);
    expect(res.moderationStatus).toBe('approved');
  });

  it('queues a borderline submission for review (40–69)', async () => {
    mockCritic(55);
    const res = await screenSubmission('Okay template', 'Meh', '{"nodes":[]}');
    expect(res.approved).toBe(false);
    expect(res.moderationStatus).toBe('pending');
    expect(res.reason).toMatch(/review/i);
  });

  it('rejects a low-strength submission (<40)', async () => {
    mockCritic(25);
    const res = await screenSubmission('Bad template', 'weak', '{"nodes":[]}');
    expect(res.moderationStatus).toBe('rejected');
  });

  it('queues for review when scoring is unavailable (fail-closed to pending)', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('provider down'));
    const res = await screenSubmission('Template', 'desc', '{"nodes":[]}');
    expect(res.moderationStatus).toBe('pending');
    expect(res.reason).toMatch(/review/i);
  });
});
