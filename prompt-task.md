# prompt-task.md — Outsourceable Task Prompts (Phase 3 → Phase 8 + TA additions)

> **Purpose:** every remaining task in `task.md` (Phases 3–8, plus the TA feature additions), rewritten as a fully self-contained prompt that an OSS coding model can execute **cold** — no access to prior conversations, no assumed context.
>
> **How to use:** for each job, feed the model **(1) the GLOBAL CONTEXT BLOCK below, verbatim, then (2) the single task prompt** (the `P-Txx` section). One task per run. Do not feed multiple task prompts at once. If a task lists "Depends on", confirm those tasks are done first (check `task.md` checkboxes).
>
> **Ground rules for the executing model:** follow the steps in order; when a step conflicts with something you find in the repo, STOP and report the conflict instead of improvising; never invent file paths — every path you need is given; run the verification commands at the end and paste their output in your report.

---

# GLOBAL CONTEXT BLOCK (prepend to every task prompt)

> **⚠️ SUPERSEDED 2026-07-11 (F0.4).** This Global Context Block predates Phases 4–8 and is now stale: it claims `web/`, `extension/`, `admin/` "DO NOT EXIST YET" (they all exist) and cites 24 suites / 160 tests (now 44 suites / 328 tests). It is kept **for historical reference only** — do not use it to brief new work. **For all current/final-phase work use the Global Context Block v2 in `final-task-prompt.md`.** The task prompts below (P-T3.x … P-T8.x, P-TA.x) remain accurate for the individual tasks they describe.

## What this project is

PromptForge (placeholder brand) is a **reverse-prompting assistant**: the user types a rough idea ("an image of a horse running"), and the system interviews them briefly, then drafts an *excellent*, platform-tailored prompt (for Midjourney, ChatGPT, Claude, Gemini, Stable Diffusion, etc.), scores it against an 8-dimension quality rubric (0–100 "strength score"), explains why it works, and lets the user edit it node-by-node. It ships as a web app, a browser extension, and later a macOS app.

The authoritative design document is `prompt-assistant-technical-architecture.md` (repo root, ~2000 lines, referenced as "§N" throughout). The authoritative task sequence is `task.md`. Design artifacts live in `docs/` (quality rubric, clarification taxonomy, data model, admin roles, acceptable-use policy, feature additions v0.7).

## Tech stack & infrastructure (all live)

- **Language:** TypeScript everywhere. Strict mode, `noUncheckedIndexedAccess: true`.
- **Backend:** a single AWS Lambda ("Lambdalith") running a **Hono** router. Local dev runs the same app via `@hono/node-server` on port 3001. Entry: `backend/src/index.ts` (exports `app` for local + `handler()` for Lambda/API-Gateway events).
- **Database:** Supabase Postgres with **pgvector** (17 tables, migrations in `backend/migrations/*.sql`, runner `npm run migrate`). Connect via `DATABASE_URL` in `backend/.env` — it points at Supabase's **shared pooler** (do NOT switch to the direct `db.<ref>.supabase.co` host; it has DNS issues from dev machines).
- **Auth:** Supabase Auth. JWTs are **ES256**, verified against JWKS at `SUPABASE_JWKS_URL` (`.../auth/v1/.well-known/jwks.json`) in `backend/src/middleware/auth.ts`. `DEV_AUTH_BYPASS=true` (env) bypasses auth locally with user id `dev-user-000` (NOT a valid DB uuid — DB writes gracefully skip for it).
- **LLM providers (chat):** default is **Groq** (OpenAI-compatible, `GROQ_API_KEY`/`GROQ_BASE_URL` in env): `llama-3.1-8b-instant` (small tier) and `llama-3.3-70b-versatile` (large tier). Alternates registered: Cerebras (`cerebras`), OpenCode Zen (`opencode_zen`). Routing lives in `config/model-routing.json` — **model changes are config edits, never code**.
- **Embeddings:** Google Gemini `gemini-embedding-001` at 1536 dims (`GEMINI_API_KEY`), adapter L2-normalizes (Google doesn't at non-default dims). Matches the `vector(1536)` DB columns.
- **Cloud:** AWS Lambda `PromptAI` behind **API Gateway** `https://qsfu5lcqt2.execute-api.us-east-1.amazonaws.com` (Function URLs are org-blocked on this AWS account — do not use them). Cloudflare R2 bucket `promptforge-blobs` + KV namespace `promptforge-registry` exist (credentials in env, no app code uses them yet). Cloudflare Pages not yet created.
- **Testing:** Jest + ts-jest. `backend/tests/` mirrors `src/`. `tests/setup.ts` presets `DEV_AUTH_BYPASS=true`, `NODE_ENV=test`, and dummy provider API keys. Tests always mock `global.fetch` — **no test may make a real network call**.

## Repo layout (actual, current)

```
Prompt AI 2026/
├── prompt-assistant-technical-architecture.md   # the spec (§ references)
├── task.md                                      # task plan with status
├── prompt-task.md                               # this file
├── docs/                                        # design docs incl. quality-rubric.md, clarification-taxonomy.md,
│                                                #   data-model.md, admin-roles.md, feature-additions-v0.7.md
├── config/                                      # runtime config (repo root, NOT inside backend/)
│   ├── platform-registry.json                   # 9 platforms (§5.1)
│   ├── model-routing.json                       # {pipeline_step, complexity} → {provider, model_id}
│   ├── model-capabilities.json                  # Model Capability Matrix (§15.1)
│   ├── strategy-profiles.json                   # per-task-type drafting strategies (§10.3)
│   ├── clarification-questions.json             # clarification taxonomy as config (§11)
│   └── pkb-seed.json                            # 64 curated knowledge chunks (§6)
├── backend/
│   ├── src/
│   │   ├── agents/          # IntentClassificationAgent, DocRetrievalAgent, ClarifyingQuestionAgent,
│   │   │                    #   DraftingAgent, CriticAgent, MemoryExtractionAgent, draftShared.ts,
│   │   │                    #   placeholders.ts (AlternativesAgent still placeholder), index.ts
│   │   ├── guardrails/      # ContentSafetyClassifier.ts, TokenGovernor.ts
│   │   ├── services/        # Supervisor.ts (state machine), PKBService, PlatformService, ModelRouter,
│   │   │                    #   PromptSerializer, ResponseDesign, SessionService, RecommendationService,
│   │   │                    #   TokenOptimizationAdvisor, providers/ (adapters + openAICompatible.ts + index.ts)
│   │   ├── handlers/routes.ts   # ALL HTTP routes
│   │   ├── middleware/      # auth.ts, rateLimit.ts (in-memory), errorHandler.ts, logging.ts
│   │   ├── types/           # Agent.ts (PipelineContext), Prompt.ts (nodes/rubric), Platform.ts, Safety.ts,
│   │   │                    #   Provider.ts, Recommendation.ts, Response.ts, Http.ts
│   │   ├── utils/           # logger.ts (pino), db.ts (lazy pg Pool + setPoolForTesting), json.ts (extractJson)
│   │   ├── config/          # env.ts (Zod-validated), safety-patterns.ts
│   │   ├── scripts/         # migrate.ts, seed-registry.ts, seed-pkb.ts, smoke-intent.ts
│   │   └── index.ts
│   ├── migrations/          # 001_initial_schema.sql, 002_knowledge_base.sql, 003_safety_and_metering.sql
│   ├── tests/               # 24 suites / 160 tests, all green
│   └── package.json         # deps: hono, @hono/node-server, @supabase/supabase-js, zod, pino, jose, pg
├── web/                     # DOES NOT EXIST YET (Phase 4 creates it)
├── extension/               # DOES NOT EXIST YET (Phase 5 creates it)
├── admin/                   # DOES NOT EXIST YET (Phase 7 creates it)
└── .github/workflows/ci.yml # typecheck + gitleaks + test
```

## Existing HTTP API (all under the authed group unless noted)

- `GET /health` (public) → `{ok:true}` · `GET /platforms` (public) → registry
- `POST /draft` `{platform_id, idea, just_generate?}` → either `{status:'clarifying', session_id, questions[]}` (paused) or `{status:'ok', final_state:'ready_for_review', response: DesignedResponse, draft, pipeline_trace}`
- `POST /draft/:sessionId/clarify` `{platform_id, idea, clarifications{}, just_generate?}` → resumes the session
- `POST /recommend` `{modality, prioritizeQuality?, prioritizeCost?, prioritizeLatency?, minContextWindow?, desiredStrengths?}` → ranked models with trade-offs
- `POST /optimize` `{text, platform_id?, has_pdf_attachment?}` → token-reduction suggestions
- Stubs returning 501/200-empty: `POST /auth/signup`, `POST /auth/login`, `GET/POST /projects`, `GET /library`, `POST /feedback`, `POST /appeal`

## The pipeline (what happens on POST /draft)

`Supervisor` state machine (§7.2): `created → context_resolved → [safety gate 1] → intent_classified → docs_retrieved → clarifying → (awaiting_clarification pause if questions & !just_generate) → drafting → [safety gate 2] → critiqued → alternatives_attached → governed → ready_for_review`. Agents implement `Agent {name, execute(AgentInput): Promise<AgentOutput>}` (§32.2); only the Supervisor mutates `PipelineContext` (via its `applyOutput` merge). Session metadata + per-step token usage persist best-effort via `SessionService` (metadata ONLY — never prompt content).

## NON-NEGOTIABLE ENGINEERING RULES (violating any of these fails the task)

1. **Dependency flow is one-way:** `handlers → services → agents/guardrails → utils/types`. No circular imports. Agents never import provider SDKs or `ModelRouter` — they call `generate(pipelineStep, complexity, request)` from `services/providers`.
2. **Config over code (§32.3):** anything tunable lives in `backend/src/config/env.ts` (Zod-validated env) or a JSON file in repo-root `config/`. Never hardcode thresholds, model ids, or platform data.
3. **Privacy (§19.1):** NEVER log prompt content, clarification text, memory statements, or keys. Log ids, counts, categories, durations, token counts. The DB stores content ONLY in `*_ciphertext` columns (encryption arrives in T7.1) — until then the server is content-stateless: metadata only.
4. **Safety fails closed (§33.7):** if the safety classifier errors, generation is refused, not skipped.
5. **LLM agents never throw:** provider outage → graceful `{status:'failure'}` (or `partial` where the pipeline should continue degraded). Malformed model output → retry once → graceful failure. Parse LLM JSON with `utils/json.ts extractJson` (tolerant). Budget `maxTokens` generously (≥2000) — some routed models are reasoning models whose hidden tokens count against the cap; `generate()` auto-retries once at 2× on truncation.
6. **Minimal dependencies:** adding an npm package requires written justification in the PR/report. Prefer node built-ins and existing deps.
7. **Migrations:** every schema change is a new numbered SQL file in `backend/migrations/` (next: `004_...`), idempotent (`create table if not exists`, `alter ... if not exists` patterns), applied by `npm run migrate`.
8. **Tests:** every new service/agent/route gets unit tests; changed behavior gets updated tests; `npm test` and `npm run typecheck` must both pass with zero failures before you report done. Tests mock `fetch` and use `setPoolForTesting` from `utils/db.ts` for DB.
9. **Secrets:** live in `backend/.env` (gitignored) — never commit values, never print them in reports. Reference by key name only.
10. **Style:** match the existing code — pino structured logging via `logger`, JSDoc headers citing the spec section, 2-space indent, named exports.

## Commands

```bash
cd backend
npm run typecheck        # must be clean
npm test                 # must be all green (currently 24 suites / 160 tests)
npm run build            # tsc → dist/
npm run dev              # build + serve on :3001
npm run migrate          # apply pending migrations (needs DATABASE_URL)
npm run seed:registry    # sync config/platform-registry.json → platforms table
npm run seed:pkb         # embed + upsert config/pkb-seed.json → knowledge_chunks (needs GEMINI_API_KEY)
# local server with auth bypassed, for manual curl testing:
set -a && source .env && set +a && DEV_AUTH_BYPASS=true node dist/index.js
# deploy (manual until T3.6):
npm run build && cd .. && zip -r /tmp/lambda.zip backend/dist backend/node_modules config -x '*.map' \
  && aws lambda update-function-code --function-name PromptAI --zip-file fileb:///tmp/lambda.zip --region us-east-1
```

## Definition of Done (every task)

`tsc` clean · tests written and passing · no secrets in code · structured logging present (no content) · follows folder structure & dependency flow · spec section cited in code comments · task.md checkbox updated with a dated status note · report includes verification-command output.

---
---

# PHASE 3 — PRODUCTION HARDENING

---

## P-T3.1 — Immutable audit logging & per-session observability (§27.1, §22.3, §31.4 Step 21)

### Objective
Make every significant event (pipeline transitions, safety decisions, auth failures, admin-relevant actions) land in an **append-only** `audit_log` table so an engineer can reconstruct any session end-to-end from stored data alone — and expose that reconstruction as an endpoint.

### Read first
`backend/src/services/Supervisor.ts` (transitions are already logged to pino), `backend/src/guardrails/ContentSafetyClassifier.ts` (safety decisions logged), `backend/migrations/003_safety_and_metering.sql` (the `audit_log` table already exists: `id, actor, action, status, detail jsonb, created_at`), `backend/src/services/SessionService.ts` (the best-effort DB-write pattern to copy), `backend/src/utils/db.ts`.

### Steps
1. Create `backend/src/services/AuditService.ts`:
   - Export `async function audit(event: {actor: string; action: string; status: 'success'|'failure'|'blocked'; sessionId?: string; detail?: Record<string, unknown>}): Promise<void>`.
   - It INSERTs into `audit_log` via `getPool()`. `detail` must be pre-sanitized by the caller — add a runtime guard: reject (log a warning, strip the key) any `detail` value longer than 500 chars, as a defense against accidental content logging.
   - Best-effort: wrap in try/catch; on failure log `{type:'audit:write_skipped', reason}` via pino and return — an audit outage must never fail a user request. (Mirror the pattern in `SessionService.ts`.)
2. Wire it in (fire-and-forget `void audit(...)` so latency is unaffected):
   - `Supervisor.transition()` → action `pipeline:transition`, detail `{from, to, agent, durationMs, tokensUsed}`, actor = userId.
   - `classifyOrFailClosed` (or its call sites in Supervisor) → action `safety:decision`, detail `{decision, category, confidence, failedClosed, classifierVersion}`.
   - `middleware/auth.ts` → on failed verification, action `auth:rejected`, actor `'anonymous'`, detail `{reason}` (reason strings only — never the token).
3. Add `GET /sessions/:sessionId/trace` to `backend/src/handlers/routes.ts` (authed): SELECT audit rows + the `sessions` metadata row + `usage_events` rows for that session id, **filtered to `actor = current userId`** (a user may only trace their own sessions), ordered by `created_at`. Return `{session, events[], usage[]}`.
4. Migration `backend/migrations/004_audit_immutability.sql`:
   - `revoke update, delete on audit_log from public;` plus a comment documenting that the app role must have only INSERT/SELECT. Guard with idempotent DO blocks so re-running is safe.
   - Add index `create index if not exists idx_audit_session on audit_log ((detail->>'sessionId'), created_at);` — but prefer adding a real `session_id uuid` column (`alter table audit_log add column if not exists session_id uuid;`) and index that instead; write to it from AuditService.
5. Tests (`backend/tests/services/AuditService.test.ts` + extend the integration test):
   - audit() inserts the expected row shape (fake pool via `setPoolForTesting`).
   - audit() swallows DB failure (pool.query rejects → no throw).
   - Long detail values are stripped.
   - `GET /sessions/:id/trace` returns rows only for the requesting user (fake pool returning rows; assert the SQL params include the userId).

### Do NOT
- Do not log or store prompt text, idea text, clarification answers, or assembled prompts anywhere in audit rows.
- Do not make audit writes synchronous blockers on the request path.
- Do not grant UPDATE/DELETE to any role on `audit_log`.

### Acceptance criteria
- Running a local `/draft` (with a real DB user) produces audit rows for every transition + both safety gates, and `GET /sessions/:id/trace` reconstructs the run in order.
- `npm test` + `npm run typecheck` green; new tests present.
- Migration 004 applies cleanly on a fresh run of `npm run migrate` (it must be a no-op the second time).

### Verify with
```bash
cd backend && npm run typecheck && npm test
npm run migrate   # twice; second run must report 0 newly applied or apply idempotently
```

---

## P-T3.2 — Rate limiting & token-budget enforcement in Postgres (§16, §22.4, §31.4 Step 22)

### Objective
Enforce per-user **monthly token budgets** (checked BEFORE any model call) and move rate limiting from in-memory to Postgres so limits hold across Lambda instances. Add a per-session cost cap as runaway-loop protection.

### Read first
`backend/src/middleware/rateLimit.ts` (current in-memory token bucket), `backend/migrations/001_initial_schema.sql` (`app_users.monthly_token_budget int`), `003_safety_and_metering.sql` (`usage_events` — one row per pipeline step with `tokens_used`), `backend/src/handlers/routes.ts` (`runPipeline`), `backend/src/config/env.ts`.

### Steps
1. Env additions in `config/env.ts` (with defaults, Zod-validated): `MAX_TOKENS_PER_SESSION` already exists (10000) — reuse it; add `BUDGET_ENFORCEMENT_ENABLED` (boolString, default `'true'`).
2. Create `backend/src/services/BudgetService.ts`:
   - `async function checkMonthlyBudget(userId: string): Promise<{allowed: boolean; used: number; budget: number}>` — SELECT `coalesce(sum(tokens_used),0)` from `usage_events` where `user_id=$1 and created_at >= date_trunc('month', now())`, and the user's `monthly_token_budget` from `app_users`. `allowed = used < budget`. If the user row is missing or DB fails → **allow** (fail-open for availability; log `budget:check_skipped`) — budgets are a cost control, not a security boundary.
   - `function checkSessionCap(trace: TransitionRecord[]): {exceeded: boolean; used: number; cap: number}` — sums `tokensUsed` over the trace against `MAX_TOKENS_PER_SESSION`.
3. Wire into `runPipeline` in `routes.ts`: before `supervisor.run`, call `checkMonthlyBudget`; if not allowed and `BUDGET_ENFORCEMENT_ENABLED`, return **429** `{status:'budget_exceeded', message: 'Monthly token budget reached (<used>/<budget>). Resets on the 1st.', used, budget}`.
4. Runaway protection inside the Supervisor: after each agent step, sum trace tokens; if > `MAX_TOKENS_PER_SESSION`, transition to `failed` with blockedReason `'session token cap exceeded'` and log `{type:'budget:runaway_halted', sessionId, used}` at **error** level (this is the alert hook).
5. Postgres-backed rate limit: replace the in-memory map in `middleware/rateLimit.ts` with a fixed-window counter in Postgres. Migration `005_rate_limits.sql`: `create table if not exists rate_limits (user_id text not null, window_start timestamptz not null, count int not null default 0, primary key (user_id, window_start));`. Implementation: upsert-increment (`insert ... on conflict do update set count = rate_limits.count + 1 returning count`) on the current minute window; deny with 429 when count > `RATE_LIMIT_REQUESTS_PER_MINUTE`. On DB error → fall back to the existing in-memory bucket (keep that code as the fallback path). Note `user_id` is `text` (dev-bypass ids aren't uuids).
6. Tests: budget check math (fake pool rows: 10k budget, 11k used → not allowed); 429 shape from the route (integration, fake pool); runaway halt (Supervisor test with a stub agent reporting huge tokensUsed); rate-limit window increments + denial + in-memory fallback on DB error.

### Do NOT
- Do not check the budget AFTER model calls only — the pre-flight check is the point.
- Do not let a budget-service DB outage take the product down (fail-open + log).
- Do not store any content in `rate_limits` or the 429 bodies.

### Acceptance criteria
- A user with 10,000 budget and 11,000 used this month gets a clean 429 with used/budget numbers before any provider call is made.
- A simulated runaway session (stub agent claiming 50k tokens) halts at the cap with an error-level log event.
- 31st rapid request within a minute → 429 (with `RATE_LIMIT_REQUESTS_PER_MINUTE=30`).
- All tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
```

---

## P-T3.3 — Error handling & graceful degradation ladder (§29.7, §31.4 Step 23)

### Objective
Guarantee the pipeline degrades, never crashes: Critic down → deterministic heuristic scoring; Drafting down → template-based fallback draft; provider down → honest 503-style message; safety classifier down → refuse (already fail-closed — verify, don't rebuild).

### Read first
`backend/src/agents/CriticAgent.ts` (already returns `partial` with the unscored draft on outage), `backend/src/agents/DraftingAgent.ts`, `backend/src/agents/draftShared.ts` (`assembleDraft`), `config/strategy-profiles.json` (per-task `required_nodes`), `backend/src/types/Prompt.ts` (`computeStrength`, `RUBRIC_DIMENSIONS`), `backend/src/services/Supervisor.ts`, `backend/tests/guardrails/ContentSafetyClassifier.test.ts` (fail-closed test exists).

### Steps
1. **Heuristic scorer** — create `backend/src/guardrails/HeuristicScorer.ts`: `function heuristicEvaluation(draft: DraftPrompt): RubricEvaluation`. Deterministic, no LLM. Scoring rules (score each dimension 1–3): specificity = 3 if avg node value length > 25 chars and no value matches /\b(nice|good|interesting|thing)\b/i, else 2, else 1 if any placeholder-ish value; non_conflict = 2 (unknowable without a model — neutral); platform_fit = 3 if the draft has ≥ 60% of the profile's `required_nodes`, else 2; constraint_completeness = 3 if a constraints/technical/negative node exists, else 2; format_determinacy = 3 if an output_format or technical_parameters node exists, else 2; context_efficiency = 3 if assembled length < 80% of platform `max_prompt_tokens`*4 chars, else 2; unambiguity = 2; technique_fit = 2. Set `rubricVersion: 'v1.0-heuristic'`, `issues: ['Scored heuristically — quality model unavailable']`, `needsRefinement: false`. Compute `overallStrength` with the shared `computeStrength`.
2. In `CriticAgent.execute`, when the initial `score()` returns null (scoring unavailable): instead of returning the unscored draft, attach `heuristicEvaluation(draft)` and return `{status:'partial', data:{draft: {...draft, evaluation}, evaluation}}`. Keep the log warning.
3. **Fallback drafting** — in `DraftingAgent.execute`, when both attempts fail (provider error or double-malformed): build a **template fallback**: for each `required_nodes` entry of the task's strategy profile, create a node whose value comes from `context.entities`/`context.clarifications` via the existing `ENTITY_TO_NODE` mapping (reverse lookup), else a generic sensible default per node type (write a small `FALLBACK_VALUES: Record<NodeType,string>` map, e.g. `style_aesthetic: 'clean, simple style'`). Mark every fallback node `defaulted: true`, assemble with `assembleDraft`, and return `{status:'partial', data:{draft}, error:'draft generated from fallback template'}`. Log `{type:'agent:fallback_template_used'}`.
4. **Route messaging** — in `routes.ts`, the `failed` branch already returns 502; extend the JSON to `{status:'error', message:'generation unavailable — please try again', degraded: result.context.finalDraft ? true : false}`. (With steps 2–3, most former failures now complete as degraded successes instead.)
5. **Error-rate visibility** — in `middleware/errorHandler.ts`, add a module-level counter: log `{type:'errors:rate', count, windowStart}` at error level every time the count in a rolling 5-minute window crosses a multiple of 10. Simple in-memory is fine (per-instance).
6. Tests: heuristic scorer scoring table (vague draft → low specificity; complete draft → high); Critic-outage path now yields `partial` WITH a heuristic evaluation (`rubricVersion` `v1.0-heuristic`); Drafting double-failure yields a `partial` template draft with all `defaulted:true` and pipeline completes to `ready_for_review`; fault-injection integration test: provider mock rejects everything → `/draft` (just_generate) still returns 200 with `degraded` content rather than 502.

### Do NOT
- Do not weaken the safety classifier's fail-closed behavior — if `classifyOrFailClosed` errors, the request stays blocked. Add a regression test if one is missing, change nothing.
- Do not use an LLM anywhere in the heuristic scorer.
- Do not report heuristic scores as if they were model scores — the `rubricVersion` marker and issues note are mandatory.

### Acceptance criteria
- With ALL provider calls failing (mocked), `POST /draft {just_generate:true}` returns 200: intent falls back? No — intent failure is still fatal (classification is load-bearing); drafting + critic degrade. Document this boundary in the code: fatal = intent; degradable = retrieval (already), drafting (template), critic (heuristic), memory (already non-fatal).
- Zero unhandled promise rejections under the fault-injection test run.
- All tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
```

---

## P-T3.4 — Prompt versioning & history (§29.1, §31.4 Step 24)

### Objective
Every saved prompt edit creates an immutable version row; users can list versions and restore an old one. (The node architecture makes prompts diff-able — store node JSON per version.)

### Read first
`backend/migrations/001_initial_schema.sql` — the `prompts` table already has `version integer`, `parent_version_id uuid`, `content_ciphertext text`, `strength_score`, `rubric_scores`, `library_opt_in`. `backend/src/services/SessionService.ts` (DB pattern), `backend/src/types/Prompt.ts` (`DraftPrompt`).

### Steps
1. **Content note (pre-E2EE):** until T7.1, the server must not persist plaintext prompt content. Store version content as node JSON in `content_ciphertext` ONLY when the client explicitly sends it with an `client_encrypted: true` flag… **Simpler compliant approach for now:** add migration `006_prompt_versions.sql` creating `prompt_versions (id uuid pk default gen_random_uuid(), prompt_id uuid not null references prompts(id) on delete cascade, version int not null, nodes_json jsonb, strength_score int, rubric_scores jsonb, created_at timestamptz default now(), unique(prompt_id, version))` and document in a SQL comment: `nodes_json` is a **[P]-classified interim** exception approved for pre-E2EE MVP, replaced by ciphertext in T7.1. If the product owner rejects this exception, store versions client-side instead and skip this task — ask before proceeding if unclear.
2. Create `backend/src/services/PromptService.ts`:
   - `savePrompt(userId, {sessionId?, platformId, taskType, nodes, assembled, strengthScore?, rubricScores?})` → inserts a `prompts` row (version 1) + a `prompt_versions` row.
   - `saveVersion(userId, promptId, {nodes, strengthScore?, rubricScores?})` → next version = max(version)+1; INSERT only (never UPDATE an old version); update the `prompts` head row's `version` pointer.
   - `listVersions(userId, promptId)` → version metadata list (id, version, strength_score, created_at) — ownership-checked (`prompts.user_id = userId`).
   - `getVersion / restore(userId, promptId, version)` → restore = saveVersion with the old nodes (restores are new versions, history is never rewritten).
   - `diffVersions(a, b)` → pure function comparing node arrays by `type`: returns `{added: NodeType[], removed: NodeType[], changed: {type, before, after}[]}`.
3. Routes: `POST /prompts` (save), `GET /prompts` (list own, metadata only), `GET /prompts/:id/versions`, `GET /prompts/:id/versions/:v`, `POST /prompts/:id/restore {version}`, `GET /prompts/:id/diff?from=1&to=3`. All ownership-checked, 404 on other users' prompts (not 403 — don't leak existence).
4. Tests: version chain (save → edit → edit → list shows 1,2,3); restore v1 → creates v4 with v1's nodes; diff detects added/removed/changed; cross-user access returns 404; fake pool throughout.

### Do NOT
- Never UPDATE or DELETE a `prompt_versions` row from application code.
- Do not return other users' data (test it).

### Acceptance criteria
- Edit 3× → restore v1 works and appears as v4; the chain is auditable via `listVersions`.
- All tests green; migration idempotent.

### Verify with
```bash
cd backend && npm run typecheck && npm test && npm run migrate
```

---

## P-T3.5 — Prompt-performance feedback loop (§29.2, §10.7, §31.4 Step 25)

### Objective
Capture "did this prompt actually work?" after use, store it **anonymized and aggregate-only**, and make under-performing rubric dimensions/techniques queryable.

### Read first
`backend/migrations/003_safety_and_metering.sql` — `outcome_signals (id, task_type, platform_id, rubric_scores jsonb, edit_count, reused, feedback, created_at)` — note: **no user_id column, by design (§10.7)**. `routes.ts` `POST /feedback` stub.

### Steps
1. Implement `POST /feedback` in `routes.ts`: body `{session_id?, task_type, platform_id, rubric_scores?, edit_count?, reused?, outcome: 'worked'|'didnt_work'|'mixed', detail?}`. Validate with a Zod schema in `backend/src/types/Feedback.ts` (`outcome` enum required; `detail` max 500 chars). INSERT into `outcome_signals` mapping `outcome`→`feedback` column. **Do not write the user id or session id into the row** — session_id may be used only to look up `sessions.rubric_scores/task_type/platform_id` server-side to enrich the row, then discarded. Return `{status:'ok'}`.
2. Optionally (if `session_id` present and belongs to the caller) also set `sessions.final_state = 'feedback_received'`? No — do not overload state. Skip.
3. Create `backend/src/services/OutcomeAnalytics.ts`: `async function underperformingDimensions(): Promise<Array<{dimension: string; avgScoreWhenFailed: number; failureShare: number; n: number}>>` — SQL over `outcome_signals`: for rows with `feedback='didnt_work'`, unpack `rubric_scores` jsonb per dimension and compare each dimension's average against rows with `feedback='worked'`; return dimensions whose failed-average is materially lower (report all 8 with numbers; let the reader judge). Add `GET /analytics/outcomes` (authed) returning it. Keep SQL simple: two grouped queries merged in TS is fine.
4. Tests: feedback insert shape (assert NO user identifier in params); Zod validation rejections (bad outcome, oversized detail); analytics math on fake rows.

### Do NOT
- Never store user_id, session_id, or free-text prompt content in `outcome_signals`.
- `detail` is user free text — cap length, store as-is in the anonymized row only if you must; prefer dropping it entirely unless the schema has a column (it does: `feedback` is the enum; there is no detail column → **drop detail after validation**, or add a `detail text` column via migration and store it capped, documented as anonymized).

### Acceptance criteria
- Feedback flows in and is queryable in aggregate; a report can flag dimensions that under-perform on real outcomes; zero identity linkage (verified by test asserting insert params).
- All tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
```

---

## P-T3.6 — CI/CD: staging auto-deploy, prod promotion, rollback (§31.4 Step 26, §27.3)

### Objective
Merge to `main` → staging deploys automatically; production is a manual one-command promotion; rollback is instant via Lambda version aliases; migrations run before code.

### Read first
`.github/workflows/ci.yml` (typecheck/gitleaks/test exist), the manual deploy command in the Global Context Block, `backend/src/scripts/migrate.ts`.

### Steps
1. Restructure `.github/workflows/ci.yml`: keep the existing `test` job (typecheck → gitleaks → test) as the PR gate; add `build` (npm run build, upload `dist/` + `config/` as an artifact).
2. New job `deploy-staging` (needs: test+build; `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`):
   - `aws-actions/configure-aws-credentials@v4` with repo secrets `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, region `us-east-1`.
   - Run migrations FIRST: `npm run migrate` with secret `DATABASE_URL` (document: migrations must always be backward-compatible with the still-running old code).
   - Package: `npm ci --omit=dev` in a clean dir → zip `dist/ node_modules/ config/` with `config/` at the zip ROOT (the Lambda reads `/var/task/config/...` — this layout is load-bearing).
   - `aws lambda update-function-code --function-name PromptAI --zip-file fileb://lambda.zip`, then `aws lambda wait function-updated`, then smoke-test: curl `https://qsfu5lcqt2.execute-api.us-east-1.amazonaws.com/health` expecting `{"ok":true}` — fail the job otherwise.
3. New workflow `.github/workflows/deploy-prod.yml` (`workflow_dispatch` with input `confirm: 'deploy-prod'`):
   - `aws lambda publish-version --function-name PromptAI` → capture version N.
   - `aws lambda update-alias --function-name PromptAI --name prod --function-version N` (create-alias on first run, `aws lambda get-alias || create-alias`).
   - Print the previous version in the job summary as the rollback target.
4. New workflow `.github/workflows/rollback-prod.yml` (`workflow_dispatch` with input `version`): `update-alias --name prod --function-version <input>`. Document: rollback is alias repointing, sub-second.
5. Documentation: add a `## Deploys` section to `backend/README.md` listing the required GitHub secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `DATABASE_URL`) and the promote/rollback runbook. **Note in the README:** API Gateway currently targets `$LATEST`; wiring it to the `prod` alias is a one-time manual change (`aws apigatewayv2 update-integration` to the alias ARN) — include the exact command with the integration id looked up via `aws apigatewayv2 get-integrations --api-id qsfu5lcqt2`.
6. Add Dependabot: `.github/dependabot.yml` for npm (weekly, `/backend`) and github-actions. Add an `npm audit --audit-level=high` step to the test job (allowed to warn, fails only on `high`+).

### Do NOT
- Do not put secret values in workflow files. Do not deploy code before migrations.
- Do not delete the manual deploy instructions from the README — they're the break-glass path.

### Acceptance criteria
- Workflows lint (run `actionlint` if available, else careful YAML review); a dry-run of the packaging steps locally produces a zip with `config/` at root.
- README documents secrets + runbook. Dependabot + audit gating present.
- Note honestly in your report: full end-to-end verification requires pushing to GitHub with secrets configured — list exactly what the repo owner must add.

### Verify with
```bash
cd backend && npm run typecheck && npm test
# packaging dry-run:
npm run build && cd .. && zip -r /tmp/ci-dryrun.zip backend/dist backend/node_modules config >/dev/null && unzip -l /tmp/ci-dryrun.zip | grep -E "^.*config/platform-registry.json" && echo PACKAGING-OK
```

---

## P-T3.7 — Load testing & performance tuning (§31.4 Step 27)

### Objective
Measure `/draft` under 100 concurrent users; target p50 < 2s, p99 < 5s, zero errors — using a **mock-provider mode** so the test measures OUR system, not Groq's free-tier rate limits (30 req/min would drown a real-provider test).

### Read first
`backend/src/services/providers/index.ts` (`generate()`), `backend/src/services/providers/MockAdapter.ts`, `backend/src/config/env.ts`, `backend/src/utils/db.ts` (pool `max: 3`).

### Steps
1. Add env flag `PROVIDER_FORCE_MOCK` (boolString, default `'false'`, **refused in production**: throw at startup if `NODE_ENV==='production' && PROVIDER_FORCE_MOCK`). In `generate()`: when set, always dispatch to the `mock` adapter. The MockAdapter must then return step-appropriate canned JSON — extend it: accept the `pipelineStep` (pass it via the request or a wrapper) and return valid intent JSON for `intent_classification`, valid node JSON for `drafting`/`critic`-refine, valid scores JSON for `critic`. Simplest: give MockAdapter a static map keyed by a marker it finds in the systemPrompt (`'intent classifier'` / `'quality critic'` / default→nodes), mirroring `tests/integration` fixtures.
2. Write `backend/load/draft-load.js` — a **k6** script (no npm dep; k6 is a standalone binary): 100 VUs, 2-minute ramp, POST `/draft` with `just_generate: true`, platform `midjourney`, randomized ideas from a 10-item list; thresholds `http_req_duration{p(50)<2000, p(99)<5000}`, `http_req_failed rate<0.01`. Read base URL + a bearer token from env (`K6_BASE_URL`, `K6_TOKEN`; for local runs DEV_AUTH_BYPASS makes any token work).
3. Write `backend/load/README.md`: how to run locally (`PROVIDER_FORCE_MOCK=true DEV_AUTH_BYPASS=true node dist/index.js` then `k6 run load/draft-load.js`), what the thresholds mean, and a section "Real-provider capacity note" documenting Groq free-tier limits (30 req/min, TPM caps) and that production load capacity is provider-bound until a paid tier.
4. Run it locally (install k6 via `brew install k6` if absent — ask before installing). Capture the summary output into `backend/load/results-<date>.txt`.
5. Tune what the numbers reveal — likely candidates: `utils/db.ts` pool max (raise to ~10 for local/server; keep a comment that Lambda stays small), registry/config file reads (already cached), pino pretty transport off outside development (verify), unnecessary awaits on audit/persistence (should be fire-and-forget after T3.1/T2.12 — verify `persistSessionMetadata`/`meterUsage` don't serially block the response; make them `void`ed or `Promise.allSettled` if they do).
6. Tests: unit-test the `PROVIDER_FORCE_MOCK` dispatch (mocked registry) and the production refusal.

### Do NOT
- Do not load-test the deployed Lambda against real Groq keys.
- Do not leave `PROVIDER_FORCE_MOCK=true` set in `.env` after finishing.

### Acceptance criteria
- k6 run passes thresholds locally (paste the summary); flag + refusal tested; findings + applied tunings listed in the report.

### Verify with
```bash
cd backend && npm run typecheck && npm test
k6 run load/draft-load.js   # after starting the mock-mode server
```

---

## P-T3.8 — Security review & penetration checklist (§31.4 Step 28, §27, §33)

### Objective
A structured security review of the backend with findings triaged by severity; all critical/high issues fixed; medium/low documented with owners. (Re-run after Phase 7's E2EE/BYOK work.)

### Read first
`docs/admin-roles.md`, spec §19/§27/§33, `backend/src/middleware/auth.ts`, `rateLimit.ts`, every route in `routes.ts`, `backend/src/services/*.ts` SQL calls, `backend/src/config/env.ts`, `.github/workflows/ci.yml`.

### Steps — work through this checklist, one section at a time, and record each finding as `{id, area, severity: critical|high|medium|low, description, fix or owner}` in a new `docs/security-review-<date>.md`:
1. **AuthN/AuthZ:** every non-public route behind `authMiddleware`? JWT verified with algorithm pinned (jose `jwtVerify` with JWKS — confirm no `alg:none` acceptance)? `DEV_AUTH_BYPASS` refused in production (env.ts — verify the check exists and add a test)? Ownership checks on every `:id` route (sessions trace, prompts, versions)?
2. **Injection:** grep every `pool.query`/`client.query` — 100% parameterized (`$1`), zero string-interpolated SQL. Check the pgvector literal construction in `PKBService` (`[${queryVector.join(',')}]`) — values are numbers from our own embedder, but harden: assert `Number.isFinite` on every element before joining.
3. **Input validation:** every route body Zod-validated or explicitly checked? Add missing schemas (draft/clarify bodies currently hand-checked — convert to Zod schemas in `types/Http.ts`).
4. **SSRF:** any endpoint fetching user-supplied URLs? (None today — write it down as an invariant to keep; T5.2 live-fetch must allowlist registry `docs_url` hosts only.)
5. **Secrets:** gitleaks in CI (yes); `.env` gitignored (verify); no secret ever logged (grep `logger` calls for env references); provider keys only read in adapters.
6. **Headers/CORS:** CORS currently reflects any origin — acceptable pre-launch, but add a TODO gate: tighten to the web/extension origins in T4.1/T5.4; add `secureHeaders()` from `hono/secure-headers` to the app now.
7. **DoS:** rate limit (T3.2) present; body size — add a JSON body-size guard middleware (e.g. reject > 100KB with 413).
8. **Safety bypasses:** can any input reach an LLM without passing safety gate 1? Trace all `generate()` callers (agents only, all downstream of the Supervisor gates? `POST /optimize` and `/recommend` don't call LLMs — confirm).
9. **Dependency audit:** `npm audit` — fix or document.
10. Fix everything you rated critical/high in this same task; write tests for each fix.

### Acceptance criteria
- `docs/security-review-<date>.md` exists with the full checklist, findings table, and fixes applied; zero open critical/high.
- New middleware (secure headers, body-size cap) + Zod body schemas + any fixes are tested; all green.

### Verify with
```bash
cd backend && npm run typecheck && npm test && npm audit --audit-level=high
git log --oneline -5   # fixes committed alongside the review doc
```

---
---

# PHASE 4 — WEB APP MVP (§20.1, §24 Phase 0, §28.1)

> **Phase-wide notes for every P-T4.x prompt:** the web app lives in `web/` (create it in T4.1 — it does not exist). Stack: **Next.js 15 + TypeScript, App Router**, deployed to **Cloudflare Pages** via `@cloudflare/next-on-pages`. Backend base URL comes from `NEXT_PUBLIC_API_URL` (local: `http://localhost:3001`; staging: the API Gateway URL). Accessibility is part of Definition of Done for every UI task (§29.5): real `<button>`s, labeled inputs, keyboard operability, visible focus. All UI strings go in `web/src/lib/strings.ts` from day one (i18n discipline, §29.6) — no hardcoded English literals inside components.

---

## P-T4.1 — Next.js scaffold on Cloudflare Pages + typed API client

### Objective
A deployable `web/` Next.js app with a typed API client that mirrors the backend contracts, a landing page, and a working staging deploy to Cloudflare Pages.

### Read first
Backend response shapes: `backend/src/types/Response.ts` (`DesignedResponse` — THE contract the UI renders), `backend/src/types/Prompt.ts` (`ClarifyingQuestion`, `NodeType`), `backend/src/handlers/routes.ts` (endpoint list + bodies). Global Context Block API list.

### Steps
1. Scaffold: `npx create-next-app@latest web --typescript --app --no-src-dir=false --eslint --tailwind` (accept src dir, Tailwind yes — justify: it's the standard styling baseline, zero runtime dep). Node 20. Do NOT add UI kit libraries.
2. Create `web/src/lib/api-types.ts`: hand-copy (do not import across package boundaries) the DTOs the UI needs: `DesignedResponse`, `DesignedNode`, `StrengthPresentation`, `GovernorPresentation`, `ClarifyingQuestion`, `Recommendation`, plus route response envelopes (`DraftResponse = {status:'ok'|...; session_id; final_state; response; questions?; ...}`). Add a comment header: "Mirrors backend/src/types — update together."
3. Create `web/src/lib/api.ts`: a small fetch client class with `baseUrl` from `process.env.NEXT_PUBLIC_API_URL`, a settable bearer token, JSON error normalization (`{status, message}` on non-2xx), and typed methods: `draft(body)`, `clarify(sessionId, body)`, `recommend(body)`, `optimize(body)`, `platforms()`, `health()`. No retries, 30s timeout via AbortController.
4. Pages: `/` landing (product one-liner, CTA to `/try`), `/try` placeholder ("coming in T4.3"). Layout with header/nav/footer. SSR/static for `/` (SEO, §20.1).
5. Cloudflare Pages: add `@cloudflare/next-on-pages` dev dep + `wrangler.toml`; scripts: `"pages:build": "npx @cloudflare/next-on-pages"`, `"preview": "wrangler pages dev .vercel/output/static"`. Document in `web/README.md`: create the Pages project with `wrangler pages project create promptforge-web`, deploy with `wrangler pages deploy .vercel/output/static`, set `NEXT_PUBLIC_API_URL` in the Pages env. Cloudflare credentials: `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` exist in `backend/.env` — the runner may export them for wrangler.
6. Tighten backend CORS now that an origin exists: in `backend/src/handlers/routes.ts`, replace the reflect-any-origin CORS with an allowlist from a new env `ALLOWED_ORIGINS` (comma-separated; default `http://localhost:3000`). Keep `*` for `GET /health` and `GET /platforms` only.
7. Tests: backend CORS change (integration: disallowed origin gets no ACAO header); web — add `vitest` only if trivial, otherwise verify with `npm run build` + `npx tsc --noEmit` in `web/` (Next builds are the practical gate at this stage).

### Acceptance criteria
- `cd web && npm run dev` serves the landing page; the API client round-trips `GET /health` against a locally running backend (manual check documented in README).
- `npm run pages:build` succeeds. Backend tests still green after the CORS change.

### Verify with
```bash
cd web && npx tsc --noEmit && npm run build && npm run pages:build
cd ../backend && npm run typecheck && npm test
```

---

## P-T4.2 — Auth UI + account management (Supabase Auth)

### Objective
Signup, login, logout, password reset, and a minimal account page — the only plaintext PII anywhere is name/email (§19.1).

### Read first
`backend/.env` keys `SUPABASE_URL`, `SUPABASE_ANON_KEY` (the anon key is public-by-design — safe in the browser). `web/src/lib/api.ts` (token setter from T4.1).

### Steps
1. `npm i @supabase/supabase-js` in `web/`. Create `web/src/lib/supabase.ts` exporting a browser client from `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (add to `.env.local.example`).
2. Auth context: `web/src/components/AuthProvider.tsx` — client component wrapping the app; exposes `{user, session, signUp, signIn, signOut, resetPassword}` via React context; subscribes to `supabase.auth.onAuthStateChange`; pushes `session.access_token` into the API client on every change.
3. Pages under `/auth`: `/auth/login`, `/auth/signup`, `/auth/reset` — labeled inputs, inline error display (Supabase error messages), disabled-while-pending buttons, links between them. On success → redirect to `/build` (exists after T4.4; use `/` until then).
4. `/account` page (auth-gated): show email, editable display name (`supabase.auth.updateUser({data:{name}})`), sign-out button, and a "Delete my data" mailto/placeholder noting §27.4 self-service deletion lands in T7.8.
5. Route guard: a `useRequireAuth()` hook redirecting unauthenticated users to `/auth/login?next=...`.
6. Also create the backend user row: on first authenticated call, backend needs an `app_users` row for FK integrity. Add a small backend endpoint `POST /me/bootstrap` (authed, idempotent `insert ... on conflict do nothing` using the JWT's `sub` as id and email claim) and call it once after login in AuthProvider. Backend test for idempotency.

### Acceptance criteria
- Full loop against the real Supabase project: sign up (email confirm per project settings), sign in, see `/account`, sign out; API client carries the token; `POST /me/bootstrap` created the row (verify via a backend log or test).
- Nothing but name/email rendered or stored; web build + backend tests green.

### Verify with
```bash
cd web && npx tsc --noEmit && npm run build
cd ../backend && npm run typecheck && npm test
```

---

## P-T4.3 — Zero-friction "try it now" flow (§28.1)

### Objective
A first-run demo: a visitor gets one great, scored prompt in under a minute WITHOUT an account — then a conversion nudge to sign up to save it.

### Read first
`backend/src/handlers/routes.ts` (`runPipeline`), `backend/src/middleware/rateLimit.ts`, `config/platform-registry.json` (platform ids).

### Steps
1. Backend: add `POST /demo/draft` (PUBLIC — mounted outside the authed group):
   - Body: `{example_id: string}` ONLY — free-form ideas are not accepted on the anonymous path (abuse control). Maintain `config/demo-examples.json` with 6 curated examples `{example_id, platform_id, idea, just_generate:true}` spanning image/persona/code.
   - IP rate limit: in-memory map keyed on `c.req.header('x-forwarded-for') ?? 'local'`, max `DEMO_REQUESTS_PER_DAY` (env, default 5) per IP per day; 429 with a friendly "create a free account" message.
   - Runs `runPipeline` with `userId: 'demo-user'` (persistence/metering skip gracefully — same as dev bypass). Safety gates still run (they're content-based).
   - Env: `DEMO_ENABLED` boolString default true.
2. Web `/try` page: example picker (cards with the 6 curated tasks) → calls `/demo/draft` → renders the result with the strength score + assembled prompt + copy button (reuse the presentation components you'll build in T4.6 if doing these tasks in order 4.4→4.6 first is impossible — otherwise build a minimal inline renderer now and swap in T4.6's components later; note the swap as a TODO).
3. Conversion: after rendering, a banner: "Sign up free to save, edit node-by-node, and build your own" → `/auth/signup`. Store the demo result in `sessionStorage` so it survives the signup redirect and can be shown on `/build` after login.
4. Tests: backend — demo endpoint happy path (mocked provider fetch), unknown example_id 400, rate-limit 429, `DEMO_ENABLED=false` → 404.

### Acceptance criteria
- Anonymous visitor: land → pick example → scored prompt rendered, all in one flow with zero auth; 6th request same IP same day → 429 nudge.
- Backend tests green; web builds.

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../web && npx tsc --noEmit && npm run build
```

---

## P-T4.4 — Clarification flow UI (§11, taxonomy in docs/clarification-taxonomy.md)

### Objective
The conversational question flow: one/two question cards at a time, MCQ chips + free text + "Other" escape, an always-visible "just generate now", wired to `/draft` → `/draft/:id/clarify`.

### Read first
`docs/clarification-taxonomy.md` (the frontend contract section at the bottom), `backend` clarify round-trip in the Global Context Block, `ClarifyingQuestion` type (`{id, text, type:'mcq'|'free_text', options?, allow_other, maps_to_node, priority}`).

### Steps
1. Page `/build` (auth-gated): step 1 — platform select (from `GET /platforms`, show display_name + modality badges) + idea textarea + two buttons: "Help me refine it" (POST /draft) and "Just generate now" (POST /draft with `just_generate:true`).
2. If the response is `{status:'clarifying'}`: render `ClarificationFlow`:
   - Show questions **one or two at a time** in priority order (they arrive ordered), not as one long form.
   - MCQ → chip buttons (a real radiogroup: `role="radiogroup"`, chips are `<button role="radio" aria-checked>`); when `allow_other`, an "Other…" chip revealing a text input.
   - free_text → labeled `<textarea>`.
   - Progress hint ("2 of 4"), Back link, and a persistent **"Just generate now"** button (first-class, always visible — §11.2).
   - On completion (or just-generate): POST `/draft/:sessionId/clarify` with `{platform_id, idea, clarifications: {questionId: answer}, just_generate}`. Answers keyed by question `id` — this matches the backend's re-ask-prevention.
3. Loading states: skeleton + a short rotating status line ("drafting…", "scoring…") while the pipeline runs (3–7s typical).
4. Render the finished result via a `DraftResult` component placeholder (fully built in T4.5/T4.6; minimal now: assembled text + score headline + copy button).
5. Keyboard pass: tab order top-to-bottom, chips arrow-navigable within the group, Enter selects, Escape closes "Other" input. Screen-reader labels on every control.
6. Component tests if a test rig exists; otherwise a documented manual keyboard-only run-through in `web/README.md` (checklist with results).

### Acceptance criteria
- The horse/Gemini example flows: idea → 4 questions as cards → answers → finished scored draft; "just generate now" works at every step; keyboard-only completion possible; matches the taxonomy contract exactly (ids round-trip).

### Verify with
```bash
cd web && npx tsc --noEmit && npm run build
# manual: npm run dev + backend local; run the horse example keyboard-only
```

---

## P-T4.5 — Node editor (§13)

### Objective
The differentiating editor: the draft as an ordered list of typed nodes — edit in place, swap ranked alternatives, lock nodes, see the re-assembled platform string live.

### Read first
`DesignedNode`/`DesignedResponse` in `backend/src/types/Response.ts`; `backend/src/services/PromptSerializer.ts` (assembly rules). §13.2 (locks), §10.6 (localized re-draft).

### Steps
1. **Backend first — two small endpoints:**
   - `POST /serialize` (authed): `{platform_id, nodes: PromptNode[]}` → `{assembled}` — a thin wrapper over `serializeNodes` + `getPlatform` (404 unknown platform). Zod-validate nodes with `promptNodeSchema`.
   - `POST /redraft-node` (authed): `{platform_id, task_type, nodes, target_node_type, instruction?}` → regenerates ONLY the target node via a small-tier `generate()` call (system prompt: here are the other nodes as fixed context, produce a replacement for `<type>` honoring the instruction; JSON `{value, rationale, alternatives[]}`), respecting `locked` (400 if target is locked). Reuse `extractJson` + retry-once. Tests for both (mock fetch).
2. Web `NodeEditor` component on the result screen:
   - Ordered list; each row: type badge (label from the response), value (click-to-edit inline `<input>`/`<textarea>`, saves on blur/Enter), lock toggle (🔒 `aria-pressed`), alternatives dropdown (ranked, each option shows its rationale as secondary text), a "regenerate this node" button (calls `/redraft-node`), and a `defaulted` marker chip ("assumed — click to confirm") that clears on any user touch.
   - Any change (edit/swap/lock) → debounced (400ms) `POST /serialize` → update the assembled-string preview pane.
   - Assembled pane: monospace block + Copy button (`navigator.clipboard`, with a "copied ✓" flash) + character/token line (client-side estimate ~len/4, labeled "≈").
3. State: keep the canonical node array in a `useReducer`; every mutation is an action (EDIT_VALUE, PICK_ALTERNATIVE, TOGGLE_LOCK, REPLACE_NODE) — this becomes the versioning payload in T4.7.
4. Locks are hard client-side too: locked nodes render read-only and PICK_ALTERNATIVE/EDIT_VALUE actions on them are ignored.

### Acceptance criteria
- Swapping an alternative updates the assembled string without touching other nodes; locked nodes cannot be changed by regenerate/edit (test the reducer); the Midjourney example re-serializes with `--no`/params ordering intact (backend serializer guarantees it — verify via `/serialize`).
- Backend + web builds and tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../web && npx tsc --noEmit && npm run build
```

---

## P-T4.6 — Strength score & explainability UI (§10.5, §28.3)

### Objective
Make quality visible and educational: overall score + band, 8 weighted sub-scores, per-node rationale, expandable "why this works" lessons — with more teaching detail for new users, tapering with use.

### Read first
`StrengthPresentation` (`{score, band, dimensions:[{dimension,label,score,weight}]}`), `whyThisWorks: string[]`, `improvementHints: string[]`, `governor` — all on `DesignedResponse`. `docs/quality-rubric.md` bands (0–39 Needs work · 40–69 Solid · 70–89 Strong · 90–100 Excellent).

### Steps
1. `StrengthScore` component: big number + band chip (color by band: red/amber/blue/green — WCAG AA contrast, and never color-only: the band NAME is always text); an 8-row breakdown — each row: dimension label, weight tag, score as a 3-segment meter (`aria-label="Specificity: 2 of 3"`), and an info popover with the dimension's one-line definition (hardcode the 8 definitions from `docs/quality-rubric.md` into `strings.ts`).
2. `WhyThisWorks` component: collapsed list of the grounded lessons (`whyThisWorks`), each expandable `<details>`; heading "Why this prompt works". `ImprovementHints`: bulleted list under "Make it stronger", each hint with a "regenerate that node" shortcut when the hint names a node type (simple substring match against node labels).
3. `GovernorBar`: tokens used / platform ceiling as a labeled progress bar; warning style when `nearLimit`, error style + the governor suggestion text when `!withinLimit`.
4. Onboarding taper (§28.3): store `draftCount` in `localStorage`; for the first 3 drafts auto-expand all WhyThisWorks entries and show a one-time coach-mark on the sub-scores ("this is how we grade prompts"); afterwards default-collapsed. A "teaching mode" toggle in `/account` overrides permanently.
5. Wire all of it into the T4.4/T4.5 result screen replacing placeholders.

### Acceptance criteria
- Rendered numbers exactly match backend payload (no client-side re-computation of the score); first-run shows expanded teaching, fourth run doesn't; keyboard/screen-reader pass on meters and details.

### Verify with
```bash
cd web && npx tsc --noEmit && npm run build
cd ../backend && npm test   # unchanged, must stay green
```

---

## P-T4.7 — History, library seed & feedback UI (+ backend endpoints)

### Objective
Close the MVP loop: browse your prompt history with version restore, remix from a seeded template library (with preview), give did-it-work feedback, export everything as JSON.

### Read first
T3.4's `PromptService` + routes (versions/restore/diff), T3.5's `POST /feedback`, `backend/migrations/003_safety_and_metering.sql` (`library_entries: id, source, title, description, modality, platform_tags, template jsonb, preview_url, popularity, remix_count, moderation_status, version`), `GET /library` stub in routes.

### Steps
1. **Backend — library:**
   - Create `config/library-seed.json`: 12 hand-curated templates spanning text_to_image (4), chat_persona (3), reasoning_code (2), long_form_writing (2), extraction_classification (1). Each: `{title, description, modality, platform_tags[], template: {task_type, nodes: PromptNode[] with customize-me markers in values like "<your subject>"}, preview_text}` — `preview_text` is a 1–2 sentence example outcome (stands in for preview_url pre-media).
   - `backend/src/scripts/seed-library.ts` + `npm run seed:library`: idempotent upsert by title into `library_entries` with `source='internally_seeded'`, `moderation_status='approved'`.
   - Implement `GET /library` (list: metadata + preview_text, filterable `?modality=&platform=`) and `GET /library/:id` (full template). `POST /library/:id/remix` increments `remix_count` and returns the template (the client loads it into the editor).
2. **Backend — sessions list:** `GET /sessions` (authed): the caller's session metadata rows (id, platform_id, final_state, strength_score, created_at), newest first, limit 50.
3. **Backend — export (§29.8):** `GET /export` (authed): JSON `{prompts (with versions), sessions (metadata), library_remixes: none-yet}` — everything the server knows about the user, honestly including a note that content is client-side pre-E2EE.
4. **Web:**
   - `/history`: session list (platform, date, score badge) → clicking a prompt-linked entry opens versions (list from T3.4 routes) with restore + a simple two-version diff view (added/removed/changed nodes, from the diff endpoint).
   - `/library`: card grid (title, description, modality badge, platform tags, preview_text, remix count) with filters; "Remix" loads the template's nodes into the `/build` editor with customize-me placeholders highlighted.
   - Feedback: on the result screen, after Copy is clicked, reveal a low-key bar: "Did this prompt work? 👍 / 👎 / 🤷" → `POST /feedback` with `{task_type, platform_id, rubric_scores, outcome}`; thank + dismiss. Never blocks anything.
   - `/account`: "Export my data" button → downloads `GET /export` as `promptforge-export.json`.
5. Tests: library seed idempotency, GET /library filters, remix counter, GET /sessions ownership, export shape (all fake-pool). Web builds.

### Acceptance criteria
- Save → browse history → restore an old version → remix a library template → give feedback: the full loop works locally end-to-end; export downloads valid JSON.
- **MILESTONE M1 check:** a stranger can get a genuinely good, scored, editable prompt on the web app in under a minute (via /try) — run it and say so honestly in the report.

### Verify with
```bash
cd backend && npm run typecheck && npm test && npm run seed:library
cd ../web && npx tsc --noEmit && npm run build
```

---
---

# PHASE 5 — GROUNDED DRAFTING AT SCALE: PKB PIPELINE + BROWSER EXTENSION (§24 Phase 1)

> **Phase-wide notes:** the extension lives in `extension/` (created in T5.4): **Manifest V3 + React + Vite + TypeScript**. Architecture rule (§20.2): the **background service worker mediates ALL network calls and holds all credentials — the content script never does either**. Overlay UI renders inside **Shadow DOM** so host-page CSS can't bleed in. Every platform the extension *inserts text into* must have `tos_reviewed: true` in the registry first (§29.4) — insertion is disabled otherwise.

---

## [x] P-T5.1 — PKB ingestion crawler, scheduled (§6.1, §6.3)

### Objective
A scheduled job that re-crawls each registered platform's docs, chunks + embeds changed content, and upserts it — keeping the knowledge base fresh automatically (and doubling as the Supabase keep-alive, §23.3).

### Read first
`backend/src/scripts/seed-pkb.ts` (the hash-idempotent upsert pattern — REUSE it), `backend/src/services/providers/GeminiEmbeddingAdapter.ts`, `config/platform-registry.json` (`docs_url` per platform), `backend/migrations/002_knowledge_base.sql` (`knowledge_chunks` has `content_hash`, `last_checked_at`, `trust_score`).

### Steps
1. Create `backend/src/scripts/crawl-pkb.ts` (runs via `npm run crawl:pkb`):
   - For each registry platform: fetch `docs_url` (plain `fetch`, 15s timeout, `User-Agent: PromptForgeBot/1.0 (+contact in repo)`).
   - **Robots/ToS respect:** before fetching, fetch `<origin>/robots.txt`; if it disallows the path for `*`, skip the platform and log `crawl:skipped_robots`. Politeness delay ≥ 2s between requests; never follow links off the docs origin; max 5 pages per platform per run (start with just `docs_url` itself + same-origin links found in it, breadth-first).
   - **Extract text:** strip HTML with a small regex/DOM-free pass (drop `<script>/<style>/<nav>`, collapse tags to newlines) — no new heavy deps; acceptable v1 fidelity.
   - **Chunk:** split by headings/blank lines into ~300–600-token chunks (use `estimateTokens`); drop chunks < 40 tokens.
   - **Diff by hash:** sha256 each chunk; skip hashes already in `knowledge_chunks` (update their `last_checked_at = now()`); embed + INSERT new ones (`kind:'pkb'`, `category:'crawled'`, `trust_score: 0.7` — crawled < hand-curated, §6.1), source_url = the fetched page.
   - **Drift:** after the run, for the platform's crawled rows whose hash was NOT seen this run AND `last_checked_at` older than 2 runs → log `crawl:stale_chunk` (deletion is a human decision via admin, T7.5 — do not auto-delete).
   - Summary log: `{platform, fetched, newChunks, refreshed, skipped}` per platform.
2. Schedule: `.github/workflows/crawl-pkb.yml` — cron `0 6 * * 1` (weekly Mon 06:00 UTC), runs `npm ci && npm run build && node dist/scripts/crawl-pkb.js` with secrets `DATABASE_URL` + `GEMINI_API_KEY`. This workflow doubles as the Supabase keep-alive — note it in the workflow comment (supersedes any ping-only job).
3. Tests: chunker (heading split, min-size drop), hash-skip logic, robots-disallow skip — all with mocked fetch + fake pool. NO live crawling in tests.

### Do NOT
- No new npm dependencies for HTML parsing (regex strip is the accepted v1) without written justification.
- Never crawl beyond the docs origin; never ignore robots.txt; never auto-delete chunks.

### Acceptance criteria
- Local run against ONE platform (manually invoked, real network OK for the manual verification only) inserts crawled chunks with `trust_score 0.7` and re-running immediately reports 0 new (hash-idempotent); workflow file lints; tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
npm run crawl:pkb   # manual once; paste per-platform summary lines
```

---

## [x] P-T5.2 — Live-fetch fallback: self-healing retrieval (§6.2, §8 L3)

### Objective
When retrieval finds nothing good for a platform, fetch that platform's docs live, answer from them, and asynchronously upsert what was learned — so the KB heals itself.

### Read first
`backend/src/services/PKBService.ts` (retrieve), P-T5.1's crawl/chunk/upsert helpers (extract them into `backend/src/services/DocIngest.ts` shared by both if T5.1 is done — else create it here and let T5.1 reuse), `backend/src/agents/DocRetrievalAgent.ts`.

### Steps
1. Change `PKBService.retrieve` to also return similarity: SELECT `1 - (embedding <=> $2::vector) as similarity` and include it on each returned chunk (add optional `similarity?: number` to `KnowledgeChunk` in `types/Agent.ts`).
2. Add env `PKB_MIN_SIMILARITY` (default `0.45`) and `LIVE_FETCH_ENABLED` (default `'true'`).
3. In `DocRetrievalAgent`: after retrieval, if `chunks.length === 0` OR best similarity < threshold → live-fetch path:
   - **Allowlist (SSRF guard, from T3.8):** the ONLY fetchable URL is the current platform's `docs_url` from the registry. Never fetch user-supplied URLs.
   - Fetch + chunk (via `DocIngest`), embed the query once (already have it — refactor retrieve to expose `embedQuery`), rank the fresh chunks in-memory by cosine vs. the query vector, take top 3, hand them to the pipeline (`sourceUrl` = docs_url, `trustScore 0.6`, mark `id:'live-<n>'`).
   - Fire-and-forget the upsert of ALL fresh chunks (same hash-idempotent insert) — `void ingest(...)` with a `.catch` that logs; the request must not wait for DB writes.
   - Log the tool call per §8 L3: `{type:'tool:live_fetch', platformId, durationMs, chunksFound, status}` — input/latency/status, no content.
   - Any live-fetch failure → degrade exactly as today (partial, empty chunks). Timeout 8s.
4. Tests: low-similarity triggers fetch (mock fetch returns HTML, assert chunks handed to output + upsert fired); allowlist enforced (agent never fetches a non-registry URL — construct the temptation and assert); failure degrades to partial; `LIVE_FETCH_ENABLED=false` skips.

### Acceptance criteria
- Deleting a platform's chunks and drafting for it (locally, manual) triggers a live fetch, the draft is grounded, and moments later the chunks exist in the DB (self-healed). Tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
```

---

## [x] P-T5.3 — MPKB population + strategy-profile tuning (§10.2)

### Objective
Deepen the Model & Prompting Knowledge Base (model-family behavior, distinct from platform docs), wire MPKB retrieval explicitly into drafting/critique, and let strategy profiles cite MPKB entries.

### Read first
`config/pkb-seed.json` (mpkb entries exist: `model_family` llm_general/diffusion_image), `backend/src/services/PKBService.ts` (the SQL already includes `kind='mpkb'` rows regardless of platform), `backend/src/agents/DraftingAgent.ts` (buildSystemPrompt), `config/strategy-profiles.json`, `config/model-capabilities.json`.

### Steps
1. Content: add ≥ 24 new MPKB chunks to `config/pkb-seed.json` across model families: `llama` (JSON-format quirks — e.g. tendency to omit keys, mitigations), `gpt` (structured-output strictness, system-prompt adherence), `claude` (XML tags, prefill, thinking tags), `gemini` (long-context placement, conversational phrasing), `diffusion_image` (weighting syntax differences MJ vs SD), `reasoning_models` (hidden-token budget behavior). Each with a real `source_url` (provider docs / published research) and honest `trust_score`. Categories: reuse existing (`formatting`, `few_shot`, `negation_handling`, `token_efficiency`, `technique_fit`).
2. Add `model_family` to each platform in `config/platform-registry.json` (new optional field + schema update in `types/Platform.ts`: `model_family?: string` — gemini→`gemini`, chatgpt→`gpt`, claude+claude_code→`claude`, midjourney/stability→`diffusion_image`, cursor/copilot→`llama`? No — set copilot→`gpt`, cursor→`mixed`; use your judgment, document choices in the registry `note`).
3. `PKBService.retrieve`: sharpen MPKB filtering — WHERE `(platform_id = $1 OR (kind='mpkb' AND (model_family = $4 OR model_family IN ('llm_general','diffusion_image'))))` with the platform's `model_family` passed in (nullable). Update `RetrieveFilter`.
4. `DraftingAgent.buildSystemPrompt`: present the two kinds distinctly — "PLATFORM KNOWLEDGE: [...]" and "MODEL BEHAVIOR KNOWLEDGE: [...]" sections (split `pkbChunks` by `kind`), so rationale citations distinguish them.
5. Strategy profiles: add optional `"mpkb_refs": string[]` (category names) per profile in `config/strategy-profiles.json` + schema; DraftingAgent boosts retrieval by appending those category names to its retrieval query string (cheap, no schema change to retrieve()).
6. Re-run `npm run seed:pkb` (idempotent — only new chunks embed). Tests: retrieve filter SQL includes model_family param; prompt-builder splits sections; profile schema accepts mpkb_refs.

### Acceptance criteria
- Drafts for Claude visibly lean XML-tag phrasing while Midjourney drafts stay tag-style (run two live drafts, paste the assembled strings); MPKB citations appear in node rationale ([n] refs). Seed run reports the new chunk count. Tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test && npm run seed:pkb
```

---

## [x] P-T5.4 — Extension scaffold: MV3 + React + Vite (§20.2)

### Objective
A loadable Chrome extension skeleton: background service worker (owns network + auth), content script with a Shadow-DOM overlay, hotkey + toolbar activation. No product features yet — the shell.

### Steps
1. Scaffold `extension/` by hand (no boilerplate generators): `package.json` (deps: react, react-dom; dev: vite, @vitejs/plugin-react, typescript, @types/chrome), `vite.config.ts` with two builds (background SW as ES module; content script as IIFE — MV3 content scripts can't be modules), `tsconfig.json` strict.
2. `extension/src/manifest.json` (copied to dist by a small build script): `manifest_version: 3`, `permissions: ["storage", "activeTab", "scripting"]`, `host_permissions`: the url_patterns of the 5 launch platforms from `config/platform-registry.json` (hardcode initially; T5.5 fetches the registry dynamically — leave a comment), `background.service_worker`, `content_scripts` matching the same hosts, `commands`: `toggle-overlay` bound to `Ctrl+Shift+Space` / `Cmd+Shift+Space`, `action` (toolbar icon; placeholder icons 16/48/128 as simple generated PNGs — a solid-color square is fine, add `scripts/make-icons.mjs` using raw PNG bytes or a tiny canvas-free encoder; if that's fiddly, check in three hand-made PNGs).
3. Background `src/background/index.ts`: message router (`chrome.runtime.onMessage`) with typed messages (`types/messages.ts`: `{kind:'API_REQUEST', path, method, body}` → fetches `API_BASE` with the stored token; `{kind:'GET_TOKEN'}`; `{kind:'TOGGLE_OVERLAY'}` relayed to the active tab). Token + API base live in `chrome.storage.local`; a minimal options page (`options.html`) lets a developer paste an API base + token for now (real auth in T5.6 hardening or via web-app session handoff — note as TODO).
4. Content script `src/content/index.tsx`: on TOGGLE message, mount/unmount a `<div id="promptforge-root">` with an **open Shadow Root**; render React inside it; all styles injected as a constructed stylesheet INTO the shadow root (write plain CSS in `overlay.css`, import as string via vite `?inline`). Overlay v0: a positioned panel saying "PromptForge" + close button + Esc-to-close; `z-index: 2147483647`.
5. Hotkey: `chrome.commands.onCommand` in background → TOGGLE to active tab.
6. `extension/README.md`: build (`npm run build` → `dist/`), load-unpacked instructions, the SW/content-script security split explained (§20.2 rule).
7. Tests: typecheck is the gate (`npx tsc --noEmit`); add vitest only for the message router's pure routing function.

### Acceptance criteria
- `npm run build` produces a `dist/` that loads unpacked in Chrome with zero manifest errors; hotkey toggles the overlay on a test page; host page styles do NOT affect the overlay (verify on a page with aggressive global CSS, e.g. any docs site — document the check).
- Content script contains zero `fetch` calls and zero token access (grep and state it).

### Verify with
```bash
cd extension && npx tsc --noEmit && npm run build && ls dist/manifest.json dist/background*.js
grep -rn "fetch(" src/content && echo "FAIL: content fetches" || echo "OK: no content fetch"
```

---

## [x] P-T5.5 — Platform detection engine (§5.2, §5.1)

### Objective
Detect which registered platform the current tab is, from the server-served registry (never hardcoded), robust to SPA navigation; degrade to generic mode with a "request platform support" action.

### Read first
`config/platform-registry.json` entries: `url_patterns` (glob-ish `https://gemini.google.com/*`), `dom_fingerprint_selectors`, `input_selector_candidates`. Extension scaffold from T5.4.

### Steps
1. Registry fetch: background fetches `GET /platforms` on install/startup, caches `{registry, fetchedAt}` in `chrome.storage.local`, TTL 24h, stale-while-revalidate. (Cloudflare KV edge caching of /platforms is a backend nicety — add `Cache-Control: public, max-age=3600` to the `/platforms` response in `backend/src/handlers/routes.ts` now; actual KV wiring can ride T7-era infra. Note it.)
2. `extension/src/content/detect.ts`: pure function `detectPlatform(url: string, doc: Document, registry): {platformId, confidence:'url+dom'|'url'|'none'}`:
   - URL match: convert `url_patterns` globs to RegExp (escape, `*` → `.*`).
   - DOM confirm: if any `dom_fingerprint_selectors` matches → `url+dom`; URL-only → `url`.
3. SPA re-detection: patch via `navigation` API if present else wrap `history.pushState/replaceState` + `popstate` + a debounced `MutationObserver` on `<head>` title changes; re-run detection ≤ once/second.
4. Overlay v1 header shows the detected platform ("Drafting for: Google Gemini") or generic mode ("Unknown site — generic prompt mode") with a "Request support for this site" button → messages background → `POST /platform-requests` — **add this tiny backend endpoint** (authed-optional public with IP rate limit 5/day like demo; body `{url_origin, note?}`, Zod-validated, INSERT into a new `platform_requests` table via migration `007_platform_requests.sql` (`id, origin text, note text, created_at`)). Store origin only, never full URLs (privacy).
5. Tests: backend endpoint (shape/rate limit); detect.ts pure-function tests in vitest (fixture registry, jsdom docs for fingerprints; SPA-nav simulated by calling detect twice with changed URL).

### Acceptance criteria
- On gemini.google.com, chatgpt.com, claude.ai, midjourney.com, and a random site: correct id or clean generic mode (manual matrix in the report); navigating within a SPA re-detects; zero hardcoded platform data in the extension (grep for 'gemini' etc. in src — only the manifest host list remains, noted for T8.5).

### Verify with
```bash
cd extension && npx tsc --noEmit && npm run build && npx vitest run
cd ../backend && npm run typecheck && npm test
```

---

## [x] P-T5.6 — In-context drafting overlay + insert (§4, §20.2)

### Objective
The §4 walkthrough, verbatim, inside the overlay: invoke on a platform page → detect → clarify → draft → score → **insert into the page's input field — never auto-submit**.

### Read first
The web clarification flow contract (P-T4.4), `DesignedResponse`, registry `input_selector_candidates` + `tos_reviewed`, T5.4 message router, T5.5 detection.

### Steps
1. Port the clarify→draft flow into the overlay (React, inside the shadow root): platform comes from detection (locked, with an override dropdown of all registry platforms); idea textarea; question cards (same interaction rules as P-T4.4 — chips, Other, just-generate; reuse copy strings); result view: assembled prompt, strength score + band, sub-scores collapsed, node list read-only v1 with alternative-swap only (full editing stays in the web app; link "Open in editor" to the web URL with the session id).
2. All API calls go content → background message → fetch (existing router). Add message kinds: `DRAFT`, `CLARIFY`, `SERIALIZE`.
3. **Insert:** button "Insert into page" — enabled ONLY when: detected platform confidence includes `url`, `tos_reviewed === true` in the registry for it, and an input element is found via `input_selector_candidates` (try each selector in order; must be visible + editable). Fill: for `<textarea>`/`<input>` set `.value` + dispatch `input` events; for `contenteditable` set textContent + `input` event. **Never** dispatch Enter, click send buttons, or submit forms. If no input found → fall back to Copy with a toast.
4. ToS flag flips: for each of the 5 launch platforms, review its ToS for automated-input concerns and record the finding in `docs/tos-review-<date>.md` (per platform: link, relevant clause summary, verdict). Set `tos_reviewed: true` in the registry ONLY for platforms whose verdict is OK, then `npm run seed:registry`. **If you cannot access ToS pages, leave the flag false and say so — the button stays disabled; that is correct behavior.**
5. Tests: insertion helper as a pure-ish function tested in vitest+jsdom (textarea, contenteditable, not-found→null); tos gate (registry fixture with false → button logic returns disabled reason).

### Acceptance criteria
- The §4 walkthrough works on gemini.google.com end-to-end (manual, documented with the assembled string) — invoke → detect → clarify → draft → score → insert fills the box and does NOT send.
- No auto-submit code path exists (state it after grepping for `submit`, `keydown`, `Enter` dispatches).

### Verify with
```bash
cd extension && npx tsc --noEmit && npm run build && npx vitest run
```

---

## [x] P-T5.7 — Model & Platform Recommendation surfacing (§15)

### Objective
Put the existing `/recommend` backend in front of users: before drafting (web + extension), show ranked model/platform candidates with visible quality/cost/speed trade-offs; keep the matrix data fresh-able.

### Read first
`backend/src/services/RecommendationService.ts` + `config/model-capabilities.json` (built in TA.2), `POST /recommend` contract in the Global Context Block, web `/build` page (T4.4), overlay (T5.6).

### Steps
1. Backend polish: add `platform_id` to each capability entry where a registry platform exists for it (extend schema: optional `platform_id`), so the UI can deep-link "draft for this". Add `GET /capabilities` (authed) returning the matrix + `last_verified` for transparency. Refresh data pass: update `config/model-capabilities.json` entries against current public pricing/limits pages; bump `last_verified` (document sources in the JSON `note`).
2. Web: on `/build`, after task-type is known (post-intent, or user-picked modality pre-draft), a collapsible "Which model fits this task?" panel: call `/recommend` with the modality + user-adjustable priority sliders (quality/cost/speed, three range inputs summing visually); render the top 4 as cards — score, the `tradeoff` line verbatim, cost/latency tier dots, context window, and "Draft for this platform →" when `platform_id` maps.
3. Extension: same panel, compact, in the pre-draft state of the overlay.
4. Staleness honesty: if `last_verified` is older than 60 days, show "capability data last verified <date>" warning chip (§15.1 perishable-data ethos).
5. Tests: backend capabilities endpoint + schema addition; web/extension builds; a small vitest on the slider-weights → request mapping.

### Acceptance criteria
- A video task shows only video-capable candidates with trade-offs (live check via web UI against local backend); moving the cost slider reorders results; matrix edits (config only) change recommendations without code changes (demonstrate by editing a tier and re-calling).

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../web && npx tsc --noEmit && npm run build
cd ../extension && npx tsc --noEmit && npm run build
```

---
---

# PHASE 6 — PREVIEW, ALTERNATIVES & SESSION MEMORY (§24 Phase 2)

---

## P-T6.1 — Live textual preview (§12.1, §12.3)

### Objective
After each clarification answer or node change, a 1–2 sentence "here's what you'll likely get" description, updating within ~1s, debounced, streamed if cheaply possible.

### Read first
`backend/src/services/providers/index.ts` (generate — non-streaming), `config/model-routing.json` (add a route), the clarify flow (web T4.4 / extension T5.6), node editor (T4.5).

### Steps
1. Routing: add `{"pipeline_step":"preview","complexity":"small","provider":"groq","model_id":"llama-3.1-8b-instant"}` to `config/model-routing.json`.
2. Backend `POST /preview` (authed + demo variant not needed): body `{platform_id, task_type, known: Record<string,string>}` (the answers/entities/node values so far). Implementation `services/PreviewService.ts`: single small-tier `generate('preview','small',...)` — system prompt: "In 1–2 plain sentences, describe the likely output of a <task_type> prompt with these elements. No preamble, no advice."; maxTokens 300; temperature 0.4. Returns `{preview: string, tokensUsed}`. 5s timeout → `{preview: null}` (UI just hides it). Meter usage (a `usage_events` row, step `PreviewService`).
   - **Streaming note (§23.2):** API Gateway HTTP APIs buffer responses; true token streaming needs Lambda response streaming via Function URLs — which are org-blocked on this account. Therefore: v1 is non-streaming (calls are ~300ms on Groq 8B; within the ~1s budget). Record this constraint in the code comment and move on.
3. Rate/cost control (§12.3): debounce client-side 600ms after last change; server-side, reuse the per-user rate limit; cap preview calls per session to 30 (in-memory counter keyed by session id, 429 after).
4. Web: preview line under the question flow (updates after each answer) and under the node editor (updates on node change). Subtle style, labeled "Likely result (preview)". Extension: same in the overlay.
5. Tests: PreviewService happy/timeout/degrade (mock fetch); route validation; session cap.

### Acceptance criteria
- Answering a question updates the preview in ~1s locally (state measured latency); rapid typing triggers ≤1 call per 600ms window (client debounce shown in code + a vitest on the debounce util); cost per preview call visible in usage_events.

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../web && npx tsc --noEmit && npm run build
```

---

## P-T6.2 — Optional visual preview (§12.2, §12.3)

### Objective
Opt-in, cost-bounded image preview for visual tasks — clearly labeled as NOT the target platform's model.

### Read first
`types/Provider.ts`, `GeminiEmbeddingAdapter` (Gemini API call shape), env (`GEMINI_API_KEY`), §12.2.

### Steps
1. Provider seam: add to `types/Provider.ts`: `interface ImageProvider {name: string; generateImage(prompt: string): Promise<{imageBase64: string; mime: string}>}`. Implement `services/providers/GeminiImageAdapter.ts` using Google's image generation endpoint (Gemini API image generation / Imagen-family model available on the free-tier key; consult https://ai.google.dev/gemini-api/docs/image-generation for the current model id — pin it in `config/model-routing.json` under a new `"image_preview"` entry `{provider:'gemini_image', model_id:'<current>'}` so swapping stays config). If the key's tier cannot generate images, implement the adapter + a clean 503 "visual preview unavailable on current provider tier" path, and note it — the seam is the deliverable.
2. Backend `POST /preview/visual` (authed): `{platform_id, assembled}`; gates: env `VISUAL_PREVIEW_ENABLED` (default `'false'`), per-session cap 3 (in-memory), per-user 10/day (reuse rate-limit table pattern), only for platforms with modality `image`. Meter tokens/cost estimate row. Response `{imageBase64, disclaimer}` where disclaimer = "Preview rendered by <model>, not by <platform display_name> — expect differences."
3. Regenerate only on node CHANGES (§12.3): client keeps a hash of the assembled string; button disabled while unchanged.
4. Web/extension: an "Enable visual preview (uses extra quota)" toggle per session, default OFF; image shown with the disclaimer caption under it.
5. Tests: gating (disabled env → 404/disabled; non-image platform → 400; caps → 429); adapter with mocked fetch.

### Acceptance criteria
- Default OFF everywhere; when enabled and provider-capable, an image renders with the disclaimer; caps enforced; unchanged prompt cannot re-generate. All tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
```

---

## P-T6.3 — Alternatives Agent, real (§7.1, §13.2 — replaces the last placeholder)

### Objective
Replace the `AlternativesAgent` placeholder: 2–4 ranked, PKB-grounded alternatives for each creative, non-locked node; localized regeneration that honors locks.

### Read first
`backend/src/agents/placeholders.ts` (the last placeholder), `agents/index.ts` wiring pattern (class + instance export, exactly like CriticAgent), `agents/draftShared.ts`, `Supervisor.applyOutput` ('alternatives' case already merges `data.draft`), `DraftingAgent` (many nodes already carry alternatives from drafting — this agent FILLS GAPS and improves ranking, not duplicates).

### Steps
1. Create `backend/src/agents/AlternativesAgent.ts` (class, injectable `generateFn`, same skeleton as CriticAgent):
   - Input: `context.finalDraft`. Target nodes: unlocked nodes of creative types (`style_aesthetic`, `composition_camera`, `lighting_mood`, `setting_context`, `subject`) that currently have < 2 alternatives.
   - If no target nodes → `{status:'success', data:{draft}}` unchanged (cheap no-op).
   - ONE small-tier call for all targets: system prompt lists the full node set as fixed context + the PKB chunks (grounding, cite [n]) + "For each of these node types: <list>, produce 2–3 ranked alternatives with one-line rationale grounded in [n] where possible. JSON: {"alternatives": {"<node_type>": [{"value","rationale","rank"}]}}". maxTokens 2500, temp 0.7, `extractJson`, Zod schema, retry-once-then-partial (keep the draft untouched on failure — alternatives are enhancement, never fatal).
   - Merge: validate each list with `nodeAlternativeSchema`, cap 4 (schema max), skip locked/unknown node types, re-`assembleDraft`? NO — alternatives don't change values; just set `node.alternatives` and keep `assembled` as-is. Return `{status:'success', data:{draft: updated}}`.
2. Wire: remove the placeholder from `placeholders.ts`, export the real instance from `agents/index.ts` (exact pattern of the other five).
3. Tests (`tests/agents/AlternativesAgent.test.ts`): fills gaps only (node with 3 alts untouched); locked nodes skipped; ranking/rationale preserved; malformed → partial with untouched draft; provider error → partial; the Supervisor merge keeps working (existing integration covers it — extend the integration fetch mock with an alternatives-shaped response keyed on its system prompt marker, as done for intent/critic).

### Acceptance criteria
- Live run (local, real provider): a just_generate Midjourney draft ends `ready_for_review` with every unlocked creative node holding ≥2 distinct, sensible alternatives with rationale (paste one node's alternatives). Selecting one in the web editor re-serializes without touching locked nodes (existing T4.5 behavior — confirm). All tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
```

---

## P-T6.4 — Session-level memory application (§17.4, scoped per §24 Phase 2)

### Objective
Within a single session, later drafts remember earlier choices — no re-asking what the user already told us this session. (No cross-session persistence yet — that's T7.3.)

### Read first
`PipelineContext` (`clarifications`, `memory` fields), `ClarifyingQuestionAgent` (skip logic keyed on clarifications/entities), `routes.ts` clarify endpoint (client re-sends idea+clarifications — the server is content-stateless), `SessionService`.

### Steps
1. Contract addition (still content-stateless): `POST /draft/:sessionId/clarify` already receives the accumulated `clarifications` — the CLIENT is the session memory pre-E2EE. Formalize multi-draft sessions: add `POST /draft/:sessionId/again` (authed): body `{platform_id, idea (the NEW idea), carried_preferences: Record<string,string>}` — runs a fresh pipeline in the SAME session id, seeding `context.clarifications` with `carried_preferences` so the clarify agent skips those and the drafting prompt receives them ("Choices the user made earlier this session: ...").
2. Client side (web `/build`): after a completed draft, "Draft another with the same style" button → collects the style-ish answers of the finished draft (clarifications with maps_to_node in style/lighting/composition) into `carried_preferences` and calls `/again` with a fresh idea input. Show carried values as pre-filled, changeable chips (§17.4's "selective, not wholesale" — only style-class preferences carry, never subject/action).
3. DraftingAgent: `buildUserMessage` already includes clarifications — add a distinct line when `params.carried` is set? Keep simple: the seeded clarifications flow through the existing path; no agent change needed. Verify with a test that the drafting user-message contains the carried values.
4. Tests: `/again` reuses the session id, seeds clarifications, skips those questions (integration with mocked provider: carried style → question list excludes style); selective carry logic (unit on the web helper if testable, else backend-side: document the client rule in `docs/feature-additions-v0.7.md` FA note).

### Acceptance criteria
- Second draft in a session with carried style prefs: never re-asks style/lighting; the draft reflects them (mock-run assertion + one live manual run); nothing persists across sessions (restart server → nothing carried — inherent, state it).

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../web && npx tsc --noEmit && npm run build
```

---
---

# PHASE 7 — TRUST, PERSONALIZATION & OPERATIONS (§24 Phase 3)

> **Phase-wide notes:** this phase changes the trust posture — E2EE, BYOK, admin. Re-read spec §19 (privacy), §21 (admin), §9.4 (key custody) before ANY task here. Rule zero: **there must never exist a code path that lets the server or an admin read user prompt content or provider keys.** When a step seems to require one, stop and report instead.

---

## [x] P-T7.1 — End-to-end encryption rollout (§19.2–19.4, §19.6)

### Objective
Client-side encryption of all prompt/session/memory content with user-derived keys: the server stores only ciphertext + wrapped keys; plaintext exists server-side ONLY in-memory during pipeline processing; a recovery code is the sole account-recovery path.

### Read first
Spec §19.2–19.4 fully. `backend/migrations/001_initial_schema.sql` (`*_ciphertext` columns already exist on sessions/prompts/memory_entries/projects), T3.4's `prompt_versions.nodes_json` interim exception (THIS task retires it), `web/src/lib/` (client), `SessionService`, `PromptService`.

### Crypto design (implement exactly this; WebCrypto only, no crypto npm deps)
- Per-user **DEK**: 256-bit AES-GCM key, generated client-side on first setup (`crypto.getRandomValues`).
- **KEK from passphrase**: PBKDF2(SHA-256, 600k iterations, random 16-byte salt) over the user's password at key-setup time (NOT their auth password — an explicit "encryption passphrase" prompt; simplest UX: reuse login password by asking for it once at setup, but derive with a distinct salt+info label so auth compromise ≠ key compromise; document choice).
- **Wrapped DEK** = AES-GCM(KEK, DEK) with fresh IV. Stored server-side.
- **Recovery code**: 24 random words? No — 32 random bytes base32-grouped (8×4 chars), shown ONCE; a second KEK derived from it wraps the DEK again (second wrapped copy). Losing both passphrase and code = data unrecoverable — the UI must say this in plain words (§19.2 honest trade-off).
- Content encryption: AES-GCM(DEK, plaintext JSON), 12-byte IV per message, payload stored as base64 `iv.ciphertext`.
- Multi-device (§19.3): new device = enter passphrase (or recovery code) → unwrap DEK from server copy → cache DEK in IndexedDB (non-extractable via `crypto.subtle.importKey` where possible).

### Steps
1. Migration `008_user_keys.sql`: `user_keys (user_id uuid pk references app_users, wrapped_dek_pass text not null, wrapped_dek_recovery text not null, kdf_salt text not null, kdf_iterations int not null, created_at, updated_at)`. Endpoints: `PUT /keys` (create/rotate wrapped keys — full replacement only), `GET /keys` (own row). **No endpoint ever accepts or returns a raw DEK/KEK.**
2. Web `web/src/lib/crypto.ts`: `setupEncryption(passphrase)`, `unlock(passphraseOrRecovery)`, `encrypt(obj) → string`, `decrypt(string) → obj`, `isUnlocked()`. Setup flow UI after signup (blocking modal): explain, collect passphrase, show recovery code with forced "I saved it" checkbox. Unlock prompt on first content access per device.
3. Client sends ciphertext: `POST /prompts` & version saves now carry `content_ciphertext` (encrypted nodes JSON) instead of plaintext nodes; `sessions.content_ciphertext` gets encrypted idea+clarification history on completion (client-initiated `PATCH /sessions/:id/content {content_ciphertext}` — add it, ownership-checked). **Migration of T3.4's interim `prompt_versions.nodes_json`:** add `content_ciphertext` column to prompt_versions; new writes use it; a client-side one-time migration re-encrypts existing plaintext versions then a cleanup migration NULLs `nodes_json` (`009_retire_plaintext_versions.sql` sets the column to null AFTER the report confirms client migration ran — split into a separate manually-triggered script `scripts/nullify-plaintext-versions.ts`, not an auto migration).
4. Processing-time exception (§19.4): the pipeline already receives plaintext idea/answers per request and holds them in-memory only — verify nothing new persists plaintext (grep SessionService/AuditService params), and add the invariant as a comment block in `SessionService`.
5. Deletion rights (§19.6): `DELETE /me` (authed): deletes user_keys + sessions + prompts(+versions) + memory rows (FK cascade where set), keeps anonymized outcome_signals (no linkage exists), writes an audit row. Ciphertext without keys is dead data — deleting keys alone satisfies erasure, but delete rows anyway.
6. Zero-data-retention note for providers (§19.4): document in `docs/security-review` addendum which providers offer ZDR (Groq/Anthropic/etc. per their current docs) — research + one paragraph each; config flag `provider_zdr` per capability entry (informational).
7. Tests: backend — key endpoints (shape, ownership, no-raw-key invariant), PATCH session content, DELETE /me cascade (fake pool asserting the delete sequence); web — crypto round-trip vitest (encrypt→decrypt identity, wrong key fails), recovery-code unwrap path.

### Do NOT
- No server-side decryption code path, period. No logging of ciphertext (it's still user data). No silent recovery mechanisms.

### Acceptance criteria
- DB inspection (manual query) shows only ciphertext in content columns for a test user; a second browser profile unlocks with the recovery code and reads the same prompt; `DELETE /me` leaves nothing user-linked. Honest-limits copy present in the UI. All tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test && npm run migrate
cd ../web && npx tsc --noEmit && npm run build && npx vitest run
```

---

## [x] P-T7.2 — BYOK provider connections (§9.4–9.6)

### Objective
Users connect their own provider API keys; keys are envelope-encrypted into AWS SSM SecureString, decrypted only ephemerally at call time, revocable, and **never retrievable or displayable by anyone** — including admins. Add OpenAI + Google chat adapters behind the existing seam.

### Read first
§9.4. `backend/migrations/003` (`provider_connections: id, user_id, provider, secret_ref, status, created_at` — key REFERENCES only), `services/providers/openAICompatible.ts` + `ProviderRegistry.ts` (adapter pattern), `types/Provider.ts` (`apiKeyOverride` slot — designed for exactly this), `generate()` in providers/index.ts.

### Steps
1. New dep (justified: AWS SDK v3 SSM client, needed for SecureString custody): `@aws-sdk/client-ssm`. Create `backend/src/services/KeyCustody.ts`: `storeKey(userId, provider, plaintextKey) → secret_ref` (PutParameter `SecureString`, name `/promptforge/byok/<userId>/<provider>/<uuid>`, overwrite:false), `resolveKey(secret_ref) → string` (GetParameter WithDecryption), `revokeKey(secret_ref)` (DeleteParameter). The Lambda's IAM role needs `ssm:PutParameter/GetParameter/DeleteParameter` on `arn:aws:ssm:*:*:parameter/promptforge/byok/*` — document the exact policy JSON in `backend/README.md` for the operator to attach (you cannot attach it yourself).
2. Routes: `POST /connections {provider, api_key}` → validate provider ∈ {openai, google, groq, anthropic-compatible list}, live-test the key with a minimal cheap call (models list endpoint) before storing — reject invalid keys with the provider's error class (never echo the key); store → INSERT provider_connections. `GET /connections` → list (provider, status, created_at — NO secret_ref exposure; it's server-internal). `DELETE /connections/:id` → revoke in SSM + status='revoked'. **There is deliberately no GET-single that returns anything more.**
3. Adapters: `OpenAIAdapter` (`https://api.openai.com/v1`, key `OPENAI_API_KEY` optional platform default or BYOK-only) and `GoogleOpenAICompatAdapter` (Gemini's OpenAI-compat endpoint `https://generativelanguage.googleapis.com/v1beta/openai`) — both ~15-liners over `callOpenAICompatibleChat`. Register in ProviderRegistry. Contract tests via the existing table-driven suite (add rows).
4. Ephemeral use: extend `generate()` with an optional per-request context `{byok?: {provider, secret_ref}}` threaded from the route layer (user picked a connection for this draft: `POST /draft` body gains optional `connection_id`); resolveKey at call time, pass as `apiKeyOverride`, never cache beyond the request, never log. Per-connection metering (§9.6): usage_events gains the existing `provider_connection` column — write the connection id when BYOK was used.
5. Web `/account` → "Provider connections": add-key form (masked input, paste-only), list with revoke buttons, "keys can never be viewed after saving" copy.
6. Tests: KeyCustody with mocked SSM client; connection routes (validation call mocked; key never in any response — assert on full JSON; revoked connections unusable); generate() BYOK path (mocked resolve → apiKeyOverride passed); metering row carries connection id.

### Do NOT
- Key in a DB column, a log line, an error message, or any response — never. No admin listing of key material (there's nothing to list — SSM refs only).

### Acceptance criteria
- Connect a real key (manual, your own test key) → draft through it → usage row carries the connection → revoke → next draft with it fails cleanly with "connection revoked". Grep-proof no-logging claim. All tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
grep -rn "api_key\|apiKey" src/ | grep -i "logger\|console" && echo FAIL || echo "OK: no key logging"
```

---

## [x] P-T7.3 — Cross-session Memory with full user control (§17.1–17.5)

### Objective
Persistent, user-controlled memory: agent-proposed entries require confirmation; view/edit/delete/add/reset controls; selective relevance-based injection into drafting; encrypted at rest via T7.1's DEK.

### Read first
`agents/MemoryExtractionAgent.ts` (built in T2.11 — emits pending proposals, currently unwired), `migrations/001` (`memory_entries: id, user_id, scope, source, status, statement_ciphertext`), §17.3 control list, T7.1 crypto client.

### Steps
1. Wire extraction at session end: in `runPipeline` after a `ready_for_review` result, fire-and-forget `MemoryExtractionAgent.execute` (it's non-fatal by design); return its proposals in the response as `memory_proposals` (plaintext, in-flight only — §19.4). The CLIENT encrypts accepted statements and posts them.
2. Routes (all authed, ownership-checked): `GET /memory` (rows: id, scope, source, status, statement_ciphertext — client decrypts), `POST /memory {scope, statement_ciphertext, source:'user_added'|'agent_proposed', status}` (client sends ciphertext; agent-proposed accepted ones arrive here too, as `status:'active'` after the user confirmed in-UI), `PATCH /memory/:id` (statement_ciphertext or status), `DELETE /memory/:id`, `DELETE /memory` (global reset — require header `x-confirm-reset: true`).
3. Selective application (§17.4): client-side (only the client has plaintext): before drafting, the web app decrypts active memories, filters by relevance — v1 rule: scope match (project > global) AND task-type keyword overlap (a small client util: memory statements tagged at save time with the session's task_type in a plaintext `task_type` column — add via migration `010_memory_tasktype.sql`; the TAG is metadata [P], the STATEMENT stays ciphertext) — and sends the selected statements as a new optional `memories: string[]` field on `POST /draft`. Backend threads them into `PipelineContext.memory` → `DraftingAgent.buildUserMessage` appends "User's saved preferences: ..." when present. Cap 5 statements, 500 chars total (validate).
4. Confirmation UI (web): after a draft completes with `memory_proposals`, a dismissible card: "Remember this? '<statement>'" [Save / No] per proposal (§17.2 — nothing auto-saves). `/account` → "Memory": full list (decrypted), edit inline, delete each, add manual, global reset with typed confirmation.
5. Tests: routes CRUD + ownership + reset header; drafting user-message includes provided memories (agent test); proposal flow returns proposals without persisting anything server-side (integration); relevance filter unit (client vitest).

### Acceptance criteria
- All §17.3 controls demonstrably work (view/edit/delete/add/reset); an "image-style" memory never appears in a code-task draft (filter test); memory statements in DB are ciphertext-only; nothing auto-saves. Tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../web && npx tsc --noEmit && npm run build && npx vitest run
```

---

## [x] P-T7.4 — Projects (§17.6, §28.7)

### Objective
Real project workspaces: CRUD, per-project default platform + pinned node set + scoped memory, `project > global` precedence, all threaded through the pipeline.

### Read first
`migrations/001` (`projects: id, user_id, content_ciphertext, default_platform, created_at`), `PipelineContext.projectId` (exists, unused), memory scoping from T7.3, `SessionService` (persists project_id already).

### Steps
1. Migration `011_projects_fields.sql`: `alter table projects add column if not exists name text not null default 'Untitled'; add column if not exists description text;` (name/description are [P] metadata — user-facing labels; the pinned node set and other content go in `content_ciphertext`).
2. Routes: `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id` — real implementations replacing stubs; ownership-checked; DELETE cascades sessions' project_id to null (FK already `on delete set null`) and deletes project-scoped memory (`memory_entries where scope = project_id`).
3. Pipeline threading: `POST /draft` gains optional `project_id` (validated as caller-owned); sets `context.projectId`; SessionService already persists it. Client sends the project's pinned preferences through the SAME `memories: []` channel from T7.3 (decrypt pinned nodes/preferences from `content_ciphertext`, include with project-scope precedence: project entries first, cap unchanged). Precedence rule lives in the client selector: project-scoped beats global on key collision.
4. Web: `/projects` list + create modal (name, description, default platform); project page: pinned preferences editor (simple key-value list encrypted into content_ciphertext), per-project prompt history (filter `GET /sessions?project_id=`— add the query param), "draft in this project" button pre-selecting platform + carrying pins.
5. Data model stays multi-user-ready (§28.7): don't add owner-assumptions beyond `user_id`; note team-sharing lands in T8.4.
6. Tests: CRUD + ownership + cascade; draft threading (project_id persisted onto the session row — fake pool assert); sessions filter.

### Acceptance criteria
- A project with pinned "watercolor style" prefs demonstrably shapes drafts inside it (drafting user-message includes it) and never outside it (a no-project draft lacks it) — both asserted in tests + one live run. Tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../web && npx tsc --noEmit && npm run build
```

---

## [x] P-T7.5 — Admin Control Plane (§21)

### Objective
A **physically separate** admin deployable — own app, own auth, own DB project — with RBAC per `docs/admin-roles.md`, step-up re-auth for destructive actions, and by construction **zero capability** to read user content or keys.

### Read first
`docs/admin-roles.md` (the RBAC matrix — the source of truth for every permission below), §21 fully, §23.2 (separate Supabase project for admin).

### Architecture (non-negotiable, §21.1/21.3)
- `admin/` = its own Hono backend (second Lambda `pf-admin`) + its own minimal web UI (same-repo `admin/web/`, can be a simple Vite SPA — Next.js not required) + its **own Supabase project** for admin identities (operator must create it; document the setup).
- The admin backend connects to the consumer DB with a **dedicated Postgres role** `admin_readonly_plus` whose grants are EXACTLY: SELECT on sessions/usage_events/audit_log/outcome_signals/platform_requests/library_entries/knowledge_chunks/platforms/model_capability_records + INSERT/UPDATE on library_entries(moderation_status)/knowledge_chunks/platforms + INSERT on audit_log. **No grants on user_keys, memory_entries, prompts, provider_connections, projects.** Migration `012_admin_role.sql` creates the role + grants (with a documented manual step for the password via Supabase dashboard). This is "secure by construction": the ciphertext tables aren't even readable.
- Admin auth: Supabase Auth on the ADMIN project; MFA required (TOTP via Supabase MFA — enroll at first login); JWT claim `role` ∈ {support, security, infra, superadmin} set via the admin project's user metadata by the superadmin.
- Step-up: destructive endpoints require a fresh auth token (< 5 min old — check `iat`) — implement as middleware `requireFreshAuth`.

### Steps
1. Scaffold `admin/backend` (mirror consumer backend structure, minimal: env.ts, auth middleware verifying the ADMIN project's JWKS + role claim, RBAC middleware mapping role→allowed route groups from a `config/admin-rbac.json` derived from docs/admin-roles.md).
2. Modules (routes + minimal UI pages), each RBAC-gated per the matrix:
   - **Registry management** (infra+): GET/PUT platforms rows (edits go to the DB; note the JSON file remains dev source — document the "config file vs DB" precedence: DB wins at runtime after this task? NO — keep file as source of truth, admin edits write BOTH a suggested-change row and require a repo PR; simpler honest v1: read-only registry view + a "propose change" note field. Choose the honest v1, state it.)
   - **PKB/MPKB management** (support+ read, infra write): list/search knowledge_chunks, edit content/trust_score, delete stale (the T5.1 stale list), trigger re-embed (writes a job row; actual re-embed = run seed script — document).
   - **Moderation queue** (support+): library_entries with moderation_status='pending' → approve/reject (step-up).
   - **Pipeline tracing** (support+): sessions list (metadata only — that's all that exists) + per-session audit trail view (T3.1 data), filter by user id/date. This is §21.4-visible: scores and states, never content.
   - **Capability matrix** (infra+): edit model_capability_records rows.
   - **Kill switches / flags** (superadmin, step-up): a `feature_flags` table (migration) read by the CONSUMER backend at request time (cached 60s): `visual_preview_enabled`, `live_fetch_enabled`, `demo_enabled`, per-provider `provider_<name>_enabled` (checked in ProviderRegistry.getProvider → throw "provider disabled"). Consumer-side wiring included in this task.
   - **User/billing admin** (support+): app_users list (id, email, plan, budget), adjust monthly_token_budget (step-up), plan changes.
   - **Security dashboard** (security+): recent auth:rejected audit rows, rate-limit hits, safety-decision counts by category.
3. Every admin action → INSERT into consumer `audit_log` (`actor: 'admin:<id>:<role>'`).
4. Deploy notes in `admin/README.md`: second Lambda + API Gateway, second Supabase project setup, the Postgres role creation, MFA enrollment.
5. Tests: RBAC matrix enforcement (role fixture × route table — support cannot touch flags; security cannot moderate; etc.), step-up freshness, flag propagation to consumer (consumer-side test: flag off → provider disabled error), and THE invariant test: admin backend has no import path to KeyCustody/decryption (static check: grep admin/src for 'KeyCustody|decrypt' → must be empty) plus a DB-level test documenting the role's grant boundaries.

### Acceptance criteria
- §21.4 visibility table holds under test; every admin action lands in audit_log; kill switch flips actually disable a provider on the consumer app within 60s (test with cache bypass); no decryption code path exists (grep + grants). All tests green in both backends.

### Verify with
```bash
cd admin/backend && npm run typecheck && npm test
cd ../../backend && npm run typecheck && npm test
grep -rn "decrypt\|KeyCustody" admin/ && echo FAIL || echo "OK: no decryption in admin"
```

---

## [x] P-T7.6 — Community library submissions + moderation (§14.2)

### Objective
Users submit templates; automated rubric + safety screening auto-publishes high-confidence entries and queues borderline ones for the T7.5 moderation queue; popular templates keep version history.

### Read first
`library_entries` schema (has `source='human_submitted'`, `moderation_status`, `version`), `CriticAgent` scoring internals (reuse the scoring call shape, NOT the refine loop), `ContentSafetyClassifier`, T4.7 library endpoints, T7.5 moderation queue.

### Steps
1. `POST /library/submit` (authed): `{title, description, modality, platform_tags, template: {task_type, nodes}}` — Zod-validated; nodes via `promptNodeSchema`. Library content is PUBLIC by nature — submitting means publishing plaintext; the UI consent copy must say so ("this template becomes public"). Rate limit 5 submissions/day/user.
2. Screening pipeline (`services/LibraryScreening.ts`):
   - Safety: `classifyOrFailClosed` on title+description+assembled template → unsafe = reject 422 (with appeal pointer).
   - Quality: score via a critic-style `generate('critic','large')` call on the assembled template (serialize with a neutral conversational platform) → strength ≥ 70 → auto-approve; 40–69 → `moderation_status='pending'`; < 40 → reject with the issues as feedback.
   - Log decisions to audit_log (`library:screened`).
3. Versioning: re-submission with the same title by the same user bumps `version` and keeps prior rows (immutable history; only the max-version approved row lists publicly — adjust GET /library).
4. Attribution: optional `credit: boolean` — store `attributed_user_id` (nullable) only when true (consent, §14.4 ethos).
5. Web: `/library/submit` form (from a finished draft: "Share to library" button pre-fills the template from current nodes), status page for own submissions.
6. Tests: screening branches (auto-approve / queue / reject — mocked provider scores), safety rejection, version bump, public listing shows only approved max-versions, rate limit.

### Acceptance criteria
- All three screening paths exercised in tests; a submitted-then-approved template appears in GET /library and can be remixed; moderation-pending items appear in the admin queue (cross-check with T7.5's listing). Tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
```

---

## [x] P-T7.7 — Monetization & plans (§28.2, §16)

### Objective
Freemium enforcement wired into the existing budget layer, with Stripe as the tokenizing payment processor — card data never touches our servers (§19.1).

### Read first
T3.2 BudgetService, `app_users.plan` + `monthly_token_budget`, §28.2 (paywall at intensity of use, not basic usefulness).

### Steps
1. Plan definitions as config `config/plans.json`: `{free: {monthly_token_budget: 50000, platforms: 'core', byok: false, projects: 1, visual_preview: false}, pro: {monthly_token_budget: 2000000, platforms: 'all', byok: true, projects: -1, visual_preview: true, price_id: '<stripe price id placeholder>'}}` + Zod schema + loader `services/PlanService.ts` with `entitlements(userId)` (reads app_users.plan → plan config).
2. Enforcement points (each returns a clear 402 `{status:'upgrade_required', feature, plan}` message):
   - Budget: BudgetService reads the plan's budget (replaces the per-user column as source of truth; keep the column as an admin override when non-null — document precedence).
   - BYOK routes (T7.2): plan gate. Projects > limit: gate on create. Visual preview: gate. Platform gating: 'core' = the original 5; drafting for others requires pro (check in POST /draft).
3. Stripe (new dep `stripe`, justified: payments): `POST /billing/checkout` (creates a Checkout Session for the pro price, `client_reference_id = userId`, success/cancel URLs to the web app) and `POST /billing/webhook` (PUBLIC, Stripe signature verification with `STRIPE_WEBHOOK_SECRET`; handles `checkout.session.completed` → set plan='pro'; `customer.subscription.deleted` → plan='free'; idempotent by event id — store processed event ids in a new `billing_events` table, migration `013_billing.sql` which also adds `app_users.stripe_customer_id text`). Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`.
4. Web: `/account` → plan card (current plan, usage vs budget from a new `GET /me/usage` endpoint), Upgrade button → checkout redirect; friendly 402 handling everywhere (an UpgradeModal on any `upgrade_required` response).
5. Tests: entitlement math per plan; each gate's 402; webhook signature rejection, event idempotency, plan flip; usage endpoint. Stripe calls fully mocked.

### Acceptance criteria
- Free user hitting the budget gets the upsell (not a dead end); simulated webhook upgrade flips entitlements immediately; BYOK/extra-platform/visual-preview gates hold; no card data anywhere in our DB (schema check: only customer id + event ids). Tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test && npm run migrate
```

---

## [x] P-T7.8 — Compliance operations package (§27)

### Objective
The "early traction" compliance artifact set (§27.6), real and tested: written policies, retention with automated deletion, incident response, access reviews, subprocessor register, backup/restore evidence, self-service export+deletion.

### Steps
1. Documents in `docs/compliance/` (each 1–2 pages, concrete, referencing actual system behavior — not boilerplate): `data-classification.md` (map every table/column to §19.1 classes [P]/[E]/[N] — derive from docs/data-model.md and verify against live schema), `retention-policy.md` (per class: sessions metadata 24mo, usage_events 24mo, audit_log 36mo, rate_limits 7d, billing_events 7y; content = user-controlled), `incident-response.md` (severity ladder, first-hour checklist, who/how to notify, provider-key-leak playbook referencing T7.2 revocation), `access-review.md` (quarterly checklist: AWS IAM users, Supabase members, GitHub collaborators, admin roles), `subprocessors.md` (AWS, Supabase, Cloudflare, Groq, Google, Cerebras, Stripe — each: what data reaches them, DPA/ZDR link).
2. Automated retention: `backend/src/scripts/retention-sweep.ts` (`npm run retention`): DELETEs per the policy (rate_limits > 7d, expired windows; audit/usage beyond horizon), logs counts, refuses to run without `RETENTION_ENABLED=true`. Schedule: add to the weekly crawl workflow as a second job (monthly cron `0 5 1 * *`).
3. Self-service (§27.4, §29.8): `GET /export` exists (T4.7) — extend with memory/projects/connections metadata; `DELETE /me` exists (T7.1) — verify both against the classification doc and add anything missed.
4. Backup/restore evidence: document Supabase's PITR/backup tier status for this project honestly (free tier = limited); write `docs/compliance/restore-test-<date>.md` performing a REAL restore drill: `pg_dump` the live DB (schema+data) via the pooler, restore into a local Postgres (or a scratch Supabase project), run `npm run migrate` idempotency + `select count(*)` spot-checks, record timings and gaps. If no local Postgres is available, document the exact blocking step and mark the drill "pending operator".
5. Tests: retention sweep (fake pool asserting delete SQL + refusal without the env flag).

### Acceptance criteria
- Every §27.6 artifact exists and reflects reality (spot-checkable claims); the deletion job actually deletes (test); the restore drill ran or its blocker is precisely documented. Tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
ls docs/compliance/
```

---

## [x] P-T7.9 — Continuous improvement loop live (§10.7, §28.5)

### Objective
Aggregate outcome signals into periodic analyses that tune strategy profiles and flag stale MPKB entries — with review landing in the admin queue, and user-visible progress framing.

### Read first
T3.5 (`outcome_signals`, `OutcomeAnalytics`), `config/strategy-profiles.json` (versioned), T7.5 admin (review queue pattern), §10.7.

### Steps
1. `backend/src/scripts/improvement-analysis.ts` (`npm run analyze:outcomes`, monthly cron alongside retention): per task_type × platform: worked-rate, avg strength when worked vs didn't, top under-performing dimension (reuse OutcomeAnalytics); flag rules: worked-rate < 60% with n ≥ 20 → flag the task type's strategy profile; a dimension consistently 1–2 in didn't-work rows → flag related MPKB categories (map dimension→category: platform_fit→syntax/phrasing categories, technique_fit→technique_fit, etc.). Writes rows to a new `improvement_flags` table (migration `014_improvement_flags.sql`: id, kind ('strategy_profile'|'mpkb_category'), target, reason, metrics jsonb, status 'open'|'resolved', created_at).
2. Admin module (extend T7.5): improvement flags list; resolving a strategy flag = a human edits `config/strategy-profiles.json` (bump `version`) and marks resolved with a note — config-not-code deploys (§10.3); resolving an MPKB flag = edit/reseed chunks.
3. User-visible progress (§28.5): `GET /me/progress` (authed): from the user's OWN sessions metadata: avg strength this month vs last, drafts count, best dimension improvement — all computable from metadata columns; web `/account` shows "Your prompts improved N points this month" (hide when insufficient data, n<5).
4. Tests: flag rules math (fixtures crossing thresholds), progress endpoint math + insufficient-data path, migration idempotent.

### Acceptance criteria
- Synthetic outcome data produces a strategy-profile flag that appears in the admin queue; profile version bump is pure config; a user with two months of sessions sees a real delta. Tests green.
- **MILESTONE M4 gate:** after this task, re-run P-T3.8 (security review) against Phase 7 additions — schedule it as the next job.

### Verify with
```bash
cd backend && npm run typecheck && npm test && npm run migrate
```

---
---

# PHASE 8 — PLATFORM PLAY (§24 Phase 4 — gated on M1–M4 traction evidence; do NOT start early, §28.6)

---

## [x] P-T8.1 — macOS app (§20.3, §5.3)

### Objective
A Swift/SwiftUI menu-bar app: global hotkey opens a drafting overlay anywhere; frontmost-app/URL detection via Accessibility — with full graceful degradation when permission is denied.

### Read first
§20.3 + §5.3 fully; the extension's product flow (T5.6) — the macOS app mirrors it; `GET /platforms` registry (`url_patterns` drive URL matching); the web auth flow (Supabase).

### Steps
1. Scaffold `macos/PromptForge/` — Xcode project (SwiftUI, macOS 14+, App Sandbox ON): menu-bar `MenuBarExtra`, global hotkey (Cmd+Shift+Space) via a `CGEvent` tap or the `KeyboardShortcuts`-style approach implemented manually (no third-party deps without justification), overlay = an `NSPanel` (non-activating, floating) hosting SwiftUI.
2. API client `Sources/APIClient.swift`: async/await URLSession wrapper for /platforms, /draft, /draft/:id/clarify, /recommend; Supabase auth: open the web app's login in the browser with a custom-scheme redirect (`promptforge://auth?token=...`) OR device-style manual token paste v1 (choose the simpler, document why; token in Keychain).
3. Ambient detection (§5.3): with Accessibility permission (AXUIElement): frontmost app bundle id; for browsers, the focused window's URL via AX attributes (Safari/Chrome expose it); match against registry url_patterns → preselect the platform. **Pre-prompt explanation screen** before requesting permission: exactly what is read (frontmost app name, window URL), what is never read (keystrokes, screen content, other windows) — §5.3's trust requirement, verbatim honesty.
4. Graceful degradation: permission denied → the overlay still works as a manual builder (platform picked from a dropdown); no nagging (one settings hint max).
5. Insert: v1 = copy-to-clipboard + a "paste where you need it" toast (system-wide typing injection needs more entitlements review — defer, document).
6. Clarify→draft→score UI in SwiftUI mirroring the overlay contract (questions one-at-a-time, MCQ chips, just-generate, score + assembled + copy).
7. Distribution: Developer-ID signing + notarization steps documented in `macos/README.md` (operator runs them; you produce the build config + `notarytool` commands). Auto-update: Sparkle is the standard — new dep justification required; v1 may ship "check for updates" linking to releases; choose and document.
8. Tests: XCTest for APIClient (URLProtocol-mocked), URL-pattern matcher, and the AX-permission state machine (protocol-abstracted so it's testable without real AX).

### Acceptance criteria
- On a Mac with permission granted: hotkey over a browser on gemini.google.com preselects Gemini, drafts, copies — system-wide. With permission denied: full manual flow works, no crashes, honest messaging. `xcodebuild test` green; notarization runbook complete.

### Verify with
```bash
cd macos && xcodebuild -scheme PromptForge -destination 'platform=macOS' build test
```

---

## [x] P-T8.2 — Autonomous Curation Agent (§14.4)

### Objective
The library grows itself: a background job mines **explicitly opted-in** sessions for high-value patterns, generalizes them with an LLM, screens them with the same rubric+safety gates as human submissions, and publishes or queues.

### Read first
§14.4 (the hard privacy constraint is the task's spine), T7.6 (`LibraryScreening` — REUSE it verbatim), `prompts.library_opt_in` column (exists since 001), T7.5 moderation queue.

### Steps
1. Opt-in surface first: web save-flow gains "Contribute the pattern (not your content) to the community library" checkbox → sets `prompts.library_opt_in = true`. Account-level default toggle in `/account` (a new `app_users.library_opt_in_default boolean default false`, migration `015_optin_default.sql`). **The mining query below is structurally incapable of touching non-opted-in rows: `WHERE library_opt_in = true` — and prompts content is ciphertext anyway; mining works on opted-in prompts only where the user ALSO shared plaintext template nodes at save time.** Design consequence: the opt-in checkbox ALSO stores a plaintext `template_nodes jsonb` copy (the generalizable structure, user-consented-public at that moment) — add the column in the same migration; the consent copy must say the pattern becomes public.
2. `backend/src/scripts/curate-library.ts` (`npm run curate`, monthly cron): candidates = opted-in prompts with strength ≥ 80, grouped by (task_type, platform_tags), min 3 similar instances (similarity: matching node-type sets); for each group take the best exemplar.
3. Generalization: one large-tier `generate()` call: "Strip instance-specific content from these node values, produce a reusable template with <placeholders>; keep structure/technique." → Zod-validate as template nodes; placeholder-marker convention `<your subject>` (same as the T4.7 seed).
4. Screening: EXACTLY `LibraryScreening` from T7.6 (safety + rubric): ≥80 auto-publish as `source:'autonomously_published'`, attribution per the originating user's consent flag (§14.4 step 5), else moderation queue.
5. Audit every publish (`library:auto_published`, with the source prompt ids).
6. Tests: the opt-in boundary (query fixture proves non-opted rows can't be selected — assert SQL), generalization parse/validation, screening reuse, attribution consent path, idempotency (re-running doesn't duplicate — track mined prompt ids in a `curation_runs` table, same migration).

### Acceptance criteria
- An opted-in high-strength session becomes a published generic template through the full gate (integration test with mocks + one live dry-run with `--dry-run` flag printing what WOULD publish); zero code path to non-opted-in data (test + grep proof). Tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
node dist/scripts/curate-library.js --dry-run
```

---

## [x] P-T8.3 — macOS SDK (§20.3)

### Objective
Extract the assistant client into an embeddable Swift package with partner API-key auth, docs, and a sample app.

### Steps
1. Partner auth backend: migration `016_partner_keys.sql` (`partner_keys: id, partner_name, key_hash text (sha256 of the key — never plaintext), scopes text[], status, created_at`); middleware `partnerAuth` accepting `X-Partner-Key`, hashing + matching, rate-limited per key (reuse rate_limits with key id); expose ONLY `/draft`, `/draft/:id/clarify`, `/platforms`, `/recommend` to partner keys (a separate Hono group). Admin (T7.5, superadmin) issues keys — key shown once at creation.
2. Swift package `macos/PromptForgeKit/`: extract APIClient + models from T8.1 into the package; the app depends on it. Public surface: `PromptForgeClient(partnerKey:)`/`(userToken:)`, `draft(idea:platform:)`, `clarify(...)`, typed result models mirroring `DesignedResponse`.
3. Sample app `macos/Examples/MinimalDraft/`: 50-line SwiftUI app: text field → draft → show assembled + score, using ONLY the package.
4. Docs: `macos/PromptForgeKit/README.md` — install (SPM), quickstart, auth models, rate limits, the never-auto-submit principle for integrators.
5. Tests: backend partner-auth (hash matching, scope gating, revoked key); package unit tests (mocked URLProtocol).

### Acceptance criteria
- The sample app drafts through the SDK alone (no app-internal imports); a revoked partner key gets 401; keys stored only as hashes. Tests green both sides.

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../macos && swift test --package-path PromptForgeKit
```

---

## [x] P-T8.4 — Teams & shared Projects (§28.7)

### Objective
Multi-user Projects (owner/editor/viewer), shared team libraries, org billing — on the multi-user-ready model from T7.4.

### Steps
1. Migration `017_teams.sql`: `teams (id, name, stripe_customer_id, plan, created_at)`, `team_members (team_id, user_id, role check in ('owner','editor','viewer'), primary key(team_id,user_id))`, `alter table projects add column if not exists team_id uuid references teams(id)`; `library_entries` gains nullable `team_id` (team-private templates).
2. AuthZ layer `services/TeamAuthz.ts`: `roleFor(userId, teamId)`, `canRead/canEdit/canManage` helpers; EVERY project/library route branches: personal (user_id match, unchanged) vs team (role check). Viewer = read + draft-in-project; editor = + edit pins/templates; owner = + members/billing.
3. Routes: `POST /teams`, `GET /teams/:id`, `POST /teams/:id/members {email, role}` (looks up app_users by email; invite-by-email for non-users = out of scope, 404 with message), `PATCH/DELETE members`, `PATCH /projects/:id {team_id}` (owner-only move). Team library: `GET /library?team_id=` merges team-approved entries.
4. **E2EE caveat (be honest in code + docs):** team-shared project pins/templates cannot use personal DEKs. Team-shared content is either (a) plaintext-by-consent like library templates, or (b) a shared team key (complex, defer). Choose (a) for v1: team pins are stored plaintext in a new `projects.team_pins jsonb`, gated by an explicit "shared with your team, not E2E-encrypted" notice. Personal projects stay E2EE. Document in `docs/compliance/data-classification.md`.
5. Org billing: team plan on `teams` overrides members' personal entitlements while acting in that team's projects (PlanService gains team context); Stripe checkout with `client_reference_id = team:<id>`.
6. Web: team switcher, members management page (owner), role badges, the not-E2EE notice on team pins.
7. Tests: full role × action matrix; personal-vs-team routing; entitlement override; the E2EE boundary (team pins never touch ciphertext columns).

### Acceptance criteria
- A 3-user team (owner/editor/viewer fixtures) exercises the whole matrix correctly in tests; a viewer drafting in a team project uses the team plan's budget; personal E2EE untouched. Tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test && npm run migrate
```

---

## [x] P-T8.5 — Firefox port + platform expansion pipeline (§20.2, §5.1, §29.4)

### Objective
Firefox parity for the extension, and a repeatable pipeline that turns `platform_requests` into registry additions (each ToS-reviewed first).

### Steps
1. Firefox: MV3 in Firefox differs — `background.scripts` (event page) vs service_worker, `browser.*` promise APIs. Add `webextension-polyfill` (justified: the standard cross-browser shim) and switch all `chrome.*` calls to imported `browser.*`; build two manifests from one template (`scripts/build-manifest.mjs` with a `--target chrome|firefox` flag): firefox adds `browser_specific_settings.gecko.id`. Vite outputs to `dist/chrome` and `dist/firefox`.
2. Verify feature parity manually on Firefox: detection, overlay, insert (contenteditable quirks differ — retest all 5 launch platforms; document the matrix).
3. Expansion pipeline (docs + tooling): `backend/src/scripts/platform-requests-report.ts` (`npm run platform-requests`): top requested origins with counts. `docs/platform-addition-runbook.md`: (1) pick origin from report, (2) ToS review recorded in `docs/tos-review-<date>.md`, (3) add registry entry (all fields incl. selectors researched on the live site), (4) write ≥6 PKB chunks, (5) `seed:registry` + `seed:pkb`, (6) extension manifest host additions (both targets), (7) verify detection live. Execute the runbook ONCE for the top requested platform as proof.
4. i18n unfreeze groundwork (§29.6): verify every UI string in web+extension flows through the strings module (grep for JSX literals; fix strays); add a `locale` field threaded through PipelineContext (default 'en', unused by agents yet) — the seam, not translations.
5. Tests: manifest builder (both targets valid JSON, required keys), report script (fake pool), strings-module lint (a script that greps for raw literals in components and fails CI — add to web/extension lint).

### Acceptance criteria
- `dist/firefox` loads in Firefox with detection+insert parity on launch platforms (manual matrix documented); one new platform added end-to-end via the runbook (registry+PKB+manifest, ToS verdict recorded); registry additions require zero code changes (assert: the diff for the new platform touches only config + manifest hosts). Tests green.

### Verify with
```bash
cd extension && npx tsc --noEmit && npm run build && npx vitest run
cd ../backend && npm run typecheck && npm test && npm run platform-requests
```

---
---

# TA — FEATURE-ADDITION TASKS (from docs/feature-additions-v0.7.md; TA.1–TA.3 are already built)

---

## P-TA.4 — Multi-platform prompt fan-out (§13.3, FA-1d) — do alongside/after T4.5

### Objective
One finished draft → the same node set serialized for several platforms side by side, each honoring its own dialect.

### Steps
1. Backend `POST /fanout` (authed): `{nodes: PromptNode[], platform_ids: string[] (2–5)}` → for each platform: `{platform_id, display_name, assembled, governor: {tokenCount, maxPromptTokens, withinLimit}}` via `serializeNodes` + `govern`. Zod-validate; unknown platform → listed in a `skipped` array, not an error. Pure/deterministic — no LLM. NOTE the honest limitation in the response: fan-out re-serializes the SAME nodes; platform-specific re-drafting (e.g. conversational rephrasing for Gemini vs tags for MJ) is what `/draft` per-platform does — include `"note": "serialized from shared nodes; for platform-optimized re-drafting, draft per platform"` and a per-platform `redraft_hint: true` when the target's dialect differs strongly from the source's (image-tag vs conversational — derive from a small static dialect map in PromptSerializer).
2. Web: on the result screen, "Generate for other platforms" → platform multi-select → side-by-side cards (platform, assembled, token bar, copy button, "Re-draft natively" button that fires a fresh `/draft` with the same idea+clarifications for that platform).
3. Extension: compact version — a platform dropdown on the result view re-serializing in place.
4. Tests: fanout shapes, dialect hint logic, skipped platforms; web build.

### Acceptance criteria
- One Midjourney draft fans out to SD (negative-prompt line appears) and Gemini (prose + explicit constraints) correctly in one call; hints flag the tag↔prose crossings. Tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../web && npx tsc --noEmit && npm run build
```

---

## P-TA.5 — Trending-prompt discovery (FA-1c, extends §14.4) — Phase 8, after T8.2

### Objective
A background job that surveys PUBLIC prompt-sharing sources for gaining-traction patterns, distills reusable structures, and feeds them through the SAME screening gates into the library.

### Steps
1. Source allowlist as config `config/trending-sources.json`: start with 2–3 explicitly-permitted sources (e.g. public prompt-sharing sites whose ToS allow read access — VERIFY each and record in the tos-review doc; if none verify cleanly, implement the pipeline against a fixtures file and mark sources "pending legal review" — the pipeline is the deliverable, sources are swappable config).
2. `backend/src/scripts/discover-trending.ts` (`npm run discover`, monthly): fetch allowlisted pages (robots.txt-respecting, same DocIngest politeness), extract candidate prompt texts (per-source CSS-selector-ish extraction rules in the config), dedupe by hash.
3. Distill: large-tier `generate()` per candidate batch: "Identify the reusable prompting PATTERN (structure/technique), not the content; output a generic template as nodes JSON with <placeholders>; name its category/niche." → Zod-validate.
4. Screen via `LibraryScreening` (T7.6) — same safety+rubric gates; publish as `source:'autonomously_published'` with `description` crediting "distilled from public community patterns" (no verbatim copying — the distillation step is also the copyright hygiene step: templates must be structural, and a similarity guard rejects outputs > 60% token-overlap with the source text).
5. Attribution/ToS: never store scraped raw text beyond the run (in-memory only); log source origins fetched.
6. Tests: extraction rules on fixtures, overlap guard, screening handoff, robots respect, config-only source swaps.

### Acceptance criteria
- Dry-run over fixtures yields structural templates that pass screening; overlap guard demonstrably rejects a verbatim copy; zero raw scraped text persisted. Tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
node dist/scripts/discover-trending.js --dry-run --fixtures
```

---

## P-TA.6 — Platform usage coaching delivery (FA-4) — Phase 5, after T5.5/T5.6

### Objective
Surface the `usage_tips` PKB chunks (seeded in TA.1) contextually: when the user is ON a platform, show 1–2 relevant usage tips ("enable X slash command", "use plan mode for this").

### Steps
1. Backend `GET /tips/:platform_id?task_type=` (authed, cacheable 1h): retrieve `usage_tips`-category chunks for the platform via `PKBService` (query = task_type + "usage tips"), return top 3 `{content, source_url}`.
2. Extension: a "Tips for <platform>" collapsible in the overlay's pre-draft state, showing 2 tips with a shuffle control; frequency capping — don't reshow a dismissed tip for 7 days (`chrome.storage.local` dismissal list by chunk id).
3. Web: same panel on `/build` after platform selection.
4. Contextual trigger (the FA-4 "when it feels so" clause, kept deterministic): if the drafted task_type is `reasoning_code` and the platform is a coding assistant, prioritize tips whose content mentions the task's language/verb (simple keyword boost client-side). No LLM.
5. Tests: endpoint (retrieval mocked), dismissal capping logic (vitest), keyword boost.

### Acceptance criteria
- On claude.ai-detected pages, coding tasks surface the plan-mode/slash-command tips seeded in TA.1 (live check); dismissed tips stay gone a week. Tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../extension && npx tsc --noEmit && npm run build && npx vitest run
```

---

## P-TA.7 — New-website walkthrough (FA-5, extends §5.4) — Phase 5, after T5.5/T5.6

### Objective
On an unfamiliar/less-supported AI site, an on-request guided walkthrough tailored to the user's stated need: getting started, where the prompt box is, key quirks, fastest path to their goal.

### Steps
1. Backend `POST /walkthrough` (authed): `{origin, page_title?, need: string (user's stated goal, ≤300 chars), known_platform_id?}`:
   - Known platform → ground in its PKB chunks + registry quirks; unknown → general MPKB only.
   - One small-tier `generate()`: "User is on <origin> (<title>), wants: <need>. Produce a 4–6 step getting-started walkthrough as JSON {steps:[{title, detail}], caution?: string}. Steps must be generic UI guidance (find the input, settings that matter) + prompting guidance from the knowledge provided. Do not invent site-specific UI facts you don't have — prefer 'look for' phrasing." Safety-gate the `need` text first (`classifyOrFailClosed`).
   - Zod-validate, retry-once, cap 6 steps. Meter usage.
2. Extension: in generic mode (T5.5's unknown-site state), the overlay offers "New here? Get a quick walkthrough" → need input → step-by-step card viewer (next/prev, step counter), with the caution line styled distinctly. Track completion locally; offer "request full support for this site" (existing T5.5 endpoint) at the end.
3. Honesty constraint: the walkthrough header always shows "General guidance — PromptForge hasn't studied this site in depth yet" for unknown platforms.
4. Tests: endpoint (grounded vs generic branches, safety gate, schema/retry), overlay step-viewer logic (vitest).

### Acceptance criteria
- On an unregistered AI site (manual), a stated need yields a sensible, honestly-framed walkthrough; a known platform's walkthrough cites its actual quirks; unsafe needs are refused. Tests green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../extension && npx tsc --noEmit && npm run build && npx vitest run
```

---
---

# EXECUTION ORDER & INDEX

Recommended sequence (respecting dependencies; parallel tracks where safe):

| Order | Task | Prereqs |
|---|---|---|
| 1 | P-T3.1 audit logging | — |
| 2 | P-T3.2 budgets/rate limits | 3.1 helpful |
| 3 | P-T3.3 degradation ladder | — |
| 4 | P-T3.4 versioning | — |
| 5 | P-T3.5 feedback loop | — |
| 6 | P-T3.6 CI/CD | 3.1–3.5 merged |
| 7 | P-T3.7 load test | 3.6 |
| 8 | P-T3.8 security review | Phase 3 done |
| 9–15 | P-T4.1 → P-T4.7 (web MVP; 4.1→4.2→4.4→4.5→4.6→4.3→4.7 works well) | backend Phase 3 |
| — | **MILESTONE M1** | T2.12+T3.1–3.3+T4.x |
| 16–22 | P-T5.1 → P-T5.7 (+ P-TA.6, P-TA.7 after 5.5/5.6; P-TA.4 anytime after 4.5) | M1 |
| — | **MILESTONE M2** | Phase 5 |
| 23–26 | P-T6.1 → P-T6.4 | M2 |
| — | **MILESTONE M3** | Phase 6 |
| 27–35 | P-T7.1 → P-T7.9 (7.1 before 7.3/7.4; 7.5 before 7.6/7.9; re-run 3.8 after) | M3 |
| — | **MILESTONE M4** | Phase 7 + security re-review |
| 36–40 | P-T8.1 → P-T8.5 (+ P-TA.5 after 8.2) | M4 + traction evidence (§28.6) |

**Standing instruction for every run:** after finishing, update the task's checkbox + a dated status note in `task.md`, exactly like the completed tasks there. Report format: what was built (file list), decisions made, verification output pasted, anything deferred + why.
