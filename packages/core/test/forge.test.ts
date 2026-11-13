import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { forgeRequestSchema, forgeResponseSchema, type ForgeRequest } from '@promptai/contract';
import { BUDGET, MAX_PICKS, forge, type ForgeDeps, type Memory } from '../src/forge.ts';
import { allCards } from './helpers.ts';
import { fakeClock, fakeLlm, frame, value, type Behavior } from './fakes.ts';

const cards = allCards();

const run = (req: ForgeRequest, behaviors?: Behavior[], extra: Partial<ForgeDeps> = {}) => {
  const clock = fakeClock();
  const llm = behaviors && fakeLlm(clock, behaviors);
  return forge(forgeRequestSchema.parse(req), { cards, clock, ...(llm && { llm }), ...extra }).then((res) => ({ res, calls: llm?.calls ?? 0, llm }));
};

describe('forge without an LLM', () => {
  it('resolves the tool, fills slots from the words, and chips the rest', async () => {
    const { res } = await run({ text: 'um write a midjourney prompt of a cat at night, 16:9' });
    expect(forgeResponseSchema.safeParse(res).success).toBe(true);
    expect(res.toolId).toBe('midjourney');
    expect(res.toolName).toBe('Midjourney');
    expect(res.brief).toMatch(/^write a midjourney prompt of a cat at night, 16:9, medium shot, night --ar 16:9$/);
    expect(res.assumptions).toEqual([
      { slotId: 'style', label: 'Style', value: '', source: 'default', kind: 'pick', options: ['photorealistic', 'illustration', '3D render', 'anime', 'watercolor', 'oil painting'] },
      { slotId: 'composition', label: 'Framing', value: 'medium shot', source: 'default', kind: 'assumption', options: ['close-up', 'medium shot', 'wide shot', 'overhead', 'low angle'] },
    ]);
    expect(res.unsourced).toEqual([]);
    expect(res.coverage).toMatchObject({ covered: 3, total: 4 });   // the unresolved style pick is not covered
    expect(res.usage).toEqual({ llmCalls: 0, ms: 0 });
  });

  it('applies answers: an answered slot is stated, not a chip', async () => {
    const { res } = await run({ text: 'a midjourney prompt of a cat', answers: { style: 'watercolor', aspect_ratio: '4:5' } });
    expect(res.assumptions.map((a) => a.slotId)).toEqual(['lighting', 'composition']);
    expect(res.brief).toMatch(/watercolor/);
    expect(res.brief).toMatch(/--ar 4:5$/);
    expect(res.coverage).toMatchObject({ covered: 4, total: 4 });
  });

  it('an answer the brief cannot hold falls back to the default chip', async () => {
    const { res } = await run({ text: 'a midjourney prompt of a cat', answers: { aspect_ratio: 'wide' } });
    expect(res.assumptions.find((a) => a.slotId === 'aspect_ratio')).toMatchObject({ value: '1:1', source: 'default', kind: 'assumption' });
    expect(res.brief).toMatch(/--ar 1:1$/);
  });

  it('toolHint wins over words and host app; an unknown hint falls through', async () => {
    expect((await run({ text: 'a midjourney prompt', toolHint: 'suno', hostApp: 'Cursor' })).res.toolId).toBe('suno');
    expect((await run({ text: 'a midjourney prompt', toolHint: 'nope' })).res.toolId).toBe('midjourney');
    expect((await run({ text: 'fix the login bug', hostApp: 'Cursor' })).res.toolId).toBe('cursor');
  });

  it('falls back to the generic card', async () => {
    const { res } = await run({ text: 'write a haiku about rain for beginners' });
    expect(res.toolId).toBe('generic');
    expect(res.brief).toMatch(/^Write a haiku about rain for beginners\.\n\nAudience: beginners\nTone: clear and direct\nFormat: markdown/);
    expect(res.assumptions.map((a) => [a.slotId, a.value])).toEqual([['tone', 'clear and direct'], ['format', 'markdown']]);
    expect(res.coverage).toMatchObject({ covered: 3, total: 3 });
  });

  it('cleans the transcript with the request locale', async () => {
    const { res } = await run({ text: 'um so, like, the budget is 100,000 for the offsite', locale: 'en-IN' });
    expect(res.brief).toMatch(/^So the budget is 1,00,000 for the offsite\./);
    expect(res.unsourced).toEqual([]);
  });

  it('counts a card requirement the brief cannot meet', async () => {
    const { res } = await run({ text: 'a lo-fi hip hop song on suno about rain' });
    expect(res.toolId).toBe('suno');
    expect(res.assumptions.map((a) => a.slotId)).toEqual(['mood']);   // genre was said
    expect(res.coverage).toMatchObject({ covered: 2, total: 3 });     // no lyrics: requires unmet
  });

  it('a pattern slot read from the words is said', async () => {
    const { res } = await run({ text: 'a veo clip of waves, 9:16, 15s, drone shot, documentary' });
    expect(res.toolId).toBe('gemini-omni-video');
    expect(res.assumptions).toEqual([]);
    expect(res.coverage).toMatchObject({ covered: 4, total: 4 });
  });

  it('neutralizes tool syntax typed into free text', async () => {
    const { res } = await run({ text: 'a midjourney prompt of a mug --ar 1:9 --sref 99999' });
    expect(res.brief.match(/--/g)).toEqual(['--']);
    expect(res.brief).toMatch(/--ar 1:9$/);   // the user did say 1:9, so the slot carries it, through the card's param rule
  });

  it('throws only on misconfiguration: no generic card, or counts without a time', async () => {
    await expect(forge(forgeRequestSchema.parse({ text: 'hi' }), { cards: cards.filter((c) => c.id !== 'generic'), clock: fakeClock() })).rejects.toThrow(/generic/);
    const counts = [{ slotId: 'tone', value: 'formal', contextKey: 'x', weight: 1, at: '2026-11-01T00:00:00Z' }];
    await expect(forge(forgeRequestSchema.parse({ text: 'hi' }), { cards, clock: fakeClock(), counts })).rejects.toThrow(/deps\.now/);
    await expect(forge(forgeRequestSchema.parse({ text: 'hi' }), { cards, clock: fakeClock(), counts, now: 'yesterday' })).rejects.toThrow(/deps\.now/);
  });
});

describe('forge with an LLM port', () => {
  it('understand improves the frame; said only when grounded', async () => {
    const { res, calls } = await run({ text: 'ask claude to explain black holes to my grandmother' }, [
      value(frame({
        goal: 'Explain how black holes form',
        slots: [
          { id: 'audience', value: 'my grandmother', source: 'said', confidence: 'high' },
          { id: 'tone', value: 'warm', source: 'said', confidence: 'high' },
          { id: 'nope', value: 'x', source: 'said', confidence: 'high' },
        ],
      })),
    ]);
    expect(calls).toBe(1);
    expect(res.toolId).toBe('claude');
    expect(res.brief).toMatch(/The work is for my grandmother; write at their level\. Tone: warm\./);
    expect(res.brief).toMatch(/<task>\nExplain how black holes form\.\n<\/task>/);
    expect(res.assumptions.map((a) => [a.slotId, a.value, a.source])).toEqual([['tone', 'warm', 'inferred'], ['format', 'markdown', 'default']]);
    expect(res.usage.llmCalls).toBe(1);
  });

  it('understand must return a contract IntentFrame; the old partial shape degrades to the heuristic frame', async () => {
    const base = (await run({ text: 'a midjourney prompt of a fox' })).res;
    const { res, calls } = await run({ text: 'a midjourney prompt of a fox' }, [value({ goal: 'A fox', slots: [{ id: 'style', value: 'anime' }] })]);
    expect(calls).toBe(2);   // invalid twice (retried once), no problems to repair
    expect({ ...res, usage: base.usage }).toEqual(base);
  });

  it('an ungrounded high-impact value is a pick only when its confidence is low', async () => {
    const low = (await run({ text: 'a midjourney prompt of a fox' }, [value(frame({ slots: [{ id: 'style', value: 'anime', source: 'inferred', confidence: 'low' }] }))])).res;
    expect(low.assumptions[0]).toMatchObject({ slotId: 'style', value: 'anime', source: 'inferred', kind: 'pick' });
    expect(low.coverage.covered).toBe(3);
    const high = (await run({ text: 'a midjourney prompt of a fox' }, [value(frame({ slots: [{ id: 'style', value: 'anime', source: 'inferred', confidence: 'high' }] }))])).res;
    expect(high.assumptions[0]).toMatchObject({ slotId: 'style', value: 'anime', source: 'inferred', kind: 'assumption' });
    expect(high.coverage.covered).toBe(4);
    // a model that claims "said" for words the user never said is not trusted on confidence either
    const claimed = (await run({ text: 'a midjourney prompt of a fox' }, [value(frame({ slots: [{ id: 'style', value: 'anime', source: 'said', confidence: 'high' }] }))])).res;
    expect(claimed.assumptions[0]).toMatchObject({ slotId: 'style', source: 'inferred', kind: 'pick' });
  });

  it('one repair pass removes unsourced specifics', async () => {
    const { res, calls } = await run({ text: 'write a launch email for the team' }, [
      value(frame({ goal: 'Write a launch email for Acme Corp on March 5' })),
      value({ goal: 'Write a launch email for the team' }),
    ]);
    expect(calls).toBe(2);
    expect(res.unsourced).toEqual([]);
    expect(res.brief).toMatch(/^Write a launch email for the team\./);
  });

  it('a repair that does not help is discarded, and the specifics are reported', async () => {
    const { res, calls } = await run({ text: 'write a launch email for the team' }, [
      value(frame({ goal: 'Write a launch email for Acme Corp' })),
      value({ goal: 'Write a launch email for Acme Corp and Globex' }),
    ]);
    expect(calls).toBe(2);
    expect(res.unsourced).toEqual(['Acme', 'Corp']);
    expect(res.brief).toMatch(/^Write a launch email for Acme Corp\./);
  });

  it('a failing port degrades to the deterministic brief', async () => {
    const base = (await run({ text: 'a midjourney prompt of a cat at night' })).res;
    for (const kind of ['throw', 'reject'] as const) {
      const { res, calls } = await run({ text: 'a midjourney prompt of a cat at night' }, [{ kind }]);
      expect(calls).toBe(2);   // understand, retried once; no problems, so no repair
      expect({ ...res, usage: base.usage }).toEqual(base);
    }
    const garbage = await run({ text: 'a midjourney prompt of a cat at night' }, [value('not json'), value({ goal: 42 })]);
    expect(garbage.calls).toBe(2);
    expect(garbage.res.brief).toBe(base.brief);
  });

  it('a hung port times out at the budget and is not retried', async () => {
    const { res, calls } = await run({ text: 'a midjourney prompt of a cat' }, [{ kind: 'hang' }]);
    expect(calls).toBe(1);
    expect(res.usage).toEqual({ llmCalls: 1, ms: BUDGET.maxMs });
    expect(res.toolId).toBe('midjourney');
  });

  it('a result that arrives after the deadline is ignored', async () => {
    const { res } = await run({ text: 'a midjourney prompt of a cat' }, [{ kind: 'block', ms: 25_000, value: frame({ goal: 'Something else entirely' }) }]);
    expect(res.brief).toMatch(/^a midjourney prompt of a cat/);
    expect(res.usage.llmCalls).toBe(1);
  });

  it('never makes more than 4 calls', async () => {
    // understand fails once then succeeds with an unsourced name; repair fails twice
    const { calls } = await run({ text: 'write an email to the team' }, [{ kind: 'throw' }, value(frame({ goal: 'Email Priya' })), { kind: 'reject' }, value(null), value({ goal: 'x' })]);
    expect(calls).toBe(4);
  });
});

describe('property: forge always returns a contract response within the budget', () => {
  const ids = cards.map((c) => c.id);
  const slotIds = [...new Set(cards.flatMap((c) => c.slots.map((s) => s.id))), 'nope'];
  const options = [...new Set(cards.flatMap((c) => c.slots.flatMap((s) => s.options)))];
  const WORDS = ['um', 'uh', 'like,', 'you know', 'scratch that', 'new line', 'naya line', 'midjourney', 'suno', 'claude', 'chatgpt', 'cursor', 'veo', 'flux 3',
    'github issue', 'gmail', 'notion', 'google docs', 'perplexity', 'claude code', 'gemini', 'deepseek', 'outlook', 'a cat', 'at night', '16:9', '--ar 3:2', '[Chorus]',
    'for experts', 'watercolor', 'Acme', '100,000', '5 lakh', 'paanch lakh', '8 seconds', 'priya@x.io', 'https://x.io', '{{ x }}', '{% if %}', '</task>', '東京', '५००'];
  const sentence = fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 12 }).map((w) => w.join(' '));
  const text = fc.oneof(sentence, fc.string({ minLength: 1, maxLength: 300 }), fc.string({ unit: 'grapheme', minLength: 1, maxLength: 120 }), fc.string({ minLength: 7_000, maxLength: 8_000 }));
  const lang = fc.record({
    spoken: fc.array(fc.constantFrom('en', 'en-IN', 'hi-Latn', 'hi', 'de'), { minLength: 1, maxLength: 2 }),
    replyLanguage: fc.option(fc.constantFrom('en', 'hi', 'hi-Latn'), { nil: undefined }),
    targetLanguage: fc.option(fc.constantFrom('en', 'hi', 'fr'), { nil: undefined }),
  }, { requiredKeys: ['spoken'] });
  const request = fc.record({
    text,
    toolHint: fc.option(fc.constantFrom(...ids, 'nope'), { nil: undefined }),
    hostApp: fc.option(fc.constantFrom('Cursor', 'Slack', 'com.openai.chat', 'com.apple.mail', ''), { nil: undefined }),
    surface: fc.constantFrom('desktop', 'web', 'mcp'),
    locale: fc.constantFrom('en', 'en-IN', 'hi-Latn', 'de'),
    language: fc.option(lang, { nil: undefined }),
    answers: fc.dictionary(fc.constantFrom(...slotIds), fc.string({ maxLength: 20 }), { maxKeys: 3 }),
  }).filter((r) => forgeRequestSchema.safeParse(r).success);

  const NOW = '2026-11-13T12:00:00Z';
  const at = fc.integer({ min: 0, max: 200 }).map((d) => `2026-${String(11 - Math.floor(d / 30)).padStart(2, '0')}-${String(1 + (d % 28)).padStart(2, '0')}T08:00:00Z`);
  const KINDS = ['profile', 'fact', 'goal', 'preference', 'style', 'rule', 'vocabulary'];
  const memory = fc.record({ id: fc.uuid(), kind: fc.constantFrom(...KINDS), text: fc.constantFrom(...KINDS).map((k) => `MEMCANARY-${k}`) })
    .map((m): Memory => ({ ...m, text: `MEMCANARY-${m.kind}` }));
  const deps = fc.record({
    memories: fc.option(fc.array(memory, { maxLength: 6 }), { nil: undefined }),
    counts: fc.option(fc.array(fc.record({
      slotId: fc.constantFrom(...slotIds), value: fc.oneof(fc.constantFrom(...options), fc.string({ maxLength: 12 })),
      contextKey: fc.constantFrom('', 'midjourney|cursor|', 'gmail||'), weight: fc.constantFrom(0, 0.5, 1), at,
    }), { maxLength: 12 }), { nil: undefined }),
    toolUsage: fc.option(fc.array(fc.record({
      toolId: fc.constantFrom(...ids, 'nope'), hostApp: fc.constantFrom(null, 'Slack', 'Cursor'), surface: fc.constantFrom('desktop', 'web'), at,
    }), { maxLength: 8 }), { nil: undefined }),
  });

  const SOURCES = ['said', 'memory', 'count', 'default', 'inferred', 'captured'] as const;
  const shapedFrame = fc.record({
    family: fc.constantFrom('generic', 'image.generate'),
    target: fc.record({ toolId: fc.option(fc.constantFrom(...ids), { nil: null }), source: fc.constantFrom('context', 'named', 'predicted', 'none') }),
    goal: fc.oneof(fc.string({ maxLength: 60 }), fc.constantFrom('Email Acme Corp by March 5', 'Ping priya@x.io', 'x'.repeat(5_000))),
    deliverable: fc.string({ maxLength: 30 }),
    successCriteria: fc.array(fc.string({ maxLength: 30 }), { maxLength: 3 }),
    slots: fc.array(fc.record({ id: fc.constantFrom(...slotIds), value: fc.option(fc.oneof(fc.string({ maxLength: 30 }), fc.constantFrom(...options)), { nil: null }), source: fc.constantFrom(...SOURCES), confidence: fc.constantFrom('low', 'med', 'high') }), { maxLength: 5 }),
    coveredForYou: fc.constant([]),
    unsure: fc.constant([]),
    language: lang,
    risk: fc.constantFrom('none', 'none', 'sensitive', 'refuse'),
  });
  const shapedRepair = fc.record({ goal: fc.oneof(fc.string({ maxLength: 60 }), fc.constantFrom('Email Acme Corp by March 5', 'x'.repeat(5_000))), subject: fc.string({ maxLength: 40 }) }, { requiredKeys: [] });
  const payload = fc.oneof(fc.anything(), shapedFrame, shapedFrame, shapedRepair);
  const behavior: fc.Arbitrary<Behavior> = fc.oneof(
    fc.constant({ kind: 'throw' as const }),
    fc.constant({ kind: 'reject' as const }),
    fc.constant({ kind: 'hang' as const }),
    fc.constant({ kind: 'echo' as const }),
    fc.record({ kind: fc.constant('value' as const), value: payload }),
    fc.record({ kind: fc.constant('slow' as const), ms: fc.integer({ min: 0, max: 40_000 }), value: payload }),
    fc.record({ kind: fc.constant('block' as const), ms: fc.integer({ min: 0, max: 40_000 }), value: payload }),
  );
  const PRIVATE_ONLY = /MEMCANARY-(?:profile|fact|goal|rule)/;

  it('for arbitrary text, history and port behaviour (>= 1,000 cases)', async () => {
    let cases = 0;
    const callCounts = new Set<number>();
    await fc.assert(fc.asyncProperty(request, deps, fc.option(fc.array(behavior, { minLength: 1, maxLength: 6 }), { nil: undefined }), async (req, d, behaviors) => {
      cases++;
      const { res, calls } = await run(req, behaviors, { ...d, now: NOW });
      callCounts.add(calls);
      const parsed = forgeResponseSchema.safeParse(res);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(res.usage.llmCalls).toBeLessThanOrEqual(BUDGET.maxCalls);
      expect(res.usage.llmCalls).toBe(calls);
      expect(res.assumptions.filter((a) => a.kind === 'pick').length).toBeLessThanOrEqual(MAX_PICKS);
      if (res.issues?.some((i) => i.code === 'refused')) expect(res.brief).toBe('');
      // destination rule: text a person reads never carries profile, fact, goal or rule memories
      const card = cards.find((c) => c.id === res.toolId)!;
      if (card.audience !== 'private_ai') {
        for (const t of [res.brief, ...(res.fields ?? []).map((f) => f.text)]) expect(t).not.toMatch(PRIVATE_ONLY);
      }
      // with an honest async port (no synchronous time-eating), forge ends within the time budget
      if (!behaviors?.some((b) => b.kind === 'block')) expect(res.usage.ms).toBeLessThanOrEqual(BUDGET.maxMs);
    }), { numRuns: Number(process.env.FORGE_RUNS ?? 1_000) });
    expect(cases).toBeGreaterThanOrEqual(1_000);
    expect([...callCounts].sort()).toEqual([0, 1, 2, 3, 4]);   // the runs reached every call count, the 4-call ceiling included
  }, 300_000);
});
