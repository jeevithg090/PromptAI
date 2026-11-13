/**
 * /v1/me/*: profile, age gate, consent, memory, library, export and account
 * deletion (blueprint §8 Consent, §10, §12, §13).
 */
import { Hono, type Context } from 'hono';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  ageGateRequestSchema,
  artifactCreateSchema,
  artifactUpdateSchema,
  consentUpdateSchema,
  exportSchema,
  memoryItemCreateSchema,
  memoryItemUpdateSchema,
  type Artifact,
  type MemoryItem,
  type Profile,
} from '@promptai/contract';
import {
  artifacts,
  artifactVersions,
  auditLog,
  consentLedger,
  decisions,
  events,
  markErasure,
  memoryItems,
  policyState,
  profiles,
  reports,
  slotCounts,
  subscriptions,
  toolUsage,
  usageCounters,
  type Db,
} from '@promptai/db';
import type { Caller } from './auth.ts';
import { latestConsents } from './consent.ts';
import type { AppDeps, AppEnv, Log } from './types.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const body = (c: Context) => c.req.json().catch(() => undefined);
const invalid = (c: Context, issues: unknown) => c.json({ error: 'invalid_request', issues }, 400);
const notFound = (c: Context) => c.json({ error: 'not_found' }, 404);

/** 18 or over on the server's (UTC) date. Only this boolean is kept. */
export function isAdult(dob: string, now: Date): boolean {
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  const month = now.getUTCMonth() + 1;
  const beforeBirthday = month < m || (month === m && now.getUTCDate() < d);
  return now.getUTCFullYear() - y - (beforeBirthday ? 1 : 0) >= 18;
}

async function profileOf(db: Db, caller: Caller): Promise<Profile> {
  return {
    id: caller.id,
    kind: caller.kind,
    ageConfirmed: caller.ageConfirmed,
    handle: caller.handle,
    consents: await latestConsents(db, caller.id),
    createdAt: caller.createdAt.toISOString(),
  };
}

const toMemory = (m: typeof memoryItems.$inferSelect): MemoryItem => ({
  id: m.id,
  kind: m.kind,
  scope: m.scope,
  scopeRef: m.scopeRef,
  sensitivity: m.sensitivity,
  status: m.status,
  text: m.text ?? '',
  source: m.source,
  createdAt: m.createdAt.toISOString(),
  updatedAt: m.updatedAt.toISOString(),
});

async function listMemory(db: Db, userId: string): Promise<MemoryItem[]> {
  const rows = await db
    .select()
    .from(memoryItems)
    .where(and(eq(memoryItems.userId, userId), isNull(memoryItems.deletedAt)))
    .orderBy(desc(memoryItems.updatedAt));
  return rows.map(toMemory);
}

/** Live artifacts joined to their head version. */
async function listLibrary(db: Db, userId: string, id?: string): Promise<Artifact[]> {
  const rows = await db
    .select({ a: artifacts, v: artifactVersions })
    .from(artifacts)
    .innerJoin(artifactVersions, eq(artifacts.headVersionId, artifactVersions.id))
    .where(and(eq(artifacts.userId, userId), isNull(artifacts.deletedAt), id === undefined ? undefined : eq(artifacts.id, id)))
    .orderBy(desc(artifacts.updatedAt));
  return rows.map(({ a, v }) => ({
    id: a.id,
    kind: v.kind,
    toolId: v.toolId,
    title: v.title,
    body: v.body,
    version: v.version,
    visibility: 'private',
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));
}

/**
 * Deletes everything held about the caller in one transaction, leaves the
 * profile as a tombstone (so its unexpired tokens cannot recreate it) and
 * appends a content-free audit row under the now-unlinkable pid.
 */
async function erase(db: Db, caller: Caller, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await markErasure(tx);
    const uid = caller.id;
    await tx.delete(memoryItems).where(eq(memoryItems.userId, uid));
    await tx.delete(artifacts).where(eq(artifacts.userId, uid)); // versions cascade
    await tx.delete(consentLedger).where(eq(consentLedger.userId, uid));
    await tx.delete(usageCounters).where(eq(usageCounters.userId, uid));
    await tx.delete(subscriptions).where(eq(subscriptions.userId, uid));
    await tx.delete(reports).where(eq(reports.userId, uid));
    if (caller.pid) {
      const pid = caller.pid;
      await tx.delete(events).where(eq(events.pid, pid));
      await tx.delete(decisions).where(eq(decisions.pid, pid));
      await tx.delete(slotCounts).where(eq(slotCounts.pid, pid));
      await tx.delete(toolUsage).where(eq(toolUsage.pid, pid));
      await tx.delete(policyState).where(eq(policyState.pid, pid));
    }
    await tx
      .update(profiles)
      .set({ pid: null, handle: null, deviceHash: null, ageConfirmed: false, trustLevel: 0, deletedAt: now, updatedAt: now })
      .where(eq(profiles.id, uid));
    await tx.insert(auditLog).values({ pid: caller.pid, actor: 'user', action: 'account.deleted', detail: { kind: caller.kind } });
  });
}

export function meRoutes(deps: AppDeps, log: Log, now: () => Date) {
  const { db } = deps;
  const me = new Hono<AppEnv>();

  // Guests are stateless (blueprint §12): no memory and nothing kept in a library.
  const accountOnly = async (c: Context<AppEnv>, next: () => Promise<void>) => {
    if (c.get('caller').kind !== 'account') return c.json({ error: 'account_required' }, 403);
    await next();
  };
  me.use('/memory/*', accountOnly);
  me.use('/memory', accountOnly);
  me.use('/library/*', accountOnly);
  me.use('/library', accountOnly);

  me.get('/', async (c) => c.json(await profileOf(db, c.get('caller'))));

  me.post('/age', async (c) => {
    const parsed = ageGateRequestSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const ageConfirmed = isAdult(parsed.data.dob, now());
    await db.update(profiles).set({ ageConfirmed, updatedAt: now() }).where(eq(profiles.id, c.get('caller').id));
    return c.json({ ageConfirmed });
  });

  me.put('/consent', async (c) => {
    const parsed = consentUpdateSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const purposes = parsed.data.entries.map((e) => e.purpose);
    if (new Set(purposes).size !== purposes.length) return invalid(c, [{ path: ['entries'], message: 'each purpose at most once' }]);
    const caller = c.get('caller');
    await db.insert(consentLedger).values(parsed.data.entries.map((e) => ({ userId: caller.id, ...e })));
    return c.json(await profileOf(db, caller));
  });

  me.get('/memory', async (c) => c.json({ items: await listMemory(db, c.get('caller').id) }));

  me.post('/memory', async (c) => {
    const parsed = memoryItemCreateSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const [row] = await db
      .insert(memoryItems)
      .values({ ...parsed.data, userId: c.get('caller').id, source: 'user', status: 'active' })
      .returning();
    return c.json(toMemory(row!), 201);
  });

  me.patch('/memory/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return notFound(c);
    const parsed = memoryItemUpdateSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    // Delete wins: a tombstone matches nothing here, so no update can resurrect it.
    const [row] = await db
      .update(memoryItems)
      .set({ ...parsed.data, updatedAt: now() })
      .where(and(eq(memoryItems.id, id), eq(memoryItems.userId, c.get('caller').id), isNull(memoryItems.deletedAt)))
      .returning();
    return row ? c.json(toMemory(row)) : notFound(c);
  });

  me.delete('/memory/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return notFound(c);
    const [row] = await db
      .update(memoryItems)
      .set({ text: null, deletedAt: now(), updatedAt: now() })
      .where(and(eq(memoryItems.id, id), eq(memoryItems.userId, c.get('caller').id), isNull(memoryItems.deletedAt)))
      .returning({ id: memoryItems.id });
    if (row) return c.body(null, 204);
    // Already a tombstone: deleting again is done, not an error.
    const [gone] = await db.select({ id: memoryItems.id }).from(memoryItems).where(and(eq(memoryItems.id, id), eq(memoryItems.userId, c.get('caller').id)));
    return gone ? c.body(null, 204) : notFound(c);
  });

  me.get('/library', async (c) => c.json({ items: await listLibrary(db, c.get('caller').id) }));

  me.get('/library/:id', async (c) => {
    const id = c.req.param('id');
    const [item] = UUID.test(id) ? await listLibrary(db, c.get('caller').id, id) : [];
    return item ? c.json(item) : notFound(c);
  });

  me.post('/library', async (c) => {
    const parsed = artifactCreateSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const userId = c.get('caller').id;
    const id = await db.transaction(async (tx) => {
      const [a] = await tx.insert(artifacts).values({ userId }).returning({ id: artifacts.id });
      const [v] = await tx.insert(artifactVersions).values({ artifactId: a!.id, version: 1, ...parsed.data }).returning({ id: artifactVersions.id });
      await tx.update(artifacts).set({ headVersionId: v!.id }).where(eq(artifacts.id, a!.id));
      return a!.id;
    });
    const [item] = await listLibrary(db, userId, id);
    return c.json(item!, 201);
  });

  /** An edit appends a version and moves the head; versions are never changed. */
  me.patch('/library/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return notFound(c);
    const parsed = artifactUpdateSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const userId = c.get('caller').id;
    const found = await db.transaction(async (tx) => {
      const [a] = await tx
        .select()
        .from(artifacts)
        .where(and(eq(artifacts.id, id), eq(artifacts.userId, userId), isNull(artifacts.deletedAt)))
        .for('update');
      if (!a?.headVersionId) return false;
      const [head] = await tx.select().from(artifactVersions).where(eq(artifactVersions.id, a.headVersionId));
      const next = { kind: head!.kind, toolId: head!.toolId, title: head!.title, body: head!.body, ...parsed.data };
      if (next.kind === head!.kind && next.toolId === head!.toolId && next.title === head!.title && next.body === head!.body) return true;
      const [v] = await tx
        .insert(artifactVersions)
        .values({ artifactId: id, version: head!.version + 1, ...next })
        .returning({ id: artifactVersions.id });
      await tx.update(artifacts).set({ headVersionId: v!.id, updatedAt: now() }).where(eq(artifacts.id, id));
      return true;
    });
    if (!found) return notFound(c);
    const [item] = await listLibrary(db, userId, id);
    return c.json(item!);
  });

  /** Tombstones the artifact and erases its versions. */
  me.delete('/library/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return notFound(c);
    const userId = c.get('caller').id;
    const found = await db.transaction(async (tx) => {
      const [a] = await tx.select().from(artifacts).where(and(eq(artifacts.id, id), eq(artifacts.userId, userId))).for('update');
      if (!a) return false;
      if (a.deletedAt) return true;
      await tx.delete(artifactVersions).where(eq(artifactVersions.artifactId, id));
      await tx
        .update(artifacts)
        .set({ deletedAt: now(), updatedAt: now(), shareSlug: null, publishedVersionId: null, skeletonHash: null, license: null, originDecisionId: null, originArtifactId: null })
        .where(eq(artifacts.id, id));
      return true;
    });
    return found ? c.body(null, 204) : notFound(c);
  });

  me.get('/export', async (c) => {
    const caller = c.get('caller');
    const account = caller.kind === 'account';
    const result = exportSchema.parse({
      profile: await profileOf(db, caller),
      memory: account ? await listMemory(db, caller.id) : [],
      library: account ? await listLibrary(db, caller.id) : [],
      exportedAt: now().toISOString(),
    });
    await db.insert(auditLog).values({ pid: caller.pid, actor: 'user', action: 'account.exported' });
    return c.json(result);
  });

  /**
   * Erases the account, then deletes the Supabase auth user. If that call
   * fails the client retries: the tombstone may call this route again (and
   * only this route), which then just retries the auth-user deletion.
   */
  me.delete('/', async (c) => {
    const caller = c.get('caller');
    if (!caller.deletedAt) await erase(db, caller, now());
    if (caller.kind === 'account' && caller.authUserId) {
      if (!deps.authAdmin) {
        log({ level: 'warn', msg: 'auth_user_delete_skipped', requestId: c.get('requestId'), reason: 'Supabase admin API not configured' });
      } else {
        try {
          await deps.authAdmin.deleteUser(caller.authUserId);
        } catch (err) {
          log({ level: 'error', msg: 'auth_user_delete_failed', requestId: c.get('requestId'), error: err instanceof Error ? err.name : typeof err });
          c.header('Retry-After', '5');
          return c.json({ error: 'auth_user_delete_failed', retry: true }, 503);
        }
      }
    }
    return c.body(null, 204);
  });

  return me;
}
