/**
 * The rebuild's Postgres schema (blueprint §12): the 12 tables, plus the four
 * Phase 1 needs (consent_ledger, reports, slot_counts, tool_usage).
 *
 * Keys. Ids are UUIDv7. Personal rows (memory, library, consent, usage,
 * billing, reports) hang off `profiles.id`. Content-free learning and
 * analytics rows (events, decisions, slot counts, tool usage, policy state,
 * audit) carry only the pseudonymous `pid`, with no foreign key, so population
 * jobs never join to an identity, and the audit log can outlive an account
 * without naming it (erasure nulls the profile's pid).
 *
 * Deletes are tombstones where a late write could otherwise resurrect data: a
 * deleted memory, artifact or profile keeps its id and `deleted_at`, its
 * content erased. Append-only and immutability rules are triggers in the
 * custom migration (drizzle/0001_append_only.sql).
 *
 * Every table has row-level security on and no policies. Only the server
 * reads these tables, as their owner, which RLS does not restrict; on
 * Supabase this stops the anon and authenticated roles reaching them
 * through the Data API.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from './ids.ts';

const id = () => uuid('id').primaryKey().$defaultFn(uuidv7);
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => at('created_at').notNull().defaultNow();
const updatedAt = () => at('updated_at').notNull().defaultNow();
const deletedAt = () => at('deleted_at');
/** `col in ('a', 'b')` for a check constraint. */
const oneOf = (col: string, values: readonly string[]) => sql.raw(`${col} in (${values.map((v) => `'${v}'`).join(', ')})`);
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

export const PROFILE_KINDS = ['guest', 'account'] as const;
export const MEMORY_KINDS = ['profile', 'preference', 'rule', 'fact', 'goal', 'vocabulary'] as const;
export const MEMORY_SCOPES = ['global', 'tool', 'project'] as const;
export const MEMORY_SENSITIVITIES = ['normal', 'sensitive', 'special'] as const;
export const MEMORY_STATUSES = ['active', 'proposed', 'archived'] as const;
export const MEMORY_SOURCES = ['user', 'proposal'] as const;
export const ARTIFACT_KINDS = ['brief', 'recipe'] as const;
export const OUTCOMES = ['inserted', 'copied', 'dismissed'] as const;
export const USAGE_METRICS = ['forges', 'dictation_seconds', 'cost_microusd'] as const;
export const CONSENT_PURPOSES = ['personalize', 'improve_defaults', 'cloud_asr', 'llm_processing', 'page_context', 'train_models'] as const;
export const REPORT_REASONS = ['wrong_or_harmful', 'illegal', 'child_safety', 'harassment', 'sexual', 'privacy', 'copyright', 'spam', 'other'] as const;
export const SURFACES = ['desktop', 'web', 'mcp'] as const;

/** One row per guest device or Supabase account. A deleted profile stays as a tombstone (pid, handle, device erased) so an unexpired token cannot recreate it. */
export const profiles = pgTable(
  'profiles',
  {
    id: id(),
    /** Random (v4, so it carries no creation time); null once erased. */
    pid: uuid('pid').unique().$defaultFn(randomUUID),
    kind: text('kind', { enum: PROFILE_KINDS }).notNull(),
    /** Supabase auth `sub`; kept on the tombstone to refuse its tokens. */
    authUserId: uuid('auth_user_id').unique(),
    /** HMAC of the guest's device id (never the id itself). */
    deviceHash: text('device_hash'),
    handle: text('handle'),
    trustLevel: smallint('trust_level').notNull().default(0),
    /** Whether the DOB screen showed 18+. The date itself is never stored. */
    ageConfirmed: boolean('age_confirmed').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('profiles_kind', oneOf('kind', PROFILE_KINDS)),
    check('profiles_identity', sql`(${t.kind} = 'account') = (${t.authUserId} is not null)`),
    check('profiles_handle_len', sql`char_length(${t.handle}) <= 64`),
    uniqueIndex('profiles_live_device').on(t.deviceHash).where(sql`${t.deletedAt} is null`),
  ],
).enableRLS();

/** Text memories (blueprint §10). A delete erases `text` and sets `deleted_at` (delete wins). */
export const memoryItems = pgTable(
  'memory_items',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: MEMORY_KINDS }).notNull(),
    scope: text('scope', { enum: MEMORY_SCOPES }).notNull(),
    scopeRef: text('scope_ref'),
    sensitivity: text('sensitivity', { enum: MEMORY_SENSITIVITIES }).notNull().default('normal'),
    status: text('status', { enum: MEMORY_STATUSES }).notNull().default('active'),
    text: text('text'),
    source: text('source', { enum: MEMORY_SOURCES }).notNull(),
    evidenceIds: uuid('evidence_ids').array().notNull().default(sql`'{}'::uuid[]`),
    strength: real('strength').notNull().default(1),
    uses: integer('uses').notNull().default(0),
    helpful: integer('helpful').notNull().default(0),
    supersededBy: uuid('superseded_by').references((): AnyPgColumn => memoryItems.id, { onDelete: 'set null' }),
    validFrom: at('valid_from').notNull().defaultNow(),
    validTo: at('valid_to'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('memory_kind', oneOf('kind', MEMORY_KINDS)),
    check('memory_scope', oneOf('scope', MEMORY_SCOPES)),
    check('memory_sensitivity', oneOf('sensitivity', MEMORY_SENSITIVITIES)),
    check('memory_status', oneOf('status', MEMORY_STATUSES)),
    check('memory_source', oneOf('source', MEMORY_SOURCES)),
    check('memory_text', sql`(${t.deletedAt} is null) = (${t.text} is not null)`),
    index('memory_items_user').on(t.userId),
  ],
).enableRLS();

/** Saved briefs and recipes. Content lives in immutable `artifact_versions`; `head_version_id` points at the current one. */
export const artifacts = pgTable(
  'artifacts',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    headVersionId: uuid('head_version_id').references((): AnyPgColumn => artifactVersions.id, { onDelete: 'set null' }),
    visibility: text('visibility').notNull().default('private'),
    license: text('license'),
    indexable: boolean('indexable').notNull().default(false),
    originDecisionId: uuid('origin_decision_id'),
    originArtifactId: uuid('origin_artifact_id'),
    publishedVersionId: uuid('published_version_id'),
    shareSlug: text('share_slug').unique(),
    skeletonHash: text('skeleton_hash'),
    moderationState: text('moderation_state').notNull().default('none'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('artifacts_user').on(t.userId)],
).enableRLS();

/** One immutable snapshot per edit (a trigger refuses UPDATE). Rows are deleted only with their artifact. */
export const artifactVersions = pgTable(
  'artifact_versions',
  {
    id: id(),
    artifactId: uuid('artifact_id')
      .notNull()
      .references((): AnyPgColumn => artifacts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    kind: text('kind', { enum: ARTIFACT_KINDS }).notNull(),
    toolId: text('tool_id').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [check('artifact_versions_kind', oneOf('kind', ARTIFACT_KINDS)), unique('artifact_versions_seq').on(t.artifactId, t.version)],
).enableRLS();

/**
 * Content-free product events, written by POST /v1/events. `id` is the
 * client's UUIDv7 and the idempotency key (`on conflict (id) do nothing`).
 * Monthly partitions wait for volume: a partitioned table needs `at` in its
 * primary key, which would break that conflict target.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey(),
    pid: uuid('pid').notNull(),
    type: text('type').notNull(),
    at: at('at').notNull(),
    props: jsonb('props').notNull().default(sql`'{}'::jsonb`),
    receivedAt: at('received_at').notNull().defaultNow(),
  },
  (t) => [index('events_pid').on(t.pid)],
).enableRLS();

/** Where a decision was made. Content-free: ids and enums only. */
export type DecisionContext = {
  toolId: string;
  hostApp: string | null;
  surface: (typeof SURFACES)[number];
  locale: string;
  cardVersion: string | null;
};
/** A chip the draft showed. Values and options come from the card or the user's own counts and memories. */
export type ShownChip = { slotId: string; value: string; source: string; kind: 'assumption' | 'pick'; options: string[] };
/** The user's flips: slot id -> the value picked and when (the latest flip per slot wins). */
export type ChosenChips = Record<string, { value: string; at: string }>;

/** One row per decision point (today: each forge draft). Outcome events update outcome, rating and chosen. */
export const decisions = pgTable(
  'decisions',
  {
    id: id(),
    pid: uuid('pid').notNull(),
    point: text('point').notNull(),
    sessionId: uuid('session_id'),
    context: jsonb('context').$type<DecisionContext>().notNull(),
    shown: jsonb('shown').$type<ShownChip[]>().notNull().default(sql`'[]'::jsonb`),
    chosen: jsonb('chosen').$type<ChosenChips>().notNull().default(sql`'{}'::jsonb`),
    outcome: text('outcome', { enum: OUTCOMES }),
    outcomeAt: at('outcome_at'),
    rating: text('rating'),
    ratedAt: at('rated_at'),
    policyVersion: text('policy_version').notNull(),
    createdAt: createdAt(),
  },
  (t) => [check('decisions_outcome', oneOf('outcome', OUTCOMES)), index('decisions_pid').on(t.pid, t.createdAt)],
).enableRLS();

/** Learned policy state per decision point: global when pid is null, else per user (bandit posteriors, Phase 3). */
export const policyState = pgTable(
  'policy_state',
  {
    id: id(),
    point: text('point').notNull(),
    pid: uuid('pid'),
    version: text('version').notNull(),
    state: jsonb('state').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('policy_state_point_pid').on(t.point, t.pid).nullsNotDistinct()],
).enableRLS();

/** Tool and family cards; catalog-sync is the only writer. */
export const catalogItems = pgTable(
  'catalog_items',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['tool', 'family'] }).notNull(),
    version: text('version').notNull(),
    card: jsonb('card').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [check('catalog_items_kind', oneOf('kind', ['tool', 'family']))],
).enableRLS();

/** Cited documentation chunks for coach Q&A, searched with Postgres full-text search. */
export const passages = pgTable(
  'passages',
  {
    id: id(),
    catalogItemId: text('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    sourceUrl: text('source_url').notNull(),
    heading: text('heading'),
    text: text('text').notNull(),
    search: tsvector('search').generatedAlwaysAs(sql`to_tsvector('english', coalesce(heading, '') || ' ' || text)`),
    createdAt: createdAt(),
  },
  (t) => [index('passages_search').using('gin', t.search), index('passages_item').on(t.catalogItemId)],
).enableRLS();

/** Daily meters per user (UTC day): forges, dictation seconds and model cost in micro-USD. */
export const usageCounters = pgTable(
  'usage_counters',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    metric: text('metric', { enum: USAGE_METRICS }).notNull(),
    value: bigint('value', { mode: 'number' }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day, t.metric] }), check('usage_metric', oneOf('metric', USAGE_METRICS))],
).enableRLS();

/** Billing state mirrored from Stripe webhooks (written once /webhooks/stripe lands). */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('stripe'),
    providerCustomerId: text('provider_customer_id'),
    providerSubscriptionId: text('provider_subscription_id').unique(),
    plan: text('plan').notNull(),
    status: text('status').notNull(),
    currentPeriodEnd: at('current_period_end'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('subscriptions_user').on(t.userId)],
).enableRLS();

/** Append-only and content-free (triggers refuse UPDATE, DELETE and TRUNCATE). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    pid: uuid('pid'),
    actor: text('actor', { enum: ['user', 'system', 'admin'] }).notNull(),
    action: text('action').notNull(),
    at: at('at').notNull().defaultNow(),
    detail: jsonb('detail').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [check('audit_actor', oneOf('actor', ['user', 'system', 'admin'])), index('audit_log_pid').on(t.pid, t.at)],
).enableRLS();

/** Append-only consent history; the latest entry per purpose wins. Rows go only with account erasure. */
export const consentLedger = pgTable(
  'consent_ledger',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    purpose: text('purpose', { enum: CONSENT_PURPOSES }).notNull(),
    granted: boolean('granted').notNull(),
    /** Version of the consent text the user saw. */
    version: text('version').notNull(),
    at: at('at').notNull().defaultNow(),
  },
  (t) => [check('consent_purpose', oneOf('purpose', CONSENT_PURPOSES)), index('consent_ledger_latest').on(t.userId, t.purpose, t.at)],
).enableRLS();

/** "Report this output": a reason code, the reported draft or artifact, and an optional short note. */
export const reports = pgTable(
  'reports',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    decisionId: uuid('decision_id'),
    artifactId: uuid('artifact_id'),
    reason: text('reason', { enum: REPORT_REASONS }).notNull(),
    note: text('note'),
    status: text('status').notNull().default('open'),
    createdAt: createdAt(),
  },
  (t) => [
    check('reports_reason', oneOf('reason', REPORT_REASONS)),
    check('reports_target', sql`${t.decisionId} is not null or ${t.artifactId} is not null`),
    check('reports_note_len', sql`char_length(${t.note}) <= 500`),
  ],
).enableRLS();

/**
 * L1 slot-count observations (blueprint §8), one row per signal; core folds
 * them into Dirichlet counts with decay. `event_id` makes an outcome event's
 * rows idempotent under retries.
 */
export const slotCounts = pgTable(
  'slot_counts',
  {
    id: id(),
    pid: uuid('pid').notNull(),
    toolId: text('tool_id').notNull(),
    slotId: text('slot_id').notNull(),
    value: text('value').notNull(),
    contextKey: text('context_key').notNull(),
    weight: real('weight').notNull(),
    at: at('at').notNull(),
    decisionId: uuid('decision_id'),
    eventId: uuid('event_id').unique(),
  },
  (t) => [index('slot_counts_pid').on(t.pid, t.at)],
).enableRLS();

/** Frecency rows (blueprint §9): which tool was used, from which host app and surface. */
export const toolUsage = pgTable(
  'tool_usage',
  {
    id: id(),
    pid: uuid('pid').notNull(),
    toolId: text('tool_id').notNull(),
    hostApp: text('host_app'),
    surface: text('surface', { enum: SURFACES }).notNull(),
    at: at('at').notNull(),
    eventId: uuid('event_id').unique(),
  },
  (t) => [check('tool_usage_surface', oneOf('surface', SURFACES)), index('tool_usage_pid').on(t.pid, t.at)],
).enableRLS();
