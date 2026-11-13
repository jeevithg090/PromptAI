/**
 * Prediction from counts (blueprint §9 MVP, §7 Vocabulary). Pure: rows in, ranking out.
 */
import { ageDays } from './time.ts';
import { normalize } from './text.ts';

export type ToolUsageRow = { toolId: string; hostApp: string | null; surface: string; at: string /* ISO */ };
export type ToolPrediction = { toolId: string; p: number; scope: 'context' | 'global' };

/** Frecency time constant: Σ exp(−Δt/τ) with τ ≈ 14 days lets habits change. */
export const FRECENCY_TAU_DAYS = 14;

const sameHost = (a: string | null | undefined, b: string | null | undefined) => normalize(a ?? '') === normalize(b ?? '');

function top(rows: readonly ToolUsageRow[], now: string): { toolId: string; p: number } | null {
  const score = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const age = ageDays(r.at, now);
    if (Number.isNaN(age) || !r.toolId) continue;
    const s = Math.exp(-age / FRECENCY_TAU_DAYS);
    score.set(r.toolId, (score.get(r.toolId) ?? 0) + s);
    total += s;
  }
  let best: { toolId: string; p: number } | null = null;
  for (const [toolId, s] of [...score].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!best || s / total > best.p) best = { toolId, p: s / total };
  }
  return best;
}

/**
 * The user's most frecent tool for this host app and surface, backing off to all
 * their usage when that context has none. `p` is the tool's share of the bucket's
 * frecency, for the show gate.
 */
export function frecencyTool(rows: readonly ToolUsageRow[], ctx: { hostApp?: string | null; surface: string; now: string }): ToolPrediction | null {
  const local = top(rows.filter((r) => sameHost(r.hostApp, ctx.hostApp) && r.surface === ctx.surface), ctx.now);
  if (local) return { ...local, scope: 'context' };
  const global = top(rows, ctx.now);
  return global && { ...global, scope: 'global' };
}

/** A term the dictation engine should be biased toward: a vocabulary memory, a tool term, a corrected word. */
export type VocabularyItem = { text: string; uses: number; lastUsedAt: string /* ISO */; hostApps?: readonly string[] };

export const VOCABULARY_HALF_LIFE_DAYS = 30;

/**
 * Context strings for the dictation engine: the top `k` terms by
 * recency × frequency × app match. A term tied to other apps still ranks, at half weight.
 */
export function rankVocabulary(items: readonly VocabularyItem[], ctx: { hostApp?: string | null; now: string; k: number }): string[] {
  const best = new Map<string, { text: string; score: number }>();
  for (const it of items) {
    const text = it.text.trim();
    const age = ageDays(it.lastUsedAt, ctx.now);
    if (!text || Number.isNaN(age)) continue;
    const recency = 0.5 ** (age / VOCABULARY_HALF_LIFE_DAYS);
    const frequency = 1 + Math.log1p(Math.max(0, it.uses));
    const apps = it.hostApps ?? [];
    const app = apps.length === 0 ? 1 : apps.some((a) => sameHost(a, ctx.hostApp)) ? 2 : 0.5;
    const score = recency * frequency * app;
    const key = normalize(text);
    if ((best.get(key)?.score ?? -1) < score) best.set(key, { text, score });
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))
    .slice(0, Math.max(0, ctx.k))
    .map((x) => x.text);
}
