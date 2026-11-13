/**
 * What forge learns from (blueprint §8 L1 counts, §9 frecency, §10 memory):
 * the per-user context loaded before a draft, the decision row written after
 * it, and the outcome events that update both.
 */
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { contextKey, weightFor } from '@promptai/core';
import { decisions, memoryItems, slotCounts, toolUsage, uuidv7, type Db, type DecisionContext } from '@promptai/db';
import type { ForgeRequestParsed, ForgeResponseParsed, MemoryItem } from '@promptai/contract';
import type { Caller } from './auth.ts';
import { granted, latestConsents, personalizes } from './consent.ts';
import type { StoredEvent } from './event-store.ts';

/** One L1 signal: core folds these into per-slot Dirichlet counts with decay. */
type CountRow = { slotId: string; value: string; contextKey: string; weight: number; at: string };
type ForgeMemory = { id: string; kind: MemoryItem['kind']; text: string };
type ToolUsageRow = { toolId: string; hostApp: string | null; surface: DecisionContext['surface']; at: string };
/** The second argument to `deps.forge`. */
export type ForgeContext = {
  counts: CountRow[];
  memories: ForgeMemory[];
  toolUsage: ToolUsageRow[];
  /** The caller said Yes to AI processing (consent ledger, `llm_processing`); skipping is No. */
  allowModel: boolean;
};

/** The decision policy behind today's drafts: core's deterministic rules. Bump it when the pick rule changes. */
const POLICY_VERSION = 'p1-rules';

/**
 * The L1 context (blueprint §8: tool × host). Provisional until core exports
 * its own key: rows for every tool are passed, so the key carries the tool.
 */

/** About six half-lives of the 30-day count decay, and of the 14-day frecency τ. */
const COUNT_DAYS = 180;
const USAGE_DAYS = 90;
const COUNT_LIMIT = 2_000;
const USAGE_LIMIT = 500;
const MEMORY_LIMIT = 200;
const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pidOf(caller: Caller): string {
  if (!caller.pid) throw new Error('profile is erased');
  return caller.pid;
}

/**
 * The caller's counts, active memories and tool usage. Empty for guests and
 * while "Personalize for me" is paused. Memories are the ones core may use
 * without more context: normal sensitivity (sensitive items need request tags
 * that don't exist yet) and global or scoped to the hinted tool.
 */
export async function loadForgeContext(db: Db, caller: Caller, req: ForgeRequestParsed, now: Date): Promise<ForgeContext> {
  const consents = await latestConsents(db, caller.id);
  const allowModel = granted(consents, 'llm_processing');
  if (req.incognito || caller.kind !== 'account' || !granted(consents, 'personalize')) return { counts: [], memories: [], toolUsage: [], allowModel };
  const pid = pidOf(caller);
  const scoped = req.toolHint ? or(eq(memoryItems.scope, 'global'), and(eq(memoryItems.scope, 'tool'), eq(memoryItems.scopeRef, req.toolHint))) : eq(memoryItems.scope, 'global');
  const [counts, memories, usage] = await Promise.all([
    db
      .select({ slotId: slotCounts.slotId, value: slotCounts.value, contextKey: slotCounts.contextKey, weight: slotCounts.weight, at: slotCounts.at })
      .from(slotCounts)
      .where(and(eq(slotCounts.pid, pid), gte(slotCounts.at, new Date(now.getTime() - COUNT_DAYS * DAY_MS))))
      .orderBy(desc(slotCounts.at))
      .limit(COUNT_LIMIT),
    db
      .select({ id: memoryItems.id, kind: memoryItems.kind, text: memoryItems.text })
      .from(memoryItems)
      .where(and(eq(memoryItems.userId, caller.id), isNull(memoryItems.deletedAt), eq(memoryItems.status, 'active'), eq(memoryItems.sensitivity, 'normal'), scoped))
      .orderBy(desc(memoryItems.updatedAt))
      .limit(MEMORY_LIMIT),
    db
      .select({ toolId: toolUsage.toolId, hostApp: toolUsage.hostApp, surface: toolUsage.surface, at: toolUsage.at })
      .from(toolUsage)
      .where(and(eq(toolUsage.pid, pid), gte(toolUsage.at, new Date(now.getTime() - USAGE_DAYS * DAY_MS))))
      .orderBy(desc(toolUsage.at))
      .limit(USAGE_LIMIT),
  ]);
  return {
    allowModel,
    counts: counts.map((r) => ({ ...r, at: r.at.toISOString() })),
    memories: memories.flatMap((m) => (m.text === null ? [] : [{ id: m.id, kind: m.kind, text: m.text }])),
    toolUsage: usage.map((r) => ({ ...r, at: r.at.toISOString() })),
  };
}

/** Writes the draft's decision row and returns its id (the response's `decisionId`). */
export async function recordDecision(db: Db, caller: Caller, req: ForgeRequestParsed, res: ForgeResponseParsed): Promise<string> {
  const id = uuidv7();
  await db.insert(decisions).values({
    id,
    pid: pidOf(caller),
    point: 'forge.draft',
    sessionId: req.sessionId ?? null,
    context: { toolId: res.toolId, hostApp: req.hostApp ?? null, surface: req.surface, locale: req.language?.spoken[0] ?? req.locale, cardVersion: res.cardVersion ?? null, incognito: req.incognito },
    shown: res.assumptions.map((a) => ({ slotId: a.slotId, value: a.value, source: a.source, kind: a.kind, options: a.options })),
    policyVersion: POLICY_VERSION,
  });
  return id;
}

const OUTCOME_TYPES = new Set(['brief.inserted', 'brief.copied', 'brief.dismissed', 'chip.flipped', 'outcome.rated']);

/**
 * Applies outcome events that name one of the caller's decisions:
 * - `brief.inserted|copied|dismissed` set the outcome (the latest wins); an
 *   insert or copy adds a frecency row;
 * - `chip.flipped` {slotId, value} records the flip in `chosen` and adds a
 *   slot-count row of weight 1.0, if the value was one of the chip's options;
 * - `outcome.rated` {rating} sets the rating.
 * Every write is idempotent (rows keyed by event id, updates guarded by time),
 * so a retried batch converges and needs no transaction. An event naming
 * someone else's or an unknown decision is stored but changes nothing.
 */
export async function applyOutcomes(db: Db, caller: Caller, events: readonly StoredEvent[], now: Date): Promise<void> {
  const linked = events.flatMap((e) => {
    const id = e.props.decisionId;
    return OUTCOME_TYPES.has(e.type) && typeof id === 'string' && UUID.test(id) ? [{ e, decisionId: id.toLowerCase() }] : [];
  });
  if (linked.length === 0) return;
  const pid = pidOf(caller);
  const rows = await db
    .select()
    .from(decisions)
    .where(and(inArray(decisions.id, [...new Set(linked.map((l) => l.decisionId))]), eq(decisions.pid, pid)));
  if (rows.length === 0) return;
  const byId = new Map(rows.map((d) => [d.id, d]));
  const learn = await personalizes(db, caller);

  for (const { e, decisionId } of linked) {
    const d = byId.get(decisionId);
    if (!d) continue;
    // Client clocks are not trusted past the draft's creation and the present.
    const at = new Date(Math.min(now.getTime(), Math.max(d.createdAt.getTime(), Date.parse(e.at))));
    const { toolId, hostApp, surface } = d.context;
    // An incognito draft keeps its decision row (Report needs the id) but teaches nothing.
    const learnHere = learn && d.context.incognito !== true;

    if (e.type === 'chip.flipped') {
      const { slotId, value } = e.props;
      if (typeof slotId !== 'string' || typeof value !== 'string' || !d.shown.some((s) => s.slotId === slotId && s.options.includes(value))) continue;
      if (learnHere) {
        await db
          .insert(slotCounts)
          .values({ pid, toolId, slotId, value, contextKey: contextKey({ toolId, hostApp }), weight: weightFor('flip'), at, decisionId, eventId: e.id })
          .onConflictDoNothing({ target: slotCounts.eventId });
      }
      await db
        .update(decisions)
        .set({ chosen: sql`${decisions.chosen} || jsonb_build_object(${slotId}::text, jsonb_build_object('value', ${value}::text, 'at', ${at.toISOString()}::text))` })
        .where(and(eq(decisions.id, decisionId), sql`coalesce((${decisions.chosen} -> ${slotId}::text ->> 'at')::timestamptz <= ${at.toISOString()}::timestamptz, true)`));
    } else if (e.type === 'outcome.rated') {
      const rating = e.props.rating;
      if (typeof rating !== 'string' && typeof rating !== 'number' && typeof rating !== 'boolean') continue;
      await db
        .update(decisions)
        .set({ rating: String(rating).slice(0, 32), ratedAt: at })
        .where(and(eq(decisions.id, decisionId), or(isNull(decisions.ratedAt), lte(decisions.ratedAt, at))));
    } else {
      const outcome = e.type.slice('brief.'.length) as 'inserted' | 'copied' | 'dismissed';
      await db
        .update(decisions)
        .set({ outcome, outcomeAt: at })
        .where(and(eq(decisions.id, decisionId), or(isNull(decisions.outcomeAt), lte(decisions.outcomeAt, at))));
      if (learnHere && outcome !== 'dismissed') {
        await db.insert(toolUsage).values({ pid, toolId, hostApp, surface, at, eventId: e.id }).onConflictDoNothing({ target: toolUsage.eventId });
      }
    }
  }
}
