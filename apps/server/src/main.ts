import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { createRemoteJWKSet } from 'jose';
import pg from 'pg';
import { createLlmPort, gatewayTransport, parseRoutes } from '@promptai/ai';
import { forge, type Clock } from '@promptai/core';
import { migrate, schema, type Db } from '@promptai/db';
import { createApp, DEFAULT_LIMITS, jsonLog, type Limits } from './app.ts';
import { createAuth, createAuthAdmin, createGuests, type SupabaseAuthConfig } from './auth.ts';
import { cardsFrom, localesFrom, readCatalogDir, readSignedCatalog, type CatalogFiles } from './catalog.ts';
import { createEventStore, type Sql } from './event-store.ts';

const env = process.env;
const production = env.NODE_ENV === 'production';

/**
 * Auth config. Accounts need SUPABASE_JWKS_URL (asymmetric keys) and/or
 * SUPABASE_JWT_SECRET (legacy HS256). Without either the server runs in dev
 * mode: only guest tokens are accepted, signed with a per-process secret
 * unless GUEST_SECRET is set. Production refuses to start without the full set.
 */
const supabase: SupabaseAuthConfig | undefined =
  env.SUPABASE_JWKS_URL || env.SUPABASE_JWT_SECRET
    ? {
        jwks: env.SUPABASE_JWKS_URL ? createRemoteJWKSet(new URL(env.SUPABASE_JWKS_URL)) : undefined,
        jwtSecret: env.SUPABASE_JWT_SECRET,
        issuer: env.SUPABASE_URL ? `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1` : undefined,
      }
    : undefined;
if (production) {
  const missing = [
    !supabase && 'SUPABASE_JWKS_URL or SUPABASE_JWT_SECRET',
    !env.SUPABASE_URL && 'SUPABASE_URL',
    !env.SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY (account deletion must delete the auth user)',
    !env.GUEST_SECRET && 'GUEST_SECRET (guest tokens must survive restarts and match across instances)',
    !env.PROMPTAI_BUNDLE_DIR && 'PROMPTAI_BUNDLE_DIR (production serves only a signed catalog bundle)',
    !env.PROMPTAI_TRUSTED_ROOTS && 'PROMPTAI_TRUSTED_ROOTS (the root public keys the bundle must chain to)',
  ].filter(Boolean);
  if (missing.length > 0) {
    console.error(`Refusing to start with NODE_ENV=production: set ${missing.join(', ')}.`);
    process.exit(1);
  }
}

/** Core takes time through a port so it stays pure; this is the real one. */
const systemClock: Clock = {
  now: () => performance.now(),
  after: (ms) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    });
    return { promise, cancel: () => clearTimeout(timer) };
  },
};

/** DATABASE_URL is assumed migrated (`pnpm --filter @promptai/server migrate`). Without it, an in-memory PGlite is migrated here (data is lost on exit). */
async function database(): Promise<{ sql: Sql; db: Db }> {
  if (env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
    // An idle client losing its connection (restart, failover) emits 'error' on
    // the pool; unhandled, that crashes the process. The next query reconnects.
    pool.on('error', (err) => jsonLog({ level: 'warn', msg: 'pg_idle_client_error', code: (err as { code?: unknown }).code }));
    return { sql: pool, db: drizzlePg({ client: pool, schema }) };
  }
  const client = new PGlite();
  const db = drizzlePglite({ client, schema });
  await migrate(db);
  return { sql: client, db };
}

const int = (name: string, fallback: number) => (env[name] ? Number.parseInt(env[name], 10) : fallback);
const limits: Limits = {
  ...DEFAULT_LIMITS,
  quota: {
    ...DEFAULT_LIMITS.quota,
    guest: {
      forgesPerDay: int('GUEST_FORGES_PER_DAY', DEFAULT_LIMITS.quota.guest.forgesPerDay),
      dictationMinutesPerDay: int('GUEST_DICTATION_MINUTES_PER_DAY', DEFAULT_LIMITS.quota.guest.dictationMinutesPerDay),
    },
  },
};

const { sql, db } = await database();
const guests = createGuests(db, { secret: env.GUEST_SECRET ?? randomBytes(32).toString('hex') });
// The catalog: a signed content bundle when PROMPTAI_BUNDLE_DIR is set (required in
// production, built with `pnpm bundle:build && pnpm bundle:sign`), else the repo's catalog/.
const SERVER_VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
let catalogFiles: CatalogFiles;
let bundleVersion: number | null = null;
if (env.PROMPTAI_BUNDLE_DIR) {
  try {
    const signed = await readSignedCatalog(env.PROMPTAI_BUNDLE_DIR, JSON.parse(env.PROMPTAI_TRUSTED_ROOTS ?? '[]') as string[], {
      now: new Date(),
      channel: env.PROMPTAI_BUNDLE_CHANNEL ?? 'stable',
      clientVersion: SERVER_VERSION,
    });
    catalogFiles = signed.files;
    bundleVersion = signed.version;
  } catch (err) {
    console.error(`Refusing to start: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
} else {
  catalogFiles = await readCatalogDir(path.resolve(import.meta.dirname, '../../../catalog'));
}
const cards = cardsFrom(catalogFiles);
const locales = localesFrom(catalogFiles);
// With AI_GATEWAY_API_KEY set, forge gets a model port; without it, forge runs its
// deterministic path (card render, chips, checks). See packages/ai/README.md.
const routesYaml = catalogFiles.get('routes.yaml');
if (routesYaml === undefined) throw new Error('the catalog has no routes.yaml');
const routes = parseRoutes(routesYaml);
const transport = env.AI_GATEWAY_API_KEY ? gatewayTransport(env.AI_GATEWAY_API_KEY) : undefined;
const app = createApp({
  forge: async (req, ctx) => {
    const { allowModel, ...personal } = ctx;
    // No AI-processing consent, no model: forge drafts on its deterministic path.
    // One port per request: a refusal latches the port so nothing is re-sent.
    const llm = transport && allowModel ? createLlmPort({ routes, transport, clock: systemClock }) : undefined;
    const res = await forge(req, { cards, clock: systemClock, locales, now: new Date().toISOString(), ...personal, ...(llm ? { llm } : {}) });
    if (!llm) return res;
    const { tokensIn, tokensOut, costUsd } = llm.usage();
    return { ...res, usage: { ...res.usage, tokensIn, tokensOut, costUsd } };
  },
  events: createEventStore(sql),
  db,
  auth: createAuth({ db, guests, supabase }),
  guests,
  authAdmin: env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? createAuthAdmin({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }) : undefined,
  limits,
  // ALLOWED_ORIGINS: comma-separated PWA origins. Dev defaults to Vite's dev and preview servers.
  corsOrigins: (env.ALLOWED_ORIGINS ?? (production ? '' : 'http://localhost:5173,http://localhost:4173')).split(',').map((o) => o.trim()).filter(Boolean),
  // Behind a proxy (Fly sets Fly-Client-IP), name its header in TRUST_PROXY_HEADER; otherwise the socket address is used.
  clientIp: (c) => (env.TRUST_PROXY_HEADER ? c.req.header(env.TRUST_PROXY_HEADER) : undefined) ?? getConnInfo(c).remote.address ?? 'unknown',
});
const port = Number(env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  jsonLog({
    level: 'info',
    msg: 'listening',
    port: info.port,
    cards: cards.length,
    locales: locales.length,
    catalog: bundleVersion === null ? 'catalog/ (unsigned, dev)' : `signed bundle v${bundleVersion}`,
    model: transport ? 'gateway' : 'none (deterministic)',
    db: env.DATABASE_URL ? 'postgres' : 'pglite-memory',
    auth: supabase ? 'supabase+guest' : 'dev: guest tokens only',
  });
});
