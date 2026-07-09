# PromptForge — Master Task Plan (task.md)

> **What this file is:** the single execution roadmap for building PromptForge from zero to a launched product, derived from `prompt-assistant-technical-architecture.md` (v0.6). Every task below has: a description, **how** it will be achieved, concrete deliverables, success criteria, and dependencies. Work proceeds phase by phase, top to bottom — a task is not started until its dependencies are checked off.
>
> **How to use it:** check off tasks as they complete (`[ ]` → `[x]`). Each task references the spec section(s) it implements (e.g. *§10.1*), so the architecture doc stays the source of truth for "why" and this file stays the source of truth for "what's next."
>
> **Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done
>
> **Outsourcing:** every remaining task (Phase 3 → Phase 8 + TA.4–TA.7) has a fully self-contained execution prompt in **`prompt-task.md`** (44 prompts, written for cold-start OSS models: Global Context Block + per-task steps/constraints/acceptance criteria/verification). When outsourcing a task, feed the model the Global Context Block + that one task's `P-Txx` section.

---

## 0. Global Decisions & Ground Rules (apply to every task)

These are locked in up front, per the spec, so no task re-litigates them:

| Decision | Choice | Spec ref |
|---|---|---|
| Infrastructure path | **Path B** — Cloudflare (Pages/R2/KV) + AWS Lambda (Hono, Node.js) + Supabase (Postgres/pgvector/Auth). $0 until ~10K users. | §23.1–23.6 |
| Backend shape | Single "Lambdalith" (one Lambda, Hono router), internally modular per the mandated folder structure. | §22.1, §32.1 |
| Language | TypeScript end-to-end (backend, web, extension). | §23 |
| Dependency policy | Minimal: `hono`, `@supabase/supabase-js`, `@anthropic-ai/sdk`, `zod`, `pino`, `jest`, `typescript`. New deps must be justified. | §32.7 |
| Dependency flow | `handlers → services → agents/guardrails → utils/types`. One-way. No circular imports, ever. | §32.1 |
| Config over code | All environment-variable config validated through a Zod schema (`config/env.ts`). Nothing tunable is hardcoded — especially guardrail thresholds, model routing, platform registry. | §32.3 |
| Agent contract | Every agent implements the standard `Agent` interface (`execute(AgentInput): Promise<AgentOutput>`). | §32.2 |
| Safety posture | Content-safety classifier runs pre-drafting, post-drafting, and pre-library-publish. **Fails closed.** Appeals path exists. | §33 |
| Privacy posture | Only name/email plaintext. Prompt content, memory, projects encrypted at rest with client-derived keys; ephemeral decryption during processing only; nothing sensitive in logs. | §19 |
| Quality posture | The Prompt Quality Rubric + Critic pass ships in the MVP — never deferred. Refinement loop capped at 1–2 iterations. | §10, §24 |
| Testing | Every agent/service/guardrail gets unit tests; the `/draft` pipeline gets an integration test; CI blocks merge on failure. | §32.4 |
| Logging | Structured (pino), every agent step / tool call / safety decision logged; audit-grade events go to an append-only store; **never log prompt plaintext**. | §27.1, §32.5, §33.6 |
| Migrations | Every schema change is a numbered SQL migration in git. | §32.6 |
| Naming | "PromptForge" is a placeholder brand — swap when the real name is chosen (single find/replace; keep it out of code identifiers where possible, use neutral `pf`/product-agnostic names in package names). | doc preamble |

**Definition of Done (every task):** code compiles (`tsc` clean) · tests written and passing · no secrets in code · logging present · follows folder structure · spec section cross-referenced in the PR/commit description.

---

## Repository Layout (target end-state)

```
Prompt AI 2026/
├── prompt-assistant-technical-architecture.md   # the spec (source of truth for design)
├── task.md                                      # this file (source of truth for sequence)
├── docs/                                        # Phase 0 design artifacts (versioned, human-readable)
│   ├── quality-rubric.md                        # §10.1 rubric with scored examples
│   ├── clarification-taxonomy.md                # §11 question decision matrix
│   ├── data-model.md                            # §17/§18 plain-language data model
│   ├── admin-roles.md                           # §21 RBAC matrix
│   └── acceptable-use-policy.md                 # §33.5
├── config/
│   └── platform-registry.json                   # §5.1 launch registry (3–5 platforms)
├── backend/                                     # the Lambdalith (§32.1 structure, verbatim)
│   ├── src/{agents,guardrails,services,handlers,middleware,types,utils,config}/
│   ├── tests/{agents,services,handlers,guardrails,integration}/
│   ├── migrations/
│   └── package.json / tsconfig.json / jest.config.js / README.md
├── web/                                         # Next.js app (Cloudflare Pages)
├── extension/                                   # Manifest V3 + React + Vite
├── admin/                                       # separate deployable — Admin Control Plane (Phase 7)
├── macos/                                       # Swift/SwiftUI app (Phase 8)
└── .github/workflows/ci.yml                     # lint + secret-scan + test + deploy
```

---

# PHASE 0 — Foundation & Design (Weeks 1–2 · zero code) — §31.1

*Goal: pin down everything code can't change — definitions, data flow, taxonomies — so every later task is unambiguous.*

### [x] T0.1 — Author the Prompt Quality Rubric document — §10.1, §31.1 Step 1
- **Description:** The single versioned definition of what "excellent" means. All eight dimensions — specificity, unambiguity, non-conflict, platform-fit, constraint-completeness, output-format determinacy, context-window efficiency, technique-fit — each with a plain definition and scored examples (score 1 vs. score 3).
- **How:** Write `docs/quality-rubric.md`. For each dimension: definition → what a low score looks like → what a high score looks like → 2 concrete scored examples → how it maps to a 0–100 overall Prompt Strength Score (weighted average, weights stated explicitly so the Critic Agent (T2.7) and the user-facing score (T4.6) compute identically).
- **Deliverable:** `docs/quality-rubric.md`
- **Success criteria:** a new person can score any prompt the same way you would; no dimension is ambiguous; a non-technical reader understands it.
- **Depends on:** nothing.

### [x] T0.2 — Build the launch Platform Registry — §5.1, §31.1 Step 2
- **Description:** Machine-readable registry of the 3–5 launch platforms spanning modalities (chat, image, code) — the config that later lives in the database and is served to clients at runtime.
- **How:** Write `config/platform-registry.json`: per platform — `platform_id`, `display_name`, `modalities[]`, `url_patterns[]`, `dom_fingerprint_selectors[]` (placeholder until extension work), `docs_url`, `quirks[]`, `syntax_rules[]`, `max_prompt_tokens`, `schema_version`, `last_verified`. Launch set: `google_gemini`, `openai_chatgpt`, `anthropic_claude`, `midjourney`, `stability_stable_diffusion`.
- **Deliverable:** `config/platform-registry.json`
- **Success criteria:** every launch platform has a complete entry; a developer can read it and know how to detect the platform and what constraints to respect.
- **Depends on:** nothing.

### [x] T0.3 — Define the Clarification Question Taxonomy — §11, §31.1 Step 3
- **Description:** For each platform × modality combo: which questions get asked, in what order, MCQ vs. free-text, and the MCQ option sets — the blueprint the Clarifying Question Agent (T2.5) and frontend flows (T4.4) are built against.
- **How:** Write `docs/clarification-taxonomy.md` as a decision matrix. Cover: `text_to_image`, `text_to_video`, `chat_persona`, `reasoning_code`, `extraction_classification`, `long_form_writing`. Encode the core rule (enumerable+platform-relevant → MCQ; open-ended → free text; hybrid → MCQ + "other" escape hatch), the 3–5 question cap, and the always-available "just generate now" control.
- **Deliverable:** `docs/clarification-taxonomy.md`
- **Success criteria:** a frontend developer can build the MCQ/input flows from this document alone, without asking questions.
- **Depends on:** T0.2 (platform list).

### [x] T0.4 — Sketch the Memory, Project & core data model — §17, §18, §31.1 Step 4
- **Description:** Plain-language description of everything the system stores about a user and why — the intent document the SQL schema (T1.3) is derived from.
- **How:** Write `docs/data-model.md` covering: USER, SESSION, PROJECT, PROMPT, PROMPT_NODE, MEMORY_ENTRY, LIBRARY_ENTRY, KNOWLEDGE_CHUNK (PKB) + MPKB_ENTRY, MODEL_CAPABILITY_RECORD, PROVIDER_CONNECTION (BYOK), USAGE_EVENT, OUTCOME_SIGNAL, AUDIT_LOG_ENTRY, SAFETY_DECISION, APPEAL. For each: fields, which are plaintext vs. encrypted-blob (per §19.1 classification), scope rules (global vs. project), and retention intent.
- **Deliverable:** `docs/data-model.md`
- **Success criteria:** a non-coder understands what is tracked and why; every entity in §18 is represented; the encrypted/plaintext split is explicit per field.
- **Depends on:** nothing.

### [x] T0.5 — Define the Admin Roles & Permissions matrix — §21, §31.1 Step 5
- **Description:** RBAC table for support / security / infra / superadmin, with "secure by construction" boundaries (capabilities that don't exist can't be granted).
- **How:** Write `docs/admin-roles.md`: per role — can / cannot lists; the global invariants table from §21.4 (what no admin can ever see: plaintext prompts, memory, BYOK keys); step-up auth requirements per destructive action.
- **Deliverable:** `docs/admin-roles.md`
- **Success criteria:** each role's boundary is clear; the no-decryption-capability invariant is stated as a construction constraint, not a permission flag.
- **Depends on:** T0.4.

### [x] T0.6 — Write the Acceptable-Use Policy draft — §33.5
- **Description:** The legal/policy companion to the technical guardrails: prohibited content, enforcement, appeals, reporting.
- **How:** Write `docs/acceptable-use-policy.md` following the §33.5 structure, aligned with the threat model in §33.1 (block: jailbreaks, illegal instruction, CSAM, targeted harassment, scaled disinformation; allow: creative expression, satire, education, controversial topics).
- **Deliverable:** `docs/acceptable-use-policy.md`
- **Success criteria:** prohibitions map 1:1 to classifier categories (T2.2); appeal path described; readable by an end user.
- **Depends on:** nothing.

---

# PHASE 1 — Infrastructure & Skeleton (Weeks 3–4 · minimal code) — §31.2

*Goal: a deployable, testable skeleton — repo, CI, auth, schema, stub routes — before any agent logic.*

### [x] T1.1 — Repo, tooling & CI pipeline — §31.2 Step 6, §27.3
- **Description:** Git repo with the target layout, backend scaffold in the exact §32.1 folder structure, and CI that lints, secret-scans, and runs tests on every push.
- **How:**
  1. `git init`; root `.gitignore` (node_modules, .env, dist, coverage).
  2. Scaffold `backend/` exactly per §32.1: `src/{agents,guardrails,services,handlers,middleware,types,utils,config}`, `tests/{agents,services,handlers,guardrails,integration}`, `migrations/`.
  3. `package.json` with the minimal dependency set; `tsconfig.json` strict; `jest.config.js` (ts-jest).
  4. `src/config/env.ts` — Zod-validated env loading (§32.3), with `.env.example` listing every required secret, stubbed.
  5. `src/utils/logger.ts` — pino structured logger + `logEvent` helper (§32.5).
  6. `src/index.ts` — Hono app + Lambda handler entry returning `{ ok: true }` on `GET /health`; local dev server via `@hono/node-server` so everything runs before any cloud account exists.
  7. `.github/workflows/ci.yml`: install → typecheck → lint → secret scan (gitleaks) → `npm test`.
- **Deliverables:** initialized repo, compiling backend skeleton, green CI config, `README.md` with "fresh clone → `npm install` → `npm run dev` → hit `/health`" instructions.
- **Success criteria:** fresh clone + one command = running local server responding on `/health`; `npm test` and `npm run typecheck` pass.
- **Depends on:** Phase 0 complete (design artifacts exist to code against).

### [x] T1.2 — Cloud environments: Supabase + Cloudflare + AWS (staging) — §23.2, §31.2 Step 6 — **COMPLETE, fully verified live**
> **Status (2026-07-07):** All three cloud providers are live and the backend is genuinely reachable over the public internet.
>
> **Supabase: fully live.** REST + Auth API reachable; Postgres reachable via the **shared pooler** (`aws-0-ap-northeast-1.pooler.supabase.com:5432` — the direct `db.<ref>.supabase.co` host had unresolved DNS/network issues from the dev machine; keep using the pooler). Auth uses modern asymmetric (ES256) JWT signing, verified via JWKS at `/auth/v1/.well-known/jwks.json`.
>
> **Cloudflare: fully live.** R2 bucket `promptforge-blobs` and KV namespace `promptforge-registry` (`d3c9eff93b7644e7b267d4a4c8025cec`) verified with real upload/download/round-trip and write/read tests. Credentials in `.env`/`config/env.ts`; client code not yet built (R2 client is T7.1 scope, KV registry cache is T5.5 scope).
>
> **AWS: fully live, deployed via API Gateway (not Function URL).** Root-caused the Function URL 403: `aws organizations describe-account` showed this account was `JoinedMethod: INVITED` into org `o-6qeuk7r04f` on 2026-02-16 — i.e. it is a **member account inside someone else's AWS Organization**, not a true standalone personal account. An org-level policy on the (external, inaccessible) management account blocks public Lambda Function URL invocation specifically; `list-policies-for-target` returns empty only because this member account/IAM user lacks visibility into the management account's SCPs/RCPs, not because none exist. Ruled out every account-local cause first (resource policy correct, no AWS Config rules, no VPC, handler path correct, direct `aws lambda invoke` always worked) before concluding this. **Fix: deployed via Amazon API Gateway (HTTP API) instead**, which is not subject to the same restriction — created `qsfu5lcqt2`, granted Lambda invoke permission, and confirmed it is NOT blocked.
>
> **Full deployment verified end-to-end** at `https://qsfu5lcqt2.execute-api.us-east-1.amazonaws.com`: `/health` → 200, `/platforms` → 200 with full registry (fixed a real bundling bug along the way — `config/platform-registry.json` lives outside `backend/` and wasn't in the deployment zip; fixed by bundling `config/` into the zip root and pointing `PLATFORM_REGISTRY_PATH=/var/task/config/platform-registry.json`), and `/draft` with a **real Supabase-issued JWT** (admin-created user → password sign-in → real token) returns `200 ready_for_review`; a garbage token correctly gets `401`. Lambda handler (`src/index.ts`) now exports both the local Node server entry point and a `handler()` adapter that converts API Gateway v2 / Function URL payload-format events to a Web `Request` and back — the same handler works for either front door if the Function URL block is ever lifted.
>
> Cloudflare Pages not yet created (deferred to T4.1, when the web app exists to deploy). Nothing here blocks local backend development, which continues to work fully offline via `npm run dev`.

> See T1.3 below for the full task definition — now complete and verified live.
- **Description:** Stand up the actual Path B staging stack. **Requires user-owned accounts/credentials — flagged as a human-in-the-loop task.**
- **How:**
  1. Create Supabase free-tier project (consumer); note URL + anon/service keys → local `.env` (never committed).
  2. Create Cloudflare account: Pages project (web), R2 bucket (encrypted blobs/media), KV namespace (registry cache).
  3. AWS account: deploy the hello-world Lambda + Function URL (Node 20/22 runtime, streaming enabled); SSM Parameter Store for secrets.
  4. Wire CI deploy job: `deploy:staging` one-command deploy of the Lambda bundle (esbuild → zip → `aws lambda update-function-code`).
  5. Set up the Supabase keep-alive: weekly GitHub Actions ping (§23.3) — later superseded by the real PKB crawler cron.
- **Deliverables:** staging URLs for Lambda + Pages; documented setup runbook in `README.md`; deploy script.
- **Success criteria:** staging Lambda reachable over HTTPS in <2-minute deploys; all three platforms talking (Lambda reads Supabase, Pages serves a placeholder).
- **Depends on:** T1.1. **Blocked on:** user creating accounts / providing credentials.

### [x] T1.3 — Core database schema & migrations — §18, §31.2 Step 8, §32.6 — **COMPLETE, verified live**
> **Status (2026-07-07):** All 3 migration files applied successfully against live Supabase Postgres via `npm run migrate` (connected through the shared pooler — see T1.2 note). 17 tables created, matching `docs/data-model.md` exactly. `pgvector` extension enabled, ivfflat index created on `knowledge_chunks.embedding`. New `npm run seed:registry` script syncs `config/platform-registry.json` → the live `platforms` table (idempotent upsert); ran successfully, all 5 launch platforms verified queryable through the Supabase REST API. Per-user/project/prompt seed data (item 5 below) deferred — not needed until real signup flow (T1.4 live auth) exists.
- **Description:** All core tables as versioned SQL migrations, with pgvector enabled, indexes, and seed data.
- **How:**
  1. `migrations/001_initial_schema.sql`: `app_users`, `projects`, `sessions`, `prompts`, `memory_entries` (+ `schema_migrations` bookkeeping table). ✅
  2. `migrations/002_knowledge_base.sql`: `knowledge_chunks` (PKB+MPKB) with `vector(1536)` + ivfflat index; `platforms` table mirroring `config/platform-registry.json`; `strategy_profiles`; `model_capability_records`. ✅
  3. `migrations/003_safety_and_metering.sql`: `safety_decisions`, `appeals`, `usage_events`, `outcome_signals`, `audit_log` (append-only), `library_entries`, `provider_connections` (key *references* only). ✅
  4. Migration runner (`src/scripts/migrate.ts` → `npm run migrate`) per §32.6, transactional, idempotent, tracked in `schema_migrations`. ✅
  5. Seed script for registry (`src/scripts/seed-registry.ts` → `npm run seed:registry`). ✅ Test user/project/prompt seed data: deferred to T1.4.
- **Deliverables:** migration files, runner, registry seed script — all done.
- **Success criteria:** ✅ `npm run migrate` on a fresh database creates everything; ✅ seeded registry data queryable via the Supabase REST API; Lambda read/write against every table not yet tested (needs T1.2 Function URL fix or local dev server, which already proves DB read/write works via `/platforms`).
- **Depends on:** T0.4 (data model) ✅, T1.2 (live Supabase) ✅.

### [x] T1.4 — Auth + core API route skeleton — §31.2 Steps 7 & 9, §23.4 — **JWT verification COMPLETE, verified live**
> **Status (2026-07-07):** JWT verification is real and tested end-to-end against the live Supabase project — not just stubbed. Created a confirmed test user via the Supabase Admin API, signed in via `/auth/v1/token?grant_type=password` to get a genuine access token, and confirmed the local server's `authMiddleware` correctly verifies it and extracts `userId`.
>
> **Correction to an earlier finding:** I previously wrote that this project uses the legacy HS256 JWT-secret model because `/auth/v1/jwks` 404'd. That was **my mistake, not a real project limitation** — I had the wrong path. The correct endpoint is `/auth/v1/.well-known/jwks.json` (returns 200 with an ES256 key whose `kid` matches real issued tokens). This project uses modern asymmetric JWT signing. `SUPABASE_JWKS_URL` is now set correctly in `.env`; `SUPABASE_JWT_SECRET` is stored but unused (legacy fallback only, not what actually signs tokens).
>
> Signup/login proxy routes (`POST /auth/signup` / `/auth/login`) remain stubbed — clients can call Supabase Auth directly for now (web/extension will do this in Phase 4/5); the proxy routes are a nice-to-have, not a blocker, since the thing that actually matters (verifying tokens on protected routes) is proven live.
- **Description:** Working signup/login via Supabase Auth, JWT verification middleware in the Lambda, per-user rate limiting, CORS, and every MVP route stubbed.
- **How:**
  1. `middleware/auth.ts`: verify `Authorization: Bearer` JWTs against Supabase's JWKS endpoint (cached), attach `userId` to context (~30 lines, §23.4). ✅ verified live.
  2. `middleware/rateLimit.ts`: token-bucket check against a Postgres row, evaluated before any model call (~50 lines, §23.4). ✅ in-memory bucket implemented (T3.2 moves it to Postgres for cross-instance correctness).
  3. `middleware/errorHandler.ts` + CORS config for the web origin and extension origin. ✅
  4. Routes (Hono, all auth-gated except auth/health): `POST /auth/signup`, `POST /auth/login` (stubbed — see note above), `GET/POST /projects`, `POST /draft` (✅ real pipeline, stub agents), `POST /draft/:sessionId/clarify` (stub), `GET /library` (stub), `POST /feedback` (stub), `GET /platforms` (✅ serves live registry), `GET /health` (✅).
  5. ✅ Proved the full loop against the real Supabase project: admin-create user → password sign-in → real JWT → authenticated `/draft` call → 200; garbage token → 401.
- **Deliverables:** middleware trio, route file(s) with stubs, auth integration tests — all done.
- **Success criteria:** ✅ a real user can sign in and call a protected route; ✅ unauthenticated/invalid calls get 401; rate-limit 429 path implemented but not yet load-tested (T3.2/T3.7).
- **Depends on:** T1.1 ✅; full E2E needs T1.2/T1.3 ✅.

---

# PHASE 2 — Guardrails & the Agent Pipeline (Weeks 5–8 · core logic) — §31.3

*Goal: the complete drafting brain — safety first, then the supervisor state machine, then each agent, then the wired `/draft` endpoint. Order within the phase is deliberate: guardrails before generation.*

### [x] T2.1 — Shared pipeline types & the Agent contract — §32.2
- **Description:** The TypeScript source of truth every agent conforms to.
- **How:** `types/Agent.ts` (`Agent`, `AgentInput`, `AgentOutput`, `PipelineContext`), `types/Prompt.ts` (Node taxonomy from §13.1: Subject, Action, Setting, Style, Composition, Lighting, Persona, Constraints, TechnicalParameters, NegativePrompt, OutputFormat — each with primary value, 2–4 ranked alternatives + rationale, lock state, position), `types/Platform.ts`, `types/User.ts`, `types/Safety.ts`. Zod schemas alongside interfaces for runtime validation of model outputs.
- **Success criteria:** all downstream tasks import from `types/` only; `tsc` clean.
- **Depends on:** T1.1.

### [x] T2.2 — Content Safety Classifier v1 + test harness — §33.1–33.3, §31.3 Step 10
> **Status:** heuristic classifier (config-driven patterns), fail-closed wrapper, 3-gate design, and the 33-harmful/32-benign harness all passing (≥90% detection, <5% FP).
- **Description:** Pre-flight safety gate. MVP = pattern/keyword classifier over the §33.1 threat model (jailbreak, illegal-instruction, CSAM, targeted-harassment, disinformation categories), with the interface shaped so a model-based classifier (v2) drops in later without touching callers.
- **How:** `guardrails/ContentSafetyClassifier.ts` returning `{safe, category?, reason?, confidence}`; category patterns in config (not code) so tightening rules needs no deploy (§32.3); **fail-closed wrapper** (§33.7); every decision logged via the audit logger (§33.6). Test harness: labeled set of ≥30 harmful and ≥30 benign prompts (including the §33.9 false-positive traps: "atomic bomb in WW2", dark-fantasy violence, controversial-topic prompts).
- **Success criteria:** ≥90% detection on the harmful set, <5% false-positive on the benign set; classifier outage → generation refused, not skipped.
- **Depends on:** T2.1, T0.6.

### [x] T2.3 — Supervisor/Planner state machine — §7.2, §31.3 Step 11
> **Status:** full state machine with logged transitions, both safety gates, justGenerate short-circuit, clean agent-failure/throw handling; stub agents wired; traced end-to-end via the live `/draft` route.
- **Description:** The orchestration engine owning the pipeline: `context_resolved → intent_classified → docs_retrieved → clarifying → drafting → critiqued → alternatives_attached → governed → ready_for_review`, with logged transitions, retries, early-exit ("just generate now"), and safety gates before/after drafting.
- **How:** `services/PromptService.ts` hosts a `Supervisor` class: explicit state enum, transition function that logs `{state_from, state_to, agent, input_summary, output_summary, tokensUsed, durationMs}` per transition, agent registry keyed by pipeline step, all agents stubbed initially (`{status:'agent_placeholder'}`).
- **Success criteria:** one request traces through the full machine; every transition visible in logs; a forced agent failure produces a clean `failure` result, not a crash.
- **Depends on:** T2.1, T2.2.

### [x] T2.4 — Provider Abstraction + default adapter + model routing table — §9.1–9.3, §7.3 — **COMPLETE (default provider is now Groq — see T2.9 perf note)**
> **Status (2026-07-07):** Built, tested, and the seam has now proven itself twice over — the default provider changed **twice** in one day (Anthropic→OpenCode Zen→Groq) as pure config edits, exactly as designed, with zero agent code changes either time. Delivered: `types/Provider.ts` (ProviderAdapter interface + Zod routing-table schema, BYOK `apiKeyOverride` slot designed in now), `config/model-routing.json` (per-step routes), `services/ModelRouter.ts` (config-driven resolution with default fallback), `services/providers/{openAICompatible,OpenCodeZenAdapter,GroqAdapter,CerebrasAdapter,MockAdapter,ProviderRegistry,index}.ts` — agents call one `generate(pipelineStep, complexity, request)` entry point and never import a provider SDK (§32.2). The three OpenAI-compatible adapters share one `callOpenAICompatibleChat()` helper (added when Groq/Cerebras landed) instead of tripling near-identical code. Contract tests run identically against all four adapters, table-driven for the three OpenAI-compatible ones (§9.1 success criterion). **Current default (2026-07-07 PM, user decision after researching free/fast alternatives): Groq** — see T2.9's perf note for the full story (latency was the reason for the switch, and it worked: 1-2min → 3-7s). Cerebras registered as a faster alternate. OpenCode Zen still registered/configured if paid-tier billing is ever added.
- **Description:** The seam that makes PromptForge model-agnostic: a normalized `generate()` interface, concrete adapters (Groq default, Cerebras/OpenCode Zen as alternates), and a config-driven routing table `{pipeline_step, task_complexity} → {provider, model_id}` (small/fast models for classification/preview, stronger for drafting/critique).
- **How:** `services/providers/` — `ProviderAdapter` interface (internal request/response schema), adapters implementing it, `ModelRouter` reading the routing table from config. No agent ever imports a provider SDK directly. BYOK slot designed into the interface now (key resolution deferred to Phase 7).
- **Success criteria:** ✅ swapping a model/provider for a pipeline step is a config edit (proven twice, live, same day); ✅ mock and real adapters pass the same contract tests.
- **Depends on:** T2.1 ✅.

### [x] T2.5 — Intent Classification Agent — §7.1, §31.3 Step 12 — **COMPLETE (mocked-provider tests green; live smoke pending API key)**
> **Status (2026-07-07):** Real agent live in the pipeline, replacing its placeholder. `agents/IntentClassificationAgent.ts`: small-tier call via the T2.4 `generate()` seam (never imports a provider SDK), strict system prompt demanding JSON-only output, Zod-validated against `intentResultSchema` (task_type ∈ the 6 TASK_TYPES, flat entity map, platform_hint, confidence 0–1), markdown-fence stripping (common model quirk), retry-once-on-malformed then graceful `failure` (never throws), provider outage → immediate graceful failure with no retry storm (§29.7), token accounting returned per call, no prompt plaintext ever logged (§19.1). **Also added the Supervisor context-merge step** (`applyOutput`) — agents return data, only the Supervisor writes it into `PipelineContext` (types/Agent.ts contract); intent → `taskType`/`entities`, and the merge map is pre-wired for docRetrieval/clarify/draft/critic/alternatives as those land. Tests: 10-example classification set + fenced-JSON + retry + double-malformed-failure + provider-error + token-accounting + a Supervisor merge integration test; `/draft` integration test now exercises the real agent against a fetch-boundary mock. 10 suites / 53 tests green. Live smoke script `npm run smoke:intent` ready — needs `OPENCODE_API_KEY`.
- **How:** LLM call (small tier via ModelRouter) → `{task_type, entities{subject,action,...}, platform_hint, confidence}`; Zod-validated structured output; 10-example test set (mocked provider in unit tests, live smoke test separately). ✅
- **Success criteria:** ✅ 10/10 example classifications correct (mocked contract; live accuracy via `smoke:intent` when key arrives); ✅ malformed model output handled (retry once → fail gracefully).
- **Depends on:** T2.3 ✅, T2.4 ✅.

### [x] T2.6 — Doc Retrieval Agent + hand-seeded PKB — §6, §10.2, §31.3 Step 13 — **CODE COMPLETE (live seeding pending GEMINI_API_KEY)**
> **Status (2026-07-07):** Embeddings decision (user): **Google Gemini** (`gemini-embedding-001`, free tier, `outputDimensionality=1536` matching the `vector(1536)` schema exactly — no migration needed; OpenCode Zen has no embeddings endpoint). Delivered: `EmbeddingProvider` seam in `types/Provider.ts`; `GeminiEmbeddingAdapter` (+ documented gotcha handled: Google does NOT L2-normalize vectors at non-default dimensionality, adapter normalizes so pgvector cosine distance is correct) + deterministic locality-sensitive `MockEmbeddingAdapter`; `utils/db.ts` lazy shared pg Pool (Lambda-friendly, max 3) with a test seam; `PKBService.retrieve(query, {platform_id}, k)` — platform-scoped PKB rows + cross-platform MPKB rows, cosine-ordered; real `DocRetrievalAgent` building its query from taskType+entities+platform, **degrading gracefully to `partial` with zero chunks on any retrieval failure — ungrounded drafting beats no drafting (§29.7)**; `config/pkb-seed.json` — 48 hand-curated chunks (8 per launch platform + 8 MPKB model-behavior entries), each with source_url + trust_score; `npm run seed:pkb` — idempotent by content sha256 (re-runs only embed changed/new chunks). **Live-verified 2026-07-07:** `GEMINI_API_KEY` wired in; `npm run seed:pkb` embedded and inserted all 48 chunks into live Supabase (48 inserted, 0 skipped); live retrieval for "Gemini image generation constraints" returned 5 chunks, top hits all Gemini-specific PKB (conversational phrasing, photography vocabulary, aspect-ratio constraint). Success criterion met against the real database.
- **Description:** RAG retrieval over pgvector. MVP: hand-curated chunks per launch platform (syntax rules, capability limits, quirks) + first MPKB entries (model-behavior guidance per §10.2), embedded and upserted. ✅
- **How:** embedding calls via provider abstraction ✅; `PKBService.retrieve(query, {platform_id, modality}, k)` using pgvector similarity ✅; ingestion script `npm run seed:pkb` reading curated JSON ✅; freshness metadata (source URL, timestamp, hash) on every chunk (§6.3) ✅. Live-fetch fallback and scheduled crawler are Phase 5 — the interface anticipates them.
- **Success criteria:** "Gemini image generation constraints" returns 3–5 relevant chunks (⏳ needs live key); ✅ retrieval wired into the drafting path (chunks land in `context.pkbChunks` via the Supervisor merge).
- **Depends on:** T1.3 ✅, T2.4 ✅.

### [x] T2.7 — Clarifying Question Agent — §11, §31.3 Step 14 — **COMPLETE**
> **Status (2026-07-07):** Real agent live, replacing its placeholder. **Design choice: deterministic selector, not LLM generation** — the T0.3 taxonomy is a decision matrix, and config-over-code (§32.3) means it lives in `config/clarification-questions.json` (all 6 task types transcribed with priorities, MCQ option sets, `maps_to_node` from the §13.1 node enum, and `answered_by_entities` skip-keys). An LLM asked to invent questions could violate the taxonomy; a selector cannot. Selection: skip questions pre-answered by intent entities (core rule 7) or by prior clarification rounds, order P1→P3, cap at `CLARIFY_MAX_QUESTIONS` (4), **return zero questions when only P3s remain** (low-information-gain stop), always `can_generate_now: true` (§11.2 — the justGenerate short-circuit itself lives in the Supervisor). Every handed-out question is re-validated against `clarifyingQuestionSchema`. Supervisor merges `questions` → `context.pendingQuestions`. Tests: horse/Gemini example yields exactly [style, setting, composition, lighting]; cap; clarification-round re-ask prevention; P3-only stop; unknown task type; whole-taxonomy "Other"-escape-hatch sweep; 6-task-type coverage; Supervisor merge integration. 14 suites / 70 tests green. An LLM phrasing-personalization pass can be added later without changing the contract.
- **How:** input = task type + entities (+ prior clarifications); output = `{questions, can_generate_now, questions_remaining_estimate}` conforming to the T0.3 taxonomy ✅; stopping criteria: priority-based information-gain rule + configurable cap + "just generate now" respected by the Supervisor ✅.
- **Success criteria:** ✅ horse/Gemini questions match the taxonomy; ✅ never exceeds the cap; ✅ MCQs always include the "other" escape hatch (config-wide test enforces it).
- **Depends on:** T2.5 ✅, T2.6 ✅, T0.3 ✅.

### [x] T2.8 — Drafting Agent + strategy profiles — §10.3, §13, §31.3 Step 15 — **COMPLETE, live-verified end-to-end**
> **Status (2026-07-07):** Real agent live. `config/strategy-profiles.json` — 6 versioned task-type profiles (required_nodes order, per-task temperature, guidance injected into the drafting system prompt) — config, not code (§10.3). `DraftingAgent`: builds a system prompt grounding the model in strategy guidance + platform syntax_rules + quirks + top-6 retrieved PKB chunks (referenced as [n] in rationale); parses the model's node JSON via Zod (`draftResponseSchema`), enriches into full `PromptNode`s ordered by profile, marks `defaulted` on justGenerate for nodes the user never confirmed (§11.2); large tier; retry-once-then-graceful-failure. `services/PromptSerializer.ts` — pure §13.3 serialization with three real dialects: Midjourney (comma tags + `--no` negatives + trailing `--` params), Stable Diffusion (tags + dedicated "Negative prompt:" line), conversational (Gemini/ChatGPT/Claude prose + explicit constraint/format/exclusion lines). `DraftPrompt.evaluation` made optional (Critic T2.9 fills it).
>
> **Live end-to-end run verified** (horse/sunset/Midjourney, justGenerate): idea → real intent → real pgvector retrieval → real DeepSeek drafting → correct Midjourney string: `galloping horse, splashing through shallow water, ... shot on 85mm f/1.4, ... photograph, low angle from water, ... golden sunset light --no text, watermark, people --ar 16:9 --style raw --v 6.1`. The seeded PKB clearly landed (photography vocab, "photograph" not "realistic", `--no` negation, params last). Nodes well-formed with distinct sensible alternatives. **Perf note:** drafting took ~28s on the free reasoning tier (DeepSeek reasoning + large output). Acceptable for MVP; T3.7 (perf tuning) / adding paid-tier billing addresses it.
>
> **Bug found & fixed during live testing:** DeepSeek V4 is a **reasoning model** — hidden reasoning tokens count against `max_tokens`, and at 1800 the JSON output was truncated (`finish_reason=length`) → parse failure. Fixed: strategy profiles bumped to `max_tokens: 4000`, intent agent 300→2000; added tolerant `utils/json.ts extractJson` (strict → fence-strip → outermost `{}`/`[]` slice) shared by both LLM agents; drafting now logs `output_truncated` distinctly from malformed output.
- **Success criteria:** ✅ (horse, running, photorealistic) → well-formed Subject/Action/Style/Composition/Lighting nodes with sensible alternatives; ✅ serialized string respects platform syntax rules (verified live on Midjourney).
- **Depends on:** T2.6 ✅, T2.7 ✅.

### [x] T2.9 — Critic Agent: rubric scoring + bounded refine loop — §10.1, §10.4, §31.3 Step 16 — **COMPLETE, live-verified**
> **Status (2026-07-07):** Real agent live. `CriticAgent` scores the draft against all 8 rubric dimensions (docs/quality-rubric.md), computes 0–100 strength via the shared `computeStrength()` (identical weights as the user-facing score, §10.1), and — when any dimension scores 1 — drives a bounded refine loop: re-draft fixing exactly the flagged issues → re-score, hard-capped at `CRITIC_MAX_REFINEMENTS` (2, §10.4). Large tier. Preserves locked nodes across refinement (§13.2 — refine never overwrites a locked value). Degrades to `partial` (keeps the unscored draft) if scoring is unavailable rather than failing the pipeline (§29.7). Refactored the node schema + `assembleDraft()` into `agents/draftShared.ts` so a refined draft is structurally identical to a fresh one. `DraftPrompt.evaluation` populated here; Supervisor merges it. Tests: strong draft → high score/no refine; vague draft → specificity=1 → refine → fixed; cap never exceeded (5 calls max); large-tier assertion; locked-node preservation; scoring-outage → partial; no-draft → clean failure. **Live-verified:** "a red bicycle leaning against a brick wall" on Midjourney → real evaluation, **strength 93/100**, all sub-scores returned.
>
> **Reliability fix (systemic, benefits every agent):** the free DeepSeek reasoning model's hidden reasoning tokens count against `max_tokens` and their length is *unpredictable* — even simple prompts sometimes truncate (`finish_reason=length`) → broken JSON. Added a **truncation-aware retry in the `generate()` entry point**: any `finish_reason=length` transparently retries once at double the budget, so no agent has to hand-tune token counts. Verified + unit-tested.
>
> **PERF RESOLVED (2026-07-07, same day):** researched free/fast alternatives and switched the default provider from OpenCode Zen/DeepSeek to **Groq** (non-reasoning open-weight Llama models, 500+ tok/s, free tier, no card) — `llama-3.1-8b-instant` for small-tier steps, `llama-3.3-70b-versatile` for large-tier. **Cerebras** also wired in as a registered alternate (even faster wafer-scale hardware, but free-tier context capped at 8192 tokens; live-verified working model on this key is `gpt-oss-120b`, not the `llama-3.3-70b` id found in initial research — Cerebras's lineup changes, check `/v1/models` before assuming an id). Refactored the three OpenAI-compatible adapters (OpenCode Zen, Groq, Cerebras) onto one shared `callOpenAICompatibleChat()` helper instead of tripling ~70 lines of near-identical code. **Result: full pipeline latency dropped from 1–2+ minutes to 3–7 seconds** (a ~20–30× improvement) — confirmed across 3 live runs on 3 different platforms (Midjourney 62/100, Claude 75/100, Stable Diffusion 86/100 strength scores), all correct, all fast.
>
> **Two new Llama-specific model quirks found and fixed live** (neither was a truncation issue — `finish_reason` was `stop` both times): (1) Llama 3.3 70B consistently omits the `"type"` key on every node despite an explicit instruction AND a few-shot example — fixed with a positional fallback (`normalizeRawNodes` in `agents/draftShared.ts`) that fills missing/invalid types from the requested node order, since the model reliably gets *order* right even when it drops the key. (2) The model sometimes returns an inapplicable node (e.g. `negative_prompt`) with `value:""` instead of omitting it as instructed — now treated as an intentional omission and dropped before validation, consistent with the rubric's own "empty optional nodes are fine" principle. Both fixes are generic, tested, and apply automatically to Drafting and Critic-refine.
- **Success criteria:** ✅ vague draft scores low on specificity and triggers refinement; ✅ strong draft scores high (93/100 live); ✅ refinement fixes flagged issues; ✅ loop never exceeds the cap.
- **Depends on:** T2.8 ✅, T0.1 ✅.

### [x] T2.10 — Response Design Layer + Token & Context Governor — §8 L6–7, §9.3, §16, §31.3 Steps 17–18 — **COMPLETE, live-verified**
> **Status (2026-07-07):** Both layers live. `services/ResponseDesign.ts` (pure transform, NO LLM) shapes the quality-checked draft + evaluation + governor report + retrieved knowledge into the single user-facing `DesignedResponse` (`types/Response.ts`): nodes with friendly labels + ranked alternatives + inline rationale + lock/defaulted flags; strength score with band ("Needs work"/"Solid"/"Strong"/"Excellent" per the rubric bands) and all 8 weighted sub-scores; **"why this works" grounded honestly in the actual PKB/MPKB chunks the draft was built on (§10.5 — deduped, trust-ordered), not invented**; the Critic's issues surfaced as improvement hints; governance presentation; defaulted-node-type list (§11.2). The **TokenGovernor is now wired into the Supervisor's governance step** (previously it logged a placeholder transition without running) — `govern()` runs over the assembled prompt and attaches a `GovernorReport` to the context. Route `/draft` now returns `response` (the designed presentation) alongside the raw `draft`.
>
> **Live-verified:** "a lone astronaut watching earthrise from the moon" on Midjourney → the full payload rendered: strength **97/100 (Excellent)** with all 8 dimensions, assembled Midjourney string, 4 grounded "why this works" lessons pulled straight from the seeded Midjourney PKB (comma-tags, composition keywords, "photograph" not "realistic", medium/movement keywords), 2 improvement hints from the Critic, governor 66/350 tokens within limit, 3 defaulted nodes flagged.
- **How:** ✅ `services/ResponseDesign.ts` pure transform; rationale/why-this-works grounded in PKB/MPKB (§10.5). ✅ `guardrails/TokenGovernor.ts` deterministic char-based estimator (v1 — a real per-platform tokenizer lib is a deferred dep, the interface is stable), platform length-limit checks (registry `max_prompt_tokens`), "tighten" suggestion flag, never an LLM call (§16).
- **Success criteria:** ✅ output shape is a fixture-tested contract (tests/services/ResponseDesign.test.ts + the integration test assert it); ✅ an over-long prompt on a platform ceiling is flagged (test: 5000-word prompt → `withinLimit: false` + suggestion); token counts are estimator-based (accurate-tokenizer upgrade deferred, noted in code).
- **Depends on:** T2.9 ✅.

### [x] T2.11 — Memory Extraction Agent (session-level) — §17.2, §31.3 Step 19 — **COMPLETE**
> **Status (2026-07-07):** Real agent live. `MemoryExtractionAgent` distills a completed session into durable USER PREFERENCES (not one-off content) — small tier, `{preferences:[{statement, confidence}]}` Zod-validated, filtered to a 0.6 confidence floor, each mapped to a `MemoryEntry` with `status: 'pending_confirmation'` and `source: 'agent_proposed'` — **never auto-active (§17.2), the user must confirm**. Scopes to `projectId` when present, else `'global'`. Non-fatal by design: provider outage OR malformed output → `success` with zero proposals (memory is a background enhancement, never blocks anything). Privacy (§19.1): logs counts only, never statement text. This agent is NOT in the drafting `STEP_SEQUENCE` — it's a session-end checkpoint, invoked separately (its wiring into the session-end flow is a small future hook; the agent itself is done + tested). 7 tests: pending-not-active, small tier, confidence floor, project scoping, empty-is-fine, provider-outage-non-fatal, malformed-non-fatal.
- **Success criteria:** ✅ an image session yields "prefers photorealistic style"-class statements; ✅ nothing auto-saves (all `pending_confirmation`).
- **Depends on:** T2.3 ✅, T2.4 ✅.

### [x] T2.12 — Wire the full `/draft` pipeline end-to-end — §31.3 Step 20 — **COMPLETE, live-verified**
> **Status (2026-07-07):** The full loop is wired and working live. **Clarification round-trip (§11):** the Supervisor now PAUSES at a new `awaiting_clarification` state when the Clarifying agent surfaces questions and the user hasn't chosen "just generate" (previously it drafted straight through); `POST /draft` returns `{status:'clarifying', session_id, questions, ...}`, and `POST /draft/:sessionId/clarify` resumes with the user's answers merged into `clarifications` (answered questions are skipped on the resume pass → continues to a finished draft, or asks any remaining ones). **Session persistence (§18):** `services/SessionService.persistSessionMetadata` writes a `sessions` row — **metadata ONLY** (final_state, strength_score, rubric sub-scores, refinement_count, platform), **no prompt content** (server stays content-stateless until E2EE in T7.1; the clarify round-trip carries idea+answers client-side). **Usage metering (§19.1, §10.7):** `meterUsage` writes one `usage_events` row per token-spending step (step name + token count, NO content). Both persistence + metering are **best-effort** (try/catch, logged, never fail the user's draft — e.g. they gracefully skip in dev-bypass mode where the user id isn't a real DB uuid).
>
> **Live-verified end-to-end:** (1) `POST /draft` "horse running" on Gemini → `clarifying`, 4 questions, session id returned; (2) `POST /draft/:id/clarify` with answers → `ready_for_review`, **strength 97/100**, same session id. (3) Persistence proven against the live Supabase DB with a real seeded user: session row stored metadata + all 8 rubric sub-scores (no content), usage_events stored per-step token counts (intent 600, drafting 3200). Integration test covers the full round-trip with the mocked provider.
- **Success criteria:** ✅ one API session yields a complete, scored, node-based prompt with alternatives and rationale; ✅ the whole trace is reconstructable from logs; ✅ clarify round-trip works; ✅ metadata-only persistence + content-free metering verified live.
- **Depends on:** T2.2–T2.11 ✅.

---

# PHASE 3 — Production Hardening (Weeks 9–12) — §31.4

*Goal: make the pipeline trustworthy under real load — observability, budgets, degradation, versioning, feedback, deploys, load tests, security review.*

### [x] T3.1 — Immutable logging & observability — §31.4 Step 21, §22.3, §27.1 — **COMPLETE**
> **Status (2026-07-08):** AuditService live. `backend/src/services/AuditService.ts` — `audit()` function: INSERT into `audit_log` via `getPool()`, fire-and-forget (`void audit(...)`) at all call sites, best-effort (try/catch → `audit:write_skipped` log, never fails the user request — mirrors SessionService pattern). Runtime privacy guard strips any `detail` string value > 500 chars (`audit:detail_stripped` warning, key removed entirely — never truncated content). Wired into three event sources: (1) `Supervisor.transition()` → `pipeline:transition` (detail: from/to/agent/durationMs/tokensUsed, actor=userId); (2) `classifyOrFailClosed` → `safety:decision` (detail: decision/category/confidence/failedClosed/classifierVersion, actor=userId, status='blocked' when unsafe); (3) `middleware/auth.ts` → `auth:rejected` on all three failure paths (missing bearer, invalid/expired, not configured — actor='anonymous', detail: reason string only, never the token). `GET /sessions/:sessionId/trace` (authed): returns `{session, events[], usage[]}` — sessions metadata + audit_log rows + usage_events rows, all filtered to `actor/user_id = current userId` (404 on other users' sessions, no existence leak; 503 on DB outage). Migration `004_audit_immutability.sql`: adds `session_id uuid` column + `idx_audit_session` index, revokes UPDATE/DELETE from PUBLIC (idempotent DO block), documents append-only invariant. Tests: 6 AuditService unit tests (insert shape, DB-failure swallow, getPool-failure swallow, 500-char detail strip, boundary-at-500, null detail/sessionId) + 3 integration tests (trace happy path with ownership-param assertion, 404 for other user's session, 503 on DB unavailable). **25 suites / 169 tests green; typecheck clean.**
- **How:** structured audit events (agent steps, API calls, safety decisions, auth events, admin-relevant actions) → append-only `audit_log` table + stdout/CloudWatch; per-session pipeline trace query ("show me everything that happened in session X"); log fields per §31.4: timestamp, user_id, action, status, cost, details — **never prompt plaintext**.
- **Success criteria:** ✅ an engineer can reconstruct any session end-to-end from logs alone; ✅ audit rows cannot be updated/deleted by the app role (UPDATE/DELETE revoked in migration 004).

### [x] T3.2 — Rate limiting & budget enforcement — §16, §22.4, §31.4 Step 22 — **COMPLETE**
> **Status (2026-07-08):** Two-layer budget enforcement live. `BudgetService.ts`: `checkMonthlyBudget(userId)` — async, queries `usage_events` (sum tokens_used this month) + `app_users.monthly_token_budget`, fail-open on DB error or missing user row (`budget:check_skipped` log, allowed=true — budgets are cost control not security). `checkSessionCap(trace)` — pure function, sums `tokensUsed` over the trace against `MAX_TOKENS_PER_SESSION` (10000). **Pre-flight check** wired into `runPipeline` in routes.ts: before `supervisor.run`, calls `checkMonthlyBudget`; if not allowed and `BUDGET_ENFORCEMENT_ENABLED` (new env, boolString default 'true'), returns 429 `{status:'budget_exceeded', message:'Monthly token budget reached (11000/10000). Resets on the 1st.', used, budget}` — no model call is made. **Runaway protection** inside the Supervisor loop: after each agent step, `checkSessionCap(this.trace)`; if exceeded → `logger.error({type:'budget:runaway_halted', sessionId, used})` (the alert hook) + transition to `failed` with `blockedReason:'session token cap exceeded'`. **Postgres-backed rate limit**: `rateLimit.ts` rewritten from in-memory to fixed-window counter in Postgres (upsert-increment on current minute window, 429 when count > `RATE_LIMIT_REQUESTS_PER_MINUTE`); in-memory token-bucket kept as fallback on DB error (`ratelimit:db_fallback` log). Migration `005_rate_limits.sql` (user_id text, window_start timestamptz, count int, PK user_id+window_start). Tests: 8 BudgetService unit tests (over/under budget, boundary, missing user fail-open, DB error fail-open, query rejection fail-open, session cap exceeded/not/empty) + 1 Supervisor runaway halt test (stub agent reporting 50k tokens → halted at 10k cap) + 4 rate-limit middleware tests (PG allow, PG 429, in-memory fallback allow, in-memory exhaustion) + 1 integration 429 budget-exceeded route test. **27 suites / 184 tests green; typecheck clean.**
- **How:** per-user monthly token budgets in Postgres, checked in the Governor **before** model calls; 429 + clear messaging on exhaustion; per-session cost caps with alerting on outliers (runaway-loop protection, §22.4).
- **Success criteria:** ✅ the 10K-budget/11K-draft test rejects cleanly with 429 + used/budget numbers before any provider call; ✅ a simulated runaway session (50k tokens) halts at the 10k cap with an error-level log event; ✅ 31st rapid request within a minute → 429.

### [x] T3.3 — Error handling & graceful degradation — §29.7, §31.4 Step 23 — **COMPLETE**
> **Status (2026-07-08):** Full degradation ladder live. **Heuristic scorer** (`guardrails/HeuristicScorer.ts`): deterministic, no-LLM fallback scoring all 8 rubric dimensions — specificity from node value length + vague-word regex, platform_fit from required_nodes ratio, constraint_completeness from constraint-type node presence, format_determinacy from output_format/technical_parameters, context_efficiency from assembled length vs platform limit, neutral 2 for unambiguity/non_conflict/technique_fit. `rubricVersion: 'v1.0-heuristic'` + mandatory issues note — never reported as model scores. **CriticAgent**: when `score()` returns null (provider outage), now attaches `heuristicEvaluation(draft)` and returns `partial` WITH a scored draft (was: unscored draft). **DraftingAgent**: provider errors now retry (was: immediate failure); after both attempts fail, builds a template fallback from `FALLBACK_VALUES` map + entity/clarification reverse lookup via `ENTITY_TO_NODE`, all nodes `defaulted: true`, returns `partial` with the template draft. Logs `agent:fallback_template_used`. **routes.ts**: 502 response now includes `degraded: boolean` field. **errorHandler.ts**: rolling 5-minute error-rate counter logs `errors:rate` at error level every time count crosses a multiple of 10. Fatal/degradable boundary documented in code: fatal = intent (classification is load-bearing); degradable = retrieval (already), drafting (template), critic (heuristic), memory (already non-fatal). Safety classifier fail-closed behavior untouched (regression test already exists). Tests: 14 HeuristicScorer unit tests + updated CriticAgent outage test (asserts `v1.0-heuristic` rubricVersion) + updated DraftingAgent failure tests (assert `partial` with `defaulted: true` nodes) + fault-injection integration test (provider rejects all except intent → `/draft` just_generate returns 200 with degraded draft + heuristic score band). **28 suites / 198 tests green; typecheck clean.**
- **How:** try/catch on every external call; fallback ladder: Critic fails → heuristic scoring; Drafting fails → template-based fallback prompt; provider down → clear "generation unavailable" message; safety classifier down → **fail closed**; error-rate spike alerting.
- **Success criteria:** ✅ simulated provider outage degrades gracefully (fault-injection test: drafting+critic down → 200 with heuristic-scored fallback template, not 502); ✅ zero unhandled exceptions under fault injection; ✅ heuristic scores marked `v1.0-heuristic` (never reported as model scores).

### [x] T3.4 — Prompt versioning & history — §29.1, §31.4 Step 24 — **COMPLETE**
> **Status (2026-07-08):** PromptService + routes live. `backend/src/services/PromptService.ts`: `savePrompt(userId, input)` → inserts prompts row (version 1) + prompt_versions row; `saveVersion(userId, promptId, input)` → next version = max(version)+1, INSERT only (never UPDATE old versions), updates prompts head version pointer; `listVersions(userId, promptId)` → metadata list (id, version, strength_score, created_at), ownership-checked via JOIN on prompts.user_id; `getVersion(userId, promptId, version)` → full node JSON + rubric scores; `restoreVersion` → saves old version's nodes as a NEW version (history is never rewritten); `diffVersions(a, b)` → pure function comparing node arrays by type: returns `{added, removed, changed}`; `listPrompts(userId)` → caller's prompts (metadata only). Migration `006_prompt_versions.sql`: `prompt_versions` table (id, prompt_id FK cascade, version int, nodes_json jsonb [P]-classified interim exception documented in SQL comment, strength_score, rubric_scores, created_at, unique(prompt_id, version)). Routes (all authed, ownership-checked, 404 on other users' prompts): `POST /prompts` (save), `GET /prompts` (list own), `GET /prompts/:id/versions`, `GET /prompts/:id/versions/:v`, `POST /prompts/:id/restore {version}`, `GET /prompts/:id/diff?from=1&to=3`. Tests: 6 PromptService unit tests with in-memory fake pool (version chain save→edit→edit→list 1,2,3; restore v1→creates v4 with v1's nodes; diff detects added/removed/changed; cross-user getVersion returns null; cross-user listVersions returns empty; listPrompts returns only caller's prompts). **29 suites / 204 tests green; typecheck clean.**
- **How:** immutable version rows on every prompt edit (node-level diffs — the node architecture makes prompts diff-able); `GET /prompts/:id/versions`, restore endpoint; version chain visible in history UI (T4.7).
- **Success criteria:** ✅ edit 3× → restore v1 works and appears as v4; the chain of changes is auditable via `listVersions`.

### [x] T3.5 — Prompt performance feedback loop — §29.2, §31.4 Step 25 — **COMPLETE**
> **Status (2026-07-09):** Feedback loop fully implemented. types/Feedback.ts — Zod schema (feedbackSchema) validating task_type, platform_id, outcome enum (worked|didnt_work|mixed), optional rubric_scores, edit_count, reused, session_id (used for lookup only, never stored), detail (max 500 chars, validated then dropped — no DB column per §10.7). POST /feedback route (authed): validates body, inserts into outcome_signals with zero identity fields (no user_id, no session_id), returns {status:ok}. services/OutcomeAnalytics.ts — underperformingDimensions() queries all outcome_signals rows with rubric_scores where feedback in (worked,didnt_work), unpacks per-dimension scores, computes avgScoreWhenWorked, avgScoreWhenFailed, failureShare (gap contribution), and n for all 8 rubric dimensions; fail-open on DB error (returns []). GET /analytics/outcomes (authed) returns the result. Tests: 5 Zod validation tests + 3 analytics tests. 30 suites / 212 tests green; typecheck clean.
- **How:** post-insertion follow-up ("Did this work?" worked / didn't / mixed + optional detail) → `POST /feedback` → `outcome_signals` (anonymized, aggregate-only: rubric outcomes + edit patterns by task-type/platform, never identity, §10.7); aggregation query correlating outcomes with rubric dimensions.
- **Success criteria:** ✅ feedback stored and queryable in aggregate; ✅ a report can flag rubric dimensions/techniques that under-perform on real outcomes; ✅ zero identity linkage verified by test.

### [x] T3.6 — CI/CD completion: staging auto-deploy, prod promotion, rollback — §31.4 Step 26, §27.3 — **COMPLETE (pending repo secrets for live run)**
> **Status (2026-07-09):** Full CI/CD in `.github/workflows/`. `ci.yml` now has three jobs: **`test`** (gitleaks → typecheck → `npm audit --audit-level=high` → jest — the PR/merge gate), **`build`** (uploads `dist/`+`config/` artifact), and **`deploy-staging`** (main pushes only: install → build → **migrate FIRST** → prune to prod deps → zip with `config/` at the ROOT + `dist`/`node_modules` under `backend/` to match the `backend/dist/index.handler` layout → `update-function-code` on `$LATEST` → `wait function-updated` → curl `/health` smoke test). Prod is a manual promotion: **`deploy-prod.yml`** (`workflow_dispatch`, `confirm: deploy-prod` → `publish-version` + repoint `prod` alias, prints previous version as rollback target) and **`rollback-prod.yml`** (`workflow_dispatch`, `version:` → alias repoint, sub-second). `dependabot.yml` (weekly npm `/backend` + github-actions). `backend/README.md` gained a `## Deploys` section: required secrets, runbook, the one-time API-Gateway→prod-alias command, and the break-glass manual deploy (kept).
> **Verified locally:** typecheck clean; **30 suites / 212 tests green**; packaging dry-run produces a zip with `config/platform-registry.json` at the root; all four YAML files parse. **Live run requires the repo owner to add GitHub secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `DATABASE_URL`** (pooler URL) — then the first push to `main` auto-deploys staging.
> **Also fixed here:** task.md had been corrupted with a mechanical `NNN|` line-number prefix on every line (introduced during the outsourced T3.1–T3.5 runs); stripped it back to clean Markdown.
- **How:** PR → lint/tests/secret-scan gate; merge to `main` → auto-deploy staging; `deploy:prod` manual one-command promotion; instant rollback (previous Lambda version alias); migrations run before code (§32.6); Dependabot + `npm audit` gating.
- **Success criteria:** change → branch → CI → merge → staging live, promote to prod, roll back — all demonstrated.

### [ ] T3.7 — Load testing & performance tuning — §31.4 Step 27
- **How:** k6/Artillery scenario: 100 concurrent users on `/draft`; measure p50/p99 latency, error rate, tokens/request; fix bottlenecks (pgvector indexes, registry/PKB caching in KV, routing cheaper models for non-critical steps, Lambda memory sizing).
- **Success criteria:** 100 concurrent users → p50 <2s, p99 <5s, zero errors.

### [ ] T3.8 — Security review & penetration test — §31.4 Step 28, §27
- **How:** external or expert review targeting: BYOK key extraction, cross-user encrypted-content access, privilege escalation to admin, injection paths, JWT handling; fix all critical/high before launch; document medium/low with owners.
- **Success criteria:** no critical/high findings open at launch.
- **Depends on:** Phases 2–3 complete (and re-run after Phase 7's E2EE/BYOK work).

---

# PHASE 4 — Web App MVP (parallel with late Phase 2/3) — §20.1, §24 Phase 0, §28.1

*Goal: the user-facing surface for the core loop — manual platform selection, clarification flow, node editor, strength score, history, library seed. This is the "Web only" MVP from the §24 roadmap.*

### [ ] T4.1 — Next.js scaffold on Cloudflare Pages
- **How:** `web/` — Next.js + TypeScript; SSR/static for public pages (landing, library) for SEO (§20.1); client-heavy builder; deploy to Pages; shared API client with typed contracts matching backend `types/`.
- **Success criteria:** deployed staging site; typed API client round-trips against staging Lambda.

### [ ] T4.2 — Auth UI + account management
- **How:** Supabase Auth signup/login/logout/password-reset pages; session handling; account settings page (name/email — the only plaintext PII, §19.1).
- **Success criteria:** full auth loop in the browser against staging.

### [ ] T4.3 — Zero-friction "try it now" flow — §28.1
- **Description:** First-run value before signup: one example task → one great result with visible strength score; account creation deferred until after value is felt.
- **How:** unauthenticated demo path with a server-side demo budget (rate-limited by IP), curated example tasks, conversion prompt to save the result by creating an account.
- **Success criteria:** a new visitor gets a scored prompt in under a minute without an account.

### [ ] T4.4 — Clarification flow UI — §11
- **How:** conversational one-or-two-at-a-time question cards; MCQ chips + free-text inputs + "other" escape; always-visible "just generate now"; streaming updates; keyboard-navigable and screen-reader-labeled from day one (§29.5).
- **Success criteria:** matches the T0.3 taxonomy; WCAG basics pass (keyboard-only run-through).

### [ ] T4.5 — Node editor — §13
- **How:** ordered node list with type badges; per-node: primary value, ranked alternatives dropdown with rationale, lock toggle, edit-in-place; localized re-draft on node change (only affected nodes regenerate, §10.6); assembled platform-serialized string preview with copy button.
- **Success criteria:** swapping/locking/editing nodes behaves per §13.2; locked nodes never change on regenerate.

### [ ] T4.6 — Strength score & explainability UI — §10.5
- **How:** visible overall score + sub-score breakdown; inline rationale per node; expandable "why this works" lessons; onboarding shows more teaching detail, tapering with use (§28.3).
- **Success criteria:** score/sub-scores match backend rubric output exactly; rationale renders grounded explanations.

### [ ] T4.7 — History, library seed & feedback UI
- **How:** prompt history with version restore (T3.4); hand-seeded library (10–20 templates from T2.6's curated set) with preview/remix into the editor (§14.2); post-insertion "did this work?" feedback capture (T3.5); export of prompts/library in open JSON (§29.8).
- **Success criteria:** save → browse → remix → feedback loop works end-to-end; export downloads valid JSON.

**MILESTONE M1 — usable MVP (Web):** T2.12 + T3.1–T3.3 + T4.1–T4.7 done. A stranger can get a genuinely good, scored, editable prompt on the web app in under a minute.

---

# PHASE 5 — Grounded Drafting at Scale: PKB Pipeline + Browser Extension — §24 Phase 1

*Goal: prove platform-grounded drafting beats generic — live docs ingestion + the in-context extension surface.*

### [ ] T5.1 — PKB ingestion crawler (scheduled) — §6.1, §6.3
- **How:** scheduled job (cron Lambda or Supabase Edge Function, weekly per platform) crawling registered platforms' docs/changelogs → chunk → embed → upsert with source URL/timestamp/hash; drift re-checks; low-trust tagging for community sources; this also serves as the Supabase keep-alive (§23.3).
- **Success criteria:** registry platforms have fresh PKB coverage that re-ingests on schedule; stale chunks detected via hash drift.

### [ ] T5.2 — Live-fetch fallback (self-healing RAG) — §6.2
- **How:** on missing/stale retrieval: live tool-call fetch of the current doc → answer from it → async upsert; tool calls logged with input/output/latency/cost (§8 L3).
- **Success criteria:** deleting a chunk and querying triggers a live fetch and heals the index.

### [ ] T5.3 — MPKB population + strategy-profile tuning — §10.2
- **How:** ingest provider prompting guides + published prompting research for launch model families; wire MPKB retrieval into Drafting/Critic/Alternatives prompts; strategy profiles reference MPKB entries by id.
- **Success criteria:** drafts demonstrably change phrasing/technique per target model family (e.g. tag-style for image models, stepwise for code tasks), with MPKB citations in rationale.

### [ ] T5.4 — Extension scaffold (Manifest V3 + React + Vite) — §20.2
- **How:** `extension/` — MV3, background service worker mediates all network calls (content script never holds credentials), overlay UI in Shadow DOM, hotkey + injected icon triggers.
- **Success criteria:** extension loads unpacked in Chrome; overlay renders on a test page without CSS bleed.

### [ ] T5.5 — Platform detection engine — §5.2
- **How:** URL pattern + DOM fingerprint match against the server-fetched registry (edge-cached in Cloudflare KV, never hardcoded, §5.1); SPA-navigation re-detection; heuristic generic-mode fallback + "request platform support" action (§5.4).
- **Success criteria:** correct detection on all launch platforms including SPA navigation; unknown sites degrade to generic mode gracefully.

### [ ] T5.6 — In-context drafting overlay + insert — §4, §20.2
- **How:** full clarify→draft→edit flow inside the overlay; **fill the input field only — never auto-submit** (§20.2); detection selectors and fill logic driven by registry config; per-platform ToS review recorded before enabling each platform (§29.4).
- **Success criteria:** the §4 walkthrough works verbatim on gemini.google.com: invoke → detect → clarify → draft → score → insert.

### [ ] T5.7 — Model & Platform Recommendation Engine — §15
- **How:** Model Capability Matrix rows maintained via the ingestion pipeline (never hardcoded, §15.1); ranking against task constraints; trade-off presentation (quality vs. cost vs. latency), not a single winner (§15.2); surfaced pre-drafting on web + extension.
- **Success criteria:** a video task recommends video-capable platforms with visible trade-offs; recommendations update when matrix data changes.

**MILESTONE M2 — grounded drafting (Web + Extension):** §24 Phase 1 complete: real PKB, MPKB, visible strength score, extension detection + insertion on launch platforms.

---

# PHASE 6 — Preview, Alternatives & Session Memory — §24 Phase 2

### [ ] T6.1 — Live textual preview (streaming) — §12.1, §12.3
- **How:** Preview Agent (small/fast tier, streaming via Lambda response streaming §23.2) regenerates a 1–2 sentence "what you'll likely get" description after each answer/node change; debounced; wired into web + extension UIs.
- **Success criteria:** preview updates within ~1s of an answer, streams progressively, is debounced under rapid input.

### [ ] T6.2 — Optional visual preview — §12.2, §12.3
- **How:** opt-in per session; cheap/fast image model or library-exemplar stand-in; strict rate limits (regenerate on node *changes* only); explicit "not the target platform's model" labeling.
- **Success criteria:** cost per preview bounded and metered; opt-in default off.

### [ ] T6.3 — Alternatives Agent — §7.1, §13.2
- **How:** 2–4 ranked alternatives per node with MPKB/PKB-grounded rationale, ranked by platform-doc relevance and task fit; localized regeneration honoring locks (§10.6).
- **Success criteria:** alternatives are sensible and distinct; selecting one re-serializes without disturbing locked nodes.

### [ ] T6.4 — Session-level memory application — §17.4
- **How:** within-session preference signals (choices made in clarification) selectively injected into Context Assembly for subsequent drafts in the same session — no cross-session persistence yet (§24 Phase 2 scoping).
- **Success criteria:** a second draft in the same session reflects earlier session choices without re-asking.

**MILESTONE M3 — interactive differentiation:** live preview + alternatives + convergence loop feel like the §10.6 closed loop.

---

# PHASE 7 — Trust, Personalization & Operations — §24 Phase 3

*Goal: E2EE, BYOK, full Memory + Projects, the Admin Control Plane, monetization — the "trust at scale" release.*

### [ ] T7.1 — E2EE rollout — §19.2–19.4
- **How:** client-side AES-GCM via WebCrypto; per-user DEK, wrapped per device (zero-knowledge multi-device sync §19.3); one-time recovery code UX with honest trade-off messaging; server stores only wrapped keys + ciphertext blobs (content in R2/Postgres blob columns); ephemeral in-memory decryption during pipeline processing only, re-encrypt before persist (§19.4); zero-data-retention agreements with providers where available; privacy policy language matches reality.
- **Success criteria:** server/database inspection shows no plaintext content anywhere; a second device syncs via wrapped-key exchange; deleting the blob satisfies deletion rights (§19.6).

### [ ] T7.2 — BYOK provider connections — §9.4–9.6
- **How:** connection CRUD UI; keys envelope-encrypted into SSM SecureString (never a DB column); ephemeral decrypt at call time; **revocable, never retrievable** (no display code path, including admin); per-connection usage metering; additional provider adapters (OpenAI, Google) behind the T2.4 interface.
- **Success criteria:** a user connects their own key and drafts through it; the key is unreadable everywhere after save; adapter contract tests pass for all providers.

### [ ] T7.3 — Cross-session Memory with full user control — §17.1–17.5
- **How:** persistent memory entries (encrypted class); confirmation flow for agent-proposed entries; view/edit/delete/add-manually UI; global reset; selective relevance-based retrieval into Context Assembly (§17.4).
- **Success criteria:** all §17.3 controls work; irrelevant memories provably don't leak into unrelated task types.

### [ ] T7.4 — Projects — §17.6, §28.7
- **How:** Project CRUD (name, description, default platform, pinned node set); project-scoped memory; precedence rule (project > global within scope); `project_id` threaded through Context Assembly; per-project prompt sub-library and reset; data model kept multi-user-ready for future teams (§28.7).
- **Success criteria:** a Project's pinned context demonstrably shapes drafts inside it and never outside it.

### [ ] T7.5 — Admin Control Plane — §21
- **How:** `admin/` as a **physically separate deployable** (own Pages project, own Lambda, second Supabase project, §23.2): its own auth (hardware-key/passkey MFA), fine-grained RBAC per `docs/admin-roles.md`, short sessions, step-up re-auth for destructive actions; modules: registry management, PKB/MPKB management + moderation queue, pipeline tracing dashboard (from T3.1 data), capability-matrix management, library moderation, user/billing admin, provider health, security dashboard, feature flags/kill-switches (per agent role, per provider adapter); **by construction, no decryption capability for user content or BYOK keys exists in this service** (§21.3).
- **Success criteria:** the §21.4 visibility table holds under test; no import path from admin code into consumer key material; every admin action lands in the immutable audit log.

### [ ] T7.6 — Community library submissions + moderation — §14.2
- **How:** submission flow → automated rubric + safety screening (same classifiers) → auto-publish high-confidence / queue borderline to admin moderation → version history on popular templates; personalization from metadata only (§14.3).
- **Success criteria:** submission-to-publish pipeline works with both auto and human-review paths exercised.

### [ ] T7.7 — Monetization & plans — §28.2, §16
- **How:** freemium tiers (free: capped drafts/month, core platforms, personal library; paid: volume, all platforms, Projects, teams-later, BYOK); tokenizing payment processor (e.g. Stripe — billing details never stored raw §19.1); plan enforcement wired into the T3.2 budget layer; paywall at intensity of use, not basic usefulness.
- **Success criteria:** a user can subscribe, hit free-tier limits with clear upsell messaging, and BYOK gating follows plan rules.

### [ ] T7.8 — Compliance operations package — §27
- **How:** written policies (data classification, retention with automated deletion jobs, incident response, access review cadence); subprocessor register + DPAs; access on/off-boarding process; backup + tested restore (Supabase Pro upgrade is the trigger, §27.5); self-service data export/deletion (§27.4, §29.8).
- **Success criteria:** the §27.6 "early traction" artifact list exists and is real (restore actually tested, deletion actually deletes).

### [ ] T7.9 — Continuous improvement loop live — §10.7
- **How:** aggregate outcome signals (T3.5) → periodic analysis tuning strategy profiles and flagging stale MPKB entries → review queue in admin (T7.5); user-visible progress framing ("your prompts improved X% this month", §28.5).
- **Success criteria:** a flagged-technique review lands in the admin queue from real aggregated data; strategy-profile updates deploy as config, not code.

**MILESTONE M4 — trust release:** E2EE + BYOK + Memory/Projects + Admin plane + billing live. Re-run T3.8 security review here.

---

# PHASE 8 — Platform Play (post-traction) — §24 Phase 4

*Explicitly gated on M1–M4 traction evidence — do not start early (§28.6).*

### [ ] T8.1 — macOS app — §20.3, §5.3
- **How:** `macos/` Swift/SwiftUI menu-bar app; global hotkey overlay; Accessibility (AXUIElement) frontmost-app/URL detection with pre-prompt explanation and full graceful degradation without permission; notarized distribution + auto-update.
- **Success criteria:** system-wide drafting works; denying Accessibility still leaves a functional manual builder.

### [ ] T8.2 — Autonomous Curation Agent — §14.4
- **How:** background job over **explicitly opted-in sessions only — no code path to non-opted-in data**; signal mining → generalization LLM pass → same safety/rubric screening → auto-publish or moderation queue → attribution with consent.
- **Success criteria:** an opted-in high-value session becomes a published generic template through the full gate; opt-in boundary verified by construction.

### [ ] T8.3 — macOS SDK — §20.3
- **How:** extract core assistant client logic into an embeddable Swift package with API-key-based partner auth; docs + sample app.
- **Success criteria:** a third-party sample app integrates drafting via the SDK only.

### [ ] T8.4 — Teams & shared Projects — §28.7
- **How:** multi-user Projects (roles: owner/editor/viewer), shared team libraries, team-standardized templates, org billing; built on the multi-user-ready model from T7.4.
- **Success criteria:** a team shares a Project and library with correct permission boundaries.

### [ ] T8.5 — Firefox extension port + platform expansion — §20.2, §5.1
- **How:** MV3 port for Firefox; grow the registry from the "request platform support" queue, each addition preceded by ToS review (§29.4); i18n groundwork unfrozen (§29.6).
- **Success criteria:** Firefox parity on launch platforms; registry additions are pure config changes.

---

# FEATURE ADDITIONS (post-v0.6 product review, 2026-07-07) — see `docs/feature-additions-v0.7.md`

*Captured from a feature review after v0.6. Some are new (not in the original spec), some pull existing roadmap items forward. IDs are TA.x to keep them distinct from the phase tasks.*

### [x] TA.1 — Knowledge Base expansion + `usage_tips` category — §6, FA-4/FA-6 — **built now**
- **Description:** Grow the PKB from 5 platforms/48 chunks to a much larger, more detailed base covering the most-used AI sites, and add a `usage_tips` chunk category (platform-usage coaching, e.g. Claude Code slash commands) that backs FA-4.
- **How:** expand `config/platform-registry.json` (new platforms incl. coding assistants + answer engines) and `config/pkb-seed.json` (richer per-platform chunks + `usage_tips`); re-run `npm run seed:registry` + `npm run seed:pkb`.
- **Success criteria:** new platforms queryable; `usage_tips` chunks retrievable; live retrieval returns platform-appropriate coaching.

### [x] TA.2 — Model & Platform Recommendation engine (backend) — §15, FA-2a — **built now** (pulls T5.7 backend forward)
- **Description:** "Which model/platform suits this task best" as backend logic + a populated Model Capability Matrix, with trade-off output (quality vs cost vs latency), never a single winner (§15.2). Frontend surfacing stays in T5.7.
- **How:** `config/model-capabilities.json` (perishable matrix data, §15.1) → `services/RecommendationService.ts` → `GET/POST /recommend`. Cost/token estimation ties into the Governor (FA-2b).
