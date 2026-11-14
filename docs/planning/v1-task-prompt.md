# v1-task-prompt.md — Cold-start execution prompts for v1-task.md

> How to use: each section below is a self-contained prompt for executing one phase of `v1-task.md` from a fresh session. Paste the **Global preamble** + the phase prompt. Phases assume the execution order in v1-task.md. After finishing a phase: run its verification block, update the ledger checkbox, commit nothing unless asked.

---

## Global preamble (prepend to every phase prompt)

You are working in `/Users/jeevithgangadhara/Desktop/Prompt AI 2026` — the PromptForge monorepo (see README.md). Authoritative plan: `v1-task.md` (read your phase's section fully before coding). Conventions that are non-negotiable:

- Dependency flow `handlers → services → agents → utils/types`. Handlers hold zero business logic.
- Config over code: tunables live in `config/*.json` or env — never inline constants.
- Never log prompt content. Safety fails closed. New services/routes/agents get jest tests.
- Web strings go in `web/src/lib/strings.ts` (the `en` object); components import `strings`.
- Web/API types are hand-mirrored in `web/src/lib/api-types.ts` (never cross-package imports); API calls go through `web/src/lib/api.ts` `ApiClient`.
- The local dev DB is partially reachable: several tables don't exist locally. Every DB touch needs a graceful degraded path (pattern: try/catch → `logger.warn({type:'…_skipped', reason})` → serve fallback). Grep `db_fallback` / `write_skipped` for examples.
- LLM calls go through `generate(pipelineStep, complexity, request)` from `services/providers` — never a provider SDK directly. New pipeline steps need a row in `config/model-routing.json`. In tests, inject a `jest.fn()` as the `generateFn` param (pattern: `tests/services/NodeRedraftService.test.ts`) or mock `global.fetch` (pattern: `tests/integration/phase4-routes.test.ts` `mockProvider()`).
- Route registration: add to the `authed` sub-app (or `app` for public) in `backend/src/handlers/routes.ts` **before** `app.route('/', authed)` (~line 2145). Body schemas live in `backend/src/types/Http.ts` (zod).
- JSON-from-LLM: use `extractJson` (`utils/json.ts`), zod-validate, retry once, then fail honestly (pattern: `ChatRefineService.ts`).
- UI: stone/paper neutrals + emerald-600 accent ONLY. Zero gradients, zero purple/violet/fuchsia. Use `web/src/components/ui/` primitives once V1.9 lands; before that, match `NodeCard.tsx` styling.
- Dev servers: backend `cd backend && npm run dev` (:3001, `DEV_AUTH_BYPASS=true` already set, restart to pick up code — no watch mode); web `cd web && npm run dev` (:3000, HMR). Verify every phase IN THE BROWSER per its Accept line before checking it off. Backend must be **rebuilt+restarted** after backend edits (`npm run dev` runs tsc then node).
- Definition of done for every phase = the 5-point checklist at the bottom of `v1-task.md`.

---

## V1.2 — Fix model recommendation + platform modes

Read: `v1-task.md` §V1.2; `web/src/components/RecommendationPanel.tsx`; `backend/src/types/Recommendation.ts` (MODALITIES = `text|code|image|video` — the frontend wrongly sends task-types like `text_to_image`, that's the bug); `backend/src/services/RecommendationService.ts`; `config/platform-registry.json` (one platform entry fully); `backend/src/types/Platform.ts`.

Steps: (1) Add `modes` arrays to every platform in `config/platform-registry.json` — curate from official docs; extend `platformSchema` with optional `modes` default `[]`; keep registry seed script compatible (check `scripts/seed-registry.ts` parses). (2) `recommendMode()` in RecommendationService — deterministic ranking of a platform's modes for `{task_type, idea}` via `best_for`/`avoid_for` keyword match; unit-test rankings. (3) Routes: public `GET /platforms/:id/modes`; authed `POST /recommend/mode` (zod schema in Http.ts). (4) Web: fix `RecommendationPanel` to send real modalities (picker of the 4, default derived from idea keywords: image/video/code/text); render context_window with `Intl.NumberFormat`. (5) New `ModeSuggestion` component on Build shown once platform+idea exist: calls `/recommend/mode`, renders top pick + reason + expandable all-modes table; chosen mode threads into the draft call as clarification `technical_parameters` hint. (6) Mirror types in api-types.ts, methods in api.ts, strings in strings.ts.

Verify: backend tests for recommendMode + routes; browser: Build → "Which model fits this task?" returns results (no 400); pick Gemini + reasoning idea → mode suggestion names a Gemini mode with reason.

## V1.5 — Token & context visibility

Read: `v1-task.md` §V1.5; `backend/src/types/Response.ts` (GovernorPresentation — already computed, never rendered); `backend/src/guardrails/TokenGovernor.ts` (`govern()`); the `/serialize` route in routes.ts; `web/src/components/{NodeEditor,NodeCard,StrengthPanel}.tsx`.

Steps: (1) `/serialize` response adds `governor` by running `govern()` on the assembled string + platform. (2) Web `TokenMeter` component (meter bar, %, absolute, amber ≥80%, red overflow, suggestions tooltip, "≈" flag for client estimates). (3) Client token estimate util `web/src/lib/tokens.ts` (`Math.ceil(chars/4)`). (4) Render TokenMeter: Build result (from `designedResponse.governor`), after node edits (from serialize response), Enhance result, chat cards (V1.4 later reuses). (5) Per-node token chip on NodeCard. (6) Platform select label gains context size from registry (`max_prompt_tokens`).

Verify: browser — draft → real meter; balloon a node value → meter amber/red + suggestions; platform dropdown shows context sizes.

## V1.6 — Visible doc-grounded rationale

Read: `v1-task.md` §V1.6; `backend/src/services/ResponseDesign.ts` (designWhyThisWorks — chunks carry sourceUrl already); `backend/src/types/Agent.ts` (KnowledgeChunk); how DraftingAgent labels chunks `[P<n>]`/`[M<n>]` (buildSystemPrompt).

Steps: (1) ResponseDesign: build `sources[]` (ref = P/M + index in the same order DraftingAgent numbered them — keep numbering logic in ONE shared helper so refs match), extend whyThisWorks to `{lesson, ref}`. (2) Mirror types web-side (keep backward compat for extension: add new fields, don't break old). (3) Web: sources rendered as link chips in "Why this prompt works"; `[P1]`-style tokens in node rationales become citation chips with popover (snippet + link); grounding summary line in result header. (4) Fixture-update `tests/services/ResponseDesign.test.ts`.

Verify: browser — draft for Midjourney; grounding line + working outbound source links + citation popovers.

## V1.3 — Public prompt library

Read: `v1-task.md` §V1.3; `web/src/app/library/page.tsx`; `web/src/data/library-seeds.json`; `GET /library` route (~line 1095 routes.ts); `web/src/components/LayoutClient.tsx` (nav auth-gating).

Steps: (1) Write 24+ high-quality seed entries (8 niches × 3) — full templates, not stubs; duplicate to `config/library-seeds.json` for the backend fallback. (2) Backend: `GET /library` catch-path serves config seeds with `source:'seed'`. (3) Web: de-auth the page; nav shows Library to signed-out users; niche pills + modality filter + search; detail drawer (Copy / Use this prompt → `/build?idea&platform` / Open in Enhance); merge DB entries (badge `community`) with seeds. (4) Strings for all labels.

Verify: browser signed-out — Library in nav, 24+ entries, niche filter, "Use this prompt" prefills Build.

## V1.8 — Platform guide pages

Read: `v1-task.md` §V1.8; platform-registry entry shape (incl. V1.2 modes); `backend/src/services/PKBService.ts` (how to fetch chunks by platform, degraded when DB/GEMINI absent); library seeds (V1.3).

Steps: (1) Backend `GET /platforms/:id/guide` (public, cache 1h): registry entry + top PKB lessons (degraded: []) + ≤4 starter library entries for the platform. (2) Web `/platforms` index + `/platforms/[id]` guide per the ledger's section list (hero / how prompting works / quirks / modes / lessons / starters / sticky CTA). Client-side fetch (static export — no dynamic SSG); `[id]` via query param or client router param handling consistent with existing dynamic pages (check how `/share/[slug]` does it). (3) Nav gains "Platforms".

Verify: browser — /platforms → Gemini guide: rules, quirks, modes, lessons w/ links, starters, CTA prefills Build.

## V1.1 — Custom platform via docs URL

Read: `v1-task.md` §V1.1 fully (SSRF list, caps); `backend/src/agents/PromptImportAgent.ts` (agent shape to copy); Supervisor's platform resolution (where `getPlatform(platform_id)` happens in routes + `PipelineContext.platform`); ChatRefineService (JSON contract pattern).

Steps: (1) `DocFetchService` with hard SSRF guards (unit-test every rejection class with mocked fetch/dns). (2) `PlatformProfileAgent` (routing step `platform_profile`, large). (3) `POST /platforms/custom` route + schema. (4) Thread `custom_platform` through draft/clarify/chat-refine/serialize bodies: zod caps, Supervisor uses provided platform + injects chunks as pkbChunks, DocRetrieval skipped (grep where pkbChunks is set). (5) Web: dropdown option + analyze panel + localStorage persistence (max 10) + custom badge + thread `custom_platform` in api.ts calls. (6) Tests per ledger.

Verify: browser — analyze a real docs URL, custom platform appears, draft with it succeeds, rationale cites fetched docs (sources panel from V1.6 shows the fetched URLs).

## V1.4 — Chat-first drafting + attachments

Read: `v1-task.md` §V1.4; `ChatRefineService.ts` + its tests (share helpers rather than duplicating); `CriticAgent` scoring entry point; ResponseDesign mapping; `web/src/components/ChatRefine.tsx`; Build page phase machine (`web/src/app/build/page.tsx`).

Steps: (1) Extract shared chat-JSON helpers from ChatRefineService into `backend/src/services/chatShared.ts`. (2) `ChatDraftService` (`chat_draft` routing step): messages+attachments+platform (+custom_platform) → question | scored draft (run Critic on the node set, shape DesignedResponse — reuse the design() path by constructing a minimal PipelineContext). (3) Route `POST /chat-draft`, schema w/ attachment caps. (4) Web: Build mode switch (Guided | Chat, persisted); chat view (reuse ChatRefine's bubble UI, extracted into a shared `ChatThread` component); paperclip attach (.txt/.md/.json/.csv/code direct read; PDF via lazy `pdfjs-dist`; reject others honestly); draft cards inline (assembled + TokenMeter + score + "Open in editor" → existing result phase); post-draft messages become refinements (send `current_nodes`). (5) Tests per ledger.

Verify: browser — full conversation with a .md attachment → question → scored draft card → open in editor → chat-refine still works.

## V1.7 — Orchestration review + graph refactor

Read: `v1-task.md` §V1.7; `backend/src/services/Supervisor.ts` FULLY; its tests; `docs/` naming conventions.

Steps: (1) Write `docs/orchestration-review.md` (honest: no LangGraph anywhere — verify with grep; gap table vs graph-orchestration criteria; adopt-vs-build decision w/ Lambda cold-start rationale; migration path to @langchain/langgraph if ever needed). (2) Build `PipelineGraph.ts` runtime (typed nodes/conditional edges/interrupt/retry/trace). (3) Refactor Supervisor to declare draft+enhance pipelines as graphs; ALL existing Supervisor tests pass unchanged. (4) PipelineGraph unit tests (topology/cycle-guard/interrupt-resume/retry).

Verify: full backend suite green; review doc committed; no behavior change (draft still works in browser).

## V1.9 — UI overhaul

Read: `v1-task.md` §V1.9; `web/src/app/globals.css`; every component you touch. Also read `web/node_modules/next/dist/docs/` guidance if routing/layout files are touched (repo rule).

Steps: (1) Tokens in globals.css (stone+emerald, radii, focus). (2) Build `ui/` primitives (Button/Card/Badge/Meter/Tabs/Drawer/EmptyState/Skeleton). (3) Refactor existing surfaces to primitives. (4) Landing redesign per ledger. (5) Nav/footer. (6) Skeletons + empty states. (7) Enforcement greps (`bg-gradient`, `purple|violet|fuchsia` = 0 in web/src).

Verify: browser pass over landing/build/result/library/guides/history; greps clean; `npm run build` green.

## V2.1 → V2.8 — flagship features

For each: read its v1-task.md section + the patterns list in the Global preamble; the service/agent pattern to copy is `ChatRefineService` (LLM JSON contract) or `RecommendationService` (deterministic). Every feature = backend service + zod schema + route + tests + web page/panel + strings + api mirror + browser verification per its Accept line. Sequence: V2.1 (debug), V2.7 (ambiguity — reuses span-render work), V2.4 (migrate — reuses diff view), V2.6 (simulate — needs `config/model-pricing.json`), V2.2 (reverse), V2.8 (lint + account rules UI), V2.3 (tests — migration 019, degraded local run), V2.5 (workflows — migration 020, degraded localStorage mode).

Feature-specific gotchas:
- **V2.1/V2.2:** reuse `PromptImportAgent` for parsing pasted prompts into nodes — don't write a second parser.
- **V2.7:** validate every span's `start/end` against the actual string server-side; drop invalid spans rather than 502.
- **V2.4:** ground in the TARGET platform's PKB chunks (DocRetrieval by target platform_id) + its syntax_rules; the diff view = two `<pre>` panes + per-node change table (no diff lib needed).
- **V2.6:** pricing is config data with a "relative estimates" disclaimer string; never present as billing truth.
- **V2.3/V2.5:** migrations are numbered idempotent SQL in `backend/migrations/`; local DB lacks them → degraded paths are mandatory and must be exercised in the browser.
- **V2.8:** deterministic rule checks are pure functions in `utils/` with exhaustive unit tests; only `tone` rules touch the LLM (small tier).
