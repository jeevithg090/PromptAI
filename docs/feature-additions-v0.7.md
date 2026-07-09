# Feature Additions — v0.7 (post-review, 2026-07-07)

> **What this is:** a formal capture of features requested in a product review after the v0.6 spec, so they are versioned and never lost. Companion to `prompt-assistant-technical-architecture.md` (which stays the v0.6 source of truth) and `task.md` (which gets the corresponding task IDs, TA.1–TA.7). Where a request extends an existing v0.6 section, that section is cited.

## Legend
- **Status:** `built` · `partial` · `planned` (in v0.6 roadmap) · `new` (not in v0.6)
- **Surface:** where the feature is actually delivered — many need a frontend (web T4.x / extension T5.x) before they are usable.

---

## FA-1 — Prompt Library with preview + autonomous & trending template creation

### FA-1a — Prompt Library with preview *(planned — §14.1–14.2, T4.7/T7.6)*
Internally-seeded, then community-grown library of reusable prompt templates across categories/niches. Each entry: modality, platform-compatibility tags, a **preview**, description, which nodes are user-customizable on remix, popularity + remix counters. Delivered in the web app (T4.7) and moderated via the Admin plane (T7.6).

### FA-1b — Autonomous template publishing from opted-in sessions *(planned — §14.4, T8.2)*
Background Autonomous Curation Agent mines **opted-in** sessions for high-value node sets, generalizes them (strips specifics, keeps the reusable pattern), runs them through the same rubric+safety screening, and auto-publishes or routes to review. Hard privacy constraint: only ever opted-in data (§14.4).

### FA-1c — Trending-prompt discovery *(NEW — extends §14.4)*
A distinct source from FA-1b: instead of (only) mining our own users' sessions, periodically survey what prompt patterns are gaining traction **on the public internet** (prompt-sharing sites, community hubs, platform showcases), distill the reusable structure, and seed category/niche templates around them. Runs in the same background curation pipeline and through the same rubric+safety gates before anything publishes. **Must respect source ToS and attribution; no scraping of gated/private content.** Feeds FA-1a's library.

### FA-1d — Multi-platform prompt generation from one draft *(NEW — extends §13.3)*
When a draft is ready, offer a one-action "generate this for other platforms" — re-serialize the same node set into each target platform's dialect using that platform's PKB/registry rules (§13.3 already assembles per-platform; this exposes it as a fan-out). E.g. one idea → a Midjourney tag-string, a Stable Diffusion prompt+negative, and a Gemini natural-language version side by side.

---

## FA-2 — "Which model suits best" + token analytics

### FA-2a — Model & platform recommendation *(planned — §15, T5.7 → pulled forward as backend TA.2)*
Rank candidate models/platforms for a given task against constraints (modality need, expected length, latency sensitivity, budget sensitivity) and **show the trade-off, not a single winner** (quality vs. cost vs. speed). Data comes from the Model Capability Matrix (§15.1), maintained as perishable KB data, never hardcoded.

### FA-2b — Per-prompt token analytics *(built — §16, T2.10)*
Token count, platform-ceiling check, near-limit warning, and a "tighten" flag already ship in the Token Governor. Enriched by TA.2 (cost estimation once the capability matrix is populated) and TA.3 (reduction suggestions).

---

## FA-3 — Token-reduction advisor (incl. PDF→Markdown practices) *(NEW — extends §16)*
Beyond raw token counting, actively **advise the user how to spend fewer tokens** for the same result:
- Detect verbosity/redundancy in the prompt and suggest concrete trims.
- Suggest format conversions that cost fewer tokens: **PDF → Markdown**, prose tables → CSV/pipe tables, base64 blobs → references, repeated boilerplate → a single definition.
- Explain the *why* (e.g. "Markdown of this doc is ~40% fewer tokens than the PDF's extracted text, and models parse its structure more reliably").
Deterministic/utility layer (no LLM), consistent with §16. Actual file conversion (running a PDF→MD converter) is a later, optional add; the first deliverable is the **suggestion engine**.

---

## FA-4 — Platform usage coaching *(NEW)*
Contextual tips on using the *target platform itself* more effectively — distinct from drafting the prompt. E.g. on Claude Code: "enable the `/xyz` slash command for this", "use plan mode for multi-step work"; on ChatGPT: "turn on the canvas for long edits". The knowledge lives in the PKB under a `usage_tips` category (seeded now, TA.1), surfaced contextually by the web/extension (Phase 4/5). Backend piece (the knowledge + a lookup) is buildable now; delivery needs the frontend surface.

---

## FA-5 — New-website walkthrough *(NEW — extends §5.4)*
When a user lands on an AI site PromptForge doesn't yet deeply support (or one they've never used), and they ask for help, provide a short **guided walkthrough** tailored to their stated need — how to get started, where the prompt box is, the platform's key quirks, and the fastest path to their goal. Extends §5.4's "generic mode / request platform support" fallback from passive to actively helpful. Delivery is inherently the browser extension / web surface (Phase 5); the backing knowledge is PKB.

---

## FA-6 — Large, detailed Knowledge Base for most-used AI sites *(partial → expanding, §6, TA.1 + T5.1)*
The PKB (§6) already backs platform-grounded drafting; v0.6 shipped 5 platforms / 48 curated chunks (T2.6). This request: curate a **much larger and more detailed** KB for the most-used AI sites so that when a user is on an already-studied site, PromptForge answers from the cached KB instead of re-fetching docs live (exactly §6.2's retrieval-first, live-fetch-fallback model).
- **TA.1 (now):** expand the registry + curated seed — more platforms (incl. coding assistants like Claude Code, Cursor, GitHub Copilot, and answer engines like Perplexity) and richer per-platform chunks, including a `usage_tips` category (feeds FA-4).
- **T5.1 (Phase 5):** the scheduled crawler keeps it fresh and grows it automatically.

---

## Sequencing summary

| ID | Feature | Status | Build now? | Needs frontend? |
|---|---|---|---|---|
| TA.1 | KB expansion + usage_tips category (FA-4, FA-6) | building | ✅ yes | no (content) |
| TA.2 | Recommendation engine + capability matrix (FA-2a) | building | ✅ yes | surfacing later |
| TA.3 | Token-reduction advisor (FA-3) | building | ✅ yes | surfacing later |
| TA.4 | Multi-platform fan-out (FA-1d) | planned | small, later | yes |
| TA.5 | Trending-prompt discovery (FA-1c) | planned | Phase 8-ish | no (background) |
| TA.6 | Platform usage coaching delivery (FA-4) | planned | Phase 5 | yes (extension) |
| TA.7 | New-website walkthrough (FA-5) | planned | Phase 5 | yes (extension) |
| — | Library + preview (FA-1a) | planned | T4.7/T7.6 | yes |
| — | Autonomous curation (FA-1b) | planned | T8.2 | no (background) |
