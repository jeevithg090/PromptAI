<div align="center">

# PromptForge

**Reverse-prompting for people who are tired of guessing.**

You type a rough idea. It interviews you, drafts a platform-tailored prompt,
scores it against an auditable 8-dimension rubric, and shows its work.

[![Tests](https://img.shields.io/badge/tests-462%20passing-2ea043?style=flat-square)](#testing)
[![Suites](https://img.shields.io/badge/suites-59-2ea043?style=flat-square)](#testing)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](#stack)
[![Platforms](https://img.shields.io/badge/platforms-13-d9480f?style=flat-square)](#supported-platforms)
[![Surfaces](https://img.shields.io/badge/surfaces-7-d9480f?style=flat-square)](#surfaces)

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

Every draft is scored by a **Critic Agent** against a versioned rubric. Any
dimension scoring 1/3 triggers a bounded refinement pass that fixes *only* the
flagged nodes — locked-node discipline, hard cap of 2 passes, no infinite loops,
no silent rewrites of things that already worked.

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

<div align="center">

`Google Gemini` · `ChatGPT` · `Claude` · `Midjourney` · `Stable Diffusion`
`Claude Code` · `Cursor` · `GitHub Copilot` · `Perplexity`
`Mistral Le Chat` · `HuggingChat` · `Grok` · `DeepSeek`

</div>

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

Three-layer safety: pre-flight classifier → post-generation validation → library publishing gate,
all failing closed · immutable append-only audit log · end-to-end encryption with client-derived
keys · BYOK for OpenAI and Gemini, stored as unretrievable encrypted references · per-user rate
limiting, 100KB body caps, CORS allowlisting, HSTS · data classification marking every field
plaintext/encrypted/never-persisted · documented retention, incident response, subprocessor
register, and acceptable-use policy.

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

## Testing

```bash
cd backend && npm test
```

```
Test Suites: 59 passed, 59 total
Tests:      462 passed, 462 total
Time:       7.8s
```

Per-surface checks: `npm run typecheck && npm test` (backend, admin, extension, desktop),
`npx tsc --noEmit && npm run build` (web), `swift build` (macos, macos-sdk).

CI runs install → typecheck → **gitleaks secret scan** → dependency audit → test on every push.

---

## API

`POST /draft` · `POST /draft/:sessionId/clarify` · `POST /draft/:sessionId/again` · `POST /enhance`
`POST /preview` · `POST /serialize` · `POST /redraft-node` · `POST /fanout` · `POST /transcribe` · `POST /compare`
`POST|GET /prompts` · `GET /prompts/:id/versions` · `POST /prompts/:id/restore` · `GET /prompts/:id/diff`
`GET|POST|PATCH|DELETE /memory` · `GET|POST /projects` · `PUT|GET /keys` · `POST|GET /connections`
`POST /recommend` · `GET /capabilities` · `POST /optimize` · `POST /feedback` · `GET /analytics/outcomes`
`GET /health` · `GET /platforms` · `GET /library` · `POST /demo/draft` · `POST|GET /teams`

Status-code contracts — including the deliberate distinction between `429 budget_exceeded`
and `403 plan_restricted` — are specified in [`docs/api-contracts.md`](docs/api-contracts.md).

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

**PromptForge** — 295 TypeScript files · 40 services · 13 agents · 22 migrations · 462 tests

</div>
