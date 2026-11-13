import { buildApp } from '../../src/handlers/routes';
import { systemPromptOf, dualCompletion as completion } from '../helpers/providerMock';

/**
 * Clarification loop (blueprint §18 fix-now). The server is stateless, so a
 * resume must carry everything: the task type and entities from the first
 * round (so intent is not re-run and cannot change the questions) and every
 * answer so far, with skipped questions sent as empty answers (so they are
 * not asked again).
 */
process.env.DEV_AUTH_BYPASS = 'true';

const app = buildApp();
const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer dev' };
let intentCalls = 0;

beforeEach(() => {
  intentCalls = 0;
  jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
    const system = systemPromptOf(init as RequestInit);
    let payload: unknown;
    if (system.includes('intent classifier')) {
      intentCalls++;
      payload = completion({ task_type: 'text_to_image', entities: { subject: 'a horse' }, platform_hint: null, confidence: 0.95 });
    } else if (system.includes('quality critic')) {
      payload = completion({ scores: {}, issues: [] });
    } else {
      payload = completion({ nodes: [{ type: 'subject', value: 'a horse', alternatives: [] }] });
    }
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) } as Response;
  });
});

afterEach(() => jest.restoreAllMocks());

describe('clarification resume', () => {
  it('reuses the first round task type and entities and does not re-ask skipped questions', async () => {
    const first = await app.request('/draft', {
      method: 'POST',
      headers,
      body: JSON.stringify({ platform_id: 'google_gemini', idea: 'an image of a horse' }),
    });
    const round1 = (await first.json()) as {
      status: string;
      session_id: string;
      task_type: string;
      entities: Record<string, string>;
      questions: Array<{ id: string }>;
    };
    expect(round1.status).toBe('clarifying');
    expect(round1.entities).toEqual({ subject: 'a horse' });
    expect(round1.questions.length).toBeGreaterThan(1);
    expect(intentCalls).toBe(1);

    // Answer the first question, skip the rest: what the web client now sends.
    const [answered, ...skipped] = round1.questions;
    const clarifications = Object.fromEntries([[answered.id, 'photorealistic'], ...skipped.map((q) => [q.id, ''])]);
    const second = await app.request(`/draft/${round1.session_id}/clarify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        platform_id: 'google_gemini',
        idea: 'an image of a horse',
        task_type: round1.task_type,
        entities: round1.entities,
        clarifications,
      }),
    });
    const round2 = (await second.json()) as { status: string; questions?: Array<{ id: string }> };

    expect(intentCalls).toBe(1); // intent was not re-run on resume
    const reasked = (round2.questions ?? []).filter((q) => q.id in clarifications);
    expect(reasked).toEqual([]);
    expect(round2.status).toBe('ok'); // only priority-3 questions remain, so it drafts
  });
});
