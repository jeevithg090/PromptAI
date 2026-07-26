# finalplan.md — PromptForge: Pair Frontend + Backend, Fix Agents, Gemini Grounding, Extension Everywhere

> Written 2026-07-19. Every claim in the "Current state" section was **verified live** in this session
> (server started, real /draft executed, Gemini API key tested, test suite run). Nothing here is assumed.

---

## ✅ IMPLEMENTATION STATUS (updated 2026-07-19, executing the plan)

All phases C1–C10 implemented. Backend **462/462 tests green**; extension + web typecheck + build clean.

| Step | What shipped | Verified |
|---|---|---|
| C1 | Gemini key stored in `backend/.env` (both provided keys tested — plain gen + url_context work, google_search 429 on free tier) | live curl |
| C2 | Fixed `gemini-omni-flash` modality; dev user now a real UUID (`DEV_USER_ID`) | 462/462 tests |
| C3 | Extension transport: dropped `/api`, added `shared/platformMap.ts` (short→registry ids), origin+token from storage | build + live 200 |
| C4 | `GeminiNativeAdapter` + `geminiNative.ts` (JSON, thinkingBudget, 429 backoff); routing switched drafting/critic/refine/import/platform_profile → gemini | live draft, 5 adapter tests |
| C5 | Rewrote `PromptSerializer` conversational mode (sentences + Requirements bullets + Output format, no comma-fusion); confirmed strength scoring already worked | live draft strength 85–100, clean prose |
| C6 | **`GroundingService`** — real doc grounding via Gemini `url_context` + SSRF-guarded HTML fallback; replaced the fake-0.5 stub in `DocRetrievalAgent`; `seed-pkb-grounding.ts` (npm run seed:grounding) | live: extracted 5 real rules from OpenAI docs w/ quotes+URLs |
| C7 | Manifest `commands` (Alt+P / Alt+Shift+P), overlay opens on empty input, two-way loop in overlay (chat-refine + per-node redraft + feedback) | endpoints live-tested |
| C8 | Options page (`options.html/js`) for backend URL + token, Bearer auth in background, backend host_permissions, 401 sign-in message | build ships options |
| C9 | Added 4 platforms (mistral_le_chat, huggingface_chat, xai_grok, deepseek_chat); manifest+detector aligned to all 10 sites; **added the 4 to the free-tier CORE_PLATFORMS** (see note) | live draft on grok + deepseek |
| C10 | `chrome-extension://` CORS, `web/.env.production`, pages domain in ALLOWED_ORIGINS, **`smoke.ts` live suite** (npm run smoke) | see below |

**⚠️ Product decision to confirm (C9):** I moved mistral/huggingface/grok/deepseek into the FREE tier
(`CORE_PLATFORMS` in `PlanService.ts`) so all ten extension-target sites can draft. The pro tier still
gates perplexity + the coding assistants (cursor/copilot/claude_code) and pro features (A/B compare, BYOK,
projects, visual preview). If you want those 4 to be paid-only, remove them from `CORE_PLATFORMS`.

**Measured Gemini vs Groq (this session):** Gemini flash produces *far* higher-quality drafts (proper
personas, structured requirements, strength 85–100) but is slow on free tier — **~25–50s per drafting
call** vs Groq ~0.3s. Small pipeline steps stay on Groq. Grounding via url_context is ~90s per platform
(a one-time seed cost, then cached as fast pgvector hits). Reverting to all-Groq is a one-edit change in
`config/model-routing.json` (documented in its `_note`).

**Not done (deliberately, needs your input):** rotating the Gemini key (you must do this — it was pasted
in chat), running the grounding seed job against the real DB (`npm run seed:grounding` — needs DATABASE_URL
+ respects Gemini RPM), and the browser-based per-site E2E checklist §6.3 (needs a real browser + the
extension loaded; the transport/id/auth wiring it depends on is all verified).

---

## 0. What we are actually building (the theme, restated)

**Problem:** People type one-shot, underspecified prompts into ChatGPT/Claude/Gemini/Midjourney and get
mediocre output. Today PromptForge is *one-way*: idea in → prompt out. The prompt is only as good as the
docs knowledge behind it and the conversation around it.

**The product we want:**
1. **Grounded** — every drafted prompt is backed by the *target platform's real documentation*
   (Midjourney parameter syntax, Claude XML-tag conventions, ChatGPT system-prompt norms), fetched and
   cited, not hallucinated.
2. **Two-way** — the user can push back: answer clarifying questions, chat-refine any node, regenerate a
   single node, A/B compare, and give worked/didn't-work feedback that tunes future drafts. (The backend
   already has all these endpoints — the extension uses almost none of them. That's the gap.)
3. **Everywhere** — a hotkey (and right-click) on the 10 supported AI websites opens the overlay, drafts
   against that site's docs, and inserts the result into the site's input box.

---

## 1. Current state — verified findings (2026-07-19)

### Working ✅
| Area | Evidence |
|---|---|
| Backend typecheck | `tsc --noEmit` clean (backend, web, extension all pass) |
| Backend tests | **450/451 pass** (57 suites). 1 failure, root-caused below |
| Full draft pipeline | Live `POST /draft` (platform `openai_chatgpt`) → HTTP 200 in 12.6s; agents ran real Groq calls + Gemini embeddings; states: context → intent → docs → draft → critic → alternatives → governed |
| Web ↔ backend contract | `web/src/lib/api.ts` paths match `backend/src/handlers/routes.ts` exactly (root-mounted: `/draft`, `/enhance`, …); `NEXT_PUBLIC_API_URL=http://localhost:3001` |
| Gemini key | Valid. `gemini-flash-latest` resolves to **gemini-3.5-flash**. Plain generateContent ✅, OpenAI-compat endpoint ✅, `url_context` tool ✅ |

### Broken ❌ (each verified, with the exact failure)
1. **Extension → backend path prefix.** `extension/src/background/index.ts:64` calls
   `http://localhost:3001/api${path}` but the backend mounts routes at root. **Every extension API call
   404s.** Same bug in `firefox-extension/src/background/index.ts`.
2. **Extension platform ids.** Extension sends `chatgpt`, `claude`, `gemini`… Registry ids are
   `openai_chatgpt`, `anthropic_claude`, `google_gemini`, `stability_stable_diffusion`, `perplexity`,
   `midjourney`. Verified live: `POST /draft {"platform_id":"chatgpt"}` → `404 unknown platform`.
   Also: extension offers `groq`, `mistral`, `huggingface` which don't exist in the registry at all.
3. **Extension has no auth.** `/draft`, `/enhance`, `/transcribe` are behind `authMiddleware`. Works
   locally only because `DEV_AUTH_BYPASS=true`. Against the deployed API every call would 401.
4. **Draft quality is poor (the "not up to the mark" problem).** Verified output for
   "eco-friendly water bottles": assembled prompt = `"eco-friendly water bottles, outdoor activities and
   daily use, informative and encouraging. focus on…"` — lowercase comma-joined fragments.
   Two causes: (a) Llama-3.3-70b returns terse fragment node values; (b) `PromptSerializer`'s
   conversational mode joins node values with commas instead of composing fluent prose.
   Also `strength_score` came back `null`.
5. **Discovery/live-fetch is a stub.** `DocRetrievalAgent.tryLiveFetch()` (lines 101–108) assigns every
   fresh chunk a **hardcoded similarity of 0.5** and returns "the first 3 chunks as-is" — no ranking.
   With an empty PKB the drafts are effectively ungrounded.
6. **Failing test.** `RecommendationService.test.ts:32` — `gemini-omni-flash` in
   `config/model-capabilities.json` has `context_window: 0` **and** `text` modality; the filter at
   `RecommendationService.ts:82` skips context checks when `context_window === 0` (meant for image
   models), so it leaks into a min-500k-context text query.
7. **DB tables missing/dev-user mismatch.** Server logs: `relation "rate_limits" does not exist`,
   `invalid input syntax for type uuid: "dev-user-000"` → rate-limit, plan, and budget checks silently
   fall back. Fine for dev, but must be verified against the real DB before launch.
8. **Hotkey UX.** `Alt+/` only opens the overlay **if the page's input already has text**
   (`triggerOverlay()` returns early on empty `sourceText`). No `commands` entry in the manifest, so users
   can't rebind it and it can't be triggered while focus is inside an input on some sites.
9. **Manifest gaps.** `content_scripts.matches` (7 sites) ≠ `host_permissions` (9 sites) — midjourney,
   stability, huggingface get no content script, so the overlay never appears there.
10. **Grounding tool on the Gemini key.** `google_search` grounding returns **429 RESOURCE_EXHAUSTED**
    consistently while plain calls succeed → the free tier of this key has no (or exhausted) Search-grounding
    quota. `url_context` (fetch a specific URL into context) **works** and fits our docs use-case better.

### ⚠️ Security note (do this first)
The Gemini API key was pasted in plain text into chat. Treat it as semi-exposed:
- Put it in `backend/.env` as `GEMINI_API_KEY=…` (the variable already exists — replace the old value).
- **Never** commit it; `.env` is already gitignored — keep it that way.
- Ideally rotate the key in AI Studio after testing and paste the new one only into `.env`.

---

## 2. Gemini vs Cerebras — measured comparison

| | **Cerebras** (gpt-oss-120b) | **Gemini** (gemini-3.5-flash via `gemini-flash-latest`) |
|---|---|---|
| Round-trip (1-sentence task) | **0.51s** | 1.19s (thinking disabled), slower with thinking on |
| Context window | 8,192 tokens (free tier) — too small for PKB-grounded drafting | 1M tokens |
| Output quality | Good, terse | Richer; produced template-style prompt with placeholders unprompted |
| JSON mode | OpenAI-compat `response_format` | Native `responseMimeType: application/json` + `responseSchema` (stricter) |
| **Doc grounding** | None | `url_context` ✅ works on this key; `google_search` ❌ 429 (needs billing/quota) |
| Thinking control | n/a (reasoning baked in, hardware hides cost) | `thinkingConfig.thinkingBudget: 0..N` — tunable per step |
| Endpoint reuse | Existing `CerebrasAdapter` | Existing `GoogleChatAdapter` works (OpenAI-compat verified) but native endpoint needed for tools/grounding |

**Verdict:** keep Cerebras for latency-critical *small* steps if desired, but **Gemini is the right
drafting/critic/grounding engine for this test phase**: 1M context lets us stuff full doc chunks, native
JSON schema kills our malformed-output retries, and `url_context` gives real grounding today without
billing. Groq stays as fallback. Routing is config-only (`config/model-routing.json`) — no code changes
to switch back.

---

## 3. Phase A — Backend fixes (make it *proper*)

### A1. Gemini as the agent engine (testing config)
1. **New `GeminiNativeAdapter`** (`backend/src/services/providers/GeminiNativeAdapter.ts`), registered as
   provider `gemini`. Uses the **native** `generateContent` endpoint (not OpenAI-compat) so we get:
   - `responseSchema` for strict JSON node output (DraftingAgent, CriticAgent, IntentClassificationAgent),
   - `thinkingConfig: { thinkingBudget: 0 }` for small/fast steps, budget > 0 for drafting/critic,
   - `tools: [{url_context: {}}]` when the request carries grounding URLs,
   - server key from `config.GEMINI_API_KEY` with per-request BYOK override preserved.
2. **Routing switch** — update `config/model-routing.json`: point `drafting`, `critic`, `chat_refine`,
   `chat_draft`, `prompt_import`, `platform_profile` at `{"provider":"gemini","model_id":"gemini-flash-latest"}`.
   Keep `intent_classification`/`clarifying_questions`/small steps on Groq (fast, cheap) — or Cerebras.
   Document in the `_note` that this is the Gemini test config and how to revert.
3. **Rate-limit hygiene**: free-tier Gemini is RPM-limited (we hit 429s in testing when calling
   back-to-back). Add simple retry-with-backoff (1 retry, honor `Retry-After`) in the adapter, and keep
   the drafting pipeline to ≤2 Gemini calls per session by default.

### A2. Real grounding (replaces the discovery stub) — **the core feature fix**
Design principle (your requirement): **never** "ask Gemini to write the prompt directly." Gemini is used
in two *separate, bounded* roles: (1) a **grounding fetcher** that turns docs into knowledge chunks, and
(2) the **model inside our existing agents**, which receive those chunks exactly the way they receive
PKB chunks today. The Supervisor pipeline, safety gates, critic loop, and node schema stay untouched.

New `GroundingService` (`backend/src/services/GroundingService.ts`):
1. **Input:** platform (registry entry incl. `docs_url`), task type, retrieval query (same one
   DocRetrievalAgent already builds).
2. **Step 1 — url_context extraction:** call Gemini with `tools:[{url_context:{}}]` on the platform's
   `docs_url` (+ up to 2 registry-listed extra doc URLs): *"Extract the prompt-writing rules, syntax,
   parameters, and examples relevant to: <query>. Return JSON: [{rule, quote, source_url}]"*.
   Note: some sites (verified: docs.midjourney.com) block bot retrieval → status
   `URL_RETRIEVAL_STATUS_ERROR`; on that, fall back to our own `DocFetchService.fetchDoc()` HTML and pass
   the extracted text inline to Gemini for the same structured extraction.
3. **Step 2 — search articles (when quota allows):** if `google_search` grounding stops 429ing (billing
   enabled), add a second pass: *"find current articles/docs about prompting <platform> for <task>"* and
   harvest `groundingChunks` URIs + snippets. Feature-flagged (`GROUNDING_SEARCH_ENABLED`, default false)
   so the pipeline never depends on quota we don't have.
4. **Output:** `KnowledgeChunk[]` with real `source_url`, `trust_score` (0.9 official docs / 0.6 fetched
   article), and content = the extracted rule+quote. Upserted into the PKB (existing `ingestChunks`) so
   the *second* request for the same platform is a fast pgvector hit — Gemini fetching is the cache-miss
   path, embeddings remain the cache-hit path.
5. **Wire-in:** `DocRetrievalAgent.tryLiveFetch()` delegates to GroundingService (delete the fake-0.5
   ranking block). Degradation contract unchanged: any failure → `partial` with fewer/zero chunks.
6. **Seed job:** one-off script `backend/src/scripts/seed-pkb-grounding.ts` that runs GroundingService
   for all 10 platforms × core task types so the PKB isn't cold on day one. Run it manually (respects RPM).

### A3. Draft quality (fix the fragment-salad output)
1. **Serializer:** rewrite the conversational assembler in `PromptSerializer.ts` — persona → instruction
   paragraph(s) → constraints as bullets → output-format section, proper sentence case; keep the
   comma-tag mode only for image platforms (Midjourney/Stability, where tags are correct).
2. **Drafting prompt:** add to `draftShared.ts` few-shot an explicit rule: node `value`s must be
   *complete instructions in the platform's dialect*, not noun fragments (with one good/bad example pair).
   Gemini's `responseSchema` enforces the shape; the few-shot enforces the register.
3. **strength_score:** trace why the critic's rubric score didn't reach the response (`ResponseDesign.ts`
   mapping) and fix so every `ok` draft returns a populated `strength_score` + rubric breakdown.
4. **Acceptance bar (deep-test §6):** assembled prompt starts with a capital letter, ≥ 3 sentences for
   text platforms, contains zero raw node-join commas, cites ≥1 `[P<n>]` rationale when chunks existed.

### A4. Small fixes
- `config/model-capabilities.json`: `gemini-omni-flash` — remove the bogus `text` modality (it's the
  video/image model) or give it its real context window → un-breaks the 451st test.
- Migrations: verify `rate_limits` exists in the real Supabase DB (warning came from the local run);
  add migration if genuinely missing.
- `DEV_AUTH_BYPASS` dev user: use a fixed UUID (e.g. `00000000-0000-4000-8000-000000000001`) so
  plan/budget lookups exercise real code paths in dev instead of `check_skipped`.

---

## 4. Phase B — Pair the extension with the backend (the real product surface)

### B1. Transport fixes (blockers, ~1 hour)
1. Drop the `/api` prefix in both `extension/src/background/index.ts` and
   `firefox-extension/src/background/index.ts`.
2. Platform id mapping: single source of truth `extension/src/shared/platformMap.ts` —
   `{chatgpt: 'openai_chatgpt', claude: 'anthropic_claude', gemini: 'google_gemini', perplexity: 'perplexity', midjourney: 'midjourney', stability: 'stability_stable_diffusion', …}`.
   Detector keeps short ids internally; every API call translates. Remove `groq`/`mistral`/`huggingface`
   from the picker until they exist in the registry (or add them to the registry — see B4).
3. `API_ORIGIN` from `chrome.storage.sync` with a default (localhost in dev build, deployed URL in prod
   build) — set via a small options page. No hardcoded origin.

### B2. Auth in the extension
- Options page: "Sign in to PromptForge" → opens the web app's auth; the web app exposes a
  `/account` "connect extension" action that hands the Supabase session token to the extension via
  `chrome.runtime.sendMessage` (externally_connectable) — or simplest v1: paste-token field in options.
- Background worker stores the token (`chrome.storage.local`), attaches `Authorization: Bearer` to every
  request, and on 401 marks the badge + overlay shows "Sign in to use PromptForge".
- Anonymous fallback: `/demo/draft` (already exists, 5/day) so a signed-out user still gets a taste.

### B3. Hotkeys + two-way UX in the overlay
1. **Manifest `commands`:** `toggle-overlay` = `Alt+P` (rebindable in chrome://extensions/shortcuts),
   `enhance-selection` = `Alt+Shift+P`. Background routes commands → content script. Keep the in-page
   `Alt+/` listener as fallback.
2. Overlay opens **even with an empty input** (remove the `sourceText.trim()` guard) — empty = draft-from-idea mode.
3. **Two-way loop in the overlay** (backend endpoints already exist, currently web-only):
   - Clarifying questions step (already wired) — keep.
   - **Refine chat**: after a result, a message box that calls `/chat-refine` with the current nodes —
     "make it more formal", "add word limit" — and re-renders nodes + assembled.
   - **Per-node regenerate** via `/redraft-node` (tap a node → "redo this part" + optional instruction).
   - **Feedback**: 👍 worked / 👎 didn't after insert → `/feedback` (feeds ContinuousImprovement).
   - Session id is kept across these calls so `/draft/:id/status` progress and traces work.
4. Insert respects each platform's real input selector (`insertText.ts` TODO: pass platform selectors —
   finish it using the detector's per-site selector table).

### B4. Exactly ten websites, each verified against its docs
Target list (= extension `content_scripts` = `host_permissions` = registry coverage):

| # | Site | Registry id | Status |
|---|---|---|---|
| 1 | chatgpt.com | `openai_chatgpt` | exists |
| 2 | claude.ai | `anthropic_claude` | exists |
| 3 | gemini.google.com | `google_gemini` | exists |
| 4 | perplexity.ai | `perplexity` | exists |
| 5 | midjourney.com | `midjourney` | exists — **add content script** |
| 6 | stability.ai / dreamstudio | `stability_stable_diffusion` | exists — **add content script** |
| 7 | chat.mistral.ai | `mistral_le_chat` | **add to registry** (docs.mistral.ai) |
| 8 | huggingface.co/chat | `huggingface_chat` | **add to registry** |
| 9 | grok.com | `xai_grok` | **add to registry** (docs.x.ai) |
| 10 | chat.deepseek.com | `deepseek_chat` | **add to registry** |

For each new registry entry: `platform_registry.json` gets `docs_url`, `syntax_rules`, `quirks`,
`max_prompt_tokens`; then the PKB seed job (A2.6) grounds it from its docs. For each of the 10, the
detector gets a tested input selector + insert path. "Fully functional on a site" is *defined* as passing
the E2E checklist in §6.3 on that site.

### B5. Web app pairing polish
- `web/.env.production`: point `NEXT_PUBLIC_API_URL` at the deployed API for the Cloudflare Pages build.
- Surface the same two-way loop the extension gets (chat-refine already exists in `/build`) on `/try`.
- Verify `ALLOWED_ORIGINS` includes the Pages domain + `chrome-extension://` origins for CORS.

---

## 5. Phase C — order of execution

| Step | What | Gate to next step |
|---|---|---|
| C1 | Security: rotate/store Gemini key in `.env` | key never in git/chat again |
| C2 | A4 small fixes | **451/451 tests green** |
| C3 | B1 transport fixes | extension overlay completes a draft locally end-to-end |
| C4 | A1 GeminiNativeAdapter + routing switch | `/draft` green on Gemini; latency + quality logged vs Groq baseline |
| C5 | A3 serializer + strength score | quality bar (§A3.4) passes on 5 sample ideas |
| C6 | A2 GroundingService + seed job | drafts cite real doc chunks for all 10 platforms |
| C7 | B3 hotkeys + two-way overlay | refine/redraft/feedback all round-trip from the overlay |
| C8 | B2 extension auth | works against deployed API without DEV_AUTH_BYPASS |
| C9 | B4 ten-site rollout | E2E checklist §6.3 passes on all 10 |
| C10 | B5 web polish + deploy | production smoke suite green |

---

## 6. Testing plan (unit → integration → deep/E2E)

### 6.1 Unit + integration (Jest, extend the existing 57 suites)
- **GeminiNativeAdapter**: JSON-schema response parsing; thinking-budget passthrough; 429 retry/backoff;
  BYOK override; mock-fetch based (no live calls in CI).
- **GroundingService**: url_context happy path (mocked response with urlMetadata OK); blocked-URL
  fallback to DocFetchService; malformed extraction JSON → `partial`; upsert called with real source_url
  and trust scores; **never throws** into the pipeline.
- **DocRetrievalAgent**: cache-hit path untouched; cache-miss delegates to GroundingService; similarity
  threshold behavior; custom-platform passthrough.
- **PromptSerializer**: per-platform snapshots — conversational output has sentence case + sections;
  Midjourney keeps tag style + `--parameters` last; no comma-join in text platforms.
- **Extension platformMap**: every detector id maps to a registry id; exhaustiveness test against
  `/platforms` fixture.
- **Routes**: `/draft` response always includes `strength_score` when status ok.

### 6.2 Live smoke suite (scripted, run manually — hits real providers)
`backend/src/scripts/smoke.ts`, one command, prints a pass/fail table:
1. `/health`, `/platforms`, `/features`
2. `/draft` just_generate on `openai_chatgpt` — assert ok + quality bar §A3.4
3. `/draft` with clarify round-trip (answer 2 questions → clarify endpoint → ok)
4. `/enhance` on a weak prompt — assert strength before < after
5. `/chat-refine` "make it formal" — assert nodes changed
6. `/redraft-node` on style node
7. Grounding: `/draft` for `midjourney` — assert ≥1 chunk with `docs.midjourney.com` source in trace
8. Provider matrix: same idea on gemini vs groq vs cerebras routing — record latency + token use
   (this is the ongoing Cerebras/Gemini comparison, automated)

### 6.3 Deep E2E per website (the ten-site checklist — repeat on each site)
1. Load site → hotkey `Alt+P` opens overlay with empty input ✅
2. Type idea → Draft → clarifying questions render → answer → result in < 20s ✅
3. Result cites the site's docs (source chip visible) ✅
4. Refine chat: one instruction changes the draft ✅
5. Per-node redraft works ✅
6. Insert puts the text into the site's real input box (ProseMirror/textarea/contenteditable) ✅
7. Right-click selection → Enhance flow ✅
8. Signed-out → demo path or clear sign-in message (no silent failure) ✅
9. Backend down → overlay shows readable error, site unaffected ✅
10. No CSP/console errors injected into the host page ✅

### 6.4 Failure-mode tests (backend)
- Gemini 429/timeout mid-draft → Groq fallback route or graceful `degraded` draft (never a hang).
- Docs URL blocks bots → DocFetch fallback → still grounded or cleanly ungrounded.
- Empty PKB + LIVE_FETCH_ENABLED=false → draft proceeds ungrounded with `partial` retrieval status.
- Safety gates: pre-flight block and post-draft block both return `blocked` with reason.
- Session token cap → `budget_exceeded` shape the extension renders.

---

## 7. Open items needing your action
1. **Rotate the Gemini key** (it was pasted in chat) and put the new one in `backend/.env`.
2. `google_search` grounding needs billing enabled on the Google AI Studio account if you want live
   article search (Phase A2.3). `url_context` works today without it — the plan doesn't block on this.
3. Confirm the ten-site list in §B4 (esp. #7–10 — swap any of these for sites you prefer).
4. Decide extension auth style for v1: paste-token in options (fast) vs. web-app handshake (nicer).
