import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  artifacts,
  artifactVersions,
  auditLog,
  consentLedger,
  markErasure,
  memoryItems,
  migrate,
  passages,
  catalogItems,
  profiles,
  schema,
  slotCounts,
  uuidv7,
  type Db,
} from '../src/index.ts';

async function fresh() {
  const client = new PGlite();
  const db: Db = drizzle({ client, schema });
  await migrate(db);
  return { client, db };
}

/** The SQLSTATE of a failed drizzle query (drizzle wraps the driver error). */
async function sqlstate(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (err) {
    return (err as { cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code;
  }
  throw new Error('expected the query to fail');
}

const TABLES = [
  'artifact_versions', 'artifacts', 'audit_log', 'catalog_items', 'consent_ledger', 'decisions', 'events', 'memory_items',
  'passages', 'policy_state', 'profiles', 'reports', 'slot_counts', 'subscriptions', 'tool_usage', 'usage_counters',
];

describe('migrations', () => {
  it('create the 12 blueprint tables plus consent_ledger, reports, slot_counts and tool_usage, and re-running is a no-op', async () => {
    const { client, db } = await fresh();
    await migrate(db);
    const { rows } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual(TABLES);
    const applied = await client.query<{ n: number }>('select count(*)::int as n from drizzle.__drizzle_migrations');
    expect(applied.rows[0]?.n).toBe(2);
  });

  it('turn on row-level security everywhere, so a role that is granted a table (Supabase anon) still sees no rows', async () => {
    const { client, db } = await fresh();
    const { rows } = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
    );
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
    expect(rows).toHaveLength(TABLES.length);

    await db.insert(profiles).values({ kind: 'account', authUserId: crypto.randomUUID() });
    await client.exec(`create role anon; grant select on profiles to anon;`);
    await client.exec('set role anon');
    expect((await client.query('select * from profiles')).rows).toEqual([]);
    await client.exec('reset role');
    expect((await client.query('select * from profiles')).rows).toHaveLength(1);
  });
});

describe('uuidv7', () => {
  it('is a version-7 RFC 9562 id carrying the current millisecond', () => {
    const before = Date.now();
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const ms = parseInt(id.replace(/-/g, '').slice(0, 12), 16);
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(Date.now() + 1);
  });

  it('sorts in creation order, even within one millisecond', () => {
    const ids = Array.from({ length: 10_000 }, uuidv7);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('table rules', () => {
  let db: Db;
  let user: string;
  beforeEach(async () => {
    ({ db } = await fresh());
    const [p] = await db.insert(profiles).values({ kind: 'account', authUserId: crypto.randomUUID() }).returning();
    user = p!.id;
  });

  it('gives a profile a random v4 pid, distinct from its v7 id', async () => {
    const [p] = await db.select().from(profiles);
    expect(p?.id).toMatch(/^[0-9a-f-]{14}7/);
    expect(p?.pid).toMatch(/^[0-9a-f-]{14}4/);
  });

  it('audit_log is append-only: update, delete and truncate are refused', async () => {
    await db.insert(auditLog).values({ actor: 'user', action: 'account.exported' });
    expect(await sqlstate(db.update(auditLog).set({ action: 'x' }))).toBe('42501');
    expect(await sqlstate(db.delete(auditLog))).toBe('42501');
    expect(await sqlstate(db.execute(sql`truncate audit_log`))).toBe('42501');
    expect(await db.$count(auditLog)).toBe(1);
  });

  it('consent_ledger refuses updates always and deletes outside an erasure transaction', async () => {
    await db.insert(consentLedger).values({ userId: user, purpose: 'improve_defaults', granted: true, version: 'v1' });
    expect(await sqlstate(db.update(consentLedger).set({ granted: false }))).toBe('42501');
    expect(await sqlstate(db.delete(consentLedger))).toBe('42501');
    await db.transaction(async (tx) => {
      await markErasure(tx);
      await tx.delete(consentLedger).where(eq(consentLedger.userId, user));
    });
    expect(await db.$count(consentLedger)).toBe(0);
    // The erasure flag is transaction-local: it ended with that transaction.
    await db.insert(consentLedger).values({ userId: user, purpose: 'cloud_asr', granted: false, version: 'v1' });
    expect(await sqlstate(db.delete(consentLedger))).toBe('42501');
  });

  it('artifact_versions are immutable but go with their artifact', async () => {
    const [a] = await db.insert(artifacts).values({ userId: user }).returning();
    await db.insert(artifactVersions).values({ artifactId: a!.id, version: 1, kind: 'brief', toolId: 'claude', title: 't', body: 'b' });
    expect(await sqlstate(db.update(artifactVersions).set({ body: 'changed' }))).toBe('42501');
    expect(await sqlstate(db.insert(artifactVersions).values({ artifactId: a!.id, version: 1, kind: 'brief', toolId: 'claude', title: 't', body: 'b' }))).toBe('23505');
    await db.delete(artifacts).where(eq(artifacts.id, a!.id));
    expect(await db.$count(artifactVersions)).toBe(0);
  });

  it('a memory tombstone must have its text erased', async () => {
    const [m] = await db.insert(memoryItems).values({ userId: user, kind: 'rule', scope: 'global', text: 'no emoji', source: 'user' }).returning();
    expect(await sqlstate(db.update(memoryItems).set({ deletedAt: new Date() }).where(eq(memoryItems.id, m!.id)))).toBe('23514');
    await db.update(memoryItems).set({ deletedAt: new Date(), text: null }).where(eq(memoryItems.id, m!.id));
  });

  it('a device has one live guest profile; its tombstone frees the device', async () => {
    const [g] = await db.insert(profiles).values({ kind: 'guest', deviceHash: 'd1' }).returning();
    expect(await sqlstate(db.insert(profiles).values({ kind: 'guest', deviceHash: 'd1' }))).toBe('23505');
    await db.update(profiles).set({ deletedAt: new Date(), deviceHash: null, pid: null }).where(eq(profiles.id, g!.id));
    await db.insert(profiles).values({ kind: 'guest', deviceHash: 'd1' });
    // An account needs its Supabase user id; a guest must not have one.
    expect(await sqlstate(db.insert(profiles).values({ kind: 'account' }))).toBe('23514');
    expect(await sqlstate(db.insert(profiles).values({ kind: 'guest', authUserId: crypto.randomUUID() }))).toBe('23514');
  });

  it('slot_counts read back in the CountRow shape core consumes', async () => {
    const at = new Date('2026-11-13T10:00:00.000Z');
    const pid = crypto.randomUUID();
    await db.insert(slotCounts).values({ pid, toolId: 'claude', slotId: 'tone', value: 'friendly', contextKey: 'claude|-', weight: 1, at });
    const rows = await db
      .select({ slotId: slotCounts.slotId, value: slotCounts.value, contextKey: slotCounts.contextKey, weight: slotCounts.weight, at: slotCounts.at })
      .from(slotCounts)
      .where(eq(slotCounts.pid, pid));
    expect(rows).toEqual([{ slotId: 'tone', value: 'friendly', contextKey: 'claude|-', weight: 1, at }]);
  });

  it('passages are searchable with Postgres full-text search', async () => {
    await db.insert(catalogItems).values({ id: 'claude', kind: 'tool', version: '1', card: {} });
    await db.insert(passages).values([
      { catalogItemId: 'claude', sourceUrl: 'https://example.com/a', heading: 'Effort', text: 'Opus defaults to medium effort.' },
      { catalogItemId: 'claude', sourceUrl: 'https://example.com/b', text: 'Use XML tags to structure prompts.' },
    ]);
    const hits = await db.select({ url: passages.sourceUrl }).from(passages).where(sql`${passages.search} @@ plainto_tsquery('english', 'tags structuring')`);
    expect(hits).toEqual([{ url: 'https://example.com/b' }]);
  });
});
