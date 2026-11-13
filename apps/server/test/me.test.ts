import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import {
  artifacts,
  artifactVersions,
  auditLog,
  consentLedger,
  decisions,
  events,
  memoryItems,
  profiles,
  reports,
  slotCounts,
  toolUsage,
  usageCounters,
  type Db,
} from '@promptai/db';
import { granted } from '../src/consent.ts';
import { isAdult } from '../src/me.ts';
import { okForge } from './helpers.ts';
import { accountToken, world } from './world.ts';

const memory = (text: string, extra: Record<string, unknown> = {}) => ({ kind: 'rule', scope: 'global', scopeRef: null, sensitivity: 'normal', text, ...extra });

describe('POST /v1/me/age', () => {
  it('stores whether the user is 18 or over, never the date', async () => {
    const w = await world();
    const token = await accountToken(w.key);
    const res = await w.call('POST', '/v1/me/age', token, { dob: '1991-07-14' });
    expect(res.body).toEqual({ ageConfirmed: true });
    expect((await w.call('GET', '/v1/me', token)).body.ageConfirmed).toBe(true);
    const { rows } = await w.db.query('select * from profiles');
    expect(JSON.stringify(rows)).not.toMatch(/1991|07-14/);

    const minor = new Date();
    minor.setUTCFullYear(minor.getUTCFullYear() - 17);
    expect((await w.call('POST', '/v1/me/age', token, { dob: minor.toISOString().slice(0, 10) })).body).toEqual({ ageConfirmed: false });
    expect((await w.call('POST', '/v1/me/age', token, { dob: '14/07/1991' })).status).toBe(400);
  });

  it('counts the 18th birthday itself as 18', () => {
    const now = new Date('2026-11-13T12:00:00Z');
    expect(isAdult('2008-11-13', now)).toBe(true);
    expect(isAdult('2008-11-14', now)).toBe(false);
    expect(isAdult('2008-02-29', new Date('2026-02-28T12:00:00Z'))).toBe(false);
    expect(isAdult('2008-02-29', new Date('2026-03-01T12:00:00Z'))).toBe(true);
  });
});

describe('PUT /v1/me/consent', () => {
  it('appends to the ledger and the latest entry per purpose wins', async () => {
    const w = await world();
    const { token, id } = await w.adultAccount();
    const put = (entries: unknown[]) => w.call('PUT', '/v1/me/consent', token, { entries });
    const first = await put([
      { purpose: 'improve_defaults', granted: true, version: 'c1' },
      { purpose: 'cloud_asr', granted: true, version: 'c1' },
    ]);
    expect(first.status).toBe(200);
    const second = await put([{ purpose: 'improve_defaults', granted: false, version: 'c2' }]);
    expect(second.body.consents).toEqual([
      { purpose: 'cloud_asr', granted: true, version: 'c1', at: expect.any(String) },
      { purpose: 'improve_defaults', granted: false, version: 'c2', at: expect.any(String) },
    ]);
    expect((await w.call('GET', '/v1/me', token)).body.consents).toEqual(second.body.consents);
    // Append-only: the earlier answer is still in the ledger.
    expect(await w.orm.$count(consentLedger, eq(consentLedger.userId, id))).toBe(3);
    expect((await put([{ purpose: 'cloud_asr', granted: true, version: 'c1' }, { purpose: 'cloud_asr', granted: false, version: 'c1' }])).status).toBe(400);
    expect((await put([{ purpose: 'telemetry', granted: true, version: 'c1' }])).status).toBe(400);
  });

  it('skipping means No, except "Personalize for me", which is on until paused', () => {
    expect(granted([], 'improve_defaults')).toBe(false);
    expect(granted([], 'train_models')).toBe(false);
    expect(granted([], 'cloud_asr')).toBe(false);
    expect(granted([], 'personalize')).toBe(true);
    expect(granted([{ purpose: 'personalize', granted: false, version: 'c1', at: '2026-11-13T00:00:00Z' }], 'personalize')).toBe(false);
  });
});

describe('/v1/me/memory', () => {
  it('creates, lists, updates and deletes (a tombstone that no update can resurrect)', async () => {
    const w = await world();
    const { token, id: userId } = await w.adultAccount();
    const created = await w.call('POST', '/v1/me/memory', token, memory('Reply in British English'));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ kind: 'rule', scope: 'global', status: 'active', source: 'user', text: 'Reply in British English' });
    const mid = created.body.id as string;

    const patched = await w.call('PATCH', `/v1/me/memory/${mid}`, token, { text: 'Reply in Indian English', status: 'archived' });
    expect(patched.body).toMatchObject({ id: mid, text: 'Reply in Indian English', status: 'archived' });
    expect((await w.call('GET', '/v1/me/memory', token)).body.items).toHaveLength(1);

    expect((await w.call('DELETE', `/v1/me/memory/${mid}`, token)).status).toBe(204);
    expect((await w.call('GET', '/v1/me/memory', token)).body.items).toEqual([]);
    expect((await w.call('PATCH', `/v1/me/memory/${mid}`, token, { text: 'back again' })).status).toBe(404);
    expect((await w.call('DELETE', `/v1/me/memory/${mid}`, token)).status).toBe(204);
    const [row] = await w.orm.select().from(memoryItems).where(eq(memoryItems.id, mid));
    expect(row).toMatchObject({ userId, text: null, deletedAt: expect.any(Date) });

    expect((await w.call('POST', '/v1/me/memory', token, memory(''))).status).toBe(400);
    expect((await w.call('DELETE', `/v1/me/memory/${randomUUID()}`, token)).status).toBe(404);
  });

  it('keeps each user to their own memories', async () => {
    const w = await world();
    const a = await w.adultAccount();
    const b = await w.adultAccount();
    const mine = await w.call('POST', '/v1/me/memory', a.token, memory('mine'));
    expect((await w.call('GET', '/v1/me/memory', b.token)).body.items).toEqual([]);
    expect((await w.call('PATCH', `/v1/me/memory/${mine.body.id}`, b.token, { text: 'theirs' })).status).toBe(404);
    expect((await w.call('DELETE', `/v1/me/memory/${mine.body.id}`, b.token)).status).toBe(404);
  });
});

describe('/v1/me/library', () => {
  it('versions every edit immutably and moves the head', async () => {
    const w = await world();
    const { token } = await w.adultAccount();
    const created = await w.call('POST', '/v1/me/library', token, { kind: 'brief', toolId: 'claude', title: 'Launch email', body: 'v1 body' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ kind: 'brief', toolId: 'claude', title: 'Launch email', body: 'v1 body', version: 1, visibility: 'private' });
    const aid = created.body.id as string;

    const edited = await w.call('PATCH', `/v1/me/library/${aid}`, token, { body: 'v2 body' });
    expect(edited.body).toMatchObject({ id: aid, title: 'Launch email', body: 'v2 body', version: 2 });
    expect((await w.call('PATCH', `/v1/me/library/${aid}`, token, { body: 'v2 body' })).body.version).toBe(2); // no change, no version
    expect((await w.call('GET', `/v1/me/library/${aid}`, token)).body.body).toBe('v2 body');

    const versions = await w.orm.select().from(artifactVersions).where(eq(artifactVersions.artifactId, aid)).orderBy(artifactVersions.version);
    expect(versions.map((v) => [v.version, v.body])).toEqual([
      [1, 'v1 body'],
      [2, 'v2 body'],
    ]);

    expect((await w.call('DELETE', `/v1/me/library/${aid}`, token)).status).toBe(204);
    expect((await w.call('GET', `/v1/me/library/${aid}`, token)).status).toBe(404);
    expect((await w.call('PATCH', `/v1/me/library/${aid}`, token, { body: 'v3' })).status).toBe(404);
    expect(await w.orm.$count(artifactVersions, eq(artifactVersions.artifactId, aid))).toBe(0);
    const [tomb] = await w.orm.select().from(artifacts).where(eq(artifacts.id, aid));
    expect(tomb?.deletedAt).toBeInstanceOf(Date);
    expect((await w.call('GET', '/v1/me/library', token)).body.items).toEqual([]);
  });
});

describe('GET /v1/me/export', () => {
  it('returns the profile, memory and library, and audits the export', async () => {
    const w = await world();
    const { token, id } = await w.adultAccount();
    await w.call('POST', '/v1/me/memory', token, memory('no emoji'));
    await w.call('POST', '/v1/me/library', token, { kind: 'recipe', toolId: 'midjourney', title: 'Poster', body: 'a fox' });
    await w.call('PUT', '/v1/me/consent', token, { entries: [{ purpose: 'cloud_asr', granted: true, version: 'c1' }] });
    const res = await w.call('GET', '/v1/me/export', token);
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ id, kind: 'account', ageConfirmed: true, consents: [{ purpose: 'cloud_asr', granted: true }] });
    expect(res.body.memory.map((m: { text: string }) => m.text)).toEqual(['no emoji']);
    expect(res.body.library.map((a: { title: string }) => a.title)).toEqual(['Poster']);
    expect((await w.orm.select().from(auditLog)).map((a) => a.action)).toEqual(['account.exported']);
  });
});

/** Gives the caller a row in every table that holds something about them. */
async function populate(w: Awaited<ReturnType<typeof world>>, token: string) {
  await w.call('POST', '/v1/me/memory', token, memory('no emoji'));
  await w.call('POST', '/v1/me/library', token, { kind: 'brief', toolId: 'claude', title: 't', body: 'b' });
  await w.call('PUT', '/v1/me/consent', token, { entries: [{ purpose: 'improve_defaults', granted: true, version: 'c1' }] });
  const forged = await w.call('POST', '/v1/forge', token, { text: 'hi' });
  const decisionId = forged.body.decisionId as string;
  await w.call('POST', '/v1/events', token, {
    events: [
      { id: randomUUID(), type: 'chip.flipped', at: new Date().toISOString(), props: { decisionId, slotId: 'tone', value: 'friendly' } },
      { id: randomUUID(), type: 'brief.inserted', at: new Date().toISOString(), props: { decisionId } },
    ],
  });
  await w.call('POST', '/v1/report', token, { decisionId, reason: 'other', note: 'odd' });
}

const toneChip = { slotId: 'tone', label: 'Tone', value: 'concise', source: 'default' as const, kind: 'assumption' as const, options: ['concise', 'friendly'] };

async function counts(db: Db, userId: string, pid: string) {
  return {
    memory: await db.$count(memoryItems, eq(memoryItems.userId, userId)),
    artifacts: await db.$count(artifacts, eq(artifacts.userId, userId)),
    versions: await db.$count(artifactVersions),
    consent: await db.$count(consentLedger, eq(consentLedger.userId, userId)),
    usage: await db.$count(usageCounters, eq(usageCounters.userId, userId)),
    reports: await db.$count(reports, eq(reports.userId, userId)),
    events: await db.$count(events, eq(events.pid, pid)),
    decisions: await db.$count(decisions, eq(decisions.pid, pid)),
    slotCounts: await db.$count(slotCounts, eq(slotCounts.pid, pid)),
    toolUsage: await db.$count(toolUsage, eq(toolUsage.pid, pid)),
  };
}

describe('DELETE /v1/me', () => {
  const forgeWithChip = { forge: async () => ({ ...okForge, toolId: 'claude', assumptions: [toneChip] }) };

  it('erases everything in one transaction, leaves a tombstone, deletes the auth user, and refuses the old token', async () => {
    const deleteUser = vi.fn(async () => {});
    const w = await world({ deps: { ...forgeWithChip, authAdmin: { deleteUser } } });
    const { token, id, sub } = await w.adultAccount();
    const bystander = await w.adultAccount();
    await populate(w, token);
    await populate(w, bystander.token);
    const [{ pid }] = (await w.orm.select({ pid: profiles.pid }).from(profiles).where(eq(profiles.id, id))) as [{ pid: string }];
    expect(Object.values(await counts(w.orm, id, pid)).every((n) => n > 0)).toBe(true);

    const res = await w.call('DELETE', '/v1/me', token);
    expect(res.status).toBe(204);
    expect(await counts(w.orm, id, pid)).toEqual({ memory: 0, artifacts: 0, versions: 1, consent: 0, usage: 0, reports: 0, events: 0, decisions: 0, slotCounts: 0, toolUsage: 0 });
    expect(deleteUser).toHaveBeenCalledWith(sub);

    const [tomb] = await w.orm.select().from(profiles).where(eq(profiles.id, id));
    expect(tomb).toMatchObject({ pid: null, handle: null, ageConfirmed: false, deletedAt: expect.any(Date), authUserId: sub });
    const audit = await w.orm.select().from(auditLog);
    expect(audit).toEqual([expect.objectContaining({ pid, action: 'account.deleted', detail: { kind: 'account' } })]);

    // The unexpired token can no longer use the account or recreate it.
    expect((await w.call('GET', '/v1/me', token)).body).toEqual({ error: 'unauthorized', reason: 'deleted' });
    expect((await w.call('POST', '/v1/me/memory', token, memory('again'))).status).toBe(401);
    expect(await w.orm.$count(profiles, eq(profiles.authUserId, sub))).toBe(1);
    // The bystander keeps everything (the one remaining version is theirs).
    expect(Object.values(await counts(w.orm, bystander.id, (await w.orm.select().from(profiles).where(eq(profiles.id, bystander.id)))[0]!.pid!)).every((n) => n > 0)).toBe(true);
  });

  it('rolls back completely when any step fails', async () => {
    const w = await world({ deps: forgeWithChip });
    const { token, id } = await w.adultAccount();
    await populate(w, token);
    const [{ pid }] = (await w.orm.select({ pid: profiles.pid }).from(profiles).where(eq(profiles.id, id))) as [{ pid: string }];
    const before = await counts(w.orm, id, pid);
    expect(Object.values(before).every((n) => n > 0)).toBe(true);
    // Make the transaction's last statement (the audit row) fail.
    await w.db.exec(`create function fail() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$;
      create trigger fail before insert on audit_log for each row execute function fail();`);

    expect((await w.call('DELETE', '/v1/me', token)).status).toBe(500);
    expect(await counts(w.orm, id, pid)).toEqual(before);
    expect((await w.call('GET', '/v1/me', token)).status).toBe(200);
  });

  it('when deleting the auth user fails, answers 503 and lets the tombstone retry just that', async () => {
    let fail = true;
    const deleteUser = vi.fn(async () => {
      if (fail) throw new Error('supabase down');
    });
    const w = await world({ deps: { authAdmin: { deleteUser } } });
    const { token } = await w.adultAccount();
    const first = await w.call('DELETE', '/v1/me', token);
    expect(first.status).toBe(503);
    expect(first.headers.get('retry-after')).toBe('5');
    fail = false;
    expect((await w.call('DELETE', '/v1/me', token)).status).toBe(204);
    expect(deleteUser).toHaveBeenCalledTimes(2);
    expect((await w.orm.select().from(auditLog)).filter((a) => a.action === 'account.deleted')).toHaveLength(1);
  });

  it('erases a guest too, freeing the device for a new guest profile', async () => {
    const w = await world();
    const token = await w.guestToken('device-ffffffff');
    const before = await w.call('GET', '/v1/me', token);
    expect((await w.call('DELETE', '/v1/me', token)).status).toBe(204);
    expect((await w.call('GET', '/v1/me', token)).status).toBe(401);
    const after = await w.call('GET', '/v1/me', await w.guestToken('device-ffffffff'));
    expect(after.body.id).not.toBe(before.body.id);
  });
});
