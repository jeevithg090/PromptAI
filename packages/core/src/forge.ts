/**
 * forge(): one request in, one brief out (blueprint §4 "A forge request", §6, §11).
 * A plain async function under a Budget whose only loop is one repair. It works
 * with no LLM: the port only improves the frame and repairs failed checks, and
 * a port that throws, stalls or returns garbage degrades to the deterministic result.
 */
import { z } from 'zod';
import type { Assumption, ForgeRequestParsed, ForgeResponse, SlotSource } from '@promptai/contract';
import { BriefSchema, type Brief } from './compose/ir.ts';
import { insertField, type Card, type Slot } from './compose/card.ts';
import { render, type RenderResult } from './compose/render.ts';
import { cleanTranscript } from './clean.ts';
import { findUnsourced, groundSlot } from './ground.ts';
import { GENERIC_CARD_ID, resolveTool } from './resolve.ts';
import { findWord, normalize } from './text.ts';

/** Blueprint §11: at most 4 LLM calls and 20 s per forge. */
export const BUDGET = { maxCalls: 4, maxMs: 20_000 } as const;

export type Clock = {
  /** milliseconds from any fixed origin */
  now(): number;
  /** a timer forge races each LLM call against; cancel() releases it */
  after(ms: number): { promise: Promise<void>; cancel(): void };
};

export type UnderstandInput = {
  text: string;
  locale: string;
  tool: { id: string; name: string; family: string };
  slots: Array<{ id: string; label: string; options: string[] }>;
};
export type RepairInput = { goal: string; subject?: string; brief: string; problems: string[] };
/**
 * Each call gets the time left in the budget. Resolve with JSON-like data
 * (validated here); rejecting, stalling or returning anything else is allowed.
 */
export type LlmPort = {
  understand(input: UnderstandInput, opts: { timeoutMs: number }): Promise<unknown>;
  repair(input: RepairInput, opts: { timeoutMs: number }): Promise<unknown>;
};
export type ForgeDeps = { cards: readonly Card[]; llm?: LlmPort; clock: Clock };

const understandSchema = z.object({
  goal: z.string().trim().min(1).max(4_000).optional(),
  subject: z.string().trim().min(1).max(2_000).optional(),
  slots: z.array(z.object({ id: z.string(), value: z.string().trim().min(1).max(500) })).max(50).optional(),
});
const repairSchema = z.object({
  goal: z.string().trim().min(1).max(4_000),
  subject: z.string().trim().min(1).max(2_000).optional(),
});

/** 'answer' = chosen on a chip in an earlier round; stated by the user, so not a chip again. */
type SlotState = { slot: Slot; value: string | null; source: SlotSource | 'answer' };
type Frame = { goal: string; subject?: string; slots: SlotState[] };
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

const isPick = (slot: Slot) => slot.impact === 3 && slot.default === undefined;

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

function heuristicFrame(text: string, card: Card, answers: Record<string, string>): Frame {
  return {
    goal: text,
    slots: card.slots.map((slot): SlotState => {
      const answer = answers[slot.id]?.trim();
      if (answer) return { slot, value: answer, source: 'answer' };
      const said = slotFromText(slot, text);
      if (said !== null) return groundSlot({ slot, value: said, source: 'said' as SlotSource }, text);
      return { slot, value: slot.default ?? null, source: 'default' };
    }),
  };
}

function applyUnderstand(frame: Frame, u: z.output<typeof understandSchema>, text: string): Frame {
  const values = new Map((u.slots ?? []).map((s) => [s.id, s.value]));
  return {
    goal: u.goal ?? frame.goal,
    subject: u.subject ?? frame.subject,
    slots: frame.slots.map((s) => {
      const value = values.get(s.slot.id);
      if (value === undefined || s.source === 'answer' || s.source === 'said') return s;
      return groundSlot({ ...s, value, source: 'said' as SlotSource }, text);
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

type Composed = { slots: SlotState[]; brief: Brief | null; result: RenderResult; insert: string; unsourced: string[]; problems: string[] };

/** Brief IR from the frame, rendered through the card, then the checks: limits and unsourced specifics. */
function compose(frame: Frame, card: Card, locale: string, sources: string[]): Composed {
  let draft: Draft = {
    ir_version: '0.1',
    intent: { mode: 'do', task_family: card.family, deliverable: { kind: card.accepts[0] } },
    goal: frame.goal,
    locale,
  };
  if (frame.subject !== undefined) draft.subject = frame.subject;
  const slots: SlotState[] = [];
  for (const s of frame.slots) {
    let state = s;
    // a value the Brief IR rejects falls back to the card default, else to unfilled
    for (const candidate of [s, { slot: s.slot, value: s.slot.default ?? null, source: 'default' as const }]) {
      state = candidate;
      if (candidate.value === null) break;
      const next = withSlot(draft, s.slot.to, candidate.value);
      if (BriefSchema.safeParse(next).success) { draft = next; break; }
      state = { ...candidate, value: null };
    }
    slots.push(state);
  }
  const assumed = slots.filter((s) => s.value !== null && (s.source === 'default' || s.source === 'inferred'));
  draft.assumptions = assumed.map((s) => ({ id: s.slot.id, text: `${s.slot.label}: ${s.value}`, why: s.source }));
  const parsed = BriefSchema.safeParse(draft);
  const brief = parsed.success ? parsed.data : null;
  const result = render(draft, card);
  const field = result.fields[insertField(card).name];
  const unsourced = brief ? findUnsourced(brief, [...sources, ...assumed.map((s) => s.value!)]) : [];
  const problems = [
    ...result.issues.filter((i) => i.code === 'over_limit').map((i) => i.message),
    ...unsourced.map((u) => `"${u}" is not in the user's words; remove it or use only what they said`),
  ];
  return { slots, brief, result, insert: typeof field === 'string' ? field : '', unsourced, problems };
}

function chips(slots: SlotState[]): Assumption[] {
  return slots.flatMap((s) => (s.source === 'said' || s.source === 'answer' ? [] : [{
    slotId: s.slot.id,
    label: s.slot.label,
    value: s.value ?? '',
    source: s.source,
    kind: isPick(s.slot) ? 'pick' as const : 'assumption' as const,
    options: s.slot.options,
  }]));
}

/** The card's checklist: its slots plus its `requires`. A pick still awaiting the user is not covered. */
function coverage(card: Card, c: Composed): ForgeResponse['coverage'] {
  const filled = c.slots.filter((s) => s.value !== null && (s.source === 'said' || s.source === 'answer' || !isPick(s.slot))).length;
  const unmet = c.brief ? c.result.issues.filter((i) => i.code === 'needs_llm').length : card.requires.length;
  return { covered: filled + card.requires.length - unmet, total: card.slots.length + card.requires.length };
}

export async function forge(req: ForgeRequestParsed, deps: ForgeDeps): Promise<ForgeResponse> {
  const generic = deps.cards.find((c) => c.id === GENERIC_CARD_ID);
  if (!generic) throw new Error(`forge: deps.cards needs the "${GENERIC_CARD_ID}" card (catalog/families/generic.yaml)`);
  const { clock, llm } = deps;
  const started = clock.now();
  const run: Run = { clock, deadline: started + BUDGET.maxMs, calls: 0 };

  const text = cleanTranscript(req.text, req.locale) || req.text.trim();
  const byId = (id: string | null | undefined) => deps.cards.find((c) => c.id === id);
  const card = byId(req.toolHint) ?? byId(resolveTool(text, req.hostApp, deps.cards)) ?? generic;
  const sources = [req.text, text, ...Object.values(req.answers)];

  let frame = heuristicFrame(text, card, req.answers);
  if (llm) {
    const u = await callLlm(run, understandSchema, (timeoutMs) => llm.understand({
      text, locale: req.locale,
      tool: { id: card.id, name: card.display_name, family: card.family },
      slots: card.slots.map((s) => ({ id: s.id, label: s.label, options: s.options })),
    }, { timeoutMs }));
    if (u) frame = applyUnderstand(frame, u, text);
  }
  let out = compose(frame, card, req.locale, sources);

  if (llm && out.problems.length > 0) {
    const before = out;
    const fix = await callLlm(run, repairSchema, (timeoutMs) => llm.repair({
      goal: frame.goal, ...(frame.subject !== undefined && { subject: frame.subject }), brief: before.insert, problems: before.problems,
    }, { timeoutMs }));
    if (fix) {
      const repaired = compose({ ...frame, goal: fix.goal, subject: fix.subject ?? frame.subject }, card, req.locale, sources);
      if (repaired.brief && repaired.problems.length < before.problems.length) out = repaired;
    }
  }

  return {
    toolId: card.id,
    toolName: card.display_name,
    brief: out.insert,
    assumptions: chips(out.slots),
    unsourced: out.unsourced,
    coverage: coverage(card, out),
    usage: { llmCalls: run.calls, ms: Math.max(0, clock.now() - started) },
  };
}
