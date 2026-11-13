import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { forgeRequestSchema, forgeResponseSchema, type ForgeRequest } from '@promptai/contract';
import { BUDGET, forge, type Clock, type LlmPort } from '../src/forge.ts';
import { allCards } from './helpers.ts';

const cards = allCards();

/** Virtual time: a timer fires only once every promise is waiting, earliest due first. */
function fakeClock(): Clock & { block(ms: number): void } {
  let t = 1_000;
  const timers: Array<{ due: number; fire: () => void; live: boolean }> = [];
  let pending = false;
  const schedule = () => { if (!pending) { pending = true; setImmediate(tick); } };
  const tick = () => {
    pending = false;
    timers.sort((a, b) => a.due - b.due);
    const next = timers.shift();
    if (next?.live) { t = Math.max(t, next.due); next.fire(); }
    if (timers.length) schedule();
  };
  return {
    now: () => t,
    block: (ms) => { t += ms; },
    after(ms) {
      let fire!: () => void;
      const promise = new Promise<void>((r) => { fire = r; });
      const timer = { due: t + ms, fire, live: true };
      timers.push(timer);
      schedule();
      return { promise, cancel: () => { timer.live = false; } };
    },
  };
}

type Behavior =
  | { kind: 'throw' } | { kind: 'reject' } | { kind: 'hang' }
  | { kind: 'value'; value: unknown }
  | { kind: 'slow'; ms: number; value: unknown }     // waits on the clock, like a slow network
  | { kind: 'block'; ms: number; value: unknown };   // eats time synchronously

function fakeLlm(clock: ReturnType<typeof fakeClock>, behaviors: Behavior[]): LlmPort & { calls: number } {
  let i = 0;
  const act = (): Promise<unknown> => {
    const b = behaviors[i++ % behaviors.length]!;
    switch (b.kind) {
      case 'throw': throw new Error('port blew up');
      case 'reject': return Promise.reject(new Error('port rejected'));
      case 'hang': return new Promise(() => {});
      case 'value': return Promise.resolve(b.value);
      case 'slow': return clock.after(b.ms).promise.then(() => b.value);
      case 'block': clock.block(b.ms); return Promise.resolve(b.value);
    }
  };
  const port = { calls: 0, understand: () => { port.calls++; return act(); }, repair: () => { port.calls++; return act(); } };
  return port;
}

const run = (req: ForgeRequest, behaviors?: Behavior[]) => {
  const clock = fakeClock();
  const llm = behaviors && fakeLlm(clock, behaviors);
  return forge(forgeRequestSchema.parse(req), { cards, clock, ...(llm && { llm }) }).then((res) => ({ res, calls: llm?.calls ?? 0 }));
};
const value = (v: unknown): Behavior => ({ kind: 'value', value: v });

describe('forge without an LLM', () => {
  it('resolves the tool, fills slots from the words, and chips the rest', async () => {
    const { res } = await run({ text: 'um write a midjourney prompt of a cat at night, 16:9' });
    expect(forgeResponseSchema.parse(res)).toEqual(res);
    expect(res.toolId).toBe('midjourney');
    expect(res.toolName).toBe('Midjourney');
    expect(res.brief).toMatch(/^write a midjourney prompt of a cat at night, 16:9, medium shot, night --ar 16:9$/);
    expect(res.assumptions).toEqual([
      { slotId: 'style', label: 'Style', value: '', source: 'default', kind: 'pick', options: ['photorealistic', 'illustration', '3D render', 'anime', 'watercolor', 'oil painting'] },
      { slotId: 'composition', label: 'Framing', value: 'medium shot', source: 'default', kind: 'assumption', options: ['close-up', 'medium shot', 'wide shot', 'overhead', 'low angle'] },
    ]);
    expect(res.unsourced).toEqual([]);
    expect(res.coverage).toEqual({ covered: 3, total: 4 });   // the unresolved style pick is not covered
    expect(res.usage).toEqual({ llmCalls: 0, ms: 0 });
  });

  it('applies answers: an answered slot is stated, not a chip', async () => {
    const { res } = await run({ text: 'a midjourney prompt of a cat', answers: { style: 'watercolor', aspect_ratio: '4:5' } });
    expect(res.assumptions.map((a) => a.slotId)).toEqual(['lighting', 'composition']);
    expect(res.brief).toMatch(/watercolor/);
    expect(res.brief).toMatch(/--ar 4:5$/);
    expect(res.coverage).toEqual({ covered: 4, total: 4 });
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
    expect(res.coverage).toEqual({ covered: 3, total: 3 });
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
    expect(res.coverage).toEqual({ covered: 2, total: 3 });           // no lyrics: requires unmet
  });

  it('a pattern slot read from the words is said', async () => {
    const { res } = await run({ text: 'a veo clip of waves, 9:16, 15s, drone shot, documentary' });
    expect(res.toolId).toBe('gemini-omni-video');
    expect(res.assumptions).toEqual([]);
    expect(res.coverage).toEqual({ covered: 4, total: 4 });
  });

  it('neutralizes tool syntax typed into free text', async () => {
    const { res } = await run({ text: 'a midjourney prompt of a mug --ar 1:9 --sref 99999' });
    expect(res.brief.match(/--/g)).toEqual(['--']);
    expect(res.brief).toMatch(/--ar 1:9$/);   // the user did say 1:9, so the slot carries it, through the card's param rule
  });

  it('throws only on misconfiguration: no generic card', async () => {
    await expect(forge(forgeRequestSchema.parse({ text: 'hi' }), { cards: cards.filter((c) => c.id !== 'generic'), clock: fakeClock() })).rejects.toThrow(/generic/);
  });
});

describe('forge with an LLM port', () => {
  it('understand improves the frame; said only when grounded', async () => {
    const { res, calls } = await run({ text: 'ask claude to explain black holes to my grandmother' }, [
      value({ goal: 'Explain how black holes form', slots: [{ id: 'audience', value: 'my grandmother' }, { id: 'tone', value: 'warm' }, { id: 'nope', value: 'x' }] }),
    ]);
    expect(calls).toBe(1);
    expect(res.toolId).toBe('claude');
    expect(res.brief).toMatch(/The work is for my grandmother; write at their level\. Tone: warm\./);
    expect(res.brief).toMatch(/<task>\nExplain how black holes form\.\n<\/task>/);
    expect(res.assumptions.map((a) => [a.slotId, a.value, a.source])).toEqual([['tone', 'warm', 'inferred'], ['format', 'markdown', 'default']]);
    expect(res.usage.llmCalls).toBe(1);
  });

  it('a high-impact suggestion stays a pick', async () => {
    const { res } = await run({ text: 'a midjourney prompt of a fox' }, [value({ slots: [{ id: 'style', value: 'anime' }] })]);
    expect(res.assumptions[0]).toMatchObject({ slotId: 'style', value: 'anime', source: 'inferred', kind: 'pick' });
    expect(res.coverage.covered).toBe(3);
  });

  it('one repair pass removes unsourced specifics', async () => {
    const { res, calls } = await run({ text: 'write a launch email for the team' }, [
      value({ goal: 'Write a launch email for Acme Corp on March 5' }),
      value({ goal: 'Write a launch email for the team' }),
    ]);
    expect(calls).toBe(2);
    expect(res.unsourced).toEqual([]);
    expect(res.brief).toMatch(/^Write a launch email for the team\./);
  });

  it('a repair that does not help is discarded, and the specifics are reported', async () => {
    const { res, calls } = await run({ text: 'write a launch email for the team' }, [
      value({ goal: 'Write a launch email for Acme Corp' }),
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
    const { res } = await run({ text: 'a midjourney prompt of a cat' }, [{ kind: 'block', ms: 25_000, value: { goal: 'Something else entirely' } }]);
    expect(res.brief).toMatch(/^a midjourney prompt of a cat/);
    expect(res.usage.llmCalls).toBe(1);
  });

  it('never makes more than 4 calls', async () => {
    // understand fails once then succeeds with an unsourced name; repair fails twice
    const { calls } = await run({ text: 'write an email to the team' }, [{ kind: 'throw' }, value({ goal: 'Email Priya' }), { kind: 'reject' }, value(null), value({ goal: 'x' })]);
    expect(calls).toBe(4);
  });
});

describe('property: forge always returns a contract response within the budget', () => {
  const ids = cards.map((c) => c.id);
  const slotIds = [...new Set(cards.flatMap((c) => c.slots.map((s) => s.id))), 'nope'];
  const WORDS = ['um', 'uh', 'like,', 'you know', 'scratch that', 'new line', 'naya line', 'midjourney', 'suno', 'claude', 'chatgpt', 'cursor', 'veo', 'flux 3',
    'github issue', 'a cat', 'at night', '16:9', '--ar 3:2', '[Chorus]', 'for experts', 'watercolor', 'Acme', '100,000', '8 seconds', 'priya@x.io', 'https://x.io', '{{ x }}', '{% if %}', '</task>', '東京', '५००'];
  const sentence = fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 12 }).map((w) => w.join(' '));
  const text = fc.oneof(sentence, fc.string({ minLength: 1, maxLength: 300 }), fc.string({ unit: 'grapheme', minLength: 1, maxLength: 120 }), fc.string({ minLength: 7_000, maxLength: 8_000 }));
  const request = fc.record({
    text,
    toolHint: fc.option(fc.constantFrom(...ids, 'nope'), { nil: undefined }),
    hostApp: fc.option(fc.constantFrom('Cursor', 'Slack', 'com.openai.chat', ''), { nil: undefined }),
    locale: fc.constantFrom('en', 'en-IN', 'hi-Latn', 'de'),
    answers: fc.dictionary(fc.constantFrom(...slotIds), fc.string({ maxLength: 20 }), { maxKeys: 3 }),
  }).filter((r) => forgeRequestSchema.safeParse(r).success);
  const shaped = fc.record({
    goal: fc.oneof(fc.string({ maxLength: 60 }), fc.constantFrom('Email Acme Corp by March 5', 'Ping priya@x.io', 'x'.repeat(5_000))),
    subject: fc.string({ maxLength: 40 }),
    slots: fc.array(fc.record({ id: fc.constantFrom(...slotIds), value: fc.string({ maxLength: 30 }) }), { maxLength: 4 }),
  }, { requiredKeys: [] });
  const behavior: fc.Arbitrary<Behavior> = fc.oneof(
    fc.constant({ kind: 'throw' as const }),
    fc.constant({ kind: 'reject' as const }),
    fc.constant({ kind: 'hang' as const }),
    fc.record({ kind: fc.constant('value' as const), value: fc.oneof(fc.anything(), shaped) }),
    fc.record({ kind: fc.constant('slow' as const), ms: fc.integer({ min: 0, max: 40_000 }), value: fc.oneof(fc.anything(), shaped) }),
    fc.record({ kind: fc.constant('block' as const), ms: fc.integer({ min: 0, max: 40_000 }), value: fc.oneof(fc.anything(), shaped) }),
  );

  it('for arbitrary text and arbitrary port behaviour (>= 1,000 cases)', async () => {
    let cases = 0;
    const callCounts = new Set<number>();
    await fc.assert(fc.asyncProperty(request, fc.option(fc.array(behavior, { minLength: 1, maxLength: 6 }), { nil: undefined }), async (req, behaviors) => {
      cases++;
      const { res, calls } = await run(req, behaviors);
      callCounts.add(calls);
      const parsed = forgeResponseSchema.safeParse(res);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(res.usage.llmCalls).toBeLessThanOrEqual(BUDGET.maxCalls);
      expect(res.usage.llmCalls).toBe(calls);
      // with an honest async port (no synchronous time-eating), forge ends within the time budget
      if (!behaviors?.some((b) => b.kind === 'block')) expect(res.usage.ms).toBeLessThanOrEqual(BUDGET.maxMs);
    }), { numRuns: Number(process.env.FORGE_RUNS ?? 1_000) });
    expect(cases).toBeGreaterThanOrEqual(1_000);
    expect([...callCounts].sort()).toEqual([0, 1, 2, 3, 4]);   // the runs reached every call count, the 4-call ceiling included
  }, 300_000);
});
