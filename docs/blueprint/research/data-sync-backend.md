# Backend, data and sync

Research lens for the PromptAI blueprint. Date: 2026-11-10.

**How this was researched.** This run's shared web-search quota was used up before this lens started. Every claim below therefore comes from three sources: direct fetches of official documentation, the GitHub API (license, stars, last push and archived flag, all checked 2026-11-10), and the npm registry. Anything I could not confirm that way is marked *unverified*.

## 1. Bottom line

- **Keep Postgres on Supabase as the single source of truth, and give it more jobs.** It already holds the app tables. It should also hold vectors, full-text search, durable workflow state (DBOS, per the agent-runtime lens) and the job queue.
- **Add exactly one new service: PowerSync.** It puts the same SQLite database on every client, keeps reads local and instant, queues writes while offline, and sends them through one validated upload endpoint.
- **Shrink the 92-route API to about 15 endpoints:** the sync upload endpoint, AI actions that stream over SSE, webhooks and a few public reads.
- **Run one Hono service in always-on containers and retire AWS** (Lambda and SSM).
- **Store learning signals in an append-only `events` table that records propensities**, so the prediction and RL lenses can evaluate policies offline from day one.

## 2. What the current backend tells us

Findings from reading the repository (read-only):

- **One huge route file.** `backend/src/handlers/routes.ts` has 2,623 lines and **92 routes**. About 30 are plain CRUD or catalog reads that a sync engine replaces.
- **No streaming.** `backend/src/index.ts` calls `await response.text()`, so every Lambda response is buffered. There is no SSE anywhere in `backend/src`.
- **Progress breaks with more than one instance.** `SessionProgress.ts` keeps it in an in-memory `Map` that clients poll, and the file notes this fails across instances.
- **Rate limiting writes to the database on every request.** `rateLimit.ts` upserts one Postgres row per call.
- **Migrations are fragile.** There are 22 files with duplicate `015_*` and `016_*` prefixes. Migration 009 promised a follow-up that never ran because the 010 slot was reused, so saves failed a NOT NULL constraint until 021. The runner has no checksums.
- **Identity types are inconsistent.** `app_users.id` is `uuid`, but `team_members`, `prompt_tests`, `workflows` and `rate_limits` use `text` user ids, and `teams.owner_id` has no foreign key.
- **No row-level security (RLS).** Tenant isolation lives only in app code. The admin-grant isolation in `012` is good and worth keeping.
- **The vector index is wrong.** IVFFlat on an empty `vector(1536)` table, although the pgvector README says to "Create the index *after* the table has some data". HNSW needs no training data.
- **The ciphertext overstates the protection.** `web/src/lib/crypto.ts` wraps a per-user AES-GCM data key with a PBKDF2-derived key. But the [P] class in `docs/data-classification.md` says the pipeline reads plaintext on the server. So the ciphertext protects database dumps and admin reads, not the running server. `prompt_versions` also stores both plaintext `nodes_json` and `content_ciphertext`.
- **Three clouds.** AWS runs Lambda and SSM, Supabase runs Postgres and Auth, and Cloudflare runs Pages. The R2 and KV settings in `config/env.ts` are "not consumed yet".
- **Product jobs run from CI.** The PKB crawl is a GitHub Actions cron. Retention, outcome analysis and model refresh are manual npm scripts.

| Keep | Change | Drop |
|---|---|---|
| Postgres + pgvector on Supabase | Migrations: move to Drizzle Kit, with a CI check for ordering and drift | Custom `migrate.ts` runner and numbered filenames |
| Supabase Auth, with JWT checks pinned to ES256 through JWKS (`auth.ts`) | IVFFlat → HNSW on `halfvec`, plus full-text search for hybrid retrieval | Duplicated `nodes_json` and `content_ciphertext` |
| Hono and zod | `routes.ts` → modules; about 15 endpoints | About 30 CRUD routes, and the 501 stubs `/auth/signup`, `/auth/login`, `/appeal` |
| Append-only `audit_log` with UPDATE/DELETE revoked | `text` user ids → `uuid` foreign keys everywhere; add RLS | In-memory progress map and status polling |
| Admin grants that exclude content tables | Rate limits off Postgres; monthly budgets stay in Postgres | Lambda adapter, AWS SSM, AWS deploy workflows |
| Stripe `billing_events` idempotency; revocable `share_links` slugs; `feature_flags` | Encryption becomes a per-table policy (section 8) | Mandatory passphrase E2EE for everything |

## 3. Requirements that decide the choice

1. **Every surface:** web, Tauri 2 desktop and Capacitor 8 mobile (the platform lens's picks), plus native Swift and Kotlin extension targets.
2. **Offline writes,** so dictation captures and edits on the move are never lost.
3. **Data mostly has one owner.** Conflicts are rare and only between one person's devices. Sharing comes later and is mostly read.
4. **AI actions stream tokens,** and their results must reach every device.
5. **Learning needs an append-only log** with logged propensities.
6. **The team is 1–3 engineers,** so few services and boring technology.

## 4. Sync engines compared

| Option | Offline writes | Clients that matter to us | License, status (checked 2026-11-10) | Verdict |
|---|---|---|---|---|
| **PowerSync** | Yes. Local writes go to a FIFO upload queue, and your `uploadData()` sends them to your API with automatic retry | Web, Capacitor (beta, `@powersync/capacitor` 0.10.1), Tauri (alpha, plugin 0.0.6), Swift, Kotlin, React Native, Node, Flutter, .NET, Rust | Service changed **from FSL to Apache-2.0 on 2026-11-03** (commit #878). v1.28.x, pushed today. Cloud tiers: Free (50 peak clients, deactivated after a week idle) and Pro from $49 | **Adopt** |
| Electric + TanStack DB | Through TanStack DB offline transactions. Writes go through your API; Electric is read-path only | Any HTTP client. TanStack DB ships Tauri SQLite persistence | Apache-2.0. Electric **joined Databricks (Aug 2026)** and now calls itself "the first agent platform built on sync". TanStack DB is at 1.0 RC | Runner-up, assess |
| Zero (Rocicorp) | **No.** "Zero does not support offline writes" | React, Solid, React Native | Apache-2.0, GA since March 2026, v1.11.5. Also needs a long-running `zero-cache` | Avoid for us |
| LiveStore *(non-obvious)* | Yes, event-sourced: events are materialized into SQLite | Web, Expo, Electron, Tauri, Node, Durable Objects. No Swift or Kotlin | Apache-2.0, v0.5.0 | Assess. The event-log model suits learning, but it is pre-1.0 and JS-only |
| A Cloudflare Durable Object per user (Agents SDK) *(non-obvious)* | Custom protocol | WebSocket clients. No native SDK | SDK MIT, runtime proprietary. 10 GB of SQLite per object | Assess later, for per-user live agents |
| Turso Sync *(non-obvious)* | Yes: push/pull, "last push wins" | Docs show TypeScript, Python and Go | MIT, 0.8.x (pre-1.0) | Assess |
| Our own HLC changes feed (the memory lens's design) | Yes | Any | Our code | **Fallback** if PowerSync fails its pilot |
Also checked and rejected:

- **Jazz 2:** MIT, but alpha.
- **InstantDB:** Apache-2.0, but "sunsetting" (services end August 31, 2027).
- **Triplit:** **AGPL-3.0**, last push January 2026.
- **Convex:** self-hosted backend is **FSL-1.1-Apache-2.0**, not OSI.
- **Firestore:** proprietary NoSQL; we would lose Postgres.
- **PocketBase:** GitHub repo archived, pre-1.0, single-node.
- **Yjs, Loro, Automerge (all MIT):** keep these for later co-editing of a single document.

**Why PowerSync wins:**

- **Only engine with SDKs for every surface we ship.** The web SDK also works inside Tauri and Capacitor webviews as a fallback.
- **Offline writes are built in,** and they go through our own endpoint, so validation and authorization live in one place.
- **Postgres stays the system of record,** and the Supabase integration is documented.
- **The license risk is gone** after the move to Apache-2.0.

Electric is the runner-up, but its focus moved to agents after the Databricks deal. Zero fails the offline-write requirement.

## 5. The other layers

| Layer | Compared | Pick | Why |
|---|---|---|---|
| Database | Supabase Postgres (today), Neon (now Databricks), SQLite-only | **Supabase Postgres** | Already wired in. Postgres, Auth and Storage from one vendor; Pro from $25/month. |
| Backend platform | Supabase, Convex, Firebase, Appwrite, PocketBase | **Supabase as infrastructure only**, with no business logic in Edge Functions | Keeps one codebase. Appwrite would duplicate Supabase. |
| API style | Hono RPC, `@hono/zod-openapi`, oRPC, tRPC, GraphQL | **Hono + `@hono/zod-openapi` (1.6.3), SSE for streams** | OpenAPI generates the Swift and Kotlin clients. tRPC clients are TypeScript-only, and GraphQL is unneeded once reads are local. Hono's docs warn RPC types slow down with many routes. Trial oRPC (MIT) if we want contract-first. |
| Auth | Supabase Auth, Better Auth (MIT, 1.7.20), Clerk | **Keep Supabase Auth** | No migration, and PowerSync accepts its JWTs. Its overview page doesn't list passkeys (*unverified*). If passkeys are needed, trial Better Auth: SimpleWebAuthn passkey plugin, Expo client. |
| Runtime | Lambda, Cloudflare Workers + Hyperdrive + Workflows, containers | **One Hono container service on Fly.io or Railway** (*pricing unverified*) | DBOS needs a long-lived process (agent-runtime lens). Containers allow long SSE streams without Workers' Node gaps or Workflow/Durable Object lock-in. |
| Queues, cron | DBOS, pg-boss, Graphile Worker, pgmq/pg_cron, Cloudflare Queues, Inngest, Trigger.dev | **DBOS queues and schedules** (MIT), plus `pg_cron` for SQL retention | No new service. Inngest's server is **SSPL**. |
| Vector search | pgvector, pgvectorscale, ParadeDB, a separate vector DB, sqlite-vec | **pgvector HNSW on `halfvec`** with `hnsw.iterative_scan`, plus `tsvector`, merged with Reciprocal Rank Fusion | No new store. ParadeDB is **AGPL**; sqlite-vec is alpha. On device, brute-force cosine is enough. |
| Migrations | Plain SQL, Drizzle Kit, Atlas | **Drizzle Kit** (Apache-2.0) | Journaled SQL from a TypeScript schema stops ordering bugs. The same schema feeds the zod contracts and the PowerSync client schema. |
| Monorepo | pnpm + Turborepo, Nx | **pnpm workspaces + Turborepo** (MIT) | Each app has its own npm lockfile today. Nx is more than this team needs. |
| Blobs | Supabase Storage, R2 | **Supabase Storage** for short-lived audio | One fewer vendor. |
| BYOK secrets | AWS SSM, envelope encryption | **AES-GCM envelope encryption** in Postgres, with a platform-secret KEK and a `key_version` column | Removes AWS. Keys are never synced. |

## 6. Recommended stack

```
Clients: web · Tauri desktop · Capacitor iOS/Android · Swift/Kotlin extension targets
  SQLite via the PowerSync SDK: local reads, works offline
    ├─ upload queue ──► POST /v1/sync/upload (Hono) ──► Postgres
    └─ sync streams ◄── PowerSync Service ◄── logical replication ◄── Postgres
  Online AI actions ──► Hono SSE endpoints ──► DBOS workflows ──► Postgres ──► (sync) every device
Postgres (Supabase): app tables · RLS · pgvector + tsvector · DBOS state · audit · events
Supabase Auth (ES256 JWKS): verified by both Hono and PowerSync
Supabase Storage: short-lived audio · PowerSync Cloud Pro → self-hosted Open Edition later
```

## 7. Data model sketch

All ids are client-generated UUIDv7, so rows can be created offline. Every synced table carries `user_id uuid references users`, `updated_at` (stamped by the server) and `deleted_at` (a tombstone) unless noted.

```sql
-- GLOBAL: read-only to clients, synced to everyone
tools(id text pk, name, category, modalities text[], docs_url, capabilities jsonb, version int)
tool_models(id, tool_id fk, model_id, context_window int, pricing jsonb, strengths text[], verified_at)
playbooks(id, tool_id, kind /*template|lesson|workflow*/, title, body jsonb,
          variables jsonb, author_id null, status /*draft|published*/, version int)

-- PERSONAL: synced to the owner's devices
profiles(user_id pk, display_name, locale, occupation, goals jsonb, prefs jsonb)
vocabulary(id, user_id, term, hint, source /*user|learned*/)      -- fed into dictation prompts
projects(id, user_id, team_id null, name, description, default_tool_id)
threads(id, user_id, project_id, tool_id, title, intent jsonb, status)
messages(id, thread_id, user_id, role, kind /*idea|question|answer|draft|critique*/,
         content jsonb, e2ee bool)                                -- append-only
artifacts(id, user_id, thread_id, tool_id, title, head_version_id, tags text[])
artifact_versions(id, artifact_id, user_id, parent_id, nodes jsonb, text, variables jsonb,
                  scores jsonb, author /*user|agent*/, e2ee bool) -- immutable; branches allowed
captures(id, user_id, device_id, kind /*voice|text|clip*/, attachment_id, transcript,
         status /*queued|transcribing|done|failed*/)
memories(id, user_id, scope, body_cipher, kind, status, source, confidence) -- E2EE, per memory lens
runs(id, artifact_version_id, user_id, model_id, status, output jsonb, latency_ms, cost_usd) -- server-written
suggestions(id, user_id, kind, payload jsonb, policy_id, propensity real,
            status /*shown|accepted|dismissed|expired*/, expires_at) -- server-written; client sets status only
events(id uuid7, user_id, device_id, type, subject_id, context jsonb, value real,
       client_ts, server_ts)                    -- insert-only, upload-only, monthly partitions

-- SERVER-ONLY: not in the publication, never synced
kb_chunks(id, tool_id, content, tsv tsvector, embedding halfvec(768), source_url, trust real)
artifact_embeddings(version_id pk, user_id, embedding halfvec(768))  -- skipped when e2ee
provider_keys(id, user_id, provider, key_cipher, key_version, status)
policy_state(user_id, policy_id, params jsonb)   -- bandit and ranker parameters
usage_events, audit_log, safety_decisions, billing_events, feature_flags, teams, team_members
```

Three choices here matter more than the rest:

- **Immutable versions with a moving head pointer.** Two offline edits become two branches rather than a conflict. That suits a product built around evolving prompts.
- **`suggestions` stores `policy_id` and `propensity`.** The learning and prediction lenses need these for offline (off-policy) evaluation.
- **`events` is insert-only.** It syncs without conflicts, including signals captured offline.

The 768-dimension embedding size is a placeholder for the model-gateway lens to confirm.

## 8. Sync strategy

**Three streams.** The syntax below is illustrative; check it against the current Sync Streams docs.

1. **`catalog`** (auto-subscribed): `tools`, `tool_models`, published `playbooks`. A few MB, identical for everyone.
2. **`mine`** (auto-subscribed): personal tables filtered by `user_id = auth.user_id()`, with `threads` and `messages` limited to the last 90 days.
3. **`thread`** (on demand, parameter `thread_id`): older history, loaded when it is opened. This keeps first sync small on phones.

**Write rules, enforced in `POST /v1/sync/upload`** with the shared zod schemas:

| Table class | Rule |
|---|---|
| Profile, project and thread fields | Last writer wins on each field, ordered by when the server receives them |
| `messages`, `artifact_versions`, `events` | Insert only; updates are rejected |
| `runs`, `suggestions`, `captures.transcript` | Written by the server. Clients may change only `status` |
| Teams | Membership changes are validated against the owner's role |

**Never jam the queue.** PowerSync's upload queue is FIFO and blocking. If the server keeps answering a bad operation with an error, every later write on that device stalls. So the endpoint must be idempotent on `(client_id, op_id)` and must accept-and-record invalid operations into a `rejected_ops` table, returning 2xx. It must not fail them forever. This puts the owner's "never stuck in a loop" rule into the data layer.

**AI actions.** Online, the client calls an SSE endpoint. A DBOS workflow saves the result, which then syncs to every device, even if the client disconnected mid-stream. Offline, the client inserts a `pending` message that a DBOS job picks up after upload. Dictation works the same way: audio is queued with PowerSync's attachment helpers (alpha), uploaded through a signed URL, and transcribed by a job, and the transcript syncs back.

**Encryption is set per table.**

- **End-to-end encrypted:** `memories` (ranked on the device, per the memory lens) and any row the user marks private (`e2ee=true`). These rows get no server-side embeddings or personalization, and the UI says so.
- **Server-readable:** everything else, protected by RLS, disk encryption and the `012` admin grants. The server already reads plaintext on every LLM call, so this states the guarantee honestly rather than weakening it.

**Clients.**

- **Web and Tauri:** the PowerSync web SDK.
- **Capacitor:** the PowerSync Capacitor SDK, behind the platform lens's `platform.store` port.
- **Swift and Kotlin extensions:** read the shared database where OS storage allows it (*unverified*). Otherwise they call the API.
- **Browser extension:** stays a thin API client with no sync.

## 9. Migration path

| Phase | Work | Verify |
|---|---|---|
| 0. Hygiene (week 1) | Set up pnpm + Turborepo. Port the schema into Drizzle as a new `app` Postgres schema with uuid foreign keys and RLS. Use HNSW indexes. | `drizzle-kit check` is clean in CI. RLS tests show one user cannot read another's rows. |
| 1. Container (week 2) | Package the existing Hono app as a container. Add SSE to `/draft` and `/enhance`. Replace the progress map with a DBOS workflow status. | `/draft` streams first tokens. Status survives two replicas. |
| 2. Sync pilot (weeks 3–4) | Set up PowerSync Cloud on Supabase (a `powersync` role and publication on `app.*` only), add `/v1/sync/upload`, and move the web client's projects, artifacts and events onto it. | Edit offline in two tabs, reconnect, and both converge. A poison op lands in `rejected_ops` without blocking the queue. |
| 3. Data move | Copy plaintext and metadata rows server-side. Ciphertext the server cannot read: on the user's next unlock, the web client decrypts it locally and rewrites it through sync. Keep v1 tables read-only for 90 days, then delete them under the retention policy. Users can still use `GET /export` before that. | Row counts reconcile for each user. Rewrites are counted per user. |
| 4. Retire AWS | Move BYOK keys out of SSM into envelope-encrypted `provider_keys` (decrypt once and re-wrap). Delete the Lambda, SSM and deploy workflows. Move the GitHub cron jobs to DBOS schedules. | No AWS calls in the logs for 14 days. |
| 5. Every surface | Add sync to Tauri and Capacitor. Delete the roughly 30 CRUD routes they replaced. | Contract tests pass against the OpenAPI spec. `routes.ts` is gone. |
| 6. Later, only if needed | Self-host PowerSync (Apache-2.0) when Cloud cost or limits bite. Add teams streams, and Yjs/Loro for co-editing one document. | n/a |

## 10. What not to build

- Our own sync engine or a CRDT layer for entity data. Keep the HLC feed only as the fallback.
- A separate vector database, a graph database or a search cluster.
- GraphQL, tRPC or microservices. Run one modular Hono monolith plus one sync service.
- Full sync inside the browser extension.
- Server-side business logic in Supabase Edge Functions; it would split the codebase in two.
- Audio blobs in Postgres, or synced embeddings.
- Self-hosting PowerSync on day one.
- Adopting Zero, InstantDB, Triplit, Jazz 2, Convex or PocketBase in their current state.

## 11. Risks and open questions

- **SDK maturity.** PowerSync's Capacitor SDK is beta, and its Tauri SDK and attachment helpers are alpha. Mitigate with the web SDK fallback, the `platform.store` port and a two-week pilot gate.
- **License history.** PowerSync relicensed only a week ago, so pin versions.
- **Idle free tiers.** PowerSync Free and Supabase Free both deactivate or pause after a week idle, so production needs Pro on both.
- **Container host.** Fly.io and Railway pricing is *unverified*. Pick a region close to Supabase.
- **Passkeys.** Supabase Auth passkey support is *unverified*.
- **E2EE scope.** Confirm it with the privacy and memory lenses, including passphrase versus passkey-wrapped keys.
- **Extension storage.** Whether iOS keyboard and share extensions can safely share the app's SQLite file is *unverified*.

## Sources

- https://zero.rocicorp.dev/docs/status
- https://zero.rocicorp.dev/docs/offline
- https://zero.rocicorp.dev/llms.txt
- https://electric.ax/
- https://electric-sql.com/blog/2026/08/11/electric-joining-databricks
- https://electric-sql.com/blog/2026/03/25/tanstack-db-0.6-app-ready-with-persistence-and-includes
- https://tanstack.com/db/latest/docs/overview
- https://docs.powersync.com/intro/powersync-overview
- https://docs.powersync.com/architecture/client-architecture
- https://docs.powersync.com/usage/sync-streams
- https://docs.powersync.com/integration-guides/supabase-+-powersync
- https://docs.powersync.com/usage/use-case-examples/attachments-files
- https://docs.powersync.com/maintenance-ops/self-hosting/overview
- https://www.powersync.com/pricing
- https://github.com/powersync-ja/powersync-service
- https://github.com/powersync-ja/powersync-js
- https://docs.livestore.dev/
- https://docs.turso.tech/sync/usage
- https://www.instantdb.com/
- https://www.instantdb.com/docs
- https://jazz.tools/
- https://github.com/aspen-cloud/triplit
- https://github.com/pocketbase/pocketbase
- https://github.com/get-convex/convex-backend
- https://developers.cloudflare.com/agents/
- https://developers.cloudflare.com/durable-objects/platform/limits/
- https://developers.cloudflare.com/workflows/
- https://developers.cloudflare.com/hyperdrive/
- https://supabase.com/pricing
- https://supabase.com/docs/guides/auth
- https://www.better-auth.com/docs/introduction
- https://www.better-auth.com/docs/integrations/expo
- https://www.better-auth.com/docs/plugins/passkey
- https://github.com/pgvector/pgvector
- https://hono.dev/docs/guides/rpc
- https://orpc.dev/docs/openapi/getting-started
- https://github.com/honojs/middleware
- https://github.com/drizzle-team/drizzle-orm
- https://github.com/dbos-inc/dbos-transact-ts
- https://github.com/vercel/turborepo
- https://github.com/asg017/sqlite-vec
- https://github.com/paradedb/paradedb
- https://github.com/inngest/inngest
- https://github.com/rocicorp/mono
- https://github.com/livestorejs/livestore
- https://github.com/tursodatabase/turso
