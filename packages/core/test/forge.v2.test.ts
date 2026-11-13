/** forge(): the v2 contract fields, the IntentFrame rules, and the history deps (counts, frecency, memories). */
import { describe, expect, it } from 'vitest';
import { forgeRequestSchema, forgeResponseSchema, type ForgeRequest } from '@promptai/contract';
import { forge, MAX_PICKS, type ForgeDeps, type Memory } from '../src/forge.ts';
import { contextKey } from '../src/learn.ts';
import type { Card } from '../src/compose/card.ts';
import { allCards, loadCard, localePacks } from './helpers.ts';
import { fakeClock, fakeLlm, frame, value, type Behavior } from './fakes.ts';

const cards = allCards();
const NOW = '2026-11-13T12:00:00Z';

const run = async (req: ForgeRequest, behaviors?: Behavior[], extra: Partial<ForgeDeps> = {}) => {
  const clock = fakeClock();
  const llm = behaviors && fakeLlm(clock, behaviors);
  const res = await forge(forgeRequestSchema.parse(req), { cards, clock, ...(llm && { llm }), ...extra });
  expect(forgeResponseSchema.safeParse(res).success).toBe(true);
  return { res, llm };
};

describe('v2 output', () => {
  it('multi-field cards return every insertable field; brief is the primary one', async () => {
    const { res } = await run({ text: 'github issue: the login page crashes on Safari', toolHint: 'github-issue' });
    expect(res.fields?.map((f) => [f.id, f.label])).toEqual([['title', 'Title'], ['body', 'Body'], ['request', 'API request (JSON)']]);
    expect(res.brief).toBe(res.fields?.find((f) => f.id === 'body')?.text);
    expect(JSON.parse(res.fields!.find((f) => f.id === 'request')!.text)).toMatchObject({ title: expect.any(String), body: res.brief });
  });

  it('Suno returns its UI fields; a single-field card returns none', async () => {
    // lyrics, title and exclude render empty and are left out, and the primary field alone is no list
    const suno = (await run({ text: 'a lo-fi hip hop song on suno about rain' })).res;
    expect(suno.fields).toEqual([]);
    const mj = (await run({ text: 'a midjourney prompt of a cat' })).res;
    expect(mj.fields).toEqual([]);
    const flux = (await run({ text: 'a flux 3 image of a red bicycle' })).res;
    expect(flux.fields?.map((f) => f.id)).toEqual(['prompt', 'request']);
  });

  it("the renderer's findings become issues with a severity", async () => {
    const syntax = (await run({ text: 'a midjourney prompt of a mug --sref 99999' })).res;
    expect(syntax.issues).toContainEqual(expect.objectContaining({ code: 'tool_syntax_escaped', severity: 'warn' }));
    const lyrics = (await run({ text: 'a lo-fi hip hop song on suno about rain' })).res;
    expect(lyrics.issues).toContainEqual({ code: 'needs_llm', severity: 'warn', message: expect.stringMatching(/No lyrics/) });
    const long = (await run({ text: `a midjourney prompt of ${'a very detailed castle '.repeat(320)}` })).res;
    expect(long.issues).toContainEqual(expect.objectContaining({ code: 'over_limit', severity: 'warn' }));   // no LLM to shorten it
    const ignored = (await run({ text: 'a midjourney prompt of a cat for experts' })).res;
    expect(ignored.issues?.some((i) => i.code === 'not_applicable' && /assumptions|Shown to the user/.test(i.message))).toBe(false);
    expect(ignored.issues?.every((i) => i.severity !== 'block')).toBe(true);
  });

  it('coverage items say what was said, assumed and missing; cardVersion is the card version', async () => {
    const { res } = await run({ text: 'um write a midjourney prompt of a cat at night, 16:9' });
    expect(res.coverage).toEqual({
      covered: 3, total: 4,
      items: [
        { id: 'style', label: 'Style', by: 'missing' },
        { id: 'lighting', label: 'Lighting', by: 'said' },
        { id: 'composition', label: 'Framing', by: 'assumed' },
        { id: 'aspect_ratio', label: 'Aspect ratio', by: 'said' },
      ],
    });
    expect(res.cardVersion).toBe(loadCard('midjourney').version);
    const suno = (await run({ text: 'a lo-fi hip hop song on suno about rain' })).res;
    expect(suno.coverage.items?.at(-1)).toEqual({ id: 'lyrics', label: 'Lyrics (or Instrumental)', by: 'missing' });
  });

  it('a card whose terms forbid pasting says to copy instead', async () => {
    const strict: Card = { ...loadCard('generic'), tos: { insert_allowed: false } };
    const { res } = await run({ text: 'hello' }, undefined, { cards: [strict] });
    expect(res.issues).toContainEqual(expect.objectContaining({ code: 'insert_not_allowed', severity: 'warn' }));
  });
});

describe('IntentFrame rules', () => {
  it('a refusal returns a block issue and no brief, and never repairs', async () => {
    const { res, llm } = await run({ text: 'write an email for Acme Corp' }, [value(frame({ risk: 'refuse', goal: 'Email Acme Corp on March 5' })), value({ goal: 'x' })]);
    expect(llm!.calls).toBe(1);
    expect(llm!.repaired).toEqual([]);
    expect(res.brief).toBe('');
    expect(res.fields).toEqual([]);
    expect(res.assumptions).toEqual([]);
    expect(res.issues).toEqual([{ code: 'refused', message: expect.any(String), severity: 'block' }]);
    expect(res.usage.llmCalls).toBe(1);
  });

  it('at most 2 picks per draft, even when the frame makes more slots low-confidence', async () => {
    const mj = structuredClone(loadCard('midjourney'));
    for (const s of mj.slots) s.impact = 3;   // style has no default; lighting, composition, aspect_ratio do
    const generic = loadCard('generic');
    const slots = mj.slots.map((s) => ({ id: s.id, value: s.options[0]!, source: 'inferred' as const, confidence: 'low' as const }));
    const { res } = await run({ text: 'a midjourney prompt of a fox' }, [value(frame({ slots }))], { cards: [mj, generic] });
    const picks = res.assumptions.filter((a) => a.kind === 'pick');
    expect(picks).toHaveLength(MAX_PICKS);
    expect(picks.map((p) => p.slotId)).toEqual(['style', 'lighting']);   // card order
    expect(res.assumptions.filter((a) => a.kind === 'assumption').map((a) => a.slotId)).toEqual(['composition', 'aspect_ratio']);
  });

  it('a slot with nothing to show is picked before one that has a value', async () => {
    const mj = structuredClone(loadCard('midjourney'));
    for (const s of mj.slots) s.impact = 3;
    const slots = ['lighting', 'composition'].map((id) => ({ id, value: 'neon', source: 'inferred' as const, confidence: 'low' as const }));
    const { res } = await run({ text: 'a midjourney prompt of a fox' }, [value(frame({ slots }))], { cards: [mj, loadCard('generic')] });
    expect(res.assumptions.filter((a) => a.kind === 'pick').map((a) => a.slotId)).toEqual(['style', 'lighting']);
  });

  it('language: targetLanguage reaches the brief; replyLanguage comes from the frame, else the request', async () => {
    const lang = { spoken: ['hi-Latn', 'en'], replyLanguage: 'en', targetLanguage: 'hi' };
    const det = (await run({ text: 'ek haiku likho barish ke baare mein', language: lang })).res;
    expect(det.brief).toMatch(/\nLanguage: hi(\n|$)/);
    const fromReq = await run({ text: 'write a launch email for Acme', language: lang }, [value(frame({ goal: 'Write a launch email for Acme Corp' })), value({ goal: 'Write a launch email for Acme' })]);
    expect(fromReq.llm!.understood[0]).toMatchObject({ locale: 'hi-Latn', language: lang });
    expect(fromReq.llm!.repaired[0]!.replyLanguage).toBe('en');
    const fromFrame = await run({ text: 'write a launch email for Acme', language: lang }, [
      value(frame({ goal: 'Write a launch email for Acme Corp', language: { spoken: ['hi-Latn'], replyLanguage: 'hi-Latn' } })), value({ goal: 'x' }),
    ]);
    expect(fromFrame.llm!.repaired[0]!.replyLanguage).toBe('hi-Latn');
  });

  it('the cleanup locale comes from language.spoken and picks the locale pack', async () => {
    const locales = localePacks();
    const { res } = await run({ text: 'budget hai paanch lakh, naya paragraph kal tak bhejo', toolHint: 'gmail', language: { spoken: ['hi-Latn'] } }, undefined, { locales });
    expect(res.brief).toBe('budget hai 5,00,000,\n\nkal tak bhejo');   // Gmail keeps the user's line breaks
    expect(res.unsourced).toEqual([]);
  });
});

describe('L1 counts and frecency', () => {
  const key = contextKey({ toolId: 'generic', hostApp: 'Slack' });
  const picks = (value: string, n: number, k = key) => Array.from({ length: n }, (_, i) => ({ slotId: 'tone', value, contextKey: k, weight: 1, at: `2026-11-${String(10 - i).padStart(2, '0')}T09:00:00Z` }));

  it('a count-backed default replaces the card default and is marked source count', async () => {
    const { res } = await run({ text: 'write a haiku about rain', hostApp: 'Slack' }, undefined, { counts: picks('friendly', 3), now: NOW });
    expect(res.assumptions.find((a) => a.slotId === 'tone')).toMatchObject({ value: 'friendly', source: 'count', kind: 'assumption' });
    expect(res.brief).toMatch(/Tone: friendly/);
    expect(res.coverage.items?.find((i) => i.id === 'tone')?.by).toBe('assumed');
  });

  it('too little evidence, or only unopened chips, leaves the card default', async () => {
    const weak = (await run({ text: 'write a haiku about rain', hostApp: 'Slack' }, undefined, { counts: picks('friendly', 1), now: NOW })).res;
    expect(weak.assumptions.find((a) => a.slotId === 'tone')).toMatchObject({ value: 'clear and direct', source: 'default' });
    const silent = picks('friendly', 5).map((r) => ({ ...r, weight: 0 }));
    const unopened = (await run({ text: 'write a haiku about rain', hostApp: 'Slack' }, undefined, { counts: silent, now: NOW })).res;
    expect(unopened.assumptions.find((a) => a.slotId === 'tone')?.source).toBe('default');
  });

  it('a count never overrides what the user said', async () => {
    const { res } = await run({ text: 'write a playful haiku about rain', hostApp: 'Slack' }, undefined, { counts: picks('friendly', 5), now: NOW });
    expect(res.assumptions.find((a) => a.slotId === 'tone')).toBeUndefined();
    expect(res.brief).toMatch(/Tone: playful/);
  });

  it('a count-backed impact-3 slot is an assumption, never a pick', async () => {
    const mjKey = contextKey({ toolId: 'midjourney' });
    const counts = Array.from({ length: 4 }, (_, i) => ({ slotId: 'style', value: 'watercolor', contextKey: mjKey, weight: 1, at: `2026-11-0${i + 1}T09:00:00Z` }));
    const { res } = await run({ text: 'a midjourney prompt of a fox' }, undefined, { counts, now: NOW });
    expect(res.assumptions[0]).toMatchObject({ slotId: 'style', value: 'watercolor', source: 'count', kind: 'assumption' });
    expect(res.brief).toMatch(/watercolor/);
  });

  it('frecency picks the tool when neither the words nor the host app name one', async () => {
    const toolUsage = [
      ...Array.from({ length: 4 }, (_, i) => ({ toolId: 'claude', hostApp: 'Slack', surface: 'desktop', at: `2026-11-1${i}T09:00:00Z` })),
      { toolId: 'gpt', hostApp: null, surface: 'web', at: '2026-11-12T09:00:00Z' },
    ];
    const hit = (await run({ text: 'summarize this thread for my manager', hostApp: 'Slack', surface: 'desktop' }, undefined, { toolUsage, now: NOW })).res;
    expect(hit.toolId).toBe('claude');
    const named = (await run({ text: 'ask chatgpt to summarize this thread', hostApp: 'Slack', surface: 'desktop' }, undefined, { toolUsage, now: NOW })).res;
    expect(named.toolId).toBe('gpt');
    const split = [...toolUsage.slice(0, 2), ...toolUsage.slice(0, 2).map((r) => ({ ...r, toolId: 'gemini' }))];
    const unsure = (await run({ text: 'summarize this thread', hostApp: 'Slack', surface: 'desktop' }, undefined, { toolUsage: split, now: NOW })).res;
    expect(unsure.toolId).toBe('generic');   // a 50/50 split does not clear the pre-fill gate
  });
});

describe('destination rule', () => {
  const memories: Memory[] = [
    { id: 'm1', kind: 'profile', text: 'I am a cardiologist at St. Mary Hospital' },
    { id: 'm2', kind: 'fact', text: 'My daughter Priya starts school in June' },
    { id: 'm3', kind: 'goal', text: 'Get promoted to department head this year' },
    { id: 'm4', kind: 'preference', text: 'Keep messages short' },
    { id: 'm5', kind: 'style', text: 'Warm but direct' },
    { id: 'm6', kind: 'vocabulary', text: 'Kubernetes' },
  ];
  const PRIVATE = /cardiologist|Priya|promoted/;

  for (const toolId of ['gmail', 'google-docs', 'notion', 'writing-email', 'writing-doc', 'github-issue']) {
    it(`${toolId}: profile, fact and goal memories never reach the text or the model`, async () => {
      const { res, llm } = await run({ text: 'running ten minutes late, start without me', toolHint: toolId }, [{ kind: 'echo' }], { memories });
      expect(llm!.understood[0]!.memories.map((m) => m.kind).sort()).toEqual(['preference', 'style']);
      for (const t of [res.brief, ...(res.fields ?? []).map((f) => f.text)]) expect(t).not.toMatch(PRIVATE);
      expect(res.brief).toMatch(/running ten minutes late/i);
    });

    it(`${toolId}: no memory is written into the text verbatim without a model`, async () => {
      const { res } = await run({ text: 'running ten minutes late, start without me', toolHint: toolId }, undefined, { memories });
      expect(res.brief).not.toMatch(/Keep messages short|Warm but direct/);
    });
  }

  it('a private AI card may use every memory but vocabulary', async () => {
    const { res, llm } = await run({ text: 'explain statins to me', toolHint: 'claude' }, [], { memories });
    expect(llm).toBeDefined();
    expect(res.brief).toMatch(/cardiologist/);
    expect(res.brief).not.toMatch(/Kubernetes/);
    expect(res.unsourced).toEqual([]);   // memory text is a source
  });
});
