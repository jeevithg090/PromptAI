<div align="center">

# PromptForge

**Reverse-prompting for people who are tired of guessing.**

You type a rough idea. It interviews you, drafts a platform-tailored prompt,
scores it against an auditable 8-dimension rubric, and shows its work.

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](#surfaces)
[![Next.js](https://img.shields.io/badge/Next.js-static%20export-000000?style=flat-square&logo=nextdotjs&logoColor=white)](#surfaces)
[![Hono](https://img.shields.io/badge/Hono-Lambdalith-e36002?style=flat-square&logo=hono&logoColor=white)](#architecture)
[![Postgres](https://img.shields.io/badge/Postgres-pgvector-4169e1?style=flat-square&logo=postgresql&logoColor=white)](#data-model)
[![Swift](https://img.shields.io/badge/Swift-SwiftUI-f05138?style=flat-square&logo=swift&logoColor=white)](#surfaces)
[![Electron](https://img.shields.io/badge/Electron-desktop-47848f?style=flat-square&logo=electron&logoColor=white)](#surfaces)

</div>

---

## The problem

Everyone writing prompts is doing the same thing: typing something vague, getting
something mediocre, then poking at it until it works. There's no feedback signal,
no explanation, and no transfer of skill — you learn nothing that survives to the
next prompt.

The advice available is worse than useless. "Prompt engineering guides" are folklore
lists scraped from Twitter, most of them wrong for the model you're actually using.
Midjourney rewards dense visual descriptors; Claude rewards structure and explicit
constraints; a diffusion model with no negative-prompt support silently ignores your
`--no watermark`. Generic advice cannot know this.

## The approach

PromptForge treats a prompt as a **structured object**, not a blob of text.

```
rough idea  →  intent classified  →  docs retrieved  →  clarified  →  drafted
                                                                        ↓
                     you  ←  scored + explained  ←  ranked  ←  critiqued
```

Every prompt decomposes into **11 typed nodes** — `subject`, `action_behavior`,
`setting_context`, `style_aesthetic`, `composition_camera`, `lighting_mood`,
`persona_role`, `constraints_rules`, `technical_parameters`, `negative_prompt`,
`output_format`. Nodes are individually editable, lockable, redraftable, and
re-serializable per target platform. The same node set fans out to Midjourney
syntax and Claude syntax without being rewritten.

### Anatomy of a node

A node is not a string. It carries its own provenance, alternatives, and edit state:

```ts
{
  type:         'style_aesthetic',   // one of the 11 typed slots
  value:        'photorealistic, cinematic wide shot',
  rationale:    'Midjourney PKB: dense descriptor phrases outperform sentences',
  alternatives: [                    // up to 4, each ranked with a reason
    { value: 'watercolor illustration', rationale: '…', rank: 1 },
  ],
  locked:       false,               // refinement must not touch this node
  position:     3,                   // serialization order
  defaulted:    true,                // filled by "just generate now", never confirmed
}
```

Two of these fields carry most of the design weight. `locked` is what makes
refinement safe — the Critic can only rewrite what you haven't pinned. `defaulted`
is what makes it honest: when you skip clarification, the UI visibly marks every
node the system guessed rather than quietly presenting assumptions as your intent.

Every draft is scored by a **Critic Agent** against a versioned rubric. Any
dimension scoring 1/3 triggers a bounded refinement pass that fixes *only* the
flagged nodes — locked-node discipline, hard cap of 2 passes, no infinite loops,
no silent rewrites of things that already worked.

### Serialization is per-platform

Nodes are stored once and rendered per target. The same set becomes:

```
Midjourney   chestnut horse mid-gallop, dust trailing, open prairie,
             golden hour, photorealistic --ar 16:9 --style raw
             └─ descriptors comma-separated, weight front-loaded, flags last

Claude       <role>You are a photography director.</role>
             <task>Describe a chestnut horse mid-gallop…</task>
             <constraints>Under 100 words. No jargon.</constraints>
             └─ structural tags, explicit constraint block
```

That difference is not hardcoded. It comes from the platform registry entry's
`syntax_rules`, `quirks`, and `max_prompt_tokens` — so adding a platform is a
JSON edit, not a code change.

---

## The scoring rubric

Eight dimensions, each scored 1–3, weighted to a 0–100 **Prompt Strength Score**.
This is a real document ([`docs/quality-rubric.md`](docs/quality-rubric.md)), versioned
like code, and shared by the Critic Agent, the Alternatives Agent, and the user-facing
score — so "excellent" means exactly one thing everywhere.

| # | Dimension | Weight | Fails when |
|---|---|:---:|---|
| 1 | **Specificity** | 20 | Vague adjectives doing a description's job — "a nice image of a horse" |
| 2 | **Unambiguity** | 15 | Two reasonable readers picture different things — "draw a bat by the window" |
| 3 | **Non-conflict** | 15 | Nodes contradict — "ultra-minimalist" + "cluttered workshop overflowing with tools" |
| 4 | **Platform-fit** | 15 | Syntax the target platform doesn't support, or ignoring its documented strengths |
| 5 | **Constraint completeness** | 15 | The user said "under 100 words, no jargon" and neither survived into the draft |
| 6 | **Format determinacy** | 8 | Extraction task shipped with no output schema |
| 7 | **Context efficiency** | 6 | Filler, repetition, or blowing past the platform's practical token ceiling |
| 8 | **Technique fit** | 6 | Zero examples on a task the model KB says measurably benefits from few-shot |

```
strength = Σ ( (score_d − 1) / 2 × weight_d )

0–39 Needs work  ·  40–69 Solid  ·  70–89 Strong  ·  90–100 Excellent
```

Sub-scores always ship alongside the total. The score is evidence, not a vibe —
and refinement triggers on *any* dimension hitting 1, never on the aggregate.

<details>
<summary><b>Worked example</b></summary>

**Before** — `"make a nice image of a dog"`
Specificity 1 · Unambiguity 2 · Non-conflict 3 · Platform-fit 1 · Constraints 3 ·
Format 3 · Efficiency 3 · Technique 1 → **52 "Solid"**, but two 1-scores force refinement.

**After** — `"golden retriever puppy mid-leap catching a red frisbee, backyard lawn,
late-afternoon sun, shallow depth of field, photorealistic, 16:9 --style raw"`
→ **100 "Excellent"**

</details>

---

## Architecture

A **Supervisor** owns a 13-state pipeline machine and decides which agent runs next.
It looks agents up from a registry and knows nothing about any agent's internals —
so adding a capability never means editing the orchestrator.

<div align="center">

```
                          ┌─────────────────┐
       rough idea ───────▶│   Supervisor    │◀──── safety gate 1 (pre-flight)
                          │  state machine  │◀──── safety gate 2 (post-draft)
                          └────────┬────────┘
                                   │ registry lookup
        ┌──────────┬───────────┬───┴────┬──────────┬─────────────┐
        ▼          ▼           ▼        ▼          ▼             ▼
    Intent      DocRetrieval  Clarify  Drafting  Critic     Alternatives
   classify      (PKB/RAG)    (≤4 Qs)  (nodes)  (rubric)     (ranked)
```

</div>

**Pipeline states** — `created → context_resolved → intent_classified → docs_retrieved →
clarifying → awaiting_clarification → drafting → critiqued → alternatives_attached →
governed → ready_for_review`, plus terminal `blocked_by_safety` and `failed`.

**Enhance mode** skips intent and clarification: a `PromptImportAgent` parses a pasted
prompt straight into nodes at the `drafting` state — so safety gate 2 still fires. If the
refined version doesn't beat the original, you're told honestly that it was already strong.

### The 13 agents

| Agent | Job |
|---|---|
| `IntentClassificationAgent` | Task type + modality from a rough idea |
| `DocRetrievalAgent` | RAG over the Platform Knowledge Base (pgvector) |
| `ClarifyingQuestionAgent` | ≤4 MCQ/free-text questions, with a "just generate" escape hatch |
| `DraftingAgent` | Idea + answers + retrieved docs → typed node set |
| `CriticAgent` | Scores the 8 dimensions, emits actionable per-node issues |
| `AlternativesAgent` | 2–4 ranked alternatives per node, each with rationale |
| `PromptImportAgent` | Parses a finished pasted prompt back into nodes |
| `MemoryExtractionAgent` | Proposes durable preferences from session behavior |
| `ModelRecommenderAgent` | Ranks models against modality/latency/cost/quality constraints |
| `ModelRefreshAgent` | Refreshes the capability matrix from provider docs |
| `OpenRouterModelFetcher` | Live pricing + capabilities across 345 models |
| `PlatformProfileAgent` | Reads a docs URL and profiles an unknown platform |
| `CurationAgent` | Mines opted-in sessions for high-value library patterns |

### Per-step model routing

No single model runs the whole pipeline. Each step declares a complexity class and
routes to a model chosen for that job — cheap and fast where the work is mechanical,
large-context where it isn't. The entire table lives in
[`config/model-routing.json`](config/model-routing.json):

| Pipeline step | Class | Routed to | Why |
|---|---|---|---|
| `intent_classification` | small | Groq · `openai/gpt-oss-20b` | Sub-second, trivially structured output |
| `clarifying_questions` | small | Groq · `openai/gpt-oss-20b` | Short, templated generation |
| `drafting` | large | Gemini · `gemini-flash-latest` | 1M context, strict JSON, doc grounding |
| `critic` | large | Gemini · `gemini-flash-latest` | Must hold rubric + docs + draft at once |
| `prompt_import` | large | Gemini · `gemini-flash-latest` | Parsing arbitrary pasted prompts |
| `chat_draft` / `chat_refine` | large | Gemini · `gemini-flash-latest` | Multi-turn context retention |
| `platform_profile` | large | Gemini · `gemini-flash-latest` | Reads and profiles whole doc sites |
| `debug` / `reverse` / `migrate` / `ambiguity` | large | Cerebras · `gpt-oss-120b` | Analytical reasoning over one artifact |
| `alternatives` / `judge` / `lint_tone` | small | Groq · `openai/gpt-oss-20b` | High call volume, narrow scope |
| `memory_extraction` / `preview` | small | Groq · `openai/gpt-oss-20b` | Background, latency-sensitive |
| `transcription` | small | Groq · `whisper-large-v3-turbo` | Speech-to-text |
| `image_preview` | small | Gemini · `imagen-3.0-generate-001` | Visual preview generation |

Swapping providers is a config edit. Every route falls back to the file-level
`default`, so a partially-specified table is still valid.

### Strategy profiles

Task type determines *how* a prompt should be built, not just what goes in it.
Six versioned profiles in [`config/strategy-profiles.json`](config/strategy-profiles.json)
each define a drafting template, which nodes are required, and which elicitation
technique the model knowledge base says actually helps:

`text_to_image` · `text_to_video` · `chat_persona` · `reasoning_code` ·
`extraction_classification` · `long_form_writing`

This is why an extraction task without an output schema scores 1 on format
determinacy while an image prompt with no schema scores 3 — the profile decides
what "complete" means for that shape of work.

### Engineering rules

These are enforced, not aspirational:

- **One-way dependency flow** — `handlers → services → agents/guardrails → utils/types`. Never backwards.
- **Config over code** — no hardcoded thresholds, models, or platform data. Swap the LLM provider by editing [`config/model-routing.json`](config/model-routing.json), not source.
- **Privacy by construction** — prompt content is never logged. User content persists only in `*_ciphertext` columns. Decrypted text exists in memory, for the length of one request.
- **Safety fails closed** — if the content classifier is unavailable, the request is blocked, not allowed.
- **Everything is tested** — every service, agent, and route.
- **Migrations are numbered and idempotent** — 22 of them, forward-only.

---

## Supported platforms

Thirteen platforms in the registry, each with its own rules, quirks, modes, and token
ceilings — plus **custom platform support**: paste any documentation URL and the
`PlatformProfileAgent` reads it and generates a registry entry on the fly.

| Platform | Modality | Model family | Notable registry entries |
|---|---|---|---|
| Google Gemini | text, image | `gemini` | Multiple modes with per-mode `best_for` routing |
| ChatGPT | text, image | `gpt` | Mode selection across reasoning and vision variants |
| Claude | text | `claude` | Rewards structural tags and explicit constraint blocks |
| Claude Code | text, code | `claude` | CLI-oriented; file and tool context conventions |
| Midjourney | image | `diffusion_image` | `--ar/--v/--style/--no` flags; `niji` vs `v7` modes |
| Stable Diffusion | image | `diffusion_image` | True negative-prompt field; weight syntax |
| Cursor | code | `mixed` | Editor-context prompting |
| GitHub Copilot | code | `mixed` | Inline completion conventions |
| Perplexity | text, search | `mixed` | Retrieval-first phrasing |
| Mistral Le Chat | text | `mistral` | — |
| HuggingChat | text | `mixed` | — |
| Grok | text | `grok` | — |
| DeepSeek | text, code | `deepseek` | — |

### What a registry entry contains

The registry is the single source of platform truth — consumed by the drafting agent,
the serializer, the Critic's platform-fit dimension, *and* the browser extension's
detection logic. One entry, four consumers:

```jsonc
{
  "platform_id": "midjourney",
  "display_name": "Midjourney",
  "modalities": ["image"],
  "model_family": "diffusion_image",
  "max_prompt_tokens": 350,           // feeds the Token Governor's ceiling check

  "url_patterns": ["https://www.midjourney.com/*", …],   // extension: where to inject
  "dom_fingerprint_selectors": ["#imagine-bar", …],      // extension: confirm the page
  "input_selector_candidates": ["#imagine-bar input", …],// extension: where to insert

  "quirks": [                          // Critic scores platform-fit against these
    "Comma-separated dense descriptor phrases outperform full sentences",
    "Word order matters: earlier tokens carry more weight",
    "The --no parameter is the supported negative-prompt mechanism;
     in-text negation ('without X') is unreliable"
  ],
  "syntax_rules": [                    // serializer renders according to these
    "Structure: subject, scene, style, lighting, composition, then flags",
    "Parameters go last: e.g. `--ar 16:9 --style raw`"
  ],

  "modes": [                           // mode recommendation matches task → mode
    { "mode_id": "v7",   "best_for": ["photorealistic", "cinematic"], … },
    { "mode_id": "niji", "best_for": ["anime", "manga"],
      "avoid_for": ["photorealistic"], … }
  ],
  "docs_url": "https://docs.midjourney.com/hc/en-us"
}
```

Because the extension's selectors live here rather than in extension source, a
platform changing its DOM is a registry update — no extension rebuild or store
re-review.

---

## Surfaces

Seven shipping surfaces against one backend.

| Dir | What it is | Stack |
|---|---|---|
| [`backend/`](backend/) | The Lambdalith — all product logic, internally modular | TypeScript · Hono · AWS Lambda + API Gateway · Supabase Postgres/pgvector |
| [`web/`](web/) | 20-page app: build, enhance, library, tools, workflows, account | Next.js 16 static export · Cloudflare Pages |
| [`extension/`](extension/) | Chrome overlay — detect platform, draft in place, insert inline | MV3 · React · Vite |
| [`firefox-extension/`](firefox-extension/) | Firefox MV3 port | MV3 · React · Vite |
| [`desktop/`](desktop/) | Electron app — tray, floating widget, full pipeline | Electron · Vite · React |
| [`macos/`](macos/) | Native menu-bar app with global hotkeys | Swift · SwiftUI |
| [`macos-sdk/`](macos-sdk/) | Embeddable Swift client for third-party apps | Swift Package |
| [`admin/`](admin/) | Control plane — moderation, flags, traces, kill switch | TypeScript · Hono |
| [`config/`](config/) | Platform registry, model routing, strategy profiles, plans, PKB seed | JSON |
| [`docs/`](docs/) | Rubric, taxonomy, data model, security reviews, compliance, API contracts | Markdown |

The admin plane is a **separate deployable with no ability to decrypt user content** —
not by policy, by construction. It never holds the keys.

### Repository layout

```
backend/
  src/
    handlers/routes.ts      90 routes, one Hono router
    services/               40 services — orchestration + domain logic
      Supervisor.ts           the pipeline state machine
      PromptSerializer.ts     nodes → platform syntax
      ModelRouter.ts          per-step provider selection
      PKBService.ts           pgvector retrieval
      KeyCustody.ts           BYOK envelope encryption
      providers/              Groq, Gemini native, Cerebras, OpenRouter, Whisper
    agents/                 13 agents behind a registry
    guardrails/
      ContentSafetyClassifier.ts   pre-flight + post-generation gates
      HeuristicScorer.ts           cheap parallel safety signal
      TokenGovernor.ts             ceiling checks, near-limit warnings
    middleware/             auth (JWKS), rateLimit, logging, errorHandler
    utils/                  token estimation, style lint, template vars, db
    scripts/                migrate, seed, crawl, refresh, retention, smoke
  migrations/               22 numbered, idempotent, forward-only
  tests/                    mirrors src/ — services, agents, integration

web/          Next.js static export — 20 pages, ⌘K palette, i18n overlay
extension/    Chrome MV3 — content overlay, background proxy, context menus
firefox-extension/  Firefox MV3 port
desktop/      Electron — main / preload / renderer split, tray, floating widget
macos/        SwiftUI menu-bar app, global hotkeys, accessibility detection
macos-sdk/    Swift Package — embeddable client
admin/        Separate Hono deployable — moderation, flags, traces, kill switch
config/       11 JSON files — the config-over-code surface
docs/         Rubric, taxonomy, data model, security reviews, compliance
```

### Configuration surface

Behavior lives in JSON, not source. These files are the tuning surface:

| File | Controls |
|---|---|
| [`platform-registry.json`](config/platform-registry.json) | Platforms: quirks, syntax rules, modes, selectors, token ceilings |
| [`model-routing.json`](config/model-routing.json) | Which model serves which pipeline step |
| [`model-capabilities.json`](config/model-capabilities.json) | Capability matrix with `last_verified` freshness |
| [`model-pricing.json`](config/model-pricing.json) | Cost inputs for the simulator |
| [`openrouter-models.json`](config/openrouter-models.json) | Cached OpenRouter catalog |
| [`strategy-profiles.json`](config/strategy-profiles.json) | Per-task-type drafting templates and requirements |
| [`clarification-questions.json`](config/clarification-questions.json) | Question bank per task type |
| [`plans.json`](config/plans.json) | Plan entitlements and budgets |
| [`library-seeds.json`](config/library-seeds.json) | Curated starter templates |
| [`pkb-seed.json`](config/pkb-seed.json) | Initial knowledge base content |
| [`demo-examples.json`](config/demo-examples.json) | No-account demo examples |

---

## What it does

<details open>
<summary><b>Drafting & enhancement</b></summary>

Conversational or form-based drafting · file attachments (text, code, CSV, JSON, PDF) ·
voice dictation via Groq Whisper · natural-language refinement ("make it more dramatic") ·
paste-to-enhance with before/after per-dimension deltas · honest "already strong" detection ·
degraded mode that returns the best partial result rather than failing.

</details>

<details>
<summary><b>Analysis tools</b></summary>

**Prompt Debugger** — paste prompt + actual output + expected output, get a diagnosis and a patch.
**Reverse Prompt** — paste an output, infer the prompt that could produce it.
**Ambiguity Analysis** — highlights risky spans with fixes.
**Style Linter** — enforce banned/required terms, length, tone, required nodes.
**Migration** — port a prompt across platforms with a change report.
**Cost Simulator** — estimate spend across models before committing.
**Workflow Composer** — chain prompts so each step's output feeds the next as a variable.
**Regression Tests** — assertion-backed test cases that catch prompt rot.

</details>

<details>
<summary><b>Intelligence</b></summary>

Model recommendation across 345 OpenRouter models with live pricing, always shown as a
quality/cost/speed trade-off rather than a bare winner · Token Governor with platform-ceiling
checks and near-limit warnings · Token-Reduction Advisor (PDF→Markdown, prose→CSV, base64→refs) ·
live text preview of what you'll likely get · document-grounding citations showing which doc
passage informed each suggestion.

</details>

<details>
<summary><b>Memory, versioning & collaboration</b></summary>

Cross-session memory with global and project scopes, agent-proposed entries held pending your
confirmation · Projects with pinned context and default platforms · immutable version chains
with restore and node-level diff · revocable public share links that re-run the safety classifier
before publishing and expose zero owner identity · teams with member management.

</details>

<details>
<summary><b>Safety, privacy & compliance</b></summary>

**Three gates, all failing closed.** A pre-flight classifier runs before any tokens are
spent; post-generation validation runs on the draft before it reaches you; a third gate
runs again at library-publish and share-link time, because content that was fine
privately isn't automatically fine publicly. When the classifier is unavailable the
request is **blocked, not allowed** — the expensive default rather than the convenient
one. A `HeuristicScorer` runs in parallel as a cheap independent signal, and every
decision lands in an append-only `audit_log` that migration `004` revokes UPDATE and
DELETE on. Blocked prompts can be appealed via `POST /appeal`.

**Privacy by construction.** Prompt content is never logged — the pino logger emits
structured events with token counts, durations, and state transitions, never text.
User content persists only in `*_ciphertext` columns; decrypted plaintext exists in
process memory for the duration of one request. Audio uploaded for dictation is never
persisted and the transcript is never logged.
[`docs/data-classification.md`](docs/data-classification.md) marks every field
plaintext / encrypted / never-persisted, so the boundary is auditable rather than
implied.

**BYOK.** Bring your own OpenAI or Gemini key. Keys are stored as encrypted,
non-retrievable references through `KeyCustody` — there is no read path that returns a
key, only a use path. Connections are individually revocable with per-connection usage
metering.

**Transport & abuse controls.** Per-user, per-endpoint rate limiting backed by a
`rate_limits` table · 100 KB request body cap · CORS allowlisting · HSTS and security
headers on every response · pre-flight budget checks that refuse before spending.

**Compliance.** Documented retention schedules (sessions 90d, usage 24mo), incident
response plan, subprocessor register, acceptable-use policy, and data portability via
`GET /export` and `DELETE /me`.

</details>

<details>
<summary><b>Experience</b></summary>

⌘K command palette · 4-step guided tour · honest step-by-step pipeline progress (real states,
not a fake spinner) · teaching mode that explains *why* a structure works · visual indicators for
defaulted nodes · i18n with locale overlay merging · curated library of 20+ battle-tested templates
across 8 niches, remixable in the builder.

</details>

---

## Quickstart

```bash
# Backend — local server on :3001, auth bypassed for curl testing
cd backend && npm install && npm run dev

# Web — Next.js dev server on :3000
cd web && npm install && npm run dev

# Chrome extension — build, then load extension/dist unpacked
cd extension && npm install && npm run build

# Desktop — Electron shell
cd desktop && npm install && npm run dev

# macOS native app / SDK — Xcode 16+
cd macos && swift build
cd macos-sdk && swift build

# Admin control plane on :3002
cd admin && npm install && npm run dev
```

Copy `backend/.env.example` → `backend/.env` and fill it in. Production secrets live in
AWS SSM Parameter Store as SecureStrings — never in files. The default LLM provider is Groq
(no-card free tier); Cerebras, Gemini, and OpenCode Zen are drop-in alternatives via config.

### Environment

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Database and auth |
| `SUPABASE_JWKS_URL` *or* `SUPABASE_JWT_SECRET` | JWT verification — JWKS preferred |
| `GROQ_API_KEY` | Default provider; also Whisper transcription |
| `GEMINI_API_KEY` | Large-context steps, embeddings, image preview |
| `CEREBRAS_API_KEY` | Analysis steps — note the 8,192-token free-tier context cap |
| `CLOUDFLARE_*` | R2 for encrypted blobs, KV for registry edge cache |
| `CONTENT_SAFETY_ENABLED` | Safety classifier toggle — leave on |
| `CLARIFY_MAX_QUESTIONS`, `CRITIC_MAX_REFINEMENTS` | Pipeline bounds (default 4, 2) |
| `MAX_TOKENS_PER_SESSION`, `RATE_LIMIT_REQUESTS_PER_MINUTE` | Budget and throttle |
| `DEV_AUTH_BYPASS` | Local-only. Refuses to start when `NODE_ENV=production` |

`DEV_AUTH_BYPASS` is worth calling out: it lets you `curl` the API without Supabase
credentials during development, and the process hard-refuses to boot with it enabled in
production. Convenience that cannot leak into a deployment.

### Operational scripts

```bash
npm run migrate           # apply numbered SQL migrations
npm run seed:registry     # load the platform registry
npm run seed:pkb          # seed the Platform Knowledge Base
npm run crawl:pkb         # refresh PKB from live platform docs
npm run refresh:models    # refresh the model capability matrix
npm run retention         # run the data-retention sweep
npm run analyze:outcomes  # aggregate outcome signals into tuning recommendations
npm run smoke             # end-to-end smoke test
```

---

## Testing & CI

Every service, agent, and route has tests. Provider adapters are tested against
recorded fixtures rather than live APIs, so the suite runs offline and
deterministically.

```bash
cd backend && npm test          # jest
cd backend && npm run typecheck # tsc --noEmit, strict
```

Per-surface checks:

| Surface | Command |
|---|---|
| `backend`, `admin`, `extension`, `desktop` | `npm run typecheck && npm test` |
| `web` | `npx tsc --noEmit && npm run build` |
| `macos`, `macos-sdk` | `swift build` |

CI runs on every push and pull request:

```
install → typecheck → gitleaks secret scan → dependency audit → test
```

The secret scan is a gate, not a report — a leaked credential fails the build before
review. Workflows live in [`.github/workflows/`](.github/workflows/) and also cover
scheduled PKB crawls, production deploy, rollback, and desktop builds.

---

## Data model

29 tables across 22 forward-only numbered migrations. The shape encodes the privacy
rules — user content lives in `*_ciphertext` columns and nowhere else, so a table dump
yields metadata, not prompts.

| Group | Tables |
|---|---|
| **Identity & accounts** | `app_users`, `teams`, `team_members`, `projects` |
| **Prompt content** | `prompts`, `prompt_versions`, `prompt_tests`, `workflows`, `share_links` |
| **Sessions & pipeline** | `sessions`, `usage_events`, `rate_limits` |
| **Knowledge** | `platforms`, `knowledge_chunks` (pgvector), `strategy_profiles`, `model_capability_records` |
| **Library** | `library_entries`, `platform_requests` |
| **Personalization** | `memory_entries`, `user_keys`, `provider_connections` |
| **Safety & audit** | `safety_decisions`, `appeals`, `audit_log` (append-only) |
| **Analytics** | `outcome_signals`, `improvement_flags` |
| **Ops** | `feature_flags`, `billing_events`, `schema_migrations` |

`knowledge_chunks` is the pgvector-backed Platform Knowledge Base: versioned doc
passages per platform, retrieved by the `DocRetrievalAgent` and cited back to the user
as grounding for each suggestion. `audit_log` is append-only by constraint, not
convention — migration `004_audit_immutability.sql` revokes update and delete.

### Plans and limits

Defined in [`config/plans.json`](config/plans.json), enforced pre-flight rather than
mid-request, so you're never charged tokens for a request that was going to be refused:

| | Free | Pro |
|---|---|---|
| Monthly token budget | 50,000 | 2,000,000 |
| Platforms | core | all |
| Projects | 1 | unlimited |
| Memory entries | 10 | unlimited |
| BYOK | — | ✓ |
| Visual preview | — | ✓ |
| Library submits / day | 5 | 20 |

---

## API

90 routes on a single Hono router. Public routes need no auth; everything else takes a
Supabase JWT verified against JWKS.

<details open>
<summary><b>Drafting pipeline</b></summary>

```http
POST   /draft                        start a session from a rough idea
POST   /draft/:sessionId/clarify     answer clarification questions
POST   /draft/:sessionId/again       redraft with the same inputs
GET    /draft/:sessionId/status      poll pipeline state
POST   /enhance                      paste a finished prompt → parse, score, improve
POST   /chat-draft                   conversational drafting
POST   /chat-refine                  natural-language refinement of a draft
POST   /redraft-node                 regenerate one node in isolation
POST   /serialize                    render nodes to a target platform's syntax
POST   /fanout                       render the same nodes for many platforms
POST   /preview                      textual "what you'll likely get"
POST   /preview/visual               image preview (Pro, env-gated)
POST   /transcribe                   audio → text (Whisper)
```
</details>

<details>
<summary><b>Analysis tools</b></summary>

```http
POST   /debug                        prompt + actual + expected → diagnosis + patch
POST   /reverse                      example output → inferred prompt
POST   /analyze/ambiguity            risky spans + suggested fixes
POST   /lint                         style-guide enforcement
POST   /migrate                      port a prompt across platforms
POST   /simulate                     cost estimate across models
POST   /optimize                     token-reduction suggestions
POST   /compare                      A/B two prompts on your own key (Pro)
POST   /workflows/run                execute a chained multi-step workflow
POST   /prompt-tests/run             run assertion-backed regression tests
```
</details>

<details>
<summary><b>Prompts, versions & sharing</b></summary>

```http
GET    /prompts                      list saved prompts (metadata only)
POST   /prompts                      save a prompt
GET    /prompts/:id/versions         version chain
GET    /prompts/:id/versions/:v      one version
GET    /prompts/:id/diff             node-level diff between versions
POST   /prompts/:id/restore          restore (creates a new version, never rewrites)
POST   /prompts/:id/share            create a revocable public link (re-runs safety)
DELETE /prompts/:id/share            revoke
GET    /share/:slug                  public read-only view, zero owner identity
```
</details>

<details>
<summary><b>Recommendation & knowledge</b></summary>

```http
POST   /recommend                    rank models for a task
POST   /recommend/task               natural-language task → model + reasoning
POST   /recommend/mode               which platform mode fits this task
POST   /recommend/with-openrouter    rank against live OpenRouter pricing
GET    /capabilities                 capability matrix + last_verified freshness
GET    /platforms                    registry
GET    /platforms/:id/guide          per-platform guide
GET    /platforms/:id/modes          available modes
POST   /platforms/custom             profile an unknown platform from a docs URL
GET    /library                      curated templates
POST   /library/submit               submit a template for review
```
</details>

<details>
<summary><b>Account, personalization & ops</b></summary>

```http
POST   /me/bootstrap                 provision on first login
GET    /me/usage · /me/progress      usage and plan progress
GET    /export                       full data export
DELETE /me                           full account + data deletion
GET|POST|PATCH|DELETE /memory        cross-session preferences
GET|POST /projects · …/:id           project CRUD
PUT|GET /keys · POST|GET /connections BYOK key custody
GET|POST /teams · …/:id/members      team management
POST   /feedback                     rate a prompt's real-world outcome
GET    /analytics/outcomes           anonymized per-dimension outcome data
GET    /analytics/improvements       aggregate tuning recommendations
GET    /sessions/:sessionId/trace    full pipeline trace for debugging
POST   /appeal                       appeal a safety block
GET    /health · /features           liveness, feature flags
```
</details>

Status-code contracts — including the deliberate distinction between `429 budget_exceeded`
(you have the entitlement, you're out of tokens) and `403 plan_restricted` (your plan
never included this), are specified in [`docs/api-contracts.md`](docs/api-contracts.md).

---

## Documentation

| Doc | What's in it |
|---|---|
| [`docs/quality-rubric.md`](docs/quality-rubric.md) | The 8 dimensions, weights, worked examples, scorer rules |
| [`docs/api-contracts.md`](docs/api-contracts.md) | Endpoint contracts and status-code semantics |
| [`docs/data-model.md`](docs/data-model.md) | Schema, encryption boundaries, retention |
| [`docs/data-classification.md`](docs/data-classification.md) | Every field marked plaintext / encrypted / never-persisted |
| [`docs/clarification-taxonomy.md`](docs/clarification-taxonomy.md) | What gets asked, when, and why |
| [`docs/features.md`](docs/features.md) | Full feature inventory |
| [`docs/incident-response.md`](docs/incident-response.md) | IR plan |
| [`docs/retention-policy.md`](docs/retention-policy.md) | Retention schedules |
| [`docs/acceptable-use-policy.md`](docs/acceptable-use-policy.md) | What's blocked and what isn't |

---

<div align="center">

**PromptForge** — 40 services · 13 agents · 29 tables · 22 migrations · 13 platforms · 7 surfaces

*A prompt is a structured object. Treat it like one.*

</div>
