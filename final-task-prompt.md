# final-task-prompt.md — Outsourceable Task Prompts (Final phase: F0 verification + F1 requested features + F2 experience upgrades)

> **Purpose:** every task in `final-task.md`, rewritten as a fully self-contained prompt an OSS coding model can execute **cold** — no access to prior conversations, no assumed context.
>
> **How to use:** for each job, feed the model **(1) the GLOBAL CONTEXT BLOCK v2 below, verbatim, then (2) the single task prompt** (the `P-Fx.y` section). One task per run. Do not feed multiple task prompts at once. If a task lists "Depends on", confirm those tasks are done first (check `final-task.md` checkboxes).
>
> **Ground rules for the executing model:** follow the steps in order; when a step conflicts with something you find in the repo, STOP and report the conflict instead of improvising; never invent file paths — every path you need is given; run the verification commands at the end and paste their output in your report.
>
> **Supersedes:** the Global Context Block in `prompt-task.md` is stale (predates Phases 4–8). Use THIS block for all F-tasks.

---

# GLOBAL CONTEXT BLOCK v2 (prepend to every task prompt)

## What this project is

PromptForge (placeholder brand) is a **reverse-prompting assistant**: the user types a rough idea ("an image of a horse running"), the system interviews them briefly, then drafts an *excellent*, platform-tailored prompt (for Midjourney, ChatGPT, Claude, Gemini, Stable Diffusion, etc.), scores it against an 8-dimension quality rubric (0–100 "strength score"), explains why it works, and lets the user edit it node-by-node. It ships as a web app, Chrome + Firefox extensions, an admin plane, and (scaffolded) macOS app + SDK. The final phase adds an Electron desktop app (macOS + Windows), an enhance-existing-prompt mode, voice dictation, and a floating assistant widget.

The authoritative design document is `prompt-assistant-technical-architecture.md` (repo root, referenced as "§N"). The historical task ledger is `task.md`; the live final-phase plan is `final-task.md`. Design artifacts live in `docs/`.

## Tech stack & infrastructure (all live unless noted)

- **Language:** TypeScript everywhere (Swift in `macos/`/`macos-sdk/`). Strict mode, `noUncheckedIndexedAccess: true`.
- **Backend:** a single AWS Lambda ("Lambdalith") running a **Hono** router. Local dev runs the same app via `@hono/node-server` on port 3001. Entry: `backend/src/index.ts` (exports `app` for local + `handler()` for Lambda/API-Gateway events). Deployed at API Gateway `https://qsfu5lcqt2.execute-api.us-east-1.amazonaws.com` (Lambda Function URLs are org-blocked on this AWS account — never use them). **Note:** API Gateway HTTP APIs buffer responses — no SSE/streaming; use short-polling where progress is needed.
- **Database:** Supabase Postgres with **pgvector** (migrations `backend/migrations/001…016_*.sql`, runner `npm run migrate`). Connect via `DATABASE_URL` in `backend/.env` — it points at Supabase's **shared pooler** (do NOT switch to the direct `db.<ref>.supabase.co` host; it has DNS issues from dev machines).
- **Auth:** Supabase Auth. JWTs are **ES256**, verified against JWKS at `SUPABASE_JWKS_URL` in `backend/src/middleware/auth.ts` (algorithms pinned). `DEV_AUTH_BYPASS=true` bypasses auth locally with user id `dev-user-000` (NOT a valid DB uuid — DB writes gracefully skip for it).
- **LLM providers (chat):** default **Groq** (OpenAI-compatible; `GROQ_API_KEY`/`GROQ_BASE_URL`): `llama-3.1-8b-instant` (small tier), `llama-3.3-70b-versatile` (large tier). Alternates registered: Cerebras, OpenCode Zen. Routing lives in `config/model-routing.json` — **model changes are config edits, never code**. All agents call `generate(pipelineStep, complexity, request)` from `services/providers` — never a provider SDK.
- **Embeddings:** Google Gemini `gemini-embedding-001` at 1536 dims (`GEMINI_API_KEY`); adapter L2-normalizes. **Image preview:** Imagen 3 via `GeminiImageAdapter` (`image_preview` routing step, default-off via `VISUAL_PREVIEW_ENABLED`).
- **BYOK:** user provider keys envelope-encrypted into AWS SSM SecureString via `backend/src/services/KeyCustody.ts` — never a DB column, never retrievable (no read-back path, including admin).
- **E2EE posture:** server is content-stateless — user content persists only in `*_ciphertext` columns written by clients (`web/src/lib/crypto.ts` AES-GCM). Session/prompt **metadata** (scores, states, token counts) is plaintext; content never is.
- **Billing:** Stripe Checkout + webhook (`POST /billing/webhook`); plans in `config/plans.json`; entitlements via `backend/src/services/PlanService.ts`.
- **Testing:** Jest + ts-jest, `backend/tests/` mirrors `src/`. `tests/setup.ts` presets `DEV_AUTH_BYPASS=true`, `NODE_ENV=test`, dummy provider keys. Tests always mock `global.fetch` and use `setPoolForTesting` from `utils/db.ts` — **no test may make a real network call**. As of 2026-07-11: **44 suites / 326 tests, of which 5 FAIL in `tests/integration/health-and-draft.test.ts`** (fixed by P-F0.1 — after it, treat "all green" as the baseline).
- **Web:** `web/` — Next.js 16 (App Router, TS, Tailwind), typed API client `web/src/lib/api.ts` + hand-mirrored DTOs `api-types.ts`, ALL UI strings in `web/src/lib/strings.ts` (i18n discipline — no hardcoded literals in components). Deploys to Cloudflare Pages via `@cloudflare/next-on-pages` (Pages project may not exist yet).
- **Extension:** `extension/` — Chrome MV3 + React + Vite. Background service worker owns ALL network + the token (`chrome.storage.local`); content script is fetch-free and credential-free (grep-enforced), renders a Shadow-DOM overlay, hotkey `Ctrl/Cmd+Shift+Space`. Insert fills the platform input, **never auto-submits**, gated by `tos_reviewed` in the registry. `firefox-extension/` is the MV3 port.
- **Admin:** `admin/` — physically separate Hono deployable (port 3002), own auth (JWT + `ADMIN_ALLOWED_EMAILS`/`admin_roles`), zero imports from `backend/`, no decryption capability by construction.
- **macOS (native):** `macos/` Swift Package (SwiftUI `MenuBarExtra` scaffold, macOS 15+); `macos-sdk/` Swift package scaffold.
- **Desktop (created by P-F1.2):** `desktop/` — Electron + Vite + React. Until P-F1.2 runs, it DOES NOT EXIST.

## Repo layout (actual, current)

```
Prompt AI 2026/
├── prompt-assistant-technical-architecture.md   # the spec (§ references)
├── task.md · final-task.md                      # ledgers (historical · live)
├── prompt-task.md · final-task-prompt.md        # outsourceable prompts (historical · live)
├── docs/                                        # rubric, taxonomy, data model, admin roles, AUP,
│                                                #   security reviews, compliance docs, tos-review
├── config/                                      # runtime config (repo root, NOT inside backend/)
│   ├── platform-registry.json                   # 9 platforms (§5.1) — model_family, tos_reviewed, etc.
│   ├── model-routing.json                       # {pipeline_step, complexity} → {provider, model_id}
│   ├── model-capabilities.json · strategy-profiles.json · clarification-questions.json
│   ├── pkb-seed.json                            # curated knowledge chunks (§6) incl. MPKB + usage_tips
│   ├── demo-examples.json · plans.json
├── backend/
│   ├── src/
│   │   ├── agents/          # IntentClassification, DocRetrieval, ClarifyingQuestion, Drafting, Critic,
│   │   │                    #   Alternatives, MemoryExtraction, Curation, draftShared.ts, index.ts
│   │   ├── guardrails/      # ContentSafetyClassifier, TokenGovernor, HeuristicScorer
│   │   ├── services/        # Supervisor (state machine), PKBService, PlatformService, ModelRouter,
│   │   │                    #   PromptSerializer, ResponseDesign, SessionService, PromptService,
│   │   │                    #   AuditService, BudgetService, PlanService, KeyCustody, RecommendationService,
│   │   │                    #   TokenOptimizationAdvisor, PreviewService, NodeRedraftService, DemoService,
│   │   │                    #   OutcomeAnalytics, ContinuousImprovementService, LibraryScreening,
│   │   │                    #   DocIngest, providers/ (adapters + openAICompatible.ts + index.ts)
│   │   ├── handlers/routes.ts   # ALL HTTP routes (~1700 lines)
│   │   ├── middleware/      # auth.ts, rateLimit.ts (Postgres+fallback), errorHandler.ts, logging.ts
│   │   ├── types/           # Agent.ts (PipelineContext), Prompt.ts (nodes/rubric/computeStrength),
│   │   │                    #   Platform.ts, Safety.ts, Provider.ts, Response.ts, Http.ts, Feedback.ts, …
│   │   ├── utils/           # logger.ts (pino), db.ts (lazy pg Pool + setPoolForTesting), json.ts (extractJson)
│   │   ├── config/          # env.ts (Zod-validated), safety-patterns.ts
│   │   └── scripts/         # migrate.ts, seed-registry.ts, seed-pkb.ts, crawl-pkb.ts, smoke-intent.ts
│   ├── migrations/          # 001…016 numbered SQL, idempotent
│   ├── load/                # k6 script + results
│   └── tests/               # mirrors src/
├── web/                     # Next.js 16 app (pages: /, /try, /build, /history, /library, /account, /auth/*)
├── extension/               # Chrome MV3 (background/, content/ incl. steps/, icons/, types/)
├── firefox-extension/       # MV3 port
├── admin/                   # separate deployable (port 3002)
├── macos/ · macos-sdk/      # Swift packages
├── desktop/                 # Electron app — created by P-F1.2, does not exist before it
└── .github/workflows/       # ci.yml (test/build/deploy-staging), deploy-prod.yml, rollback-prod.yml, crawl-pkb.yml
```

## Existing HTTP API (all authed unless noted)

- Public: `GET /health` · `GET /platforms` (cached 1h) · `GET /demo/examples` · `POST /demo/draft` · `GET /library` (+ `GET /library/:id`) · `POST /platform-requests` · `POST /billing/webhook`
- Pipeline: `POST /draft` → `{status:'clarifying', session_id, questions[]}` (paused) or `{status:'ok', final_state:'ready_for_review', response: DesignedResponse, draft, pipeline_trace}` · `POST /draft/:sessionId/clarify` (resume) · `POST /draft/:sessionId/again` (same-style redraft) · `POST /preview` · `POST /preview/visual` · `POST /serialize` · `POST /redraft-node` · `POST /fanout`
- Prompts: `POST/GET /prompts` · `GET /prompts/:id/versions` · `GET /prompts/:id/versions/:v` · `POST /prompts/:id/restore` · `GET /prompts/:id/diff`
- Personalization: `GET/POST/PATCH/DELETE /memory` (+ bulk `DELETE /memory`) · `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`
- Accounts/plans: `POST /me/bootstrap` · `GET /me/usage` · `GET /me/progress` · `DELETE /me` · `GET /export` · `GET /sessions` · `GET /sessions/:sessionId/trace` · `PATCH /sessions/:sessionId/content`
- BYOK: `PUT/GET /keys` · `POST/GET /connections` · `DELETE /connections/:id`
- Teams: `POST/GET /teams` · `POST /teams/:id/members` · `DELETE /teams/:id/members/:userId`
- Analysis: `POST /recommend` · `GET /capabilities` · `POST /optimize` · `POST /feedback` · `GET /analytics/outcomes` · `GET /analytics/improvements`
- Library: `POST /library/submit` · `GET /library/pending` · `PATCH /library/:id/moderate`
- Billing: `POST /billing/checkout`
- Stubs still 501: `POST /auth/signup`, `POST /auth/login` (clients use Supabase Auth directly), `POST /appeal`

## The pipeline (what happens on POST /draft)

`Supervisor` state machine (§7.2): `created → context_resolved → [safety gate 1] → intent_classified → docs_retrieved → clarifying → (awaiting_clarification pause if questions & !just_generate) → drafting → [safety gate 2] → critiqued → alternatives_attached → governed → ready_for_review`. Agents implement `Agent {name, execute(AgentInput): Promise<AgentOutput>}` (§32.2); only the Supervisor mutates `PipelineContext` (via `applyOutput`). Fatal = intent; degradable = retrieval (partial), drafting (template fallback), critic (heuristic scores), memory (non-fatal). Session metadata + per-step token usage persist best-effort (metadata ONLY — never prompt content). Budget check (T3.2) runs pre-flight; plan gate (T7.7) also runs in the route.

## NON-NEGOTIABLE ENGINEERING RULES (violating any of these fails the task)

1. **Dependency flow is one-way:** `handlers → services → agents/guardrails → utils/types`. No circular imports. Agents never import provider SDKs or `ModelRouter` — they call `generate(pipelineStep, complexity, request)` from `services/providers`.
2. **Config over code (§32.3):** anything tunable lives in `backend/src/config/env.ts` (Zod-validated env) or a JSON file in repo-root `config/`. Never hardcode thresholds, model ids, or platform data.
3. **Privacy (§19.1):** NEVER log prompt content, pasted prompts, clarification text, transcripts, memory statements, or keys. Log ids, counts, categories, durations, token counts. Content persists ONLY in `*_ciphertext` columns written by clients. **New for F-tasks: dictation audio is never written to disk or DB; transcripts are returned to the caller and never logged; A/B comparison outputs are ephemeral.**
4. **Safety fails closed (§33.7):** if the safety classifier errors, generation is refused, not skipped. Every new content entry point (enhance text, share submissions, compare bodies) passes the safety gate.
5. **LLM agents never throw:** provider outage → graceful `{status:'failure'}` (or `partial` where the pipeline should continue degraded). Malformed output → retry once → graceful failure. Parse LLM JSON with `utils/json.ts extractJson`. Budget `maxTokens ≥ 2000`; `generate()` auto-retries once at 2× on truncation.
6. **Minimal dependencies:** adding an npm package requires written justification in the report. Prefer node built-ins and existing deps. (Electron/electron-builder/electron-updater are pre-justified for `desktop/` by final-task.md F1.2; animation libraries are explicitly banned for the widget.)
7. **Migrations:** every schema change is a new numbered SQL file in `backend/migrations/` (next free number — check the directory), idempotent, applied by `npm run migrate`.
8. **Tests:** every new service/agent/route gets unit tests; changed behavior gets updated tests; `npm test` + `npm run typecheck` green before reporting done. Tests mock `fetch` and use `setPoolForTesting`.
9. **Secrets:** live in `backend/.env` (gitignored) — never commit values, never print them. Reference by key name only.
10. **Style:** match existing code — pino structured logging, JSDoc headers citing the spec section, 2-space indent, named exports.
11. **Electron security (all `desktop/` work):** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on every window; a single typed preload bridge with an enumerated IPC allowlist; strict CSP; deny `will-navigate`/window-open to external URLs; tokens on disk only via `safeStorage`; clipboard is read ONLY on an explicit user click.
12. **Mirror-file convention:** web/desktop copies of backend types (and desktop copies of web modules) are hand-copied with a header comment "Mirrors <path> — update together". Never import across package boundaries.
13. **Extension boundary:** content scripts stay fetch-free and credential-free; all network goes through the background worker; insertion never auto-submits; `tos_reviewed` gate respected.
14. **Never auto-invoke on user data:** widget/palette clipboard reads and selection reads happen only on an explicit user action, never on a timer or on focus.

## Commands

```bash
cd backend
npm run typecheck && npm test        # must both be clean (after P-F0.1)
npm run build && npm run dev         # local server on :3001
npm run migrate                      # apply pending migrations (needs DATABASE_URL)
cd ../web && npx tsc --noEmit && npm run build && npm run pages:build
cd ../extension && npx tsc --noEmit && npx vitest run && npm run build
cd ../admin && npm test
cd ../macos && swift build
# local backend with auth bypassed, for manual curl testing:
cd backend && set -a && source .env && set +a && DEV_AUTH_BYPASS=true node dist/index.js
# break-glass deploy (CI staging job needs repo secrets):
npm run build && cd .. && zip -r /tmp/lambda.zip backend/dist backend/node_modules config -x '*.map' \
  && aws lambda update-function-code --function-name PromptAI --zip-file fileb:///tmp/lambda.zip --region us-east-1
```

## Definition of Done (every task)

`tsc` clean · tests written and passing · no secrets in code · structured logging present (no content) · follows folder structure & dependency flow · spec/plan section cited in code comments · `final-task.md` checkbox updated with a dated status note · report includes verification-command output.

---
---

# PHASE F0 — RELEASE-READINESS VERIFICATION

---

## P-F0.1 — Fix the regressed `/draft` integration suite (T3.2 vs T7.7 contract collision)

### Objective
`tests/integration/health-and-draft.test.ts` has 5 failing tests (confirmed 2026-07-11): three expect 200 from `/draft` and get **500**, one expects 422 (safety block) and gets **500**, one expects 429 `budget_exceeded` and gets **402**. Root-cause all five, make plan lookups fail-open, pick and document one status-code contract, and turn the suite green.

### Read first
`backend/tests/integration/health-and-draft.test.ts` (the failing assertions and its fake pool setup), `backend/src/handlers/routes.ts` (the `/draft` route — note `getEntitlements` imported at line ~56 and a 402 response at line ~681), `backend/src/services/PlanService.ts`, `backend/src/services/BudgetService.ts` (the fail-open pattern to copy: DB error → allow + `budget:check_skipped` log), `config/plans.json`.

### Steps
1. Run `npx jest tests/integration/health-and-draft.test.ts` and capture the five stack traces. Do not assume one shared cause — verify each. Expected findings: (a) `getEntitlements` runs a plans query the test's fake pool doesn't stub → throws → 500 on three drafts and even on the safety-block path (the gate runs before/around it); (b) the plan gate returns 402 before the budget check can 429.
2. Make `PlanService.getEntitlements` (or its call site) **fail-open to the free plan** on any DB error: log `{type:'plan:check_skipped', reason}` at warn, return the free-plan entitlements from `config/plans.json`. Plans are cost control, not a security boundary — mirror BudgetService's documented posture. Order the route so the safety gate's 422 cannot be preempted by plan/budget infrastructure errors.
3. Contract decision (make it, write it down): **429 `{status:'budget_exceeded', used, budget, message}`** stays the token-budget-exhaustion response (T3.2 contract); plan-entitlement denial becomes **403 `{status:'plan_restricted', feature, plan, message}`**. If you find a strong reason to keep 402 instead of 403, you may — but then update the T3.2 test expectations *and* say so explicitly in the report. Either way: exactly one documented code per condition.
4. Create `docs/api-contracts.md`: a short table of every non-2xx status the `/draft` family can return (400 validation, 401 auth, 403 plan_restricted, 404 ownership, 413 body size, 422 blocked, 429 budget/rate, 502 degraded-failure, 503 infra) with the owning subsystem for each. Link it from `backend/README.md`.
5. Extend the integration fake pool to answer PlanService's queries (return a free-plan row); add a new test: "plans table query rejects → `/draft` (just_generate) still returns 200".
6. Run the FULL suite — fix any other test your contract change touches (grep for `402`/`429` assertions across `backend/tests/`).

### Do NOT
- Do not delete or skip the failing tests to get green.
- Do not weaken the budget 429 contract or the safety 422 path.
- Do not make plan enforcement a hard dependency of drafting (fail-open, logged).

### Acceptance criteria
- All 44+ suites green, typecheck clean.
- A plans-table outage demonstrably cannot 500 the draft path (test proves it).
- `docs/api-contracts.md` exists and matches the code.

### Verify with
```bash
cd backend && npm run typecheck && npm test
```

---

## P-F0.2 — Full-surface verification sweep

### Objective
Re-prove every surface with its own definition of green and record a check-matrix in `docs/release-readiness-<date>.md`. Fix what's red in-task; file follow-ups for anything deliberately deferred.

### Read first
`final-task.md` "Verified current state" section; each surface's README; `.github/workflows/*.yml`.

### Steps
1. **Backend:** `npm run typecheck && npm test`. Then migrations idempotency: run `npm run migrate` twice against the live DB (or a scratch schema if you can create one) — the second run must apply 0 migrations. Record how many the first run applied (if >0, Phase 7 migrations were never applied live — note it prominently for P-F0.3).
2. **Web:** `npx tsc --noEmit && npm run build && npm run pages:build`. Record page count and any warnings.
3. **Extension:** `npx tsc --noEmit && npx vitest run && npm run build`; then load `extension/dist` unpacked in Chrome, and on gemini.google.com verify: detection, `Ctrl/Cmd+Shift+Space` overlay, a draft round-trip against a local backend, "insert" filling the input WITHOUT submitting. Screenshot or describe results.
4. **Firefox extension:** build; load via `about:debugging`; overlay renders on a test page.
5. **Admin:** run its tests; boot on :3002; curl an unauthed request (expect 401/403) and a request with a JWT whose email is in `ADMIN_ALLOWED_EMAILS` (expect 200).
6. **Swift:** `cd macos && swift build`; `cd macos-sdk && swift build`. Scaffolds may hit Swift 6 strict-concurrency errors — fix minimally (e.g. `@MainActor` isolation) rather than disabling checks.
7. **CI:** `actionlint` (if installed) or careful YAML review of all four workflows; confirm `dependabot.yml` exists.
8. Write `docs/release-readiness-<date>.md`: table `surface | check | result | fix commit / follow-up`. Fix reds in-task where ≤ ~1h each; otherwise file them as explicit follow-up items in the doc with owners.

### Do NOT
- Do not mark a row green without running its command in this session.
- Do not "fix" Swift concurrency by lowering the language mode or adding `@unchecked Sendable` without justification.

### Acceptance criteria
- The matrix exists, every row green or explicitly followed-up; all fixes have tests where applicable; suite/typecheck/builds green across backend, web, extension.

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../web && npx tsc --noEmit && npm run build
cd ../extension && npx tsc --noEmit && npx vitest run && npm run build
cd ../macos && swift build && cd ../macos-sdk && swift build
```

---

## P-F0.3 — Live staging E2E re-verification

### Objective
Prove the **deployed** system runs today's code end-to-end. Known risks: GitHub deploy secrets were never added (T3.6), so the deployed Lambda may be months stale; Phase 7 migrations may never have been applied to live Supabase.

### Read first
`backend/README.md` "Deploys" section (secrets, runbook, break-glass manual deploy), `.github/workflows/ci.yml` (deploy-staging job), the API list in this Global Context Block, `docs/release-readiness-<date>.md` from P-F0.2 (migration count finding).

### Steps
1. Check staleness: `curl https://qsfu5lcqt2.execute-api.us-east-1.amazonaws.com/health`, then probe a Phase-7 route (e.g. authed `GET /me/usage`). A 404 on Phase-7 routes = stale deploy.
2. Deploy current `main`: prefer the CI staging job if repo secrets exist; otherwise the break-glass zip deploy from the Commands section. Run `npm run migrate` against live Supabase first (migrations before code, per §32.6). Record how many applied.
3. Create a fresh test user via the Supabase Admin API (service key in `backend/.env`), sign in via `POST {SUPABASE_URL}/auth/v1/token?grant_type=password`, capture the access token.
4. Scripted curl sequence against the API Gateway URL, recording status + trimmed body for each: `/health` (200) · `/platforms` (200, 9 platforms) · `POST /draft` with a clarify-triggering idea (200 `clarifying`) · `POST /draft/:id/clarify` with answers (200 `ready_for_review` + strength score) · `POST /draft` with a jailbreak-style idea (422 blocked) · garbage token (401) · `GET /memory`, `POST /projects` + `GET /projects` (200s) · `GET /me/usage` (200 with plan) · `POST /recommend` (200 ranked) · `POST /optimize` (200).
5. Web against live: set `NEXT_PUBLIC_API_URL` to the gateway URL, `npm run dev`, click through signup → build (full clarify loop) → node edit → history. If a Cloudflare Pages project exists, deploy and re-check; if not, record "Pages project not created" as a launch blocker with the exact `wrangler pages project create` command — do NOT create it without the repo owner's go-ahead.
6. Extension §4 walkthrough on gemini.google.com pointed at the live API.
7. Write `docs/live-e2e-<date>.md`: every request, status, and a pass/fail verdict; a "blockers for the repo owner" section (e.g. GitHub secrets to add) if anything requires accounts you don't control.

### Do NOT
- Do not test against localhost and call it live.
- Do not paste tokens/secrets into the transcript doc — statuses and trimmed bodies only.
- Do not create cloud resources (Pages projects, new AWS infra) without explicit owner approval — document the exact command instead.

### Acceptance criteria
- Transcript shows the full §4 walkthrough green against staging on current code; zero unexplained 5xx; blockers (if any) listed with exact owner actions.

### Verify with
```bash
curl -s https://qsfu5lcqt2.execute-api.us-east-1.amazonaws.com/health
# plus the transcript in docs/live-e2e-<date>.md
```

---

## P-F0.4 — Documentation & ledger reconciliation

### Objective
Make the repo's written state match its actual state: fix the stale Global Context Block in `prompt-task.md`, fill the TA.3–TA.7 ledger hole in `task.md`, sweep every README, add a root README.

### Read first
`prompt-task.md` lines 1–120 (the stale block: claims web/extension/admin don't exist, 24 suites/160 tests), `task.md` tail (TA section ends at TA.2), `prompt-task.md` P-TA.4…P-TA.7 sections, `docs/feature-additions-v0.7.md` (FA-1…FA-6 map), every `README.md` in the repo.

### Steps
1. In `prompt-task.md`, insert a prominent note at the top of its Global Context Block: "SUPERSEDED 2026-07-11 by the Global Context Block v2 in final-task-prompt.md — kept for historical reference." Do not rewrite history inside it.
2. In `task.md`: append ledger entries `TA.3` through `TA.7` in the FEATURE ADDITIONS section. For each, first VERIFY in code whether it shipped (TA.3 = token-reduction advisor → `POST /optimize` + `TokenOptimizationAdvisor.ts` exists; TA.4 = fan-out → `POST /fanout` exists; TA.5 = trending discovery; TA.6 = usage coaching; TA.7 = new-website walkthrough — for each, grep the code named in the corresponding P-TA prompt). Mark `[x]` with a dated note ONLY where the code verifiably exists; mark `[ ]` with "prompt exists, never executed" where it doesn't. Accuracy over completeness — an honest `[ ]` is required if the feature isn't there.
3. `backend/README.md`: regenerate the route table from `handlers/routes.ts` (grep the route registrations); confirm the Deploys section still matches the workflows.
4. `web/README.md`: note Pages deployment status (from P-F0.3). `extension/README.md`, `firefox-extension/README.md`, `admin/README.md`, `macos/README.md`: sweep each against reality; fix drift.
5. Create root `README.md`: one-paragraph product description, surface map (7 dirs + desktop/ marked "coming in F1.2"), per-surface quickstart one-liners, pointers to the spec / ledgers / prompt files.

### Do NOT
- Do not change any code in this task (docs-only diff; exception: none).
- Do not mark any ledger item `[x]` without naming the file(s) that prove it.

### Acceptance criteria
- `grep -rn "DOES NOT EXIST YET" prompt-task.md` hits only inside the superseded-marked historical block (or nowhere); task.md TA section is complete and evidence-based; root README exists; every README statement spot-checks true.

### Verify with
```bash
git diff --stat   # docs-only
grep -n "TA.3\|TA.4\|TA.5\|TA.6\|TA.7" task.md
```

---

## P-F0.5 — Post-Phase-7 security review (mandated T3.8 re-run)

### Objective
Re-run the T3.8 security review over everything shipped since 2026-07-09 — E2EE, BYOK/KeyCustody, memory/projects, teams, billing/Stripe, admin plane, community library — producing `docs/security-review-<date>.md` with all critical/high findings fixed in-task.

### Read first
`docs/security-review-2026-07-09.md` (the prior review + its deferred items S-7/S-8), `prompt-task.md` P-T3.8 (the original checklist), `backend/src/services/KeyCustody.ts`, `PlanService.ts`, `handlers/routes.ts` (every route added after T3.8: memory, projects, keys, connections, teams, billing, library submit/moderate, sessions/content), `admin/` (all of it), `web/src/lib/crypto.ts`, migrations 009–016.

### Steps — record each finding as `{id, area, severity, description, fix or owner}`:
1. **BYOK non-retrievability:** audit every code path touching SSM — prove no read-back/display path exists (consumer or admin). Attempt-by-construction: is there ANY route that returns key material? Any log line?
2. **E2EE leak sweep:** grep all `logger.` calls and all route responses for `*_ciphertext` handling — ciphertext may move, plaintext may not exist server-side; confirm no decrypt code exists in `backend/` or `admin/`.
3. **IDOR sweep:** for EVERY `:id`/`:sessionId` route added since T3.8 (memory/:id, projects/:id, connections/:id, teams/:id + members, prompts/*, sessions/:sessionId/content, library/:id/moderate), verify an ownership/role WHERE clause exists and cross-user access returns **404** (not 403). Write a table. Pay special attention to `PATCH /sessions/:sessionId/content` — it writes ciphertext and MUST be ownership-checked.
4. **Stripe webhook:** confirm signature verification runs on every event; unset `STRIPE_WEBHOOK_SECRET` must refuse (in production) rather than accept-unsigned; replayed event ids must be idempotent (billing_events).
5. **Admin plane to the consumer bar:** authz on every route, CORS allowlist (not reflect-any), `secureHeaders()`, body-size cap, no `backend/` imports (grep), audit logging of admin actions.
6. **Plan-gate bypass:** can a free user reach pro-gated features by calling routes directly (visual preview, BYOK, projects count, compare-when-it-exists)? Server-side checks only count.
7. **Injection/validation regression:** every post-T3.8 route body Zod-validated; all SQL parameterized (grep `pool.query`).
8. **Dependency audit:** `npm audit --audit-level=high` in backend, admin, web, extension.
9. Fix all critical/high in-task with regression tests; mediums fixed or owner-assigned; write the doc.

### Do NOT
- Do not downgrade a finding's severity to avoid fixing it — justify every severity in one sentence.
- Do not add a BYOK key read-back path even as a debugging aid.

### Acceptance criteria
- `docs/security-review-<date>.md` complete; zero critical/high open; every fix has a test; §21.4 invariants re-verified; all suites green.

### Verify with
```bash
cd backend && npm run typecheck && npm test && npm audit --audit-level=high
cd ../admin && npm test && npm audit --audit-level=high
```

---
---

# PHASE F1 — REQUESTED FEATURE ADDITIONS

---

## P-F1.1 — Prompt Enhance mode (`POST /enhance` + web + extension)

### Objective
Let users improve a prompt they already have: parse pasted prompt text into the §13.1 node taxonomy, score it, run the Critic's bounded refine loop, and return an enhanced version with before/after scores and per-dimension deltas — then the normal node-editor experience.

**Feature check first:** grep `backend/src/handlers/routes.ts` for `enhance` — as of 2026-07-11 there is no such route (`/optimize` is token-reduction advice only). If one has appeared, STOP and convert this task into a gap review against the spec below.

### Read first
`backend/src/agents/draftShared.ts` (`normalizeRawNodes`, `assembleDraft`, node schema), `DraftingAgent.ts` (system-prompt construction, retry pattern), `CriticAgent.ts` (scoring + the bounded refine loop — this is what does the improving), `services/Supervisor.ts` (STEP_SEQUENCE, applyOutput), `types/Prompt.ts` (`computeStrength`, `RubricEvaluation`), `types/Response.ts` (`DesignedResponse`), `web/src/app/build/page.tsx` + `NodeEditor.tsx` + `StrengthPanel.tsx`, `extension/src/content/App.tsx` + `insertText.ts`.

### Steps
1. **`backend/src/agents/PromptImportAgent.ts`** (implements `Agent`): large-tier `generate('prompt_import','large',...)` call (add the `prompt_import` step to `config/model-routing.json`). System prompt: "You are given a FINISHED prompt written by a user. Decompose it into typed nodes… also classify task_type (one of the 6) and platform_hint. Do not improve anything — parse faithfully." JSON out via `extractJson` + Zod; reuse `normalizeRawNodes`; retry-once-then-`failure`. Returns `{nodes, taskType, platformHint}`.
2. **Supervisor enhance mode:** add `mode: 'draft' | 'enhance'` to the run options. `ENHANCE_SEQUENCE`: `context_resolved → [safety gate 1 on the pasted text] → imported (PromptImportAgent) → docs_retrieved → critiqued (Critic scores the imported draft, refines if needed — reuse the existing agent unchanged) → alternatives_attached → governed → ready_for_review`. Before the Critic runs, snapshot the imported draft's evaluation: score it once via the Critic's scoring call (or run Critic with refinement enabled and capture its *initial* evaluation from the agent output — extend CriticAgent's output to include `initialEvaluation` if not already exposed). Only the Supervisor mutates context.
3. **Route** `POST /enhance` (authed, Zod schema in `types/Http.ts`): `{platform_id?: string, text: string (10–8000)}`. platform_id omitted → use the import agent's `platformHint` if it matches the registry, else `generic` handling (same path `/draft` uses for unknown platforms — check how PlatformService resolves and mirror it). Response: `{status:'ok', original: {nodes, evaluation}, enhanced: DesignedResponse, improvement: {before: number, after: number, dimension_deltas: [{dimension, before, after}]}}`. Plan/budget/rate-limit checks same as `/draft`. Meter usage per step as `/draft` does.
4. **Honesty rule:** if `after <= before`, return the original as `enhanced` content but with `improvement.note: 'already_strong'` — never present a worse rewrite as an improvement. Implement + test.
5. **Web:** `/enhance` page (auth-gated): paste textarea + optional platform select → loading → before/after `StrengthPanel`s side by side + dimension-delta chips (▲/▼ per dimension) + `NodeEditor` on the enhanced nodes + copy button. All strings in `strings.ts`. On `/build`: if the idea input exceeds ~200 chars AND matches finished-prompt cues (multiple sentences/imperatives/formatting), show a dismissible inline nudge linking to `/enhance` with the text carried over (sessionStorage).
6. **Extension:** add an "Enhance current input" action to the overlay: read the detected platform's input field value (content script may READ the field it already fills), send to background → `/enhance` → show before/after score + "Replace input" button using the existing `insertText` (ToS gate + never-submit rules unchanged).
7. **Tests:** PromptImportAgent (parse happy path, malformed retry, provider outage → failure); Supervisor enhance sequence (imported → critiqued path, safety gate 1 blocks a jailbreak paste); route (200 shape with deltas, 400 validation, already-strong honesty path, plan/budget behavior mirrors `/draft`); web builds; extension vitest for the new message type.

### Do NOT
- Do not create a second Critic or duplicate refine logic — reuse `CriticAgent`.
- Do not skip safety gate 1 because "it's the user's own prompt" — pasted content is untrusted.
- Do not log the pasted text or the enhanced text (ids/scores/counts only).

### Acceptance criteria
- A deliberately vague pasted prompt returns `after > before` with coherent dimension deltas; a strong prompt returns `already_strong`; extension replace-in-field works on a launch platform without submitting; all suites green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../web && npx tsc --noEmit && npm run build
cd ../extension && npx tsc --noEmit && npx vitest run && npm run build
```

---

## P-F1.2 — Electron desktop app (`desktop/`) for macOS + Windows

### Objective
Create `desktop/`: an Electron app shipping the full builder (draft → clarify → node editor → enhance → history) for macOS and Windows, with hard renderer security, electron-builder packaging (dmg/zip + NSIS/portable), auto-update via GitHub Releases, and a web `/download` page.

**Feature check first:** confirm `desktop/` does not exist (`ls`). `macos/` (Swift) is a different surface — leave it untouched.

### Read first
`web/src/lib/api.ts` + `api-types.ts` (the client to mirror), `web/src/app/build/page.tsx`, `web/src/components/{NodeCard,NodeEditor,QuestionCard,StrengthPanel}.tsx` (the flow to re-implement — copy patterns, not files, unless a file imports nothing Next-specific, in which case copy it with the mirror header), `backend/.env` (SUPABASE_URL / SUPABASE_ANON_KEY names), Global Context Block rule 11.

### Steps
1. Scaffold two packages: `desktop/` (main + preload, esbuild or tsc, `electron`, `electron-builder`, `electron-updater` as the ONLY new deps — justified in final-task.md F1.2) and `desktop/renderer/` (Vite + React + TS strict). `desktop/README.md` opens with the Electron-vs-Tauri justification (team stack TS/React, Tray/globalShortcut/auto-update maturity, MediaRecorder for STT).
2. **Main process** (`desktop/src/main/`): app lifecycle, single main window (1120×760, min 900×600, `show:false` + `ready-to-show`), every window created with `contextIsolation:true, nodeIntegration:false, sandbox:true`; `session` CSP header (`default-src 'self'`; connect-src limited to the API base + Supabase origin); `will-navigate` prevent + `setWindowOpenHandler` → `shell.openExternal` for http(s), deny otherwise; single-instance lock.
3. **Preload bridge** (`desktop/src/preload/index.ts`): `contextBridge.exposeInMainWorld('pf', {...})` — enumerated methods only: `getVersion()`, `getSettings()/setSettings(partial)`, `readClipboardText()` (main-process-side, invoked only from explicit UI clicks), `onDeepAction(cb)`. Type the bridge in a shared `desktop/src/shared/ipc.ts`; snapshot-test the exposed key list so the surface can't grow silently.
4. **Settings store:** hand-rolled JSON store in `app.getPath('userData')/settings.json` (~40 lines: read-once, atomic write via rename). Session token persisted ONLY via `safeStorage.encryptString` (fallback: keep in-memory + re-login, with a logged warning — never plaintext on disk).
5. **Renderer:** mirror `web/src/lib/api-types.ts` + `api.ts` (mirror headers per rule 12); Supabase email/password auth (`@supabase/supabase-js`); env via Vite define `PF_API_URL` (default the staging gateway) + `PF_SUPABASE_URL`/`PF_SUPABASE_ANON_KEY`. Screens: sign-in → builder (platform picker, idea box, clarify cards, result with node editor + strength panel + copy), enhance (paste → before/after, from P-F1.1), history (GET /sessions). Reuse the web components' logic; strings in a `strings.ts` copy.
6. **Packaging:** `electron-builder` config — appId `com.promptforge.desktop` (placeholder-brand note), mac: dmg+zip, arm64+x64, hardened runtime + entitlements file, notarization hook stubbed with a runbook section (works unsigned for dev); win: nsis (per-user, no elevation) + portable, x64; `publish: github`. `electron-updater`: check on ready + every 6h, silent-fail offline, quit-and-install prompt.
7. **Auto-update + CI:** `.github/workflows/desktop.yml` — on tag `desktop-v*`: build both platforms (matrix), attach artifacts to a draft GitHub Release; a plain push runs package-dry-run only. Document required secrets (none for unsigned; APPLE_ID etc. listed for later signing).
8. **Web `/download` page:** OS detection → primary button (dmg or exe) + all-platforms list + Gatekeeper ("right-click → Open") and SmartScreen ("More info → Run anyway") first-run notes; links point at the GitHub Releases latest URLs; strings in `strings.ts`.
9. **Tests:** main-process unit tests where feasible (settings store, IPC surface snapshot); renderer: vitest for the api client + auth flow reducer; a `npm run dist:dry` that runs electron-builder with `--publish never` on the current OS. Manual smoke documented in README (install → sign in → draft loop).

### Do NOT
- Do not enable `nodeIntegration`, disable `contextIsolation`, or expose `ipcRenderer` raw.
- Do not load ANY remote URL in a BrowserWindow — the renderer is fully local; only fetch() to the API.
- Do not store tokens or settings in localStorage/plaintext files.
- Do not add UI-kit/animation libraries.

### Acceptance criteria
- `npm run dev` (desktop) opens the app; full draft loop works against a local backend; `npm run dist:dry` produces an installable artifact on the build OS; IPC snapshot test enumerates the bridge; security flags asserted in a test (create window config exported + unit-tested).
- README: install, dev, packaging, signing/notarization runbook, unsigned-Windows caveat, update flow.

### Verify with
```bash
cd desktop && npm run typecheck && npm test && npm run dist:dry
cd renderer && npx tsc --noEmit && npx vitest run
cd ../../web && npx tsc --noEmit && npm run build   # /download page
```

---

## P-F1.3 — Voice dictation (STT): `POST /transcribe` + `useDictation()` across surfaces

### Objective
Add dictation-only voice input: a mic button on the idea box, free-text clarification answers, and the enhance paste box — web (Web Speech API primary, backend fallback), extension, desktop (backend path only). Backend fallback = Groq `whisper-large-v3-turbo` (`$0.04/audio-hr`, free tier ~2k req/day — decision + comparison table live in final-task.md F1.3; re-verify current pricing before hardcoding budgets).

**Feature check first:** grep the repo for `SpeechRecognition|MediaRecorder|transcribe` — as of 2026-07-11 there is none. If found, STOP and gap-review instead.

### Read first
`backend/src/services/providers/GroqAdapter.ts` + `openAICompatible.ts` (Groq auth/base-url pattern), `config/model-routing.json`, `backend/src/config/env.ts`, `backend/src/services/PlanService.ts` (plan-aware caps), the `/preview/visual` route in `routes.ts` (the per-user daily-cap + metering pattern to copy), `web/src/components/QuestionCard.tsx` + the `/build` page idea box, `extension/src/types/messages.ts` + `background/index.ts`.

### Steps
1. **Adapter** `backend/src/services/providers/GroqSTTAdapter.ts`: `transcribe({audio: Buffer, mimeType, language?}): Promise<{text, durationMs}>` — multipart POST to `${GROQ_BASE_URL}/audio/transcriptions` with model from a new `transcription` step in `config/model-routing.json` (`whisper-large-v3-turbo`); 10s timeout; errors → typed failure (never throw raw).
2. **Route** `POST /transcribe` (authed): multipart form (`audio` file + optional `duration_ms` hint). Guards in order: `STT_ENABLED` env (boolString default `'true'`; 404 when off) → mime allowlist (`audio/webm`, `audio/ogg`, `audio/mp4`, `audio/m4a`, `audio/wav`; else 415) → size ≤ 5MB (413) → per-user daily cap `STT_REQUESTS_PER_DAY` (default 50; read the user's plan via PlanService and allow a per-plan override from `config/plans.json` if the schema supports feature limits — follow the existing plans schema, don't invent one) → adapter call. Meter: one `usage_events` row, step `transcribe`, tokens 0, detail `{durationMs}`. Return `{text}`. Provider failure → **503 `{status:'stt_unavailable'}`**.
3. **Privacy (hard):** the audio Buffer lives only in request scope; no disk writes, no DB writes, no logging of `text`. Add a test asserting the logger mock never receives the transcript string.
4. **Web hook** `web/src/lib/useDictation.ts`: `{start, stop, state: 'idle'|'listening'|'processing'|'unsupported'|'denied', interim, error}` — feature-detect `window.SpeechRecognition ?? webkitSpeechRecognition` → free path with interim results; else MediaRecorder (`audio/webm;codecs=opus`, 60s hard stop) → `api.transcribe(blob)`. Expose which path is active (for the fallback test).
5. **`MicButton` component:** idle / listening (slow pulse, ≥1.5s cycle) / processing states; `aria-pressed`, `aria-label`; `prefers-reduced-motion` → no pulse; permission denied → inline hint text, never a crash. Wire into: `/build` idea textarea, free-text `QuestionCard`s, `/enhance` paste box. Insert at cursor position; never replace existing text. `STT_ENABLED` exposure: add a lightweight `GET /features` public route returning `{stt: boolean, visual_preview: boolean}` (extend later) so clients can hide the mic when off — or reuse an existing config route if one exists (check first).
6. **Extension:** mic in the overlay (idea + free-text steps): content UI captures via MediaRecorder, transfers the ArrayBuffer to the background worker (`chrome.runtime.sendMessage` supports structured clone), background posts multipart to `/transcribe` with the stored token. Content script stays fetch-free (grep-enforced in its test).
7. **Desktop:** renderer uses the same hook with the Web-Speech branch disabled (always backend path); add `NSMicrophoneUsageDescription` to electron-builder's mac config (extendInfo).
8. **Tests:** adapter (multipart shape, model from routing config, timeout, error typing); route (200, 404 off, 413, 415, 429 cap, 503 outage, meter row asserted, transcript-never-logged); hook unit tests with mocked recognition/recorder; extension message round-trip.

### Do NOT
- Do not put `GROQ_API_KEY` in ANY client (web/extension/desktop) — backend only.
- Do not stream audio continuously or auto-start the mic — capture starts/stops on explicit clicks only.
- Do not store audio or transcripts anywhere server-side.

### Acceptance criteria
- Web: dictation works via Web Speech AND via the forced fallback (temporarily stub detection to false); extension + desktop: backend path works; caps/flags enforced with tests; no audio/transcript in logs or DB (test-proven); suites green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../web && npx tsc --noEmit && npm run build
cd ../extension && npx tsc --noEmit && npx vitest run && npm run build
```

---

## P-F1.4 — Menu-bar / system-tray quick-open (Swift verify + Electron Tray)

### Objective
(a) Prove the Swift menu-bar scaffold actually works and add its promised global hotkey. (b) Add a Tray to the Electron app: macOS menu-bar icon + Windows system tray with quick actions, close-to-tray, start-at-login.

**Feature check first:** `macos/Sources/PromptForge/PromptForgeApp.swift` already has `MenuBarExtra` — verify, don't rebuild. `desktop/` has no tray (created bare in P-F1.2).

### Read first
`macos/Sources/PromptForge/*.swift` (all 5 files), `prompt-task.md` P-T8.1 (the CGEvent-tap hotkey approach), `desktop/src/main/` (from P-F1.2: window management, settings store, IPC bridge), electron `Tray`/`globalShortcut`/`app.setLoginItemSettings` docs (your knowledge; no new deps).

### Steps
1. **Swift half:** `swift build` + run the app. Exercise every menu item (Draft, History, Settings, Quit) — fix runtime breakage minimally (scaffold code may have Swift 6 concurrency issues; prefer `@MainActor`). Implement the global hotkey (default Cmd+Shift+Space) via a `CGEvent` tap that toggles the draft panel; hotkey configurable in `SettingsView` (persist in `UserDefaults`). Accessibility permission: request lazily with a pre-prompt explanation sheet; full manual flow must work when denied (§20.3). Record what worked/was fixed in `macos/README.md`.
2. **Electron tray** (`desktop/src/main/tray.ts`): macOS — 22×22pt template PNG (`nativeImage.createFromPath(...).setTemplateImage(true)`) so it adapts to menu-bar dark/light; Windows — .ico. Context menu: `Open PromptForge` (show + focus main window) · `New Draft  ⌃⇧P`-labeled (opens main window on the builder, cleared) · `Enhance Clipboard` (reads clipboard via the main process **on this click only**, opens the enhance screen prefilled) · `Toggle Widget` (no-op with a "coming with F1.5" disabled state until F1.5 lands — wire the menu item now) · `Start at Login` (checkbox → `app.setLoginItemSettings({openAtLogin})`, state read back from `getLoginItemSettings`) · `Quit`.
3. **Close-to-tray:** window `close` event hides instead of quitting when `settings.closeToTray` (default true); first hide on Windows shows a one-time balloon/notification "PromptForge is still running in the tray"; `Quit` menu item and Cmd+Q set an `isQuitting` flag so quit is never trapped.
4. Click behavior: macOS — left-click opens the menu (platform convention); Windows — left-click toggles the main window, right-click opens the menu.
5. **Tests:** settings-store round-trip for the new keys; menu template builder unit-tested as a pure function (given settings → menu item array with correct labels/checked states); manual matrix in `desktop/README.md` (macOS light/dark menu bar, Windows tray, login item on/off, quit-vs-close).

### Do NOT
- Do not add third-party hotkey/tray libraries (Swift or Electron).
- Do not read the clipboard anywhere except inside the explicit `Enhance Clipboard` click handler.
- Do not let close-to-tray make the app unquittable.

### Acceptance criteria
- Swift: builds, runs, menu works, hotkey toggles the panel, denied-permission path clean — README updated with evidence.
- Electron: tray icon correct on both OSes (macOS template verified in dark + light), all menu items functional, login item toggles, close-to-tray + real quit both work.

### Verify with
```bash
cd macos && swift build
cd ../desktop && npm run typecheck && npm test && npm run dist:dry
```

---

## P-F1.5 — Always-on floating assistant widget ("Pulse"): skins, hotkey, drag

### Objective
A small always-on-top floating widget (desktop) and an opt-in per-origin floating button (extension): drag-anywhere with edge snap + persistent position, click/hotkey opens a quick-action panel (draft / enhance clipboard / dictate / open app), three skins — `pill` (minimal rounded rectangle), `orb` (breathing glow), `companion` ("Forgi", an animated SVG figure) — all obeying hard non-distraction rules.

**Feature check first:** confirm nothing widget-like exists (`grep -rn "alwaysOnTop\|floating" desktop/ extension/src` — expect zero hits beyond this task).

### Read first
`desktop/src/main/` (windows, settings store, tray from P-F1.4 — its `Toggle Widget` item gets wired here), `desktop/src/preload/` (bridge pattern), `extension/src/content/index.tsx` + `overlay.css` (Shadow DOM setup + how the overlay opens), `extension/src/manifest.json` (commands), P-F1.3's dictation hook.

### Steps
1. **Widget window (desktop main):** frameless, transparent, `alwaysOnTop` level `'screen-saver'`, `visibleOnAllWorkspaces({visibleOnFullScreen:false})`, `skipTaskbar`, `resizable:false`, ~76×76. Same security flags as every window (rule 11).
2. **Drag:** pointer events in the widget renderer → IPC `widget:drag` (dx/dy) → main moves the window (`setBounds`, no animation). A ≤6px total-movement pointerup = click (open panel), more = drag. On release: snap to nearest horizontal screen edge (12px margin), persist `{x, y, displayId}` to the settings store. On `screen` module `display-metrics-changed`/`display-removed`: clamp the saved position back into a visible display's workArea.
3. **Panel:** on activate, resize/show an anchored panel window (~340×440) positioned beside the widget, flipping horizontally/vertically to stay on-screen. Contents: idea input with Draft button (+ `MicButton` from P-F1.3) · **Enhance clipboard** — button that on click asks main for `readClipboardText()`, shows an 80-char preview chip + "Enhance" confirm (never acts on the clipboard without this explicit two-step) · Open full app · settings gear (skin, size S/M/L, opacity, hotkey, enabled). Esc or blur collapses back to the widget.
4. **Hotkey:** `globalShortcut.register(settings.widgetHotkey ?? 'CommandOrControl+Shift+P')` toggles the panel from anywhere; registration failure (conflict) → warning surfaced in settings UI; re-register on change; unregister on quit. (The extension's existing `Ctrl/Cmd+Shift+Space` overlay command is a separate concern — leave it.)
5. **Skins — registry, not switch-statements:** `desktop/renderer/src/widget/skins/{pill,orb,companion}.tsx` + a `skins.ts` registry `{id, label, render(state)}`. `pill`: rounded-rect + logo glyph. `orb`: dot with a ≥4s breathing glow (CSS keyframes). `companion` ("Forgi"): hand-rolled inline SVG — randomized blink every 3–5s (one ~30-line scheduler), 3px idle bob (CSS), one-time wave on first launch; **zero animation libraries**. All skins: hover scale ≤1.06, active state while the panel is open.
6. **Non-distraction rules (enforce, don't suggest):** idle-fade to 40% opacity after 6s without hover/panel (CSS transition; timer in renderer); no animation cycle <3s; no sound; no badges; `prefers-reduced-motion` → all animation off (static skin, instant fades); auto-hide the widget when the OS reports a fullscreen frontmost context (best-effort: hide when any display-matching window is fullscreen via `screen`+`getFocusedWindow` heuristics on our own windows, and expose a "hide in fullscreen" setting default ON; document the OS-level limitation honestly).
7. **Extension parity (small, opt-in):** a floating button rendered inside the existing Shadow DOM host — default OFF; per-origin enable + position in `chrome.storage.local` (`widget:{origin}` keys); same three skins via shared CSS copied into `overlay.css` (mirror-header comment); drag with the same 6px click/drag threshold; click opens the existing overlay. No new permissions.
8. **Tray integration:** implement P-F1.4's `Toggle Widget` menu item → enable/disable the widget window + persist.
9. **Tests:** drag math + snap + clamp as pure functions (unit); skin registry completeness (every skin renders in all states); reduced-motion branch; settings persistence round-trip; extension: position persistence + fetch-free/credential-free invariants still hold. Manual matrix in `desktop/README.md`: 2-display drag + unplug, hotkey rebind + conflict, all 3 skins × light/dark, 10-minute-video distraction check.

### Do NOT
- Do not read the clipboard on hover, focus, timer, or panel-open — only on the explicit Enhance-clipboard click.
- Do not use `-webkit-app-region: drag` (it swallows the click-vs-drag distinction) — pointer-event drag only.
- Do not add tweening/animation/state libraries.
- Do not let the widget appear over fullscreen video by default.

### Acceptance criteria
- Widget restores position after restart (including after a display unplug → clamped sanely); click opens the panel, drag never does; hotkey toggles globally; all skins render with animations off under reduced-motion; extension button is off by default and per-origin sticky; all suites green.

### Verify with
```bash
cd desktop && npm run typecheck && npm test && cd renderer && npx vitest run
cd ../../extension && npx tsc --noEmit && npx vitest run && npm run build
```

---
---

# PHASE F2 — EXPERIENCE UPGRADES

---

## P-F2.1 — Real pipeline progress (status endpoint + honest step labels)

### Objective
Replace the web UI's fake rotating status lines with the pipeline's true current step, via an in-memory progress registry + a short-poll status endpoint. (API Gateway buffers responses — SSE/streaming is not available; poll.)

### Read first
`backend/src/services/Supervisor.ts` (`transition()` — the single choke point), `backend/src/handlers/routes.ts` (`/draft` family, ownership-check patterns), the web `/build` page's loading state (T4.4 shipped rotating placeholder text — find it), `web/src/lib/strings.ts`.

### Steps
1. `backend/src/services/SessionProgress.ts`: module-level `Map<sessionId, {userId, state, updatedAt}>`; `set()` called from `Supervisor.transition()` (fire-and-forget, zero awaits on the hot path); TTL sweep (delete entries >10min old) on a lazy timer or on each set.
2. Route `GET /draft/:sessionId/status` (authed): entry must exist AND `userId` match → `{state, updatedAt}`; else 404 (no existence leak). No DB round-trip — memory only (Lambda instance-affinity caveat: within one warm instance the map is coherent; across instances a 404 falls back gracefully — note this honestly in a code comment; it's a perceived-latency feature, not a correctness feature).
3. Web: while a draft/clarify/enhance call is in flight and a `session_id` is known, poll every 650ms; render labels from a `state → label` map in `strings.ts` ("Checking safety…", "Reading {platform} docs…", "Drafting…", "Scoring…", "Preparing alternatives…"). Unknown state or any poll error → fall back silently to the generic spinner. Stop polling on completion/unmount.
4. Desktop renderer + extension overlay: reuse the same polling logic (mirror-copied helper).
5. Tests: registry TTL + ownership; route 200/404; Supervisor still green (no added latency — assert `transition` doesn't await the registry); web builds.

### Do NOT
- Do not persist progress to the DB (metadata churn for a UX nicety — memory only).
- Do not block or slow `transition()` — no awaits.
- Do not let a status-endpoint failure affect the draft result path.

### Acceptance criteria
- Live local draft shows true step labels advancing; killing the status route mid-draft still yields the finished draft with the generic spinner; suites green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../web && npx tsc --noEmit && npm run build
```

---

## P-F2.2 — Version history & diff UI (face for T3.4)

### Objective
Give the shipped T3.4 backend (immutable versions, restore, node diff) its missing UI: a `/prompts` list page, a `/prompts/[id]` detail page with version timeline + diff + restore, and "Save prompt" wiring from build/enhance results.

### Read first
Backend endpoints: `POST/GET /prompts`, `GET /prompts/:id/versions`, `GET /prompts/:id/versions/:v`, `POST /prompts/:id/restore`, `GET /prompts/:id/diff?from=&to=` (shapes in `backend/src/services/PromptService.ts`); migration `006_prompt_versions.sql` (the pre-E2EE `nodes_json` interim note — reflect it in page copy); `web/src/lib/api.ts` (add typed methods), `/history` page (list-page pattern), `NodeEditor` (node rendering).

### Steps
1. API client: `savePrompt`, `listPrompts`, `listVersions`, `getVersion`, `restoreVersion`, `diffVersions` + DTOs in `api-types.ts` (mirror header).
2. `/prompts` page (auth-gated): table of saved prompts (platform, task type, head version, strength, updated) → row links to detail. Empty state with a pointer to Build.
3. `/prompts/[id]`: left rail = version timeline (v1…vN, score chips, created date); main = selected version's nodes (read-only `NodeCard` variant) + assembled text + copy. **Diff mode:** pick two versions → render added (green) / removed (red) / changed (amber, before → after) rows from the diff endpoint. **Restore:** button on any old version → confirm dialog with the copy "Restoring creates a new version — history is never rewritten" → calls restore → timeline refreshes showing v(N+1).
4. Wire "Save prompt" buttons onto the `/build` result and `/enhance` result screens (`POST /prompts` with nodes/platform/task_type/score); after saving, node-editor changes surface a "Save as v(N+1)" affordance (`saveVersion`).
5. Keyboard + a11y pass (tables navigable, diff rows labeled, dialog focus-trapped). All strings in `strings.ts`.
6. Tests: any new backend gap found (e.g. missing field in list response) fixed with tests; web builds; manual chain documented in `web/README.md`: save → edit ×2 → diff v1↔v3 → restore v1 → v4 exists.

### Do NOT
- Do not add UPDATE/DELETE version capabilities (immutability is the contract).
- Do not fetch all version bodies eagerly — metadata list first, bodies on selection.

### Acceptance criteria
- The full save → edit → diff → restore loop works by mouse and keyboard against a local backend; restores append; suites green + web builds.

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../web && npx tsc --noEmit && npm run build
```

---

## P-F2.3 — Command palette (⌘K) + selection-to-enhance in the extension

### Objective
A keyboard-first command palette on web (and desktop renderer if `desktop/` exists), plus a right-click "Enhance with PromptForge" context-menu item in the Chrome extension.

### Read first
`web/src/components/` (component conventions), `web/src/lib/strings.ts`, `GET /sessions` shape (recent-session search), `extension/src/manifest.json` (permissions — `contextMenus` must be added), `extension/src/background/index.ts` (message routing), P-F1.1's extension enhance flow.

### Steps
1. `web/src/lib/palette.ts`: action registry `{id, label, keywords, run()}` — new draft, enhance, history, library, prompts, account, platform quick-switch ("Draft for Midjourney…"), dictate (focus idea + start mic if STT enabled). Hand-rolled fuzzy subsequence scorer (~40 lines: chars must appear in order; score by consecutive-run length + word-boundary bonuses; unit-test the ranking). **No new dependency.**
2. `CommandPalette.tsx`: global `⌘K`/`Ctrl+K` listener; `role="dialog"` + focus trap + `aria-activedescendant` listbox; sections: Actions (fuzzy over registry) / Recent (last 8 sessions via `GET /sessions`, matched on platform + state label); arrow/Enter/Escape; renders nothing until opened (zero cost). Mount in the web layout; copy to `desktop/renderer` with the mirror header if desktop exists (skip cleanly if not — say so in the report).
3. Extension: add `"contextMenus"` permission; background creates one item ("Enhance with PromptForge", contexts `["selection"]`) on install; on click → send the selection text to the active tab's content script → open the overlay in enhance mode prefilled (reuses P-F1.1's overlay flow). On non-detected platforms: overlay still shows before/after + a Copy button (no insert). Selection text goes through the normal `/enhance` safety gate server-side; never logged.
4. Tests: scorer ranking table (exact > prefix > word-boundary > scattered; non-matching excluded); palette keyboard nav (testing-library if the web has a rig, else a documented manual checklist in `web/README.md`); extension: context-menu registration + message round-trip with mocked chrome APIs.

### Do NOT
- Do not add cmdk/kbar/fuse.js — hand-rolled only.
- Do not auto-enhance on selection — the context-menu click is the explicit action, and the overlay still requires a user click to insert.
- Do not request extension permissions beyond `contextMenus`.

### Acceptance criteria
- ⌘K → type 3 chars → Enter reaches every core destination; ranking test green; right-click flow yields an enhanced prompt on an arbitrary site with copy (and insert on detected platforms); builds + suites green.

### Verify with
```bash
cd web && npx tsc --noEmit && npm run build
cd ../extension && npx tsc --noEmit && npx vitest run && npm run build
```

---

## P-F2.4 — Prompt templates with variables + shareable links

### Objective
`{{variable}}` slots in saved prompts and library entries with a fill-form on every insert path; safety-gated, revocable public share links for prompts.

### Read first
`backend/src/services/PromptService.ts` + `LibraryScreening.ts` (the safety+rubric gate to reuse), `backend/migrations/` (next free number — expect 017+), `web/src/app/library/page.tsx` (remix flow), `web/src/data/library-seeds.json`, P-F2.2's `/prompts` pages, `backend/src/handlers/routes.ts` (public-route mounting + rate-limit patterns, e.g. `/platform-requests`).

### Steps
1. `backend/src/utils/templateVars.ts` (pure): `parseVars(text): {name, default?}[]` for `{{name}}` / `{{name|default}}` (name: `[a-z0-9_]{1,32}`); `fillVars(text, values)`; `validate` (unknown/missing vars listed). Mirror-copy to `web/src/lib/templateVars.ts`.
2. Migration `0NN_template_vars.sql` (use the actual next number): `alter table prompts add column if not exists variables jsonb;` + same on `library_entries`. Derive + persist `variables` in `savePrompt`/`saveVersion` and library submission (server-derived from the assembled text — never trust a client-sent list).
3. Migration `0NN+1_share_links.sql`: `share_links (id uuid pk default gen_random_uuid(), prompt_id uuid not null references prompts(id) on delete cascade, slug text not null unique, created_at timestamptz default now(), revoked_at timestamptz)`; slug = 22 chars from `crypto.randomBytes` base64url.
4. Routes: `POST /prompts/:id/share` (authed, owner, rate-limited ~20/day) → run the prompt's assembled text through **the same safety classifier + rubric screening as `POST /library/submit`** (block → 422 with the standard blocked shape) → create/return `{slug, url}`. `DELETE /prompts/:id/share` → sets `revoked_at`. `GET /share/:slug` (**public**): joins to the prompt head version; 404 when revoked/missing; returns assembled text, nodes, strength score, variables — **no user identifiers of any kind**; response header `X-Robots-Tag: noindex`.
5. Web: fill-form modal — any insert path (library remix, `/prompts` copy, share-page "Open in PromptForge") with `variables.length > 0` shows labeled inputs (defaults prefilled) + live preview → fills before inserting. `/share/[slug]` public page: prompt + score + node breakdown + fill-form + CTA; works logged-out. Share controls on `/prompts/[id]`: create / copy link / revoke.
6. Tests: templateVars parse/fill/validate table (incl. `{{a|with spaces}}`, repeated vars, malformed braces); share create/fetch/revoke; safety-block path (mock classifier unsafe → 422, no row); no-identity assertion on the public payload; migrations idempotent.

### Do NOT
- Do not make share links enumerable (no sequential ids in URLs) and do not leak owner id/email/name in the public payload (test it).
- Do not skip the safety gate because the prompt was already scored at save time — share is a new publication event.

### Acceptance criteria
- 3-variable template round-trips (save → remix → fill → insert); share link renders logged-out, revokes to 404 instantly, safety-gated; suites green + migrations idempotent.

### Verify with
```bash
cd backend && npm run typecheck && npm test && npm run migrate
cd ../web && npx tsc --noEmit && npm run build
```

---

## P-F2.5 — A/B prompt comparison via BYOK (`POST /compare`)

### Objective
Let BYOK users run two prompt variants (typically original vs enhanced) against their own connected provider key, side by side, and record which won — the "prove the enhancement" moment.

### Read first
`backend/src/services/KeyCustody.ts` (ephemeral decrypt), the BYOK adapters (`GoogleChatAdapter`, `OpenAIAdapter`) + how `/connections` selects them, `PlanService.ts` (pro gating pattern), the `/preview/visual` route (daily-cap pattern), `POST /feedback` (outcome recording), P-F1.1's `/enhance` web result screen.

### Steps
1. Route `POST /compare` (authed): Zod body `{platform_id, prompt_a: string ≤8000, prompt_b: string ≤8000, connection_id?}`. Guards in order: plan entitlement (pro-tier feature per `config/plans.json` — follow the existing entitlement key pattern; 403 `plan_restricted` from P-F0.1's contract) → active BYOK connection exists (else 409 `{status:'no_connection'}`) → daily cap `COMPARE_REQUESTS_PER_DAY` (env, default 5; 429) → **safety gate on BOTH texts** (422 on either) → run both prompts through the user's connected adapter via KeyCustody ephemeral decrypt, concurrently, 30s overall timeout → `{a: {output, latency_ms, tokens?}, b: {...}}`. Adapter/provider failure → **502** with a clear message (their key/provider, not our infra), never 500.
2. **Ephemerality (hard):** outputs are returned and forgotten — no DB write, no audit `detail` containing output text (audit the event as counts/durations only), no logging. Meter one usage_events row (step `compare`, tokens if the adapter reports them).
3. Web: on the `/enhance` result screen, a "Test them on your model" button — visible only when `GET /connections` shows an active connection AND the plan allows (otherwise an upsell chip linking to account/billing — an honest nudge, not an error). Click → side-by-side output panes (A = original, B = enhanced, labeled) + latency chips + verdict buttons "A was better / B was better / Tie" → POST to the existing `/feedback` (outcome mapping: B-better → `worked`, A-better → `didnt_work`, tie → `mixed`; task_type/platform from the enhance context — stays anonymized per §10.7).
4. Tests: gating order (plan 403 before connection 409 before cap 429); safety block; concurrent execution + timeout; 502 on adapter error; **no-persistence assertion** (fake pool records zero content writes; logger mock never sees output text); web builds.

### Do NOT
- Do not run comparisons through PromptForge's own provider keys — BYOK only (it's the user's cost and their model).
- Do not persist or log model outputs anywhere.
- Do not show the feature as broken to free/keyless users — upsell chip, not an error state.

### Acceptance criteria
- With a mocked adapter: full compare → verdict → feedback row (anonymized) flow green; all gate orders tested; ephemerality test-proven; suites green.

### Verify with
```bash
cd backend && npm run typecheck && npm test
cd ../web && npx tsc --noEmit && npm run build
```

---

## P-F2.6 — First-run onboarding, PWA install & i18n activation

### Objective
Three polish workstreams: a hand-rolled first-run spotlight tour, PWA installability (shell only — no API caching), and turning the long-maintained `strings.ts` discipline into a working locale system with a switcher.

### Read first
`web/src/lib/strings.ts` (every key — this is the i18n corpus), `web/src/app/layout.tsx` + `LayoutClient.tsx`, `/build` page structure (tour anchors), `/account` page (switcher + tour-relaunch home), `next.config.*` + `wrangler.toml` (static asset handling for manifest/icons).

### Steps
1. **Onboarding tour:** `web/src/components/Tour.tsx` (~200 lines, hand-rolled): 4 steps anchored to `/build` elements via `data-tour="platform-picker|idea-box|node-editor|strength-panel"` attributes — (1) pick a platform, (2) describe your idea (or dictate/paste a finished prompt → mentions `/enhance`), (3) lock & edit nodes, (4) what the score means. Spotlight = fixed overlay with a box-shadow cutout positioned from `getBoundingClientRect`; Next/Back/Skip buttons; keyboard operable; step changes announced via `aria-live=polite`; shown once (`localStorage pf_tour_done`), relaunchable from `/account`. Steps 3–4 no-op gracefully if the user hasn't drafted yet (point at the area with adjusted copy).
2. **Empty states:** `/history`, `/library`, and (if present from P-F2.2) `/prompts` get coaching cards ("Your drafts will appear here — try the builder") instead of bare "no data" lines.
3. **PWA:** `public/manifest.json` (name, short_name, standalone, theme/background colors for light+dark, 192/512 maskable icons — generate from the existing logo asset; if none exists, create a simple SVG-derived one and note it as placeholder branding); link it in the layout with proper meta tags. **No service worker that caches API responses** — content privacy decision, documented in `web/README.md`; a minimal SW for the static shell is optional, skippable if `next-on-pages` complicates it (report which you did).
4. **i18n:** move the corpus to `web/src/lib/locales/en.ts` (typed as the canonical `Strings` shape); `strings.ts` becomes a compatibility re-export so existing imports keep working; add `useStrings()` context provider with a locale switcher on `/account` (persisted in localStorage); add ONE stub locale (e.g. `es.ts`) machine-translated and flagged `// MACHINE-TRANSLATED — needs human review` to prove the pipe (translation quality is explicitly out of scope). Dead-key sweep: script or manual pass removing unreferenced keys (list them in the report). Enforcement: a vitest/grep check that `web/src/app` + `web/src/components` contain no raw user-facing string literals in JSX text positions (pragmatic heuristic: flag JSX text nodes with ≥2 consecutive letters outside the locale files; tune to zero false-positive noise and document exclusions).
5. Tests: tour state machine (step advance/skip/persist) unit-tested; strings-shape type equality between locales (`satisfies Strings`); the no-hardcoded-strings check wired into the web test/build script.

### Do NOT
- Do not add an i18n framework (next-intl/i18next) — the context + typed dictionaries pattern is sufficient at this scale.
- Do not cache API responses in any service worker.
- Do not block the app on tour code (lazy-mount it).

### Acceptance criteria
- Fresh profile: tour appears once on `/build`, is fully keyboard-operable, relaunches from `/account`; Lighthouse (or manual criteria) shows installable PWA; locale switch re-renders every visible string with the stub locale; the hardcoded-string check passes; web builds green.

### Verify with
```bash
cd web && npx tsc --noEmit && npm run build && npm run pages:build
npx vitest run   # if the web test rig exists; else paste the manual checklist results
```
