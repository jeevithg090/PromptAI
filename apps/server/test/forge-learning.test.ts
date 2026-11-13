import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import type { ForgeResponse } from '@promptai/contract';
import { decisions, profiles, slotCounts, toolUsage, usageCounters } from '@promptai/db';
import { DEFAULT_LIMITS, type AppDeps, type Limits } from '../src/app.ts';
import type { ForgeContext } from '../src/learning.ts';
import { okForge } from './helpers.ts';
import { accountToken, world } from './world.ts';

const chip = (slotId: string, value: string, options: string[]) => ({ slotId, label: slotId, value, source: 'default' as const, kind: 'assumption' as const, options });
const drafted: ForgeResponse = {
  ...okForge,
  toolId: 'claude',
  toolName: 'Claude',
  cardVersion: '2026-11-10.1',
  assumptions: [chip('tone', 'clear and direct', ['clear and direct', 'friendly', 'concise']), chip('format', 'markdown', ['markdown', 'bullet list'])],
};
const ev = (type: string, props: Record<string, unknown>, at = new Date().toISOString()) => ({ id: randomUUID(), type, at, props });
/**
 * Event times that are distinct, after the draft was created and not in the
 * future (the server clamps client times into that window). Call it after
 * the forge returns.
 */
async function clock() {
  await new Promise((r) => setTimeout(r, 30));
  const base = Date.now() - 20;
  return (ms: number) => new Date(base + ms).toISOString();
}

async function setup(opts: { forge?: AppDeps['forge']; limits?: Limits } = {}) {
  const forge = vi.fn(opts.forge ?? (async () => drafted));
  const w = await world({ deps: { forge }, limits: opts.limits });
  const user = await w.adultAccount();
  const [row] = await w.orm.select().from(profiles).where(eq(profiles.id, user.id));
  return { w, forge, ...user, pid: row!.pid! };
}

describe('POST /v1/forge', () => {
  it('requires the age gate', async () => {
    const w = await world();
    const token = await accountToken(w.key);
    expect((await w.call('POST', '/v1/forge', token, { text: 'hi' })).body).toEqual({ error: 'age_unconfirmed' });
    await w.call('POST', '/v1/me/age', token, { dob: '2015-01-01' });
    expect((await w.call('POST', '/v1/forge', token, { text: 'hi' })).status).toBe(403);
    await w.call('POST', '/v1/me/age', token, { dob: '1990-01-01' });
    expect((await w.call('POST', '/v1/forge', token, { text: 'hi' })).status).toBe(200);
  });

  it('writes a content-free decision row per draft and returns its id', async () => {
    const { w, token, pid } = await setup();
    const sessionId = randomUUID();
    const res = await w.call('POST', '/v1/forge', token, { text: 'my secret launch plan', hostApp: 'com.anthropic.claudefordesktop', surface: 'desktop', sessionId });
    expect(res.status).toBe(200);
    const [d] = await w.orm.select().from(decisions).where(eq(decisions.id, res.body.decisionId));
    expect(d).toMatchObject({
      pid,
      point: 'forge.draft',
      sessionId,
      context: { toolId: 'claude', hostApp: 'com.anthropic.claudefordesktop', surface: 'desktop', locale: 'en', cardVersion: '2026-11-10.1' },
      shown: [
        { slotId: 'tone', value: 'clear and direct', source: 'default', kind: 'assumption', options: ['clear and direct', 'friendly', 'concise'] },
        { slotId: 'format', value: 'markdown', source: 'default', kind: 'assumption', options: ['markdown', 'bullet list'] },
      ],
      chosen: {},
      outcome: null,
      policyVersion: 'p1-rules',
    });
    expect(JSON.stringify(d)).not.toContain('secret');
  });

  it('passes the caller’s counts, active memories and tool usage to forge', async () => {
    const { w, token, forge } = await setup();
    const first = await w.call('POST', '/v1/forge', token, { text: 'a', hostApp: 'Slack' });
    const decisionId = first.body.decisionId;
    const flippedAt = new Date().toISOString();
    await w.call('POST', '/v1/events', token, { events: [ev('chip.flipped', { decisionId, slotId: 'tone', value: 'friendly' }, flippedAt), ev('brief.inserted', { decisionId }, flippedAt)] });
    const keep = await w.call('POST', '/v1/me/memory', token, { kind: 'rule', scope: 'global', scopeRef: null, sensitivity: 'normal', text: 'no emoji' });
    const scoped = await w.call('POST', '/v1/me/memory', token, { kind: 'preference', scope: 'tool', scopeRef: 'cursor', sensitivity: 'normal', text: 'use pnpm' });
    await w.call('POST', '/v1/me/memory', token, { kind: 'fact', scope: 'global', scopeRef: null, sensitivity: 'sensitive', text: 'a sensitive fact' });
    const archived = await w.call('POST', '/v1/me/memory', token, { kind: 'goal', scope: 'global', scopeRef: null, sensitivity: 'normal', text: 'old goal' });
    await w.call('PATCH', `/v1/me/memory/${archived.body.id}`, token, { status: 'archived' });
    const deleted = await w.call('POST', '/v1/me/memory', token, { kind: 'goal', scope: 'global', scopeRef: null, sensitivity: 'normal', text: 'forgotten' });
    await w.call('DELETE', `/v1/me/memory/${deleted.body.id}`, token);

    await w.call('POST', '/v1/forge', token, { text: 'b' });
    const ctx = forge.mock.calls.at(-1)![1] as ForgeContext;
    expect(ctx).toEqual({
      counts: [{ slotId: 'tone', value: 'friendly', contextKey: 'claude|Slack', weight: 1, at: flippedAt }],
      memories: [{ id: keep.body.id, kind: 'rule', text: 'no emoji' }],
      toolUsage: [{ toolId: 'claude', hostApp: 'Slack', surface: 'web', at: flippedAt }],
    });
    await w.call('POST', '/v1/forge', token, { text: 'c', toolHint: 'cursor' });
    expect((forge.mock.calls.at(-1)![1] as ForgeContext).memories.map((m) => m.text).sort()).toEqual(['no emoji', 'use pnpm']);
    expect(scoped.status).toBe(201);
  });

  it('while "Personalize for me" is paused, reads and records no counts, memories or frecency', async () => {
    const { w, token, forge, pid } = await setup();
    await w.call('POST', '/v1/me/memory', token, { kind: 'rule', scope: 'global', scopeRef: null, sensitivity: 'normal', text: 'no emoji' });
    await w.call('PUT', '/v1/me/consent', token, { entries: [{ purpose: 'personalize', granted: false, version: 'c1' }] });
    const res = await w.call('POST', '/v1/forge', token, { text: 'a' });
    expect(forge.mock.calls.at(-1)![1]).toEqual({ counts: [], memories: [], toolUsage: [] });
    const decisionId = res.body.decisionId;
    await w.call('POST', '/v1/events', token, { events: [ev('chip.flipped', { decisionId, slotId: 'tone', value: 'friendly' }), ev('brief.copied', { decisionId })] });
    expect(await w.orm.$count(slotCounts, eq(slotCounts.pid, pid))).toBe(0);
    expect(await w.orm.$count(toolUsage, eq(toolUsage.pid, pid))).toBe(0);
    // The decision row still records what happened.
    const [d] = await w.orm.select().from(decisions).where(eq(decisions.id, decisionId));
    expect(d).toMatchObject({ outcome: 'copied', chosen: { tone: { value: 'friendly' } } });
  });
});

describe('outcome events', () => {
  it('update the decision and record slot counts (flips weigh 1.0) and frecency, exactly once under retries', async () => {
    const { w, token, pid } = await setup();
    const { decisionId } = (await w.call('POST', '/v1/forge', token, { text: 'a', hostApp: 'Gmail' })).body;
    const t = await clock();
    const batch = [
      ev('chip.flipped', { decisionId, slotId: 'tone', value: 'concise' }, t(1)),
      ev('chip.flipped', { decisionId, slotId: 'tone', value: 'friendly' }, t(2)),
      ev('chip.flipped', { decisionId, slotId: 'tone', value: 'whatever I typed' }, t(3)), // not an option: ignored
      ev('chip.flipped', { decisionId, slotId: 'audience', value: 'experts' }, t(3)), // not shown: ignored
      ev('brief.inserted', { decisionId }, t(4)),
      ev('outcome.rated', { decisionId, rating: 'worked' }, t(5)),
    ];
    for (let i = 0; i < 3; i++) {
      // Retries arrive in any order; the result is the same.
      const res = await w.call('POST', '/v1/events', token, { events: i === 1 ? [...batch].reverse() : batch });
      expect(res.body.accepted).toHaveLength(batch.length);
    }
    const [d] = await w.orm.select().from(decisions).where(eq(decisions.id, decisionId));
    expect(d).toMatchObject({ outcome: 'inserted', rating: 'worked', chosen: { tone: { value: 'friendly', at: t(2) } } });
    const counts = await w.orm.select().from(slotCounts).where(eq(slotCounts.pid, pid)).orderBy(slotCounts.at);
    expect(counts.map((c) => [c.slotId, c.value, c.weight, c.contextKey, c.toolId])).toEqual([
      ['tone', 'concise', 1, 'claude|Gmail', 'claude'],
      ['tone', 'friendly', 1, 'claude|Gmail', 'claude'],
    ]);
    expect(await w.orm.select({ toolId: toolUsage.toolId, hostApp: toolUsage.hostApp, surface: toolUsage.surface }).from(toolUsage)).toEqual([
      { toolId: 'claude', hostApp: 'Gmail', surface: 'web' },
    ]);
  });

  it('a later outcome wins over an earlier one, whatever order they arrive in', async () => {
    const { w, token } = await setup();
    const { decisionId } = (await w.call('POST', '/v1/forge', token, { text: 'a' })).body;
    const t = await clock();
    const [earlier, later] = [t(1), t(5)];
    await w.call('POST', '/v1/events', token, { events: [ev('brief.dismissed', { decisionId }, later)] });
    await w.call('POST', '/v1/events', token, { events: [ev('brief.copied', { decisionId }, earlier)] });
    const [d] = await w.orm.select().from(decisions).where(eq(decisions.id, decisionId));
    expect(d?.outcome).toBe('dismissed');
    // A copy counts as a use for frecency even though a dismissal came later; a dismissal never does.
    expect(await w.orm.$count(toolUsage)).toBe(1);
  });

  it('ignore decisions that are not the caller’s, but still store the event', async () => {
    const { w, token } = await setup();
    const other = await w.adultAccount();
    const { decisionId } = (await w.call('POST', '/v1/forge', other.token, { text: 'a' })).body;
    const res = await w.call('POST', '/v1/events', token, {
      events: [ev('chip.flipped', { decisionId, slotId: 'tone', value: 'friendly' }), ev('brief.inserted', { decisionId }), ev('brief.inserted', { decisionId: 'nope' })],
    });
    expect(res.body.accepted).toHaveLength(3);
    const [d] = await w.orm.select().from(decisions).where(eq(decisions.id, decisionId));
    expect(d).toMatchObject({ outcome: null, chosen: {} });
    expect(await w.orm.$count(slotCounts)).toBe(0);
  });

  it('a transient failure while applying outcomes fails the batch with 503 so the client retries', async () => {
    const { w, token } = await setup();
    const { decisionId } = (await w.call('POST', '/v1/forge', token, { text: 'a' })).body;
    // Make the first slot-count insert fail with a serialization failure (a
    // sequence, unlike a table, keeps its value when the statement rolls back).
    await w.db.exec(`create sequence attempts;
      create function flaky() returns trigger language plpgsql as $$
      begin if nextval('attempts') = 1 then raise exception 'serialization' using errcode = '40001'; end if; return new; end $$;
      create trigger flaky before insert on slot_counts for each row execute function flaky();`);
    const batch = { events: [ev('chip.flipped', { decisionId, slotId: 'tone', value: 'friendly' })] };
    const first = await w.call('POST', '/v1/events', token, batch);
    expect(first.status).toBe(503);
    expect((await w.call('POST', '/v1/events', token, batch)).status).toBe(200);
    expect(await w.orm.$count(slotCounts)).toBe(1);
  });
});

describe('quotas and the cost ceiling', () => {
  const limits = (forgesPerDay: number | null, costCeilingUsd = 2): Limits => ({
    ...DEFAULT_LIMITS,
    quota: { ...DEFAULT_LIMITS.quota, account: { forgesPerDay, dictationMinutesPerDay: 60 } },
    costCeilingUsd: { ...DEFAULT_LIMITS.costCeilingUsd, account: costCeilingUsd },
  });

  it('meter forges per UTC day and refuse new ones at the quota, refunding failed forges', async () => {
    let fail = false;
    const { w, token, id } = await setup({
      limits: limits(2),
      forge: async () => {
        if (fail) throw new Error('model down');
        return drafted;
      },
    });
    fail = true;
    expect((await w.call('POST', '/v1/forge', token, { text: 'a' })).status).toBe(500);
    fail = false;
    expect((await w.call('POST', '/v1/forge', token, { text: 'a' })).status).toBe(200);
    expect((await w.call('POST', '/v1/forge', token, { text: 'b' })).headers.get('x-forges-remaining')).toBe('0');
    const refused = await w.call('POST', '/v1/forge', token, { text: 'c' });
    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({ error: 'quota_exceeded', remaining: { forges: 0, dictationMinutes: 60 } });
    const [row] = await w.orm.select().from(usageCounters).where(eq(usageCounters.userId, id));
    expect(row).toMatchObject({ metric: 'forges', value: 2, day: new Date().toISOString().slice(0, 10) });
  });

  it('cannot be overshot by concurrent forges', async () => {
    const { w, token } = await setup({ limits: limits(3) });
    const statuses = await Promise.all(Array.from({ length: 8 }, (_, i) => w.call('POST', '/v1/forge', token, { text: `t${i}` }).then((r) => r.status)));
    expect(statuses.filter((s) => s === 200)).toHaveLength(3);
    expect(statuses.filter((s) => s === 429)).toHaveLength(5);
  });

  it('refuse new forges once the day’s model cost reaches the ceiling', async () => {
    const { w, token, id } = await setup({ limits: limits(null, 0.03), forge: async () => ({ ...drafted, usage: { llmCalls: 2, ms: 900, costUsd: 0.02 } }) });
    expect((await w.call('POST', '/v1/forge', token, { text: 'a' })).status).toBe(200);
    expect((await w.call('POST', '/v1/forge', token, { text: 'b' })).status).toBe(200);
    const refused = await w.call('POST', '/v1/forge', token, { text: 'c' });
    expect(refused.status).toBe(429);
    expect(refused.body.error).toBe('cost_ceiling');
    const rows = await w.orm.select().from(usageCounters).where(eq(usageCounters.userId, id));
    expect(Object.fromEntries(rows.map((r) => [r.metric, r.value]))).toEqual({ forges: 2, cost_microusd: 40_000 });
  });
});
