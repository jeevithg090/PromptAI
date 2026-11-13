/**
 * L1 context counts (blueprint §8 "Learners"): a Dirichlet per (slot, context)
 * that backs off to the context-free count. Pure: the server stores the rows
 * and passes them in; nothing here is trained.
 */
import { ageDays } from './time.ts';

/** One weighted observation of a slot value, as the server stores it. */
export type CountRow = { slotId: string; value: string; contextKey: string; weight: number; at: string /* ISO */ };

export const L1 = {
  /** prior mass of each Dirichlet */
  pseudoCount: 2,
  halfLifeDays: 30,
  /** personal p is capped on impact-3 slots, so they always show as assumptions */
  impact3Cap: 0.85,
} as const;

/** Show-gate starting thresholds (blueprint §9): a pre-filled default needs p above `prefill`. */
export const SHOW_GATE = { chip: 0.25, prefill: 0.7, card: 0.8 } as const;

/** The context a count is kept under: tool × host app (or project) × recipient class. */
export function contextKey(c: { toolId: string; hostApp?: string | null; recipientClass?: string | null }): string {
  return [c.toolId, c.hostApp, c.recipientClass].map((p) => encodeURIComponent((p ?? '').trim().toLowerCase())).join('|');
}

/**
 * What the server saw happen to a chip. Explicit choices and kept chips the user
 * opened (or whose task went well) count fully; a chip kept without opening counts 0
 * until the catch rate is measured, because learning from silent assumptions self-confirms.
 */
export type CountSignal = 'pick' | 'flip' | 'answer' | 'kept_opened' | 'kept_went_well' | 'kept_unopened';
const WEIGHTS: Record<CountSignal, number> = { pick: 1, flip: 1, answer: 1, kept_opened: 1, kept_went_well: 1, kept_unopened: 0 };
export function weightFor(signal: CountSignal): number {
  return WEIGHTS[signal];
}

export type SlotChoice = { value: string; p: number };

/**
 * The count-backed value for a slot in a context, or null when the counts do not
 * clear the show gate. Candidates are the slot's options and default plus values
 * seen in this exact context (another tool's values never leak in through back-off).
 * Weights decay with a 30-day half-life; p is the posterior mean of the context
 * Dirichlet whose prior is the context-free posterior, whose prior is uniform.
 */
export function countDefault(
  rows: readonly CountRow[],
  slot: { id: string; impact: number; options: readonly string[]; default?: string },
  key: string,
  now: string,
): SlotChoice | null {
  const mine = rows.filter((r) => r.slotId === slot.id && r.weight > 0 && r.value.trim() !== '');
  if (mine.length === 0) return null;
  const candidates = new Set([...slot.options, ...(slot.default === undefined ? [] : [slot.default])]);
  for (const r of mine) if (r.contextKey === key) candidates.add(r.value);
  const free = new Map<string, number>(), ctx = new Map<string, number>();
  let nFree = 0, nCtx = 0;
  for (const r of mine) {
    if (!candidates.has(r.value)) continue;
    const age = ageDays(r.at, now);
    if (Number.isNaN(age)) continue;
    const w = r.weight * 0.5 ** (age / L1.halfLifeDays);
    free.set(r.value, (free.get(r.value) ?? 0) + w); nFree += w;
    if (r.contextKey === key) { ctx.set(r.value, (ctx.get(r.value) ?? 0) + w); nCtx += w; }
  }
  if (nFree === 0) return null;
  const a = L1.pseudoCount, base = 1 / candidates.size;
  let best: SlotChoice | null = null;
  for (const v of [...candidates].sort()) {
    const pFree = ((free.get(v) ?? 0) + a * base) / (nFree + a);
    const p = ((ctx.get(v) ?? 0) + a * pFree) / (nCtx + a);
    if ((free.get(v) ?? 0) > 0 && (!best || p > best.p)) best = { value: v, p };
  }
  if (!best) return null;
  if (slot.impact === 3) best = { ...best, p: Math.min(best.p, L1.impact3Cap) };
  return best.p > SHOW_GATE.prefill ? best : null;
}
