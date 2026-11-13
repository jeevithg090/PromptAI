/**
 * Daily meters and quotas (blueprint §6, §11, B6). Days are UTC. A forge
 * reserves its unit atomically before it runs, so concurrent requests cannot
 * overshoot the quota, and a forge that fails gives the unit back.
 */
import { and, eq, sql } from 'drizzle-orm';
import { usageCounters, type Db } from '@promptai/db';
import type { Quota } from './auth.ts';

type Metric = (typeof usageCounters.$inferSelect)['metric'];

export const utcDay = (now: Date) => now.toISOString().slice(0, 10);
export const nextUtcMidnight = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

const key = (userId: string, day: string, metric: Metric) =>
  and(eq(usageCounters.userId, userId), eq(usageCounters.day, day), eq(usageCounters.metric, metric));

export async function usageToday(db: Db, userId: string, day: string): Promise<Record<Metric, number>> {
  const rows = await db
    .select({ metric: usageCounters.metric, value: usageCounters.value })
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.day, day)));
  const used = { forges: 0, dictation_seconds: 0, cost_microusd: 0 };
  for (const r of rows) used[r.metric] = r.value;
  return used;
}

/** Counts one forge if the caller is under `limit` (null: no limit). False at the quota. */
export async function reserveForge(db: Db, userId: string, day: string, limit: number | null): Promise<boolean> {
  if (limit !== null && limit <= 0) return false;
  const rows = await db
    .insert(usageCounters)
    .values({ userId, day, metric: 'forges', value: 1 })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.day, usageCounters.metric],
      set: { value: sql`${usageCounters.value} + 1` },
      setWhere: limit === null ? undefined : sql`${usageCounters.value} < ${limit}`,
    })
    .returning({ value: usageCounters.value });
  return rows.length > 0;
}

export async function refundForge(db: Db, userId: string, day: string): Promise<void> {
  await db
    .update(usageCounters)
    .set({ value: sql`greatest(${usageCounters.value} - 1, 0)` })
    .where(key(userId, day, 'forges'));
}

export async function addUsage(db: Db, userId: string, day: string, metric: Metric, amount: number): Promise<void> {
  if (!(amount > 0)) return;
  await db
    .insert(usageCounters)
    .values({ userId, day, metric, value: amount })
    .onConflictDoUpdate({ target: [usageCounters.userId, usageCounters.day, usageCounters.metric], set: { value: sql`${usageCounters.value} + ${amount}` } });
}

/** What the caller has left today; null where there is no limit. */
export function remaining(quota: Quota, used: Record<Metric, number>) {
  return {
    forges: quota.forgesPerDay === null ? null : Math.max(0, quota.forgesPerDay - used.forges),
    dictationMinutes: quota.dictationMinutesPerDay === null ? null : Math.max(0, Math.floor(quota.dictationMinutesPerDay - used.dictation_seconds / 60)),
  };
}
