/**
 * forge(): one request in, one brief out (blueprint §4 "A forge request", §6, §11).
 * A plain async function under a Budget whose only loop is one repair. It works
 * with no LLM: the port only improves the frame and repairs failed checks, and
 * a port that throws, stalls or returns garbage degrades to the deterministic result.
 *
 * Both paths build an IntentFrame (the contract's): the heuristic frame from the
 * user's words, answers, counts and card defaults, and `understand`'s frame
 * merged on top of it. Composition reads only the frame.
 */
import { z } from 'zod';
import {
  intentFrameSchema,
  type Assumption, type ForgeRequestParsed, type ForgeResponse, type IntentFrame, type Language, type SlotSource,
} from '@promptai/contract';
import { BriefSchema, type Brief } from './compose/ir.ts';
import { insertField, type Card, type Slot } from './compose/card.ts';
import { render, type RenderResult } from './compose/render.ts';
import { cleanTranscript } from './clean.ts';
import { findUnsourced, isGrounded } from './ground.ts';
import { contextKey, countDefault, L1, SHOW_GATE, type CountRow } from './learn.ts';
import { lookupPack, type LocalePack } from './locale.ts';
import { frecencyTool, type ToolUsageRow } from './predict.ts';
import { GENERIC_CARD_ID, resolveTool } from './resolve.ts';
import { findWord, normalize } from './text.ts';
import { isoMs } from './time.ts';

/** Blueprint §11: at most 4 LLM calls and 20 s per forge. */
export const BUDGET = { maxCalls: 4, maxMs: 20_000 } as const;
/** Blueprint §6: at most 2 pick chips per draft (the card lint enforces it for defaults; forge for every frame). */
export const MAX_PICKS = 2;

export type Clock = {
  /** milliseconds from any fixed origin */
  now(): number;
  /** a timer forge races each LLM call against; cancel() releases it */
  after(ms: number): { promise: Promise<void>; cancel(): void };
};

/** A user memory the server ranked for this request (blueprint §10). `kind`: profile, preference, style, rule, fact, goal, vocabulary. */
export type Memory = { id: string; kind: string; text: string };

export type UnderstandInput = {
  text: string;
  /** the locale the transcript was cleaned with */
  locale: string;
  language: Language;
  tool: { id: string; name: string; family: string; audience: Card['audience'] };
  slots: Array<{ id: string; label: string; options: string[] }>;
  /** already filtered by the card's audience (destination rule) */
  memories: Memory[];
};
export type RepairInput = { goal: string; subject?: string; brief: string; problems: string[]; replyLanguage: string };
/**
 * Each call gets the time left in the budget. Resolve with JSON-like data
 * (validated here: `understand` must return a contract IntentFrame); rejecting,
 * stalling or returning anything else is allowed.
 */
export type LlmPort = {
  understand(input: UnderstandInput, opts: { timeoutMs: number }): Promise<unknown>;
  repair(input: RepairInput, opts: { timeoutMs: number }): Promise<unknown>;
};
export type ForgeDeps = {
  cards: readonly Card[];
  llm?: LlmPort;
  clock: Clock;
  /** wall-clock time of the request, ISO 8601; required with `counts` or `toolUsage`, whose weights decay with age */
  now?: string;
  /** L1 context counts for this user */
  counts?: readonly CountRow[];
  /** this user's tool usage, for the frecency fallback when neither the words nor the host app name a tool */
  toolUsage?: readonly ToolUsageRow[];
  memories?: readonly Memory[];
  /** parsed catalog/locales packs; the cleanup locale picks one */
  locales?: readonly LocalePack[];
};

const repairSchema = z.object({
  goal: z.string().trim().min(1).max(4_000),
  subject: z.string().trim().min(1).max(2_000).optional(),
});

type FrameSlot = IntentFrame['slots'][number];
type Confidence = FrameSlot['confidence'];
type SlotState = { slot: Slot; value: string | null; source: SlotSource; confidence: Confidence };
type Run = { clock: Clock; deadline: number; calls: number };

const TIMEOUT = Symbol('timeout');

/** One LLM function call: retried once (blueprint §6), never past the budget, never throws. */
async function callLlm<T>(run: Run, schema: z.ZodType<T>, call: (timeoutMs: number) => Promise<unknown>): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const timeoutMs = run.deadline - run.clock.now();
    if (run.calls >= BUDGET.maxCalls || !(timeoutMs > 0)) return null;
    run.calls++;
    const timer = run.clock.after(timeoutMs);
    try {
      const out = await Promise.race([
        Promise.resolve().then(() => call(timeoutMs)),
        timer.promise.then(() => TIMEOUT, () => TIMEOUT),
      ]);
      if (out === TIMEOUT || run.clock.now() > run.deadline) return null;
      const r = schema.safeParse(out);
      if (r.success) return r.data;
    } catch {
      // a failing port degrades to the deterministic result
    } finally {
      timer.cancel();
    }
  }
  return null;
}

/** The slot's value in the user's words: the card's pattern if it has one, else the first option mentioned. */
function slotFromText(slot: Slot, text: string): string | null {
  if (slot.pattern !== undefined) {
    const m = new RegExp(slot.pattern, 'iu').exec(text);
    return (m?.[1] ?? m?.[0])?.trim() || null;
  }
  const hay = normalize(text);
  let best: { option: string; at: number } | null = null;
  for (const option of slot.options) {
    const at = findWord(hay, normalize(option));
    if (at !== -1 && (!best || at < best.at)) best = { option, at };
  }
  return best?.option ?? null;
}

const cardDefault = (slot: Slot): FrameSlot =>
  ({ id: slot.id, value: slot.default ?? null, source: 'default', confidence: slot.default === undefined ? 'low' : 'med' });

type Learned = { counts: readonly CountRow[]; key: string; now: string } | null;

/** The frame forge can build alone: answers, then the user's words, then L1 counts, then the card default. */
function heuristicFrame(text: string, card: Card, answers: Record<string, string>, language: Language, target: IntentFrame['target'], learned: Learned): IntentFrame {
  return {
    family: card.family,
    target,
    goal: text,
    deliverable: '',
    successCriteria: [],
    slots: card.slots.map((slot): FrameSlot => {
      const answer = answers[slot.id]?.trim();
      if (answer) return { id: slot.id, value: answer, source: 'said', confidence: 'high' };   // chosen on a chip: stated by the user
      const said = slotFromText(slot, text);
      if (said !== null) return isGrounded(said, text) ? { id: slot.id, value: said, source: 'said', confidence: 'high' } : { id: slot.id, value: said, source: 'inferred', confidence: 'low' };
      const counted = learned && countDefault(learned.counts, slot, learned.key, learned.now);
      if (counted) return { id: slot.id, value: counted.value, source: 'count', confidence: counted.p > L1.impact3Cap ? 'high' : 'med' };
      return cardDefault(slot);
    }),
    coveredForYou: [],
    unsure: [],
    language,
    risk: 'none',
  };
}

/**
 * `understand`'s frame on top of the heuristic one. A slot value is `said` only
 * when grounded in the user's words; an ungrounded value is `inferred`, and if
 * the model claimed it was said, its confidence is not trusted (low). Answers,
 * grounded words and count-backed values are never replaced by a guess.
 */
function mergeFrame(h: IntentFrame, u: IntentFrame, text: string): IntentFrame {
  const fromLlm = new Map(u.slots.filter((s) => s.value !== null && s.value.trim() !== '').map((s) => [s.id, s]));
  const language: Language = { ...h.language };
  for (const [k, v] of Object.entries(u.language)) if (v !== undefined) Object.assign(language, { [k]: v });
  return {
    ...h,
    goal: u.goal.trim() || h.goal,
    deliverable: u.deliverable.trim(),
    successCriteria: u.successCriteria.map((c) => c.trim()).filter(Boolean),
    coveredForYou: u.coveredForYou,
    unsure: u.unsure,
    language,
    risk: u.risk,
    slots: h.slots.map((s): FrameSlot => {
      const v = fromLlm.get(s.id);
      if (!v || s.source === 'said') return s;
      const value = v.value!.trim();
      if (isGrounded(value, text)) return { id: s.id, value, source: 'said', confidence: v.confidence };
      if (s.source !== 'default' && s.source !== 'inferred') return s;
      return { id: s.id, value, source: 'inferred', confidence: v.source === 'said' ? 'low' : v.confidence };
    }),
  };
}

type Draft = Record<string, unknown>;
const scalar = (v: string) => (/^-?\d+(?:\.\d+)?$/.test(v) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v);
/** Put a slot value at its Brief IR path (card SlotSchema `to`). */
function withSlot(b: Draft, to: string, value: string): Draft {
  const dot = to.indexOf('.');
  if (dot === -1) return { ...b, [to]: value };
  const head = to.slice(0, dot);
  const v = head === 'style' ? [value] : head === 'params' ? scalar(value) : value;
  return { ...b, [head]: { ...(b[head] as object | undefined), [to.slice(dot + 1)]: v } };
}

type Composed = {
  slots: SlotState[]; picks: Set<string>; brief: Brief | null; result: RenderResult;
  insert: string; unsourced: string[]; problems: string[];
};
type ComposeContext = { subject?: string; memories: readonly Memory[]; sources: readonly string[] };

const WHY: Partial<Record<SlotSource, string>> = { count: 'usual choice' };

/**
 * The pick rule (blueprint §6): an impact-3 slot with low confidence that no
 * count or memory backs, at most MAX_PICKS per draft. Slots with no value go first,
 * since they have nothing to show as an assumption.
 */
function pickRule(slots: SlotState[]): Set<string> {
  const candidates = slots.filter((s) => s.slot.impact === 3 && s.confidence === 'low' && s.source !== 'said' && s.source !== 'count' && s.source !== 'memory');
  candidates.sort((a, b) => Number(a.value !== null) - Number(b.value !== null));
  return new Set(candidates.slice(0, MAX_PICKS).map((s) => s.slot.id));
}

/** Brief IR from the frame, rendered through the card, then the checks: limits and unsourced specifics. */
function compose(frame: IntentFrame, card: Card, ctx: ComposeContext): Composed {
  const deliverable = frame.deliverable && frame.deliverable !== frame.goal ? { description: frame.deliverable } : {};
  let draft: Draft = {
    ir_version: '0.1',
    intent: { mode: 'do', task_family: card.family, deliverable: { kind: card.accepts[0], ...deliverable } },
    goal: frame.goal,
    locale: frame.language.replyLanguage ?? frame.language.spoken[0] ?? 'en',
  };
  if (ctx.subject !== undefined) draft.subject = ctx.subject;
  const context = ctx.memories.map((m) => m.text.trim()).filter(Boolean);
  if (context.length) draft.context = context;
  if (frame.successCriteria.length) draft.success_criteria = frame.successCriteria;
  if (frame.language.targetLanguage) draft.output = { language: frame.language.targetLanguage };
  const slots: SlotState[] = [];
  for (const slot of card.slots) {
    const fs = frame.slots.find((s) => s.id === slot.id) ?? cardDefault(slot);
    const fallback = cardDefault(slot);
    let state: SlotState = { slot, ...fs };
    // a value the Brief IR rejects falls back to the card default, else to unfilled
    for (const candidate of [state, { slot, ...fallback }]) {
      state = candidate;
      if (candidate.value === null) break;
      const next = withSlot(draft, slot.to, candidate.value);
      if (BriefSchema.safeParse(next).success) { draft = next; break; }
      state = { ...candidate, value: null, confidence: 'low' };
    }
    slots.push(state);
  }
  const picks = pickRule(slots);
  const assumed = slots.filter((s) => s.value !== null && s.source !== 'said');
  draft.assumptions = assumed.map((s) => ({ id: s.slot.id, text: `${s.slot.label}: ${s.value}`, why: WHY[s.source] ?? s.source }));
  const parsed = BriefSchema.safeParse(draft);
  const brief = parsed.success ? parsed.data : null;
  const result = render(draft, card);
  const field = result.fields[insertField(card).name];
  const unsourced = brief ? findUnsourced(brief, [...ctx.sources, ...assumed.map((s) => s.value!)]) : [];
  const problems = [
    ...result.issues.filter((i) => i.code === 'over_limit').map((i) => i.message),
    ...unsourced.map((u) => `"${u}" is not in the user's words; remove it or use only what they said`),
  ];
  return { slots, picks, brief, result, insert: typeof field === 'string' ? field : '', unsourced, problems };
}

function chips(c: Composed): Assumption[] {
  return c.slots.flatMap((s) => (s.source === 'said' ? [] : [{
    slotId: s.slot.id,
    label: s.slot.label,
    value: s.value ?? '',
    source: s.source,
    kind: c.picks.has(s.slot.id) ? 'pick' as const : 'assumption' as const,
    options: s.slot.options,
  }]));
}

/** Every insertable (labelled) field, in card order; empty when the primary field is the only one. */
function fieldsOf(card: Card, result: RenderResult): NonNullable<ForgeResponse['fields']> {
  const out = card.fields.flatMap((f) => {
    const v = result.fields[f.name];
    if (f.label === undefined || v === undefined) return [];
    return [{ id: f.name, label: f.label, text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }];
  });
  return out.length > 1 ? out : [];
}

/** Renderer codes that mean the output itself is broken: nothing should be inserted. */
const BROKEN = new Set(['brief_invalid', 'template_error', 'template_artifact', 'field_empty', 'schema_violation', 'vendor_schema_invalid']);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function issuesOf(card: Card, result: RenderResult): NonNullable<ForgeResponse['issues']> {
  const out = result.issues
    // forge fills /assumptions with the chips themselves; that a card does not send them is never news
    .filter((i) => !(i.code === 'not_applicable' && i.path === '/assumptions'))
    .map((i) => ({ code: clip(i.code, 64), message: clip(i.message, 500), severity: i.level === 'info' ? 'info' as const : BROKEN.has(i.code) ? 'block' as const : 'warn' as const }));
  if (!card.tos.insert_allowed) out.push({ code: 'insert_not_allowed', message: clip(`${card.display_name}'s terms do not allow pasting into it; copy the text instead`, 500), severity: 'warn' });
  return out;
}

/** The card's checklist: its slots plus its `requires`. A pick still awaiting the user is missing. */
function coverage(card: Card, c: Composed): ForgeResponse['coverage'] {
  const unmet = new Set(c.brief ? c.result.issues.filter((i) => i.code === 'needs_llm').map((i) => i.path) : card.requires.map((r) => r.any_of.join(' | ')));
  const items = [
    ...c.slots.map((s) => ({
      id: s.slot.id, label: s.slot.label,
      by: s.source === 'said' || s.source === 'captured' ? 'said' as const : s.value === null || c.picks.has(s.slot.id) ? 'missing' as const : 'assumed' as const,
    })),
    ...card.requires.map((r) => ({ id: r.id, label: r.label, by: unmet.has(r.any_of.join(' | ')) ? 'missing' as const : 'said' as const })),
  ];
  return { covered: items.filter((i) => i.by !== 'missing').length, total: items.length, items };
}

/** Destination rule (blueprint §10): text a person reads is shaped only by style and preference memories. */
const RECIPIENT_SAFE = new Set(['style', 'preference']);
function memoriesFor(card: Card, memories: readonly Memory[]): Memory[] {
  return memories.filter((m) => m.text.trim() !== '' && (card.audience === 'private_ai' ? m.kind !== 'vocabulary' : RECIPIENT_SAFE.has(m.kind)));
}

export async function forge(req: ForgeRequestParsed, deps: ForgeDeps): Promise<ForgeResponse> {
  const generic = deps.cards.find((c) => c.id === GENERIC_CARD_ID);
  if (!generic) throw new Error(`forge: deps.cards needs the "${GENERIC_CARD_ID}" card (catalog/families/generic.yaml)`);
  if ((deps.counts?.length || deps.toolUsage?.length) && (deps.now === undefined || Number.isNaN(isoMs(deps.now)))) {
    throw new Error('forge: deps.now (an ISO 8601 time) is required with counts or toolUsage');
  }
  const { clock, llm } = deps;
  const started = clock.now();
  const run: Run = { clock, deadline: started + BUDGET.maxMs, calls: 0 };

  const language: Language = req.language ?? { spoken: [req.locale] };
  const locale = req.language?.spoken[0] ?? req.locale;
  const text = cleanTranscript(req.text, locale, lookupPack(deps.locales, locale)) || req.text.trim();

  // the tool: the client's hint, a name in the words, the host app, then frecency, else generic
  const byId = (id: string | null | undefined) => (id ? deps.cards.find((c) => c.id === id) : undefined);
  const hinted = byId(req.toolHint);
  const named = hinted ? undefined : byId(resolveTool(text, undefined, deps.cards));
  const hosted = hinted ?? named ? undefined : byId(resolveTool('', req.hostApp, deps.cards));
  let predicted: Card | undefined;
  if (!hinted && !named && !hosted && deps.toolUsage?.length) {
    const known = new Set(deps.cards.filter((c) => c.id !== GENERIC_CARD_ID).map((c) => c.id));
    const f = frecencyTool(deps.toolUsage.filter((r) => known.has(r.toolId)), { hostApp: req.hostApp ?? null, surface: req.surface, now: deps.now! });
    if (f && f.p > SHOW_GATE.prefill) predicted = byId(f.toolId);
  }
  const card = hinted ?? named ?? hosted ?? predicted ?? generic;
  const target: IntentFrame['target'] = {
    toolId: card === generic ? null : card.id,
    source: hinted || hosted ? 'context' : named ? 'named' : predicted ? 'predicted' : 'none',
  };

  const memories = memoriesFor(card, deps.memories ?? []);
  const sources = [req.text, text, ...Object.values(req.answers), ...memories.map((m) => m.text)];
  const learned: Learned = deps.counts?.length ? { counts: deps.counts, key: contextKey({ toolId: card.id, hostApp: req.hostApp }), now: deps.now! } : null;

  let frame = heuristicFrame(text, card, req.answers, language, target, learned);
  if (llm) {
    const u = await callLlm(run, intentFrameSchema, (timeoutMs) => llm.understand({
      text, locale, language,
      tool: { id: card.id, name: card.display_name, family: card.family, audience: card.audience },
      slots: card.slots.map((s) => ({ id: s.id, label: s.label, options: s.options })),
      memories,
    }, { timeoutMs }));
    if (u) frame = mergeFrame(frame, u, text);
  }
  const base = { toolId: card.id, toolName: card.display_name, cardVersion: card.version };
  const usage = () => ({ llmCalls: run.calls, ms: Math.max(0, clock.now() - started) });

  // a refusal is terminal (blueprint §6): no draft, no repair
  if (frame.risk === 'refuse') {
    return {
      ...base, brief: '', fields: [], assumptions: [], unsourced: [],
      issues: [{ code: 'refused', message: 'PromptAI will not draft this request.', severity: 'block' }],
      coverage: { covered: 0, total: 0, items: [] },
      usage: usage(),
    };
  }

  const ctx: ComposeContext = { memories, sources };
  let out = compose(frame, card, ctx);
  if (llm && out.problems.length > 0) {
    const before = out;
    const replyLanguage = frame.language.replyLanguage ?? frame.language.spoken[0] ?? locale;
    const fix = await callLlm(run, repairSchema, (timeoutMs) => llm.repair({
      goal: frame.goal, brief: before.insert, problems: before.problems, replyLanguage,
    }, { timeoutMs }));
    if (fix) {
      const repaired = compose({ ...frame, goal: fix.goal }, card, { ...ctx, ...(fix.subject !== undefined && { subject: fix.subject }) });
      if (repaired.brief && repaired.problems.length < before.problems.length) out = repaired;
    }
  }

  return {
    ...base,
    brief: out.insert,
    fields: fieldsOf(card, out.result),
    assumptions: chips(out),
    unsourced: out.unsourced,
    issues: issuesOf(card, out.result),
    coverage: coverage(card, out),
    usage: usage(),
  };
}
