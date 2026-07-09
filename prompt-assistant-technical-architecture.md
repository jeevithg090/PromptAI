# PromptForge — Technical Product & Architecture Specification
### v0.6 Draft — Reverse-Prompting Assistant (Web, Browser Extension, macOS SDK)

> **Note on naming:** "PromptForge" is used as a placeholder brand name throughout this document purely so sections can refer to "the product" consistently. Swap it for your real name wherever you see it.
>
> **Note on scope:** This document is a technical and architectural blueprint, not a business plan. It assumes you already have technical fluency (backend systems, distributed architecture, security fundamentals) and focuses on *how to build this correctly*, not on explaining basic concepts. Where I've made a judgment call to fill a gap you didn't specify, I've flagged it explicitly as an assumption so you can override it.
>
> **v0.3 changelog:** added Section 10, the **Prompt Quality Engine** — the concrete mechanism by which PromptForge drafts prompts that are actually excellent (a quality rubric, a model-behavior knowledge base, task-specific drafting strategies, a generate-critique-refine loop, a visible strength score with inline teaching, and a continuous improvement loop from real usage). All subsequent sections and cross-references have been renumbered accordingly.
>
> **v0.4 changelog:** completely revised Path B (Sections 23.1–23.6) — replaced the AWS-only architecture with a three-platform split (Cloudflare for frontend/storage/edge, Lambda for compute, Supabase for Postgres/pgvector/auth) after auditing every component against all credible free tiers. Eliminated the in-memory vector-search hack (pgvector is free in Supabase), replaced DynamoDB single-table design pain with normal Postgres, swapped Cognito (10K MAU for new pools) for Supabase Auth (50K MAU), and added Cloudflare R2 (zero-egress blob storage) for encrypted content. Custom plumbing reduced from ~300–400 lines to ~100–150 lines. Verified all free-tier figures against official pricing pages as of July 2026.
>
> **v0.5 changelog:** added three new sections following a full product review. Section 27 (**Compliance & Trust Foundations**) gives principles that make future ISO 27001 / SOC 2 audits far easier, sequenced so nothing slows down early development. Section 28 (**Product & Market Refinements**) addresses gaps that matter for startup success rather than architecture — cold-start/time-to-value, a monetization model, onboarding-as-teaching, trust-as-marketing, and teams as a growth vector. Section 29 (**Additional Features & Loophole Remediation**) adds prompt versioning, the critical missing **prompt-performance feedback loop** (the product currently optimizes against predicted, not actual, quality), content-safety guardrails, platform-ToS risk contingency, accessibility, i18n, degraded-mode behavior, data portability, and a frank note on the central defensibility risk.
>
> **v0.6 changelog:** added three major operational sections. Section 30 (**Build Plan**) is a 28-step, no-code-first execution roadmap breaking the MVP into 4 phases across 12 weeks (foundation/design → rough infra → guardrails & agent pipeline → production hardening), with explicit deliverables and success criteria for each step. Section 31 (**Code Quality & Production Readiness**) defines standards upfront: modular folder structure, agent interface contracts, configuration over code, comprehensive testing, structured logging, database migrations as code, dependency minimalism, and code review discipline — all chosen so clean code is the default, not a retrofit. Section 32 (**Guardrails & Safety**) is a complete framework defining what the system blocks (jailbreaks, illegal instruction, CSAM, targeted harassment, disinformation) vs. allows (creative expression, satire, educational content), with three-layer architecture (pre-flight classifier → post-generation validation → library publishing gate), false-positive handling via appeals, immutable logging, acceptable-use policy, and graceful failure (fail closed when the classifier is unavailable).

---

## Table of Contents

1. [Product Vision & Problem Statement](#1-product-vision--problem-statement)
2. [Target Users & Core Use Cases](#2-target-users--core-use-cases)
3. [Product Pillars](#3-product-pillars)
4. [System Overview & End-to-End Walkthrough](#4-system-overview--end-to-end-walkthrough)
5. [Platform Awareness & Context Detection Engine](#5-platform-awareness--context-detection-engine)
6. [Documentation Intelligence Layer (Platform Knowledge Base)](#6-documentation-intelligence-layer-platform-knowledge-base)
7. [Multi-Agent Orchestration Architecture](#7-multi-agent-orchestration-architecture)
8. [Agent Internal Processing Layers](#8-agent-internal-processing-layers)
9. [Model Provider Abstraction & BYOK Architecture](#9-model-provider-abstraction--byok-architecture)
10. [The Prompt Quality Engine — How PromptForge Drafts Excellent Prompts](#10-the-prompt-quality-engine--how-promptforge-drafts-excellent-prompts)
11. [Conversational Clarification Engine](#11-conversational-clarification-engine)
12. [Live Preview System](#12-live-preview-system)
13. [Prompt Node Architecture](#13-prompt-node-architecture)
14. [Prompt Library System](#14-prompt-library-system)
15. [Model & Agent Recommendation Engine](#15-model--agent-recommendation-engine)
16. [Token & Context Window Intelligence Layer](#16-token--context-window-intelligence-layer)
17. [Memory & Personalization System](#17-memory--personalization-system)
18. [Core Domain Data Model (Conceptual)](#18-core-domain-data-model-conceptual)
19. [Security & Privacy Architecture](#19-security--privacy-architecture)
20. [Surface-Specific Technical Design](#20-surface-specific-technical-design)
21. [Admin Control Plane](#21-admin-control-plane)
22. [Backend Infrastructure & Deployment Architecture](#22-backend-infrastructure--deployment-architecture)
23. [Recommended Tech Stack](#23-recommended-tech-stack)
24. [Phased Development Roadmap](#24-phased-development-roadmap)
25. [Success Metrics & KPIs](#25-success-metrics--kpis)
26. [Key Risks & Mitigations](#26-key-risks--mitigations)
27. [Compliance & Trust Foundations (ISO 27001 / SOC 2 Readiness)](#27-compliance--trust-foundations-iso-27001--soc-2-readiness)
28. [Product & Market Refinements](#28-product--market-refinements)
29. [Additional High-Value Features & Loophole Remediation](#29-additional-high-value-features--loophole-remediation)
30. [Build Plan & Development Workflow — Step-by-Step Execution](#30-build-plan--development-workflow--step-by-step-execution)
31. [Code Quality & Production Readiness Standards](#31-code-quality--production-readiness-standards)
32. [AI Agent Guardrails & Safety Framework](#32-ai-agent-guardrails--safety-framework)
33. [Glossary](#33-glossary)

---

## 1. Product Vision & Problem Statement

Most people know *what* they want an AI system to produce but not *how* to phrase it in the specific syntax, parameter set, and idiom that a given AI platform responds well to. Prompt quality is currently a tribal-knowledge problem — good prompts are scattered across Reddit threads, Discord servers, and screenshots, and they go stale the moment a platform updates its model or capabilities.

PromptForge's core bet is that **prompting should be platform-aware, model-aware, and interactive** rather than a blank text box. Instead of the user staring at an empty input field, the product:

- Identifies *where* the user is working (which AI platform, which modality — image, video, chat/persona, code, etc.)
- Pulls in current, authoritative information about that platform's capabilities and syntax
- Interviews the user briefly and adaptively to extract the details that actually matter for a good result
- Shows the user what they're likely to get *before* they commit tokens/credits on the target platform
- Produces a structured, editable, swappable prompt rather than an opaque wall of text
- Tells the user which underlying model is actually best suited to their task, and why
- Remembers how a given user likes to work, and lets them organize related work into Projects with their own persistent context
- **Drafts prompts that are measurably good by an explicit quality standard, and teaches the user why, so their own prompting skill compounds over time**

The differentiator versus "just ask ChatGPT to help you write a prompt" is **grounding**: every suggestion is backed by live/cached documentation of the actual target platform, not the assistant's generic training knowledge, which goes stale and doesn't know about platform-specific quirks. A second differentiator is that **PromptForge is model-agnostic by design** — whatever underlying LLM provider generates the raw draft, the way the result is structured, explained, and presented to the user is always authored by PromptForge's own agent design, not a raw pass-through of someone else's API response (Section 9). The third, and arguably most important, differentiator is the one you're asking this document to nail down precisely: **PromptForge has an explicit, checkable definition of what makes a prompt "good," and a concrete pipeline built to hit that bar every time** (Section 10) — rather than "quality" being an emergent side-effect of just calling an LLM and hoping.

## 2. Target Users & Core Use Cases

- **Prosumers / power users** of AI image, video, and chat tools who want consistently better output without memorizing prompt syntax for five different platforms.
- **Non-technical creators** (marketers, educators, designers) who know the *outcome* they want but not the *mechanics* of prompting.
- **Developers/PMs** evaluating which model/platform is cost- and capability-appropriate for a given task before committing engineering time.
- **Teams standardizing on reusable prompt templates** (e.g. a support team that always needs "draft a customer email in tone X"), including teams that want to bring their own enterprise API contract with a model provider rather than route through PromptForge's default provider.

Core use cases map directly to the flows you described:

1. In-context prompt drafting while on a third-party AI platform (browser extension overlay).
2. Standalone prompt building on the PromptForge website (no live site context — user manually picks a target platform).
3. Browsing/customizing a library of proven prompt templates, including templates the system itself has discovered and published.
4. Getting a model/platform recommendation for a task before writing any prompt at all.
5. Working inside a persistent **Project** whose context (audience, tone, target platform, prior decisions) is automatically remembered and applied across many drafting sessions.
6. Connecting your own model provider API key so PromptForge's agent logic runs on top of a provider/contract you already have.
7. Learning, over repeated use, why certain prompt structures work — improving their own prompting ability, not just receiving a finished output.

## 3. Product Pillars

| # | Pillar | One-line description |
|---|--------|----------------------|
| 1 | **Platform-Aware Drafting Engine** | Detects the target AI platform and grounds prompt generation in that platform's real, current documentation. |
| 2 | **Prompt Quality Engine** | An explicit, checkable rubric plus a generate-critique-refine pipeline that defines and enforces what "excellent" means for every draft. |
| 3 | **Adaptive Clarification Engine** | Asks the minimum number of MCQ/free-text follow-ups needed to disambiguate user intent. |
| 4 | **Live Preview System** | Shows a text and/or visual preview of the likely output *while* the user is still answering questions. |
| 5 | **Prompt Node Architecture** | Every generated prompt is a set of editable, swappable "nodes" rather than a monolithic string. |
| 6 | **Prompt Library** | Curated, community, *and autonomously agent-discovered* prompt templates, previewable and remixable. |
| 7 | **Model/Platform Recommendation Engine** | Recommends the best-fit model or platform for a task based on live capability data, not static assumptions. |
| 8 | **Token & Context Intelligence** | Surfaces token usage, context-window budget, and cost implications everywhere it's relevant. |
| 9 | **Multi-Provider Connectivity (BYOK)** | Any supported model provider can power the raw generation step, but the output is always shaped by PromptForge's own agent design, never a raw API pass-through. |
| 10 | **Memory & Projects** | The assistant adapts to a user's style over time, with full user visibility/control, and can scope context to a persistent Project. |
| 11 | **Admin Control Plane** | A single, highly secured internal surface for operating and observing the entire system. |

Pillar 2 is the newest addition and, per your latest ask, the one this document now treats as the product's central novelty — Section 10 is the detailed mechanism behind it, and every other pillar ultimately feeds it data or context.

## 4. System Overview & End-to-End Walkthrough

At a high level, PromptForge is three thin client surfaces (Web, Browser Extension, macOS app/SDK) plus one internal-only surface (the Admin Control Plane) sitting on top of one shared backend: an **Orchestration Service** (the multi-agent "brain"), a **Platform Knowledge Base** (RAG store of platform documentation), a **Model & Prompting Knowledge Base** (Section 10.2 — how models actually behave, distinct from platform docs), a **Model Provider Abstraction** (Section 9), a **Memory Service** (Section 17), a **Prompt Library Service**, and an **Identity/Encryption layer**. No client surface re-implements agent logic — they are all thin, and all business logic lives server-side so it can be updated without shipping new extension/app versions.

To ground this, here is your own example (Gemini + "create an image of a horse running") traced through the full architecture:

1. **Trigger**: User is on `gemini.google.com`. They invoke the PromptForge overlay via a hotkey or a persistent injected icon near the input box.
2. **Context detection**: The extension's content script matches the current URL and DOM signature against the **Platform Registry** and identifies `platform_id = google_gemini`, `surface = web_chat`, `modalities = [text, image]`.
3. **Request dispatch**: The extension sends `{platform_id, raw_user_idea, surface_context}` to the backend over an authenticated, TLS-encrypted channel. The raw idea ("create an image of a horse running") is never logged in plaintext server-side (see Section 19).
4. **Context assembly**: relevant Memory entries and, if the user is working inside a Project, that Project's pinned context (Section 17) are pulled in alongside platform data.
5. **Doc grounding**: the Doc Retrieval Agent queries the Platform Knowledge Base for "Gemini image generation" capability chunks. If missing/stale, it live-fetches and re-indexes (Section 6).
6. **Intent classification**: task tagged `text_to_image`; entities extracted: subject = "horse", action = "running".
7. **Adaptive clarification**: enumerable nodes (style, environment, lighting, aspect ratio) become MCQ chips; open nodes (specific breed/color) become short free-text prompts.
8. **Live preview**: streams an updating description as the user answers.
9. **Quality-governed drafting**: the Drafting Agent calls out through the **Model Provider Abstraction** (Section 9) to generate the raw draft text, immediately passes it through PromptForge's own **Response Design Layer**, and — per the **Prompt Quality Engine** (Section 10) — runs it through a generate-critique-refine pass against an explicit quality rubric before it's ever shown to the user.
10. **Alternatives**: ranked alternative values attached per node, each with a short rationale (Section 10.5) tying the choice back to a general prompting principle.
11. **Token/context check**: the deterministic Governor flags verbosity and offers a "tighten" pass.
12. **Insertion**: user reviews the drafted prompt *and its visible strength score*, swaps nodes if they want, clicks Insert — the extension fills (never auto-submits) Gemini's input box.
13. **Persistence & learning**: the finalized prompt is saved (encrypted) to history/Project; a lightweight Memory extraction step proposes durable preference signals for the user to keep or discard; edit/reuse signal from this session feeds the aggregate continuous-improvement loop in Section 10.7; if the user has opted in to library contribution, the session becomes eligible for the Autonomous Curation Agent (Section 14.4) to later consider generalizing into a public template.

Every other feature in this document is really a variation on steps 4–12 applied to a different entry point.

## 5. Platform Awareness & Context Detection Engine

### 5.1 Platform Registry

The Platform Registry is the single source of truth every other component reads from — a centrally maintained, versioned configuration store (not hardcoded into client code) containing, per supported platform: canonical `platform_id`, display name, modality tags, URL match patterns and DOM fingerprint selectors, links to official documentation sources, known prompt-syntax quirks, practical prompt-length norms, and a schema version / "last verified" timestamp.

Because this lives server-side and is fetched by clients at runtime (with local caching), adding a new platform or fixing a broken selector after a UI redesign is a config change — not a new extension release.

**Assumption/recommendation**: launch with a deliberately narrow registry — 5 to 8 high-traffic platforms spanning each modality — rather than trying to cover the long tail on day one.

### 5.2 Browser Extension Detection Strategy

- **Primary — DOM fingerprinting**: URL pattern match confirmed by DOM selectors, to avoid false positives.
- **Fallback — heuristic detection**: generic page signals (title, Open Graph tags, headings) when no registry entry matches, offering a "generic mode" experience without platform-specific grounding.

Detection re-runs on SPA navigation events, not just full page loads, since most AI platforms are single-page apps.

### 5.3 macOS System-Wide Context Detection

- **Frontmost-application detection** via standard system APIs.
- **Accessibility API (AXUIElement) read-only access**, explicitly permissioned, to inspect window titles and, where the frontmost app is a supported browser, the active tab's URL.
- **Graceful degradation without permission**: the macOS app still functions as a manual/standalone builder without ambient detection. Onboarding should explain exactly what's read (window title / URL) and what's never read (keystrokes, screen content, other apps' data).

### 5.4 Fallback & Unknown Platform Handling

When a platform isn't in the registry and heuristics can't classify it, say so plainly and offer a generic prompt-engineering pass plus an explicit "request platform support" action feeding a prioritization queue.

## 6. Documentation Intelligence Layer (Platform Knowledge Base)

### 6.1 Ingestion Pipeline

A scheduled, queue-based crawler ingests each registered platform's official documentation, changelog, and API reference pages, chunked and embedded into a vector store (the **Platform Knowledge Base**, PKB), on a recurring cadence rather than per-request. Where no public docs exist, curated community reference material can be ingested too, tagged with a lower trust/confidence score.

### 6.2 Retrieval-Augmented Tool-Calling Flow

1. Query the PKB vector index for chunks relevant to `{platform_id, task_modality}`.
2. If a fresh, high-confidence match exists, use it directly (fast path).
3. If missing or stale, trigger a **live tool call** to fetch the current doc, extract the relevant section, answer from it, and asynchronously upsert the result into the PKB.

This "cache-first, tool-call-as-fallback, self-healing index" pattern keeps steady-state latency and cost low while avoiding permanent drift.

### 6.3 Freshness & Versioning

Every PKB entry carries a source URL, ingestion timestamp, and content hash, re-checked periodically for drift. Model/platform capability data is treated as especially perishable and re-verified more aggressively than general prompting guidance.

## 7. Multi-Agent Orchestration Architecture

Rather than one giant prompt trying to do everything, the backend runs a **pipeline of narrow, single-responsibility agents** coordinated by a supervisor — debuggable (trace exactly which step produced a bad output), cost-controllable (route each step to the cheapest capable model), and independently improvable.

### 7.1 Agent Roles

| Agent | Responsibility | Typical model tier |
|---|---|---|
| **Supervisor/Planner** | Owns the pipeline state machine, decides which agent runs next, handles retries and "just generate" early exits. | Small/fast |
| **Context Agent** | Resolves platform_id + modality from client-supplied signals. | Rule-based / no LLM needed |
| **Intent Classification Agent** | Classifies task type and extracts initial entities. | Small/fast |
| **Doc Retrieval Agent** | Executes the RAG + tool-calling flow (Section 6). | Small/fast, tool-calling capable |
| **Clarifying Question Agent** | Generates adaptive MCQ/free-text follow-ups; decides when to stop. | Mid-tier |
| **Preview Agent** | Produces incremental textual/visual previews as answers come in. | Small/fast, streaming |
| **Drafting Agent** | Synthesizes gathered data + doc knowledge into the final node-based prompt, via the Provider Abstraction (Section 9), applying the strategy profiles in Section 10.3. | Larger/higher-quality |
| **Critic Agent** | Evaluates a draft against the Prompt Quality Rubric (Section 10.1) and triggers a bounded refinement pass. | Mid-to-large tier, runs once per draft |
| **Alternatives Agent** | Generates ranked alternative values per node, each with rationale (Section 10.5). | Mid-tier |
| **Model Recommendation Agent** | Matches task requirements against the Model Capability Matrix (Section 15.1). | Small/fast, mostly retrieval + ranking |
| **Memory Extraction Agent** | Proposes durable preference signals at session checkpoints (Section 17). | Small/fast |
| **Autonomous Curation Agent** | Mines opted-in sessions for library-worthy templates (Section 14.4). | Mid-tier, runs as a background job, not in the live request path |

The **Token & Context Governor** is deliberately not listed as an agent — it's a deterministic policy/utility layer, not an LLM call.

### 7.2 Orchestration Pattern

Model this as an explicit **state machine**: `context_resolved → intent_classified → docs_retrieved → clarifying → previewing → drafting → critiqued_and_refined → alternatives_attached → governed → ready_for_review`. Each transition is logged with its inputs/outputs for observability (feeds directly into the Admin Control Plane's pipeline tracing view, Section 21). A supervisor owns transitions and can short-circuit the pipeline whenever the user requests it.

### 7.3 Model Routing Strategy (Cost-Aware)

Route classification, retrieval, and preview steps to small/fast/cheap models; reserve stronger models for final drafting and for the Critic Agent's evaluation pass, since these are the steps most directly responsible for output quality and are run once per draft, not on every keystroke. Maintain a hot-swappable internal routing table mapping `{pipeline_step, task_complexity}` → `{provider, model_id}` so you can react to new model releases without a code deploy — this table is exactly what the Model Provider Abstraction in Section 9 makes possible across multiple providers, not just one.

## 8. Agent Internal Processing Layers

Section 7 describes *what* each agent does. This section describes the **layered pipeline every single request physically moves through**, end to end — the "how it works inside" view.

1. **Ingestion Layer** — receives the raw client request (user idea + platform/session/Project context), authenticates the caller, and decrypts session context for in-memory use only.
2. **Context Assembly Layer** — gathers everything relevant *before* any generation happens: the Platform Registry entry, retrieved PKB chunks, applicable Memory entries (Section 17), the active Project's pinned context if any, and prior turns in this session. This is the layer most responsible for output quality, since a well-assembled context makes every downstream step better.
3. **Tool-Calling Layer** — the mechanism that lets agents reach outside their own weights: doc-retrieval calls, live web-fetch fallback, model-capability lookups. Every tool call is logged (input, output, latency, cost) for full traceability.
4. **Reasoning/Drafting Layer** — where actual model calls happen, routed through the Model Provider Abstraction (Section 9): classification, clarifying-question generation, drafting, alternatives generation.
5. **Quality Evaluation Layer** — the Critic Agent (Section 7.1) checks the draft against the Prompt Quality Rubric (Section 10.1) and triggers a bounded refine pass if it fails any dimension. This sits between raw drafting and response shaping deliberately: it evaluates content quality *before* the output is dressed up for presentation, so a well-formatted-but-weak prompt can't slip through.
6. **Response Design/Shaping Layer** — takes the (now quality-checked) model output and reshapes it into PromptForge's own node structure (Section 13), attaches ranked alternatives with rationale, and applies platform-specific serialization rules. **This is the layer that guarantees the user-facing result always looks like a PromptForge-designed output, never a raw third-party API response** — it runs identically regardless of which provider produced the underlying text (Section 9.3).
7. **Governance Layer** — the deterministic Token & Context Governor (Section 16) checks length/cost/budget; not an LLM call.
8. **Memory Write-Back Layer** — at session checkpoints, the Memory Extraction Agent proposes durable, human-readable preference updates (never raw transcripts) for the user to accept, edit, or discard (Section 17).
9. **Persistence Layer** — encrypted write to storage (Section 19), plus a metering event that records cost/usage without recording content, and an anonymized outcome-signal event feeding the continuous improvement loop (Section 10.7).

Treat this as the canonical mental model when building: every feature you add should be locatable in one of these nine layers, which keeps the system's complexity legible as it grows.

## 9. Model Provider Abstraction & BYOK Architecture

You specifically want two things at once: (1) users/orgs should be able to connect *any* supported AI provider via their own API key, and (2) regardless of which provider is doing the raw generation, the actual response the user sees must reflect **PromptForge's own agent design**, not a straight pass-through of that provider's API output. These two requirements are solved by the same architectural pattern: a strict separation between a **Provider Adapter** (dumb, swappable, does raw generation only) and a **Response Design Layer** (PromptForge's own logic, provider-agnostic, always runs).

### 9.1 Provider Adapter Interface

Every supported provider (e.g. OpenAI, Anthropic, Google, others you choose to support) is implemented behind one normalized internal interface — conceptually: "given a request in PromptForge's internal schema, return raw generated text/tokens." The rest of the system — every agent in Section 7, every layer in Section 8 — talks *only* to this interface, never to a provider's SDK directly. Adding a new provider means writing one new adapter; it never touches orchestration logic.

### 9.2 Capability Normalization

Providers differ in supported parameters (function-calling formats, streaming behavior, system-prompt conventions, max output length). Each adapter is responsible for translating between PromptForge's internal request/response schema and that provider's specific API shape, so the orchestration layer is 100% provider-agnostic and never has provider-specific branching logic scattered through it.

### 9.3 The Response Design Layer — Why the Output Never Looks Like a Raw API Call

This is the direct answer to "the response should be like how our AI agent designed it, not straight from the API." After *any* provider adapter returns raw text — and after that text passes the Quality Evaluation Layer (Section 8, Layer 5) — it is mandatory input to PromptForge's own **Response Design Layer** (Section 8, Layer 6) before it's ever shown to a user:

- The raw text is parsed and mapped into the Node structure (Section 13) — subject, style, constraints, etc. — regardless of whether it came from Provider A or Provider B.
- Alternatives, rationale, and platform-specific serialization are applied by PromptForge's own logic, not by the provider.
- Preview generation, token governance, and library formatting all run identically on top, regardless of provider.
- The underlying provider is, architecturally, nothing more than a raw-text generation engine one layer down — it never touches presentation, structure, quality evaluation, or decision logic. This means you could swap the default provider entirely, or let ten different BYOK users each run through ten different providers, and every one of them gets an output that looks, behaves, and *is held to the same quality bar* as a PromptForge product, because the parts that define "what this product feels like" and "what counts as good" are code and rubric you own, not a prompt you're passing through to someone else's API.

### 9.4 BYOK Key Custody

User-supplied API keys are treated as highly sensitive secrets:

- Stored via envelope encryption backed by a dedicated secrets manager, not as plaintext columns in the primary database.
- Decrypted only ephemerally, server-side, at the moment of an actual provider call — never logged, never sent to any client, never visible in plaintext anywhere in the Admin Control Plane (Section 21.4).
- Revocable, not retrievable — once a user saves a BYOK key, the product should be able to *use* and *delete* it, but should have no code path that displays it back in plaintext, including to admins.

### 9.5 Default Provider & Monetization Interplay

BYOK is additive, not mandatory: PromptForge maintains its own negotiated provider relationship as the default path for users who don't want to manage keys, and this default-provider usage is also your primary metered revenue line (Section 16). BYOK users still pay for the PromptForge *product* (orchestration, grounding, quality engine, UI, library, memory) — they're only opting out of paying PromptForge for the underlying raw generation cost specifically.

### 9.6 Per-Connection Usage Tracking

Usage metering (Section 16/18) tracks calls per provider connection, so BYOK users see their own provider spend distinctly from PromptForge-billed spend, and so the Admin Control Plane can show aggregate provider health/error rates without ever needing to see individual key values.

## 10. The Prompt Quality Engine — How PromptForge Drafts Excellent Prompts

This section is the direct answer to your question: what, specifically, makes PromptForge's drafted prompts actually good, reliably, rather than "good because an LLM wrote them and LLMs are often decent at this"? The honest answer is that quality can't be left as an emergent side-effect of calling a model — it has to be an explicit, checkable target the system is built to hit. That requires five things working together: a definition of quality you can mechanically check, real knowledge of how models behave (not just what platforms document), task-specific technique, a self-check pass before anything reaches the user, and a way to get smarter over time from real usage. This is also where the "enhance user productivity by teaching them how models work" goal lives — the mechanism that makes prompts good is the same mechanism that, made visible, teaches the user *why* they're good.

### 10.1 What "Excellent" Means — The Prompt Quality Rubric

Before anything can be optimized, it has to be defined. Every drafted prompt is evaluated — by the Critic Agent (10.4) and shown to the user (10.5) — against a fixed set of concrete, checkable dimensions:

- **Specificity**: are all nodes filled with concrete values, not vague placeholders ("a nice image" vs. "a chestnut horse mid-gallop, dust trailing from its hooves")?
- **Unambiguity**: is there any instruction that could reasonably be read two different ways?
- **Non-conflict**: do any two nodes or instructions contradict each other (e.g. "ultra-minimalist" style paired with a highly detailed, cluttered scene description)?
- **Platform-fit**: does the phrasing/syntax match what the target platform is documented, via the PKB (Section 6), to actually respond well to?
- **Constraint completeness**: is every explicit constraint the user actually stated represented in some node — nothing they said got silently dropped?
- **Output-format determinacy**: is it clear what shape the response should take, wherever that matters for the task type?
- **Context-window efficiency**: is the prompt as concise as possible without losing needed specificity (ties directly to the Token Governor, Section 16)?
- **Appropriate technique application**: for reasoning/coding/extraction tasks, does the prompt use the elicitation technique the Model & Prompting Knowledge Base (10.2) indicates that model family actually benefits from?

This rubric is a single shared artifact — the Critic Agent, the Alternatives Agent, and the user-facing Prompt Strength Score (10.5) all check drafts against the *same* dimensions, so "excellent" is a consistent, auditable standard across the product rather than a different vibe every time.

### 10.2 The Model & Prompting Knowledge Base (MPKB)

The Platform Knowledge Base (Section 6) tells the system *what a platform's interface/syntax supports*. It does not, by itself, encode *how language and diffusion models actually behave* — that's a separate, equally important body of knowledge, maintained the same way: an ingestion pipeline over reputable, current sources (model providers' own prompting guides, published prompting research, provider changelogs noting behavior changes), refreshed on a schedule rather than baked once into a template and left to rot. This becomes the **Model & Prompting Knowledge Base (MPKB)** — treated exactly like the Model Capability Matrix (Section 15.1): perishable, versioned, continuously refreshed, never hardcoded into application logic.

Representative categories of what it holds: how strongly a given model family weights system-level versus user-level instructions; how reliably a model follows negative instructions ("don't include X") versus positive/constructive ones ("include only X"), since negation is documented to be handled less reliably by many models; when few-shot examples measurably help (classification/extraction/style-matching) versus when they can over-constrain (open-ended creative tasks); when explicit step-by-step reasoning requests improve reliability for a given model family versus adding no benefit; formatting sensitivities (some models respond more reliably to structured/tagged input than freeform prose, or vice versa); known verbosity and instruction-following quirks per model family and version.

This is what the Drafting Agent and the Response Design Layer actually draw on to decide **how** to phrase a node, not just what content it should contain — the difference between "the user wants a horse running" (content, from the user) and "phrase it as a dense comma-separated descriptor list, because that's documented to work best for this platform's specific model" (technique, from the MPKB).

### 10.3 Task-Type Specific Drafting Strategies

Different task modalities genuinely need different prompting approaches, so the Drafting Agent selects from a small library of **strategy profiles** keyed off the classified task type (Section 7.1):

- **Generative visual (image/video)**: dense descriptive/tag-style language, explicit style/composition/lighting anchors, disciplined negative-prompt usage, platform-specific weighting syntax where the platform supports it.
- **Conversational persona/agent**: explicit role framing in a system-level instruction, a defined tone/register, a small number of example exchanges where the persona needs a specific voice, and explicit boundaries on what the persona should and shouldn't do.
- **Reasoning/coding tasks**: explicit step-decomposition requests, a requested self-verification pass ("check the answer before finalizing") where the MPKB indicates the target model benefits from it, precise output-format specification, and relevant constraints (language/library/version) surfaced as their own dedicated node.
- **Extraction/classification tasks**: a small number of concrete few-shot examples plus an explicit output schema — these tasks are consistently more reliable with examples than with description alone.
- **Long-form writing**: structural scaffolding (sections/beats) plus a small number of style anchors rather than an exhaustive style description, since over-specifying style tends to produce stilted, over-constrained output.

Each strategy profile lives in the MPKB (10.2) as versioned, editable configuration rather than hardcoded logic — improving "how we draft coding prompts" becomes a knowledge update reviewable in the Admin Control Plane (Section 21.2), not a code change requiring a deploy.

### 10.4 Generate → Critique → Refine Loop

The Drafting Agent's first output is never treated as final. It passes through the **Critic Agent** (Section 7.1, Quality Evaluation Layer in Section 8) before it ever reaches the user: the Critic checks the draft against every dimension of the Prompt Quality Rubric (10.1), flags any failing dimension — a conflicting pair of nodes, a missing output-format specification where the task type needs one, an underused constraint the user explicitly mentioned — and triggers one bounded refinement pass to fix exactly what was flagged.

This is deliberately capped at one or two refinement iterations, not an open-ended loop — enough to catch real quality gaps without becoming an unbounded, expensive self-improvement cycle (this directly ties into the cost-governance principles in Sections 7.3 and 22.4). It's worth spending a slightly stronger model tier here specifically, since this single step is most directly responsible for whether the final output actually earns the word "excellent," and it runs once per draft, not on every keystroke — so the cost is bounded and predictable even though the model tier is higher.

### 10.5 Prompt Strength Score & Explainability Layer

This is the direct mechanism behind "enhance user productivity by understanding how models work" — the product doesn't just hand over a finished prompt silently; it shows *why* it made the choices it made, so the user's own prompting skill compounds with every use rather than staying dependent on the tool forever:

- **Prompt Strength Score**: a visible, rubric-derived score (10.1) shown alongside every drafted prompt, broken into legible sub-scores — specificity, platform-fit, constraint-completeness — so quality is concrete evidence the user can see, not just an implicit claim.
- **Inline rationale**: every node's chosen value and its alternatives (Section 13.2) carry a short, plain-language reason grounded in the MPKB/PKB — e.g. *"added as an explicit constraint because this platform tends to ignore aspect-ratio requests mentioned only in passing"* or *"phrased as numbered steps because this model is documented to reason more reliably on code tasks with explicit step structure."*
- **"Why this works" expandable detail**: for a user who wants to actually learn the underlying principle instead of just accepting the output, a short optional expansion ties the specific choice back to a general prompting principle (positive vs. negative instructions, the value of few-shot examples, context-window discipline) — turning every drafted prompt into a small, optional lesson rather than a black box.
- Positioned deliberately as a real differentiator: this is the difference between a tool that does prompting *for* the user forever, and one that measurably makes the user *better at prompting themselves* over time — which is a stronger retention and word-of-mouth driver than opacity ever is, and directly serves the productivity goal you named.

### 10.6 Closed-Loop Intent Convergence

The clarification engine (Section 11), live preview (Section 12), and node architecture (Section 13) aren't three independent features — together with the Quality Engine they form one tight feedback loop whose entire purpose is converging on exactly what the user meant, as fast as possible: draft/ask → preview → user signal (accept / edit / reject a node) → immediate, *localized* redraft of only the affected node(s), never a full regeneration. This locality matters for quality specifically: because nodes are independently addressable (Section 13.1), a rejection or edit on one node never forces the system to regenerate everything else and risk drifting away from parts the user had already confirmed they liked. This — not a single best-guess generation — is what mechanically delivers "draft excellent prompts the user exactly wants": a fast-converging loop with cheap, localized correction at every step, governed throughout by the same quality rubric.

### 10.7 Continuous Improvement from Outcome Signals

Individual sessions produce two kinds of signal worth feeding back into the system over time, aggregated and privacy-preserving, consistent with Section 19's data-minimization commitments: **implicit** signal (how many nodes a user edited before accepting a draft, whether they reused a prompt later, whether they abandoned a draft entirely) and **explicit** signal (an optional thumbs up/down on a finished prompt). Aggregated across many users and sessions — never raw content, only rubric-dimension outcomes and edit patterns tied to task-type/platform combinations, never to individual identity — this data is used to periodically tune the strategy profiles in 10.3 and to flag MPKB entries that may be stale or wrong (e.g. if prompts using a particular technique consistently get heavily edited by users, that technique's entry gets flagged for review in the Admin Control Plane, Section 21.2).

This closes the loop between "how we think prompting should work" (10.2/10.3, sourced from external prompting research and platform docs) and "how it's actually performing for real users" (10.7, your own first-party signal). Over time, this loop is a genuine, hard-to-replicate advantage: a competitor without your usage volume can source the same public prompting research you can, but they can't tune against the same scale of real, aggregated outcome data — which is precisely what turns "we called an LLM to write a prompt" into "we have a system that has learned, from real usage, what actually works."

## 11. Conversational Clarification Engine

### 11.1 Adaptive Question Generation (MCQ vs. Free Text)

Core rule: **if a node's answer space is enumerable and platform-relevant, ask MCQ; if it's open-ended/descriptive, ask free text.** Enumerable → MCQ (art style, aspect ratio, tone, output format, camera framing, persona archetype — anything the PKB already lists a bounded value set for). Open → free text (specific subject details, brand voice nuances). Hybrid: MCQ with an explicit "other (describe)" escape hatch.

Questions generate one or two at a time, not as a long upfront form, so the flow stays conversational and the Preview Agent can update incrementally.

### 11.2 Stopping Criteria

Track a rough information-gain estimate per remaining underspecified node and stop once marginal value drops below a threshold, or a small fixed cap is reached (start around 3–5 questions, configurable). Always expose an explicit **"just generate now"** control.

## 12. Live Preview System

### 12.1 Textual Preview Mode

Always-on, cheap, fast: a one- to two-sentence description of what the current node configuration will likely produce, regenerated after each change — the default mode for every task type, including non-visual ones.

### 12.2 Visual Preview Mode

Optional, opt-in per session given real generation cost: a fast/low-cost image model for a rough approximation, or a similar-looking exemplar pulled from the Prompt Library as a cheaper "vibe" stand-in. The UI should state plainly this isn't the target platform's actual model.

### 12.3 Incremental Updates & Cost Control

Debounce (wait for a pause) and stream (progressive partial text) preview regeneration. Rate-limit visual previews specifically (regenerate on node *changes*, not every interaction) given their materially higher cost.

## 13. Prompt Node Architecture

### 13.1 Node Taxonomy

A finalized prompt is an **ordered collection of typed nodes**, each independently editable/swappable — and, per Section 10.6, independently addressable for localized correction.

| Node type | Applies to | Description | Example |
|---|---|---|---|
| Subject | Image / Video / Persona | The core entity or topic | "a horse" |
| Action / Behavior | Image / Video / Persona | What the subject does, or how an agent should behave | "running", "answers concisely, asks one clarifying question at a time" |
| Setting / Context | Image / Video / Chat | Environment or scenario | "open prairie at golden hour" |
| Style / Aesthetic | Image / Video | Visual/stylistic treatment | "photorealistic" |
| Composition / Camera | Image / Video | Framing, angle, shot type | "wide shot, low angle" |
| Lighting / Mood | Image / Video | Atmospheric/emotional tone | "warm, golden-hour lighting" |
| Persona / Role | Chat / Agent tasks | Who or what the AI should act as | "a patient, encouraging language tutor" |
| Constraints / Rules | All | Hard boundaries the output must respect | "under 100 words" |
| Technical Parameters | Platform-specific | Enumerable settings the platform exposes | "aspect ratio 16:9" |
| Negative Prompt | Image / Video | What to explicitly exclude | "no extra limbs, no watermark text" |
| Output Format | All | Structure of the expected response | "bulleted list", "JSON object" |

### 13.2 Node Alternatives & Ranking

Each node carries a primary value plus 2–4 ranked alternatives with a short rationale (Section 10.5), ranked by platform-doc relevance and task fit. Nodes can be individually **locked**, so regenerating others never disturbs a locked node.

### 13.3 Prompt Assembly per Platform Syntax

The final string is produced by a platform-aware **template/assembly step**: the same abstract node set serializes differently per target platform's expected syntax, per rules stored in the Platform Registry/PKB. This separation — abstract nodes vs. platform-specific serialization — is also what lets the same idea be "ported" across platforms later.

## 14. Prompt Library System

### 14.1 Content Taxonomy & Data Model

Each entry: task modality, target platform compatibility tags, a preview, a short description, which nodes are meant to be user-customized on remix, popularity/usage counters, and remix/fork count.

### 14.2 Curation & Community Contribution Workflow

Launch with an internally seeded library. Community submissions go through automated quality/safety screening (against the same Prompt Quality Rubric, Section 10.1) → a moderation queue for borderline cases → publish. Track version history on popular templates.

### 14.3 Personalization

Recommendations can work from *metadata* (modality, platform, tags) without needing to expose the *content* of a user's private saved prompts, consistent with the encryption model in Section 19.

### 14.4 Autonomous Template Publishing

This is the mechanism by which PromptForge's own agents — not only humans — grow the library, per your request. It runs as a background **Autonomous Curation Agent**, entirely outside the live request path:

1. **Signal mining**: periodically scans session signals (reuse count, explicit save, positive implicit engagement, high Prompt Strength Score per Section 10.5) for high-value node sets that are candidates for generalization.
2. **Generalization**: an LLM call strips the specific instance's particulars (e.g. a user's exact subject matter) while preserving the reusable structural pattern — turning "a chestnut horse running across a golden prairie" into a generic "animal-in-motion, golden-hour landscape" template.
3. **Quality/safety screening**: the same automated checks used for human submissions (14.2), against the same rubric (10.1), run before anything is published.
4. **Publish or route to review**: high-confidence, low-risk candidates publish automatically; anything borderline routes to the human moderation queue inside the Admin Control Plane (Section 21).
5. **Attribution**: published templates can optionally credit the originating user (with consent) or publish as "PromptForge Community."

**Hard constraint, non-negotiable given Section 19's privacy commitments**: the Autonomous Curation Agent may only ever consider sessions/prompts a user has explicitly opted in to (e.g. a "contribute to library" toggle at save time, or an account-level default the user actively sets). It must never mine private, non-opted-in encrypted history — there is no code path for that, by design, the same way there's no admin code path for decrypting private content (Section 21.3). This is what lets you offer autonomous library growth *and* keep the "nothing beyond name/email is ever exposed by default" promise simultaneously.

## 15. Model & Agent Recommendation Engine

### 15.1 Model Capability Matrix

Maintained as part of the Platform Knowledge Base, not hardcoded: per model/platform, track modality support, context window size, relative cost tier, latency profile, and a qualitative strength profile. Treat this as perishable data refreshed through the same ingestion pipeline as platform docs — never hardcode specific numbers into application logic.

### 15.2 Recommendation Logic & Trade-off Presentation

Rank candidate models/platforms against task constraints (expected length, latency sensitivity, budget sensitivity) and **show the trade-off, not just a single winner** — e.g. higher quality at higher cost vs. near-equivalent quality faster and cheaper. This mirrors the token-transparency ethos of Pillar 8 and builds trust.

## 16. Token & Context Window Intelligence Layer

- **Token accounting**: use each target platform's actual tokenizer where available, not a generic word-count heuristic.
- **Context budget visualization**: an always-visible indicator of context-window consumption.
- **Cost estimation**: translate token counts into estimated cost using current pricing data from the Model Capability Matrix (Section 15.1) — and, for BYOK users, using their connected provider's actual pricing tier (Section 9.6).
- **Compression suggestions**: a one-click "tighten" pass when a prompt is unnecessarily verbose.

This layer is deterministic/utility code, deliberately separate from the probabilistic agent pipeline — it should never depend on an LLM call to produce a token count.

## 17. Memory & Personalization System

You asked for two related things here: (1) the assistant should adapt to a user's style over time, with the user able to see and add to that memory directly, and (2) a ChatGPT/Claude-style **Projects** concept that scopes context to a specific body of work.

### 17.1 What Gets Remembered

Memory is stored as discrete, human-readable **preference statements**, not raw conversation transcripts — e.g. "prefers concise, direct prompt phrasing," "usually targets Midjourney for image work," "writes in a professional register by default." This mirrors how the durable, useful signal in a long interaction history is almost always a handful of stable facts, not the full transcript, and it's also what makes user review/editing (17.3) actually usable — nobody can meaningfully audit a raw history dump, but they can easily scan and correct a dozen short statements.

### 17.2 Memory Extraction

At natural checkpoints (end of a session, or an explicit "remember this" action), the **Memory Extraction Agent** (Section 7.1, Layer 8 in Section 8) proposes candidate memory updates from the session. This is a lightweight, small-model background step — it never runs on every message, only at checkpoints, to control cost. Proposed updates are surfaced to the user for confirmation before being saved permanently, rather than being silently written.

### 17.3 User Visibility & Control

Full transparency is a hard requirement, not a nice-to-have, both for trust and because it's the only way memory-driven personalization avoids feeling invasive:

- Users can view every stored memory entry as a plain-language list.
- Users can edit or delete any entry directly.
- Users can **manually add** new memory entries themselves (e.g. "always assume I mean cinematic lighting unless I say otherwise") without waiting for the system to infer it.
- Memory can be reset entirely, per-Project or globally.

### 17.4 Applying Memory (Selective, Not Wholesale)

Memory entries are selectively retrieved and injected into the Context Assembly Layer (Section 8, Layer 2) based on relevance to the *current* task — not dumped wholesale into every request. This keeps token cost bounded and avoids irrelevant context pollution (e.g. a memory entry about video-generation preferences shouldn't leak into a chat-persona drafting session unless genuinely relevant).

### 17.5 Encryption

Memory entries fall into the encrypted-at-rest content class (Section 19.1) — they can reveal a great deal about a person, arguably more than any single prompt, so they get the same client-derived-key encryption treatment as prompt content.

### 17.6 Projects

A **Project** is a persistent container grouping multiple drafting sessions under shared, scoped context — analogous to ChatGPT/Claude Projects, but tailored to prompt-drafting specifically:

- A Project has a name, description, a default target platform (optional), a pinned style/persona node set (optional), and its own **Project-scoped memory**, distinct from the user's global memory.
- When drafting inside a Project, the Context Assembly Layer pulls Project-scoped context in addition to global memory; where the two would conflict, **Project context takes precedence within its own scope** (e.g. a "German Learning App Prompts" Project's pinned tone/audience settings override a general global preference, since the Project is the more specific signal).
- A Project also functions as a natural home for a running sub-library — prompts drafted within it are easy to browse as a set, and are a natural default source when the user later wants to publish or remix within that specific body of work.
- Architecturally, a Project is simply a scoping key threaded through Context Assembly (Section 8, Layer 2) and Memory retrieval (17.4) — it doesn't require a separate pipeline, only a consistent `project_id` carried through the request.

## 18. Core Domain Data Model (Conceptual)

Described conceptually — the key entities your data model needs to represent:

- **User**: identity, plaintext name/email, encrypted preferences.
- **Platform**: registry entry as described in Section 5.1.
- **KnowledgeChunk**: a PKB entry — source, embedding, content, freshness metadata, trust/confidence score. A parallel `MPKBEntry` type (Section 10.2) carries the same shape but for model-behavior/prompting-technique knowledge rather than platform docs.
- **Session**: one clarification-to-draft flow instance — links a user, a platform, an optional Project, and a sequence of agent-pipeline state transitions (Section 7.2), including its Prompt Strength Score and Critic Agent findings.
- **Project**: name, description, pinned defaults, and a scope key used by Memory and Context Assembly (Section 17.6).
- **MemoryEntry**: a single human-readable preference statement, its scope (global or project), source (agent-proposed vs. user-added), and encrypted content.
- **PromptNode**: a single node within a draft — type, primary value, alternatives with rationale, lock state, ordering position.
- **Prompt**: an ordered set of PromptNodes plus the assembled, platform-serialized final string, its rubric sub-scores (Section 10.1), and its refinement history (Section 10.4); encrypted at rest.
- **LibraryEntry**: a published, reusable node set plus preview/metadata (Section 14.1), including a `source` field distinguishing human-submitted, autonomously-published, and internally-seeded entries.
- **ModelCapabilityRecord**: an entry in the Model Capability Matrix (Section 15.1), sourced from the PKB.
- **ProviderConnection**: a BYOK record — provider type, envelope-encrypted key reference (never the key itself in the primary DB), status, per-connection usage counters (Section 9.4/9.6).
- **AdminUser / Role / AuditLogEntry**: the RBAC and immutable audit trail backing the Admin Control Plane (Section 21).
- **UsageEvent**: metering record (tokens consumed, cost, which pipeline steps ran, which provider connection) — kept separate from prompt *content* so billing/analytics never require decrypting user data.
- **OutcomeSignal**: an anonymized, aggregate-only record (edit count, reuse flag, thumbs up/down, tied to task-type/platform, never to identity) feeding the continuous improvement loop (Section 10.7).

## 19. Security & Privacy Architecture

Your requirement ("only name + email stored directly, everything else end-to-end encrypted") needs one important nuance worked through: pure E2EE and *server-side AI processing* are in tension, since if backend agents need to read prompt content to do their job, the server necessarily touches plaintext at some point. The correct way to reconcile this is **ephemeral, minimal-exposure processing**, not a literal "the server never sees plaintext ever."

### 19.1 Data Classification

- **Plaintext, server-stored**: name, email, account/billing metadata (billing details themselves go through a tokenizing payment processor, not stored raw).
- **Encrypted at rest, client-derived keys**: prompt content, node data, conversation/clarification history, Memory entries, Project data, saved library customizations, BYOK provider key material (envelope-encrypted, distinct key hierarchy from user content — see 19.2), preferences beyond basic account settings.
- **Never persisted at all**: raw prompt content in application logs, analytics events, or error-tracking payloads. Metering and outcome-signal records capture *that* a generation happened, its cost, and coarse quality outcomes — never *what* it said.

### 19.2 End-to-End Encryption Design

Client-side encryption (e.g. AES-GCM via each platform's native crypto APIs) with a per-user **Data Encryption Key (DEK)**. The server only ever stores *wrapped* (encrypted) key material, never the raw DEK. BYOK provider keys use their own envelope-encryption path through a dedicated secrets manager (Section 9.4) — kept separate from the user-content DEK hierarchy since they have different access patterns.

### 19.3 Key Management & Multi-Device Sync

Zero-knowledge multi-device sync (web + extension + macOS all need the same encrypted data) works by wrapping the DEK separately per device using each device's own key pair — the server relays wrapped-key blobs but never possesses a key capable of decrypting them itself. Plan explicit **key recovery UX**: offer a one-time recovery code shown at setup, and be upfront with users about the trade-off.

### 19.4 The Processing-Time Exception (and How to Minimize It)

When an agent pipeline step genuinely needs to read prompt content, the realistic architecture is: **decrypt only in ephemeral memory for the duration of that call, never write the decrypted form to disk or logs, and re-encrypt immediately before persisting.** Prefer sending only the minimum necessary context per call; route through zero-data-retention API agreements where providers offer them; be explicit in your privacy policy about this exact model rather than making an unqualified "we never see your data" claim that wouldn't survive scrutiny.

### 19.5 Threat Model Notes

Minimize metadata leakage, not just content leakage — even "this user prompted platform X at time Y" is sensitive in aggregate. Keep metering/analytics as coarse-grained as the business actually needs.

### 19.6 Compliance

E2EE simplifies data-subject-rights obligations (GDPR/CCPA-style deletion — deleting the encrypted blob is sufficient). Maintain a proper Data Processing Agreement posture with any third-party model providers you route through, since they're data processors even for ephemeral processing.

## 20. Surface-Specific Technical Design

### 20.1 Web Application

The central hub: account management, the standalone node editor, prompt/Project history, the Prompt Library, key/recovery management UI, and BYOK provider connection management. Server-render the public library pages for discoverability; keep the interactive builder client-heavy.

### 20.2 Browser Extension

- Manifest V3, Chromium-first, Firefox as near-term follow-on.
- Overlay UI rendered inside an isolated **Shadow DOM** to avoid CSS/JS collisions with the host page.
- A background service worker mediates all network calls so the content script never directly holds long-lived credentials in a page-exposed context.
- The content script's *only* write action on the host page is filling the detected input field — it never auto-submits.
- Detection selectors live in the server-fetched Platform Registry, not hardcoded in the shipped bundle.

### 20.3 macOS App & SDK

- **The app**: menu-bar-resident, global-hotkey floating overlay, same builder experience system-wide.
- **The SDK**: the core assistant logic exposed as an embeddable package so third-party macOS developers can integrate PromptForge into their own apps — scope this as a distinct, later-phase deliverable (Section 24), not bundled into the initial app build.

Distribution: notarized build, in-app auto-update, Accessibility permission requested with a clear explanation before the system prompt appears.

## 21. Admin Control Plane

A single, highly secured internal surface for full system visibility and management — a genuinely separate application from the consumer-facing surfaces, not a hidden route inside the main app.

### 21.1 Access Architecture

- Fully separate subdomain/deployment from the consumer product, with its own network boundary (not publicly routable without VPN/allowlisting, or at minimum a much stricter auth gate).
- Mandatory strong authentication: SSO plus hardware-key/passkey-based MFA for every admin account — no password-only access, ever.
- Fine-grained **RBAC**: a support-tier admin can view account metadata but not touch encryption key material or the Platform Registry; a security-tier admin can view audit logs but not modify infra config; only a small superadmin tier can touch billing/infra config.
- Full, immutable, append-only **audit logging** of every admin action (who, what, when, before/after state), itself monitored for anomalies.
- Short session lifetimes, IP allowlisting where feasible, and step-up re-authentication before any destructive or highly sensitive action.

### 21.2 Functional Modules

- **Platform Registry management**: add/edit/deprecate platforms, review community "request platform support" submissions.
- **PKB & MPKB management**: ingestion job health, force re-ingestion, review/override low-confidence or flagged knowledge chunks, review strategy-profile updates flagged by the continuous improvement loop (Section 10.7).
- **Agent pipeline observability**: the tracing dashboard from Section 22.3 — per-session traces, cost breakdowns, per-agent error rates, model routing table configuration, Critic Agent flag rates.
- **Model Capability Matrix management**: update/verify specs, pricing, deprecations.
- **Prompt Library moderation**: review both human-submitted and autonomously-proposed templates (Section 14.4), approve/reject/edit.
- **User & billing administration**: account status, plan/quota management, support-tier actions.
- **Provider/BYOK oversight**: aggregate visibility into connected providers system-wide, per-adapter error rates — never raw key values.
- **Security & compliance dashboard**: audit log viewer, anomaly/cost-spike alerts, data-subject request processing queue.
- **Feature flags / rollout controls**: staged rollout per pipeline version, kill-switches per agent role or per provider adapter.

### 21.3 Design Principle: "Secure by Construction," Not Just "Secure by Policy"

The single most important property to build in here: **the admin panel should have no code path capable of decrypting user prompt content, Memory entries, or BYOK keys — by construction, not merely by permission-check.** A permission check can be misconfigured or bypassed by a compromised credential; a missing capability cannot. Concretely: the Admin Control Plane's backend service should not even hold the cryptographic material needed to decrypt user-content DEKs (Section 19.2/19.3) or plaintext BYOK keys (Section 9.4) — those capabilities simply don't exist in that service's code, the same way they're absent from analytics/logging paths. This means even a fully compromised admin credential cannot exfiltrate user prompt content or provider keys, which is a materially stronger and more honestly-marketable security posture than "admins can see everything, but we log it."

### 21.4 What Admins Can and Cannot See

| Data class | Visible in Admin Panel? |
|---|---|
| Account metadata (name, email, plan, billing status) | Yes |
| Usage/cost metering (aggregate, per-session cost, token counts) | Yes |
| Agent pipeline traces (which steps ran, timing, errors, rubric scores — no prompt content) | Yes |
| Platform Registry / PKB / MPKB / Model Capability data | Yes, fully editable |
| Library moderation queue content (candidate templates pending review) | Yes — these are explicitly opted-in/public-bound content, not private data |
| Raw prompt content, Memory entries, Project content | **No — no decryption capability exists in this service** |
| Plaintext BYOK provider keys | **No — revocable only, never retrievable** |

## 22. Backend Infrastructure & Deployment Architecture

### 22.1 Service Breakdown

Start as a **well-modularized monolith** rather than premature microservices — split out independently-scaling pieces (most likely Agent Orchestration and doc-ingestion workers, given their distinct load/cost profiles) once traffic justifies it. Logical modules regardless of physical deployment shape: Auth & Identity, Platform Registry, Knowledge Base (PKB + MPKB ingestion and retrieval), Agent Orchestration, Model Provider Abstraction, Memory Service, Prompt Library, Token/Billing Metering, Encryption/Key Management, and the Admin Control Plane (kept as a genuinely separate deployable per Section 21.1).

This "modular monolith on a managed container platform" pattern isn't the only credible way to hit that goal — Section 23.2 lays out a fully serverless, AWS-native alternative (a single Lambda function behind a Function URL, no container to operate at all) that trades a bit of custom plumbing for an even lower cost floor. Both are legitimate; Section 23.4 gives a direct comparison.

### 22.2 Data Stores

Relational store for core entity metadata (encrypted content fields as opaque blobs); a vector store for the PKB and MPKB; object storage for encrypted blobs and library preview media; an in-memory cache for hot registry/knowledge-base lookups and preview debounce state; a message queue for async ingestion jobs and internal pipeline task handoff.

### 22.3 Scaling & Observability

Invest early in **structured tracing per session** (Section 7.2's transitions, logged with timing, cost, and rubric outcomes per step) — this is what makes "why was this draft bad" and cost-anomaly detection possible, and it directly feeds the Admin Control Plane's observability module (21.2). Put the extension-facing registry/PKB read path behind an edge cache — it's the highest-frequency, most latency-sensitive path in the system.

### 22.4 Cost Control for Token-Based Economics

Per-user rate/budget limits enforced at the Governor layer (Section 16), not just billed after the fact; aggressive retrieval-layer caching; model routing (Section 7.3/9) so only steps that need a strong model use one, including bounding the Critic Agent's refinement loop (Section 10.4) to one or two passes; alerting on per-session cost outliers, since a runaway agent loop is the single biggest financial risk in a multi-agent architecture.

## 23. Recommended Tech Stack

You asked specifically for a stack that's genuinely production-ready **and** keeps billing cost under control — those two goals are compatible if you bias toward managed, pay-as-you-go, scale-to-zero services everywhere, and specifically avoid any component with a large fixed baseline cost until real usage data justifies the upgrade. The single biggest cost lever in the entire system is **not** infrastructure — it's the model-routing and caching discipline in Sections 7.3/16/22.4, since LLM API spend will dwarf infrastructure spend at any realistic early scale. The stack below is chosen so infrastructure stays a small, predictable line item while that discipline does the real cost control.

| Layer | Recommendation | Why this, and why it's cost-conscious |
|---|---|---|
| **Web app** | Next.js (React) + TypeScript, deployed on a platform with a real free/hobby tier and pay-as-you-go scaling (e.g. Vercel) | SSR for the public library pages (SEO), avoids you standing up and paying for your own CDN/edge layer from day one. |
| **Browser extension** | Manifest V3 + React + TypeScript, bundled with Vite | Zero ongoing infra cost — this is a build-tooling choice, not a hosting choice. |
| **macOS app** | Native Swift/SwiftUI | No server cost beyond the one-time Apple Developer Program fee; genuinely native Accessibility API access, which a wrapped web view can't give you cleanly. |
| **Backend/orchestration language** | TypeScript (Node.js, e.g. NestJS) for a solo/small team wanting one language end-to-end; Python (FastAPI) once agent-orchestration complexity grows, given the maturity of Python's agent/RAG tooling ecosystem | One-language-across-the-stack is itself a cost saver early (no context-switching, no need to hire a second specialist); re-evaluate toward Python specifically for the orchestration service as pipeline complexity grows. |
| **Primary database** | Managed Postgres (e.g. Supabase or Neon) | Real free tiers, cheap scaling, and Supabase specifically bundles auth + object storage, reducing the number of separate paid services you operate. |
| **Vector store (PKB + MPKB)** | `pgvector` **inside your existing Postgres instance** to start; migrate to a dedicated vector engine (e.g. Qdrant/Pinecone) only once scale genuinely requires it | One of the biggest realistic early cost-savers available — a dedicated managed vector DB is a real, avoidable line item you don't need at MVP-to-early-growth scale. |
| **Cache** | Serverless, pay-per-request Redis (e.g. Upstash) | Much cheaper than a provisioned Redis instance at the low/spiky traffic profile an early-stage product actually has. |
| **Object storage** | S3-compatible storage with zero egress fees (e.g. Cloudflare R2) | Library preview media and encrypted blobs are read far more than written; egress fees are what actually erode margins on media-heavy products, so this is a deliberate, meaningful choice, not a minor one. |
| **Async jobs/queue** | A lightweight Postgres-backed job queue to start; migrate to a dedicated managed queue only once ingestion volume justifies it | Avoids paying for a separate queue service before you need one. |
| **Edge layer for Registry/PKB reads** | Cloudflare Workers + KV/Cache | This is specifically the highest-frequency read path in the whole system (every extension page-load hits it) — keeping it off your primary compute billing and on a cheap edge tier matters disproportionately. |
| **Auth** | A managed auth provider with MFA/passkey support built in (e.g. Supabase Auth or Clerk) | Building auth/MFA/passkey support yourself is expensive in engineering time, which is a cost too; both have free tiers sufficient for a long early runway. |
| **BYOK/secrets custody** | A dedicated cloud secrets manager (or Vault if you want to stay cloud-agnostic) | The one place *not* to cost-optimize away from a real solution — BYOK key custody (Section 9.4) is a core trust guarantee, not a place to cut corners. |
| **Backend hosting** | A managed container platform with scale-to-zero (e.g. Cloud Run or Fly.io), not a provisioned Kubernetes cluster | Kubernetes' operational overhead and baseline cost is very hard to justify pre-scale; scale-to-zero means you pay close to nothing during low-traffic periods, which matters a great deal pre-revenue. |
| **Observability** | A generously-tiered hosted option or self-hosted open-source stack, not an enterprise observability suite | Needed from day one (Section 22.3), but shouldn't be a top-3 cost line item this early. |
| **Model provider access** | PromptForge's own default provider contract, plus the BYOK path (Section 9) | Your largest *variable* cost by far — this is exactly why the routing/caching/governance sections matter more than any single infra choice on this table. |

**Overall philosophy**: nothing on this list has a meaningful fixed cost floor except the secrets manager and the Apple Developer fee — everything else scales down toward near-zero at low traffic and only starts costing real money once you have real usage to justify it, which is the correct shape for a pre-revenue/early-revenue product. Call this **Path A**. There's a second, more aggressive path worth having on the table.

### 23.1 Path B: Revised — Multi-Platform Zero-Cost Architecture

The original Path B was built entirely on AWS. That was too narrow — AWS's always-free tiers are strong for compute (Lambda) but weaker for storage egress, vector search, and frontend delivery compared to what other platforms offer at the same $0 price. A deeper analysis, checking each PromptForge component against every credible free tier available (not just AWS), produces a better fit: a three-platform split where each platform handles what it's genuinely best at for free.

The three platforms: **Cloudflare** (frontend, object storage, edge caching), **AWS** (backend compute, secrets), and **Supabase** (relational database, vector search, auth). Each is chosen because it solves a specific PromptForge requirement better — or more durably — at $0 than the alternatives.

### 23.2 Path B: Component Mapping (Revised)

| PromptForge component | Service | Free tier (verified July 2026 — confirm before committing) | Why this beats the alternatives |
|---|---|---|---|
| **Web app static hosting** (Section 20.1) | Cloudflare Pages | Unlimited bandwidth, unlimited requests, 500 builds/month, 20,000 files. No expiry. | CloudFront gives 1 TB/month free (generous but finite). Vercel gives 100 GB/month. Pages is literally unlimited — the ceiling does not exist for static delivery. |
| **Encrypted content blobs + library preview media** (Sections 19, 14) | Cloudflare R2 | 10 GB storage, 1M Class A ops, 10M Class B ops per month. **Zero egress fees, ever, on any plan.** | S3 charges for egress after month 12. R2 never charges for egress on any tier. For a product serving library preview media to many users, egress is the cost line that actually matters — R2 eliminates it structurally. |
| **Platform Registry edge cache** (Section 5.1) | Cloudflare KV | 1 GB storage, 100K reads/day, 1K writes/day. | The Platform Registry is the highest-frequency read path in the whole system (every extension page-load). KV is a global, edge-replicated key-value store with sub-millisecond reads — purpose-built for exactly this access pattern. 100K reads/day is ~3M/month, far more than you need for registry lookups. |
| **Agent orchestration backend** (Sections 7, 8, 9) | AWS Lambda + Function URL (Node.js, Hono router) | 1M requests + 400K GB-seconds per month, always free, never expires. Function URLs are free (no API Gateway cost). Native response streaming on Node.js. | Cloudflare Workers free tier caps CPU time at 10ms per invocation — too restrictive for a multi-step agent pipeline that parses, classifies, and assembles nodes even though most wall-clock time is spent waiting on external LLM API calls. Lambda's 400K GB-seconds gives you the headroom the agent pipeline actually needs. Workers' wall-clock time is unlimited (good), but the CPU cap means a complex drafting pass could hit the limit and return a 1102 error to the user — unacceptable for a core product flow. |
| **Live/streaming preview** (Section 12) | Lambda response streaming via Function URL | Supported natively on Node.js runtime. First 6 MB of each response streams at uncapped bandwidth. Free. | A strong technical fit for incremental preview: partial output reaches the client as it's generated, not buffered. This is the same mechanism used by production AI chat interfaces for streaming LLM output, and it's free within the Lambda invocation cost already accounted for above. |
| **Relational database — users, sessions, projects, library metadata, memory entries, node structures** (Section 18) | Supabase (free tier) — Postgres | 500 MB database, unlimited API requests, 60 direct connections, 200 pooler connections. | DynamoDB's 25 GB is more generous on storage, but DynamoDB is NoSQL — every access pattern must be designed up front, adding to developer-side cost (time). Postgres gives you proper foreign keys, joins, and the ability to add a new query pattern with a SQL statement instead of a GSI redesign. 500 MB is tight, but PromptForge's bulk data (encrypted prompt content, library media) lives in R2, not Postgres — Postgres stores only structured metadata, which stays small. |
| **Vector search — PKB and MPKB embeddings** (Sections 6, 10.2) | Supabase pgvector (included free on all plans) | Runs inside the same 500 MB Postgres instance. No separate service, no separate bill. | This is the single biggest improvement over the original Path B. The AWS-only version required either a dedicated vector DB (not free) or in-Lambda brute-force cosine similarity over embeddings loaded into memory (a hack that breaks at scale). pgvector gives you real indexed vector similarity search (`ivfflat` or `hnsw` indexes), co-located with your relational data, at $0. At 1536 dimensions (a common embedding size), each vector is ~6 KB. 5,000 PKB chunks = ~30 MB. Even 50,000 chunks = ~300 MB, fitting well within 500 MB alongside lightweight metadata tables. |
| **Auth — sign-up, sign-in, social OAuth, MFA, JWT issuance** (Sections 19, 21.1) | Supabase Auth (included free) | 50,000 monthly active users. Social OAuth (Google, GitHub, Apple, etc.), anonymous sign-ins, basic MFA included. No expiry. | Cognito's free tier for new user pools was cut from 50K to 10K MAU in late 2024 — Supabase is now 5x more generous for new projects. Supabase Auth also issues standard JWTs verifiable against a public JWKS endpoint, so your Lambda backend validates them the same way it would validate Cognito tokens — one small verification function, not a Cognito-specific SDK dependency. |
| **Async ingestion jobs — PKB/MPKB crawler** (Sections 6.1, 10.2) | Supabase Edge Functions (cron-triggered) or a scheduled Lambda | Supabase: 500K Edge Function invocations/month. Lambda: draws from the same 1M always-free request pool. | The PKB crawler runs on a schedule (weekly per platform), not per user request. Even at 50 registered platforms × 52 weeks × 100 page-fetches per crawl = 260K invocations/year — a rounding error against either free tier. |
| **BYOK provider-key custody** (Section 9.4) | AWS SSM Parameter Store (`SecureString`, KMS-encrypted) | Standard parameters free to store. 20K KMS requests/month free. | BYOK key retrieval happens once per provider call, at low frequency. SSM's throughput ceiling (~40 req/s on standard parameters) is irrelevant at BYOK's naturally low call volume. No Supabase or Cloudflare equivalent offers the same level of envelope-encryption integration at $0. |
| **Admin Control Plane isolation** (Section 21.1) | A second, independent stack: Cloudflare Pages + separate Lambda + Function URL + separate Supabase project | Supabase free tier allows 2 active projects. The second project is the admin backend. | Physical isolation by construction: the admin backend is a separate deployable with no import path into the consumer service's code, separate auth (its own Supabase Auth pool or a restricted admin-only pool), and — per Section 21.3 — no code path capable of decrypting user content DEKs. |

### 23.3 Supabase Free-Tier Pause Risk — The One Real Gotcha, and How to Neutralize It

Supabase free-tier projects pause after 7 days of inactivity. This is the single most commonly cited reason not to run production on Supabase Free, and it's a legitimate concern — a paused project means your database and auth endpoints go offline until manually resumed.

For PromptForge, this is a non-issue in practice, for two independent reasons:

1. **The PKB ingestion crawler itself prevents pausing.** The weekly scheduled crawler (Section 6.1) hits Supabase to upsert PKB chunks. As long as the crawler runs at least once every 7 days — which it does by design, since platform docs are re-checked on a weekly cadence — the project never goes inactive. The thing that keeps Supabase alive is a feature you were already building, not a keep-alive hack.

2. **As a belt-and-suspenders fallback**, a single GitHub Actions workflow (a 5-line YAML file, free on public repos) can ping your Supabase project's health endpoint every 6 days. This takes 10 minutes to set up once and never needs attention again. It's not elegant, but it's a well-documented, widely-used pattern that costs nothing.

If the pause risk still feels uncomfortable: the moment Supabase becomes load-bearing for real users with real expectations, upgrading to Supabase Pro ($25/month) eliminates the pause entirely, adds daily backups, and raises the database to 8 GB. That's a reasonable, planned upgrade — not an emergency — and $25/month is the cost of two coffees a week for a service that replaces a managed Postgres instance, a vector database, and an auth provider simultaneously.

### 23.4 Where This Stack Still Requires Custom Code

"Free" means no infrastructure bill, not no engineering work. These are the pieces you build yourself — all one-time code, not ongoing operational burden:

**1. JWT verification in Lambda (required, ~30 lines)**

Lambda Function URLs don't natively verify Supabase (or any) JWTs. Your Lambda handler fetches Supabase's public JWKS endpoint (cached after first fetch) and verifies the `Authorization` header on every request. This is a single, reusable middleware function — the same code pattern whether you were using Cognito, Auth0, or any other OIDC-compliant issuer.

**2. Per-user rate/budget limiting (required, ~50 lines)**

Neither Function URLs nor Supabase provide built-in per-user rate limiting. A lightweight token-bucket check against a Postgres row (or a DynamoDB counter if you prefer) at the top of the Lambda handler, before any model call happens, covers the Token & Context Governor's per-user budget caps (Section 16). This is evaluated once per request and is cheap.

**3. CORS configuration (required, ~10 lines)**

Function URLs require explicit CORS headers in your Lambda response for the browser extension and web app to call them. Hono (or Express) middleware handles this in a few lines.

**4. Supabase client in Lambda (trivial)**

Your Lambda calls Supabase's REST API (or uses the `@supabase/supabase-js` client) for database reads/writes and pgvector similarity searches. This is a standard SDK integration, not custom infrastructure code.

**Total custom plumbing: ~100–150 lines of code**, written once, in your first sprint.

What you do NOT build (compared to the original all-AWS Path B):
- No in-memory brute-force vector search hack (pgvector handles this properly)
- No DynamoDB single-table design (Postgres with normal tables and foreign keys)
- No Cognito-specific SDK integration (standard JWT verification against any OIDC issuer)
- No custom WAF (Cloudflare's free-tier WAF covers OWASP Top 10 in front of Pages; Lambda rate-limiting covers the API)

### 23.5 Cost Projections at Scale (Revised)

| Milestone | Monthly AWS cost | Monthly Supabase cost | Monthly Cloudflare cost | Total |
|---|---|---|---|---|
| **MVP (1K users)** | $0 (Lambda within free tier) | $0 (free tier, ~20 MB DB) | $0 (Pages + R2 + KV free) | **$0** |
| **5K users** | $0 (still within 1M req + 400K GB-s) | $0 (free tier, ~80 MB DB, ~5K MAU) | $0 | **$0** |
| **10K users** | ~$40 (Lambda overage begins) | $0 (free tier, ~150 MB DB, ~10K MAU) | $0 | **~$40** |
| **20K users** | ~$120 | $25 (upgrade to Pro for reliability — removes pause risk, adds backups, 8 GB DB) | $0 | **~$145** |
| **50K users** | ~$900 | $25 (still Pro, DB ~2 GB) | $0 | **~$925** |

Cloudflare's cost stays at $0 through every milestone because Pages bandwidth is unlimited, R2 egress is always free, and KV's 100K reads/day ceiling is far above Platform Registry lookup volume even at 50K users.

Lambda is the first service to hit paid territory (around 10K users), because the agent orchestration pipeline consumes real compute time per session. This is where the model-routing and caching discipline from Sections 7.3, 16, and 22.4 pays for itself most directly — the difference between a 200ms average Lambda execution (cheap) and a 2s average (expensive) is the difference between $40/month and $400/month at the same user count.

Supabase stays free through ~10K MAU and ~500 MB of metadata. The upgrade to Pro at ~20K users is a planned transition, not a surprise — and at $25/month for managed Postgres + pgvector + auth + realtime, it's the cheapest "real backend" upgrade path available.

### 23.6 Choosing Between Path A and Path B (Revised)

**Path A** (Section 23, the managed-platform table) optimizes for minimal glue code at a small, predictable baseline cost. Every component scales to near-zero at low traffic but has a nonzero floor once traffic exists (e.g. a Cloud Run instance, an Upstash Redis instance). Total at 5K users: maybe $10–30/month. Advantage: less custom code, more platform-managed features.

**Path B** (this revised multi-platform stack) optimizes for a genuinely $0 bill as long as possible, at the cost of ~150 lines of custom plumbing (JWT verification, rate limiting, CORS) written once. Total at 5K users: $0. Total at 10K users: ~$40. Advantage: you literally do not pay for infrastructure until you have proven the product works and have enough users to justify the spend.

The two paths share the same application code — the orchestration pipeline, the agent logic, the node architecture, the Quality Engine. Switching from Path B to Path A later (e.g. moving from Supabase Free to Supabase Pro, or from Lambda to Cloud Run) is a deployment/config change, not a rewrite, because the application code talks to normalized interfaces (a Postgres client, an HTTP router, an S3-compatible API), not to platform-specific primitives.

**The recommendation for PromptForge specifically**: start with Path B. Your actual competitive moat is the Prompt Quality Engine (Section 10), not infrastructure. Every dollar and every hour spent on infrastructure before the Quality Engine is proven is a dollar and hour that could have gone into the thing that actually determines whether the product succeeds. Path B lets you defer all infrastructure spend until the product question is answered — and then, if the answer is yes, you have real usage data to guide which pieces to invest in scaling, rather than guessing.

## 24. Phased Development Roadmap

| Phase | Goal | Key deliverables | Surfaces |
|---|---|---|---|
| **0 — MVP** | Prove the core drafting loop is useful | Manual platform selection, basic node editor, small hand-seeded library, single-pass drafting agent through the Provider Abstraction (Section 9) with one default provider, a first-cut Prompt Quality Rubric and a simple critique pass (Section 10.1/10.4, even before the full MPKB exists), hardcoded platform capability configs, minimal internal ops view | Web only |
| **1 — Grounded, quality-checked drafting** | Prove platform-grounded, quality-checked prompting is meaningfully better than generic | Browser extension with detection for an initial platform set, real PKB with RAG-backed retrieval, the MPKB (Section 10.2) populated for the initial platform/model set, MCQ+free-text clarification, visible Prompt Strength Score (Section 10.5) | Web + Extension |
| **2 — Preview, alternatives & memory basics** | Prove the interactive/adaptive differentiation | Live text preview, optional visual preview, node alternatives with inline rationale, model recommendation engine, session-level Memory (no cross-session persistence yet) | Web + Extension |
| **3 — Trust, reach & personalization** | Scale trust, platform coverage, and adaptation | Full E2EE rollout, macOS app, BYOK provider connectivity (Section 9), full cross-session Memory with user editing (Section 17.3), Projects, community library submissions, the full RBAC'd Admin Control Plane (Section 21), the continuous improvement loop (Section 10.7) live on real usage data | Web + Extension + macOS |
| **4 — Platform play** | Open the ecosystem | Public macOS SDK for third-party developers, Autonomous Curation Agent for library publishing (Section 14.4), community-driven platform registry expansion, enterprise/team features | All + SDK |

Resist building the macOS SDK, autonomous publishing, or the full Admin Control Plane before Phase 0–1 prove the core loop is genuinely useful — each is a meaningful engineering investment that only pays off once there's a validated core product. The Quality Engine (Section 10), by contrast, should never be deferred — even a simplified first-cut rubric and critique pass belongs in the MVP, since it's the thing the whole product's credibility rests on.

## 25. Success Metrics & KPIs

- **Activation**: % of new users completing at least one full drafting flow in their first session.
- **Time-to-first-good-prompt**: median time from opening the assistant to inserting a finalized prompt.
- **Retention**: D7/D30 return usage, especially of the extension.
- **Prompt Strength Score distribution**: the median/percentile spread of scores across real sessions, and how it trends over time as the MPKB and strategy profiles improve (Section 10.7) — this is the most direct, ongoing measure of whether the Quality Engine is actually working.
- **Edit-to-accept ratio**: average number of node edits before a user accepts a draft — trending down over time is a strong signal the closed-loop convergence (Section 10.6) and quality engine are doing their job.
- **Library engagement**: remix rate on library entries, split by source (human-submitted vs. autonomously-published) to track whether autonomous curation is actually producing useful templates.
- **Memory adoption**: % of users who ever view/edit/add a memory entry (a proxy for whether personalization feels trustworthy rather than opaque).
- **Unit economics**: average token cost per completed session, tracked separately for PromptForge-default-provider sessions vs. BYOK sessions, and separately for the Critic Agent's refinement passes so quality-loop cost is visible on its own line.
- **Extension health**: detection success rate per registered platform.
- **BYOK adoption**: % of active users/orgs connecting their own provider key, and their retention relative to default-provider users.

## 26. Key Risks & Mitigations

- **DOM-detection fragility**: third-party platforms redesign without warning. *Mitigation*: server-side registry with automated selector health-checks.
- **Platform ToS exposure**: injecting UI/reading DOM on third-party sites needs care. *Mitigation*: strictly read-side detection, user-initiated-only insertion, per-platform ToS review before registry addition.
- **Cost overrun from the multi-agent pipeline**: many small calls add up unpredictably, and the Critic Agent's refinement loop adds a further pass. *Mitigation*: model routing, caching, hard per-session budget caps, and a strict cap on refinement iterations (Section 10.4).
- **Quality rubric drift or blind spots**: a rubric that looks reasonable on paper may not actually track what real users consider good output. *Mitigation*: the continuous improvement loop (Section 10.7) exists specifically to catch this — outcome signal, not just the rubric's internal logic, ultimately governs what "good" means over time.
- **E2EE vs. server-side AI processing tension**: an unqualified "fully E2EE" claim doesn't survive how AI processing actually works. *Mitigation*: the ephemeral-processing model (Section 19.4), described honestly to users.
- **BYOK key leakage**: user-supplied provider keys are a high-value target. *Mitigation*: dedicated secrets manager, envelope encryption, no plaintext retrieval path anywhere including the Admin Control Plane (Section 9.4/21.4).
- **Provider abstraction drift**: a provider changes its API shape. *Mitigation*: the adapter-per-provider pattern (Section 9.1) isolates the blast radius to a single adapter, not the whole orchestration layer.
- **Autonomous publishing consent/quality risk**: mining sessions for templates without consent would breach your own privacy commitments. *Mitigation*: strict opt-in requirement with no code path around it, generalization + moderation gate before any autonomous publish (Section 14.4).
- **Admin panel as a high-value attack target**: it has broad operational power over the whole system. *Mitigation*: separate deployment boundary, hardware-key MFA, fine-grained RBAC, and the "secure by construction" no-decryption-capability design (Section 21.3).
- **macOS Accessibility permission friction**: a real adoption blocker if mishandled. *Mitigation*: clear onboarding explanation before the system prompt, full graceful degradation without it.
- **Competitive landscape**: generic "prompt helper" tools already exist. *Mitigation*: doc-grounding + an explicit, checkable quality bar + node-based editability + true multi-surface reach + memory/Projects is a materially different and harder-to-replicate value proposition than a standalone prompt-writing chatbot.

## 27. Compliance & Trust Foundations (ISO 27001 / SOC 2 Readiness)

You asked for basic principles that make a future ISO 27001 or SOC 2 audit dramatically easier. The single most important thing to understand: **compliance is far cheaper to build in from day one than to retrofit.** Auditors don't just want a secure system — they want *evidence*, produced continuously, that the system was secure the whole time. A control you can't produce logs for might as well not exist. None of the below slows down early development meaningfully; all of it is expensive to bolt on later. This section is written as principles to design against, not a certification checklist — but it maps directly onto the SOC 2 Trust Services Criteria (Security, Availability, Confidentiality, Processing Integrity, Privacy) and the ISO 27001 Annex A control families.

### 27.1 Foundational Principles

- **Least privilege everywhere.** Every human, every service, every agent gets the minimum access it needs and nothing more. The Admin Control Plane's RBAC (Section 21.1) is one instance of this; it applies equally to inter-service credentials, database roles, and CI/CD deploy keys. Broad "admin does everything" credentials are the first thing an auditor flags.
- **Everything is logged, and logs are immutable.** Every security-relevant event — auth attempts, admin actions, permission changes, data access, key operations, BYOK key use — writes to an append-only audit trail (already required for admin actions in Section 21.1; extend the same discipline system-wide). Immutability is the point: a log an insider can edit is not evidence.
- **Data is classified, and each class has a defined handling rule.** Section 19.1 already does this (plaintext / encrypted / never-persisted). Formalizing it into a written data-classification policy is one of the earliest, easiest SOC 2 artifacts to produce.
- **Encryption in transit and at rest is universal, not selective.** TLS everywhere (automatic on the Path B stack), encryption at rest on every store (one-click on Supabase/R2). No plaintext-anywhere exceptions except the deliberately-scoped ephemeral processing window (Section 19.4), which is documented rather than hidden.
- **Change is controlled and traceable.** Every production change goes through version control and a reviewable pipeline (Section 27.3). "Who deployed what, when, and who approved it" must be answerable for any change, ever.
- **Vendors are assessed, not assumed.** Every third party in the data path (model providers, Supabase, Cloudflare, AWS) is a subprocessor. Maintain a subprocessor register with each one's own compliance posture (all of the named platforms hold SOC 2 / ISO certifications — inheriting their certified controls is a major reason this stack is audit-friendly) and a Data Processing Agreement on file.
- **Incidents have a defined response, rehearsed before they're needed.** A written incident-response plan (detect → contain → eradicate → recover → post-mortem → notify) with defined roles and breach-notification timelines. Auditors ask to see it; regulators (GDPR's 72-hour breach notification) require it.

### 27.2 Access Control & Identity Discipline

- Enforce MFA on every account with any production access, human or machine-adjacent — not just admins.
- Provision and, critically, **de-provision** access through a documented process. Orphaned credentials of former contributors are a classic audit failure.
- Review access grants on a fixed cadence (quarterly is standard) and log the review itself as evidence.
- Separate duties where it matters: the person who writes a deployment shouldn't be the sole approver of it; the person who can read audit logs shouldn't be able to alter them.

### 27.3 Secure Development Lifecycle (SDLC)

- All code in version control, all production changes via pull request with at least one independent review.
- Automated dependency vulnerability scanning (e.g. `npm audit`, Dependabot, or equivalent) in CI, with a defined policy for how fast criticals get patched.
- Static analysis / secret-scanning in the pipeline so credentials never reach a repo (a leaked BYOK-adjacent key is exactly the kind of finding that ends a SOC 2 report).
- Separate development, staging, and production environments with no production data in lower environments (or properly anonymized if unavoidable).
- Infrastructure-as-code (already recommended, Section 23) is itself a compliance win: it makes your entire environment reviewable, versioned, and reproducible — auditors love this.

### 27.4 Data Governance & Privacy Operations

- **Data retention policy**: define how long each data class lives and enforce automated deletion. Keeping data forever "just in case" is a liability, not an asset, under both SOC 2 and GDPR.
- **Data subject rights**, already simplified by E2EE (Section 19.6): a documented, ideally self-service flow for access / export / deletion requests, with the deletion path proven to actually remove data (deleting the encrypted blob suffices).
- **Data residency awareness**: know which region each data class lives in. If you later target EU customers seriously, being able to pin data to EU regions (all three platforms support this) becomes a sales requirement, not just a compliance one.
- **Privacy by design as the default**, not a setting: the whole "nothing beyond name/email exposed by default" posture (Section 19) *is* privacy-by-design, which is exactly what GDPR Article 25 asks for. Keep new features honest to it.

### 27.5 Availability & Resilience

- Automated backups with a *tested* restore path (an untested backup is a hope, not a control). Note the Supabase free-tier caveat: no backups on free (Section 23.3) — this is a concrete reason the Pro upgrade is a compliance milestone, not just a scaling one.
- Defined RTO/RPO (recovery time / recovery point objectives) even if modest early on — having *a number* you designed toward is what matters to an auditor.
- Basic uptime monitoring and alerting, with an incident log that doubles as availability evidence.

### 27.6 Pragmatic Sequencing (What To Do When)

Don't pursue certification prematurely — it's a distraction pre-product-market-fit. But build the *habits and artifacts* from the start, because they're nearly free early and brutally expensive to reconstruct later:

- **Now (MVP)**: universal logging + immutable audit trail, least-privilege access, encryption everywhere, IaC, PR-based change control, secret-scanning. All of this is just "good engineering" and costs almost nothing at greenfield stage.
- **Early traction**: written policies (data classification, retention, incident response, access review), subprocessor register + DPAs, formalized on/off-boarding.
- **When enterprise deals demand it**: pursue SOC 2 Type I (point-in-time), then Type II (sustained over 3–12 months — which is why the logging discipline from day one matters: Type II audits your *history*), then ISO 27001 if selling internationally. Enterprise buyers will ask for these before signing; having the groundwork already laid turns a 12-month scramble into a 3-month formality.

## 28. Product & Market Refinements

Reviewing the full product as a startup rather than an architecture, several things stood out as genuinely important for market success that the spec either underweighted or missed. These are changes I'd make to improve the product's odds, not just its engineering.

### 28.1 The Cold-Start & Time-to-Value Problem

The single biggest adoption risk isn't technical — it's that a new user's *first* experience must deliver value in under a minute, or they leave. The current flow (detect platform → clarify → draft) is sound, but the first-run experience needs deliberate design: a new user should be able to get one genuinely great prompt *before* signing up, before connecting anything, before understanding what "nodes" are. **Recommendation**: a zero-friction "try it now" path on the web app and extension — one example task, one great result, visible strength score — with account creation deferred until *after* the user has felt the value. Gating value behind signup is the most common way products like this die.

### 28.2 Monetization Must Be Designed In, Not Bolted On

The spec is architecturally excellent but says almost nothing about how this makes money — a fatal omission for a startup. The token-metered economics (Section 16) imply the mechanism but not the model. **Recommendation**: a freemium structure where the free tier is genuinely useful (a capped number of drafts/month, core platforms, personal library) and paid tiers unlock volume, all platforms, Projects, team features, and BYOK (BYOK is a natural paid feature — the user saves on generation cost, you charge for the product layer). The key principle: the free tier must be good enough to build habit and word-of-mouth, and the paywall must sit at *intensity of use*, not at *basic usefulness*. Price against the value delivered (better AI output, saved time) not against your token cost.

### 28.3 Onboarding as a Teaching Moment

Because a core differentiator is that PromptForge makes users *better at prompting* (Section 10.5), onboarding should lean into this explicitly — the first few sessions can surface slightly more "why this works" detail, then taper as the user gains skill. This turns onboarding from a chore into the product's value proposition in miniature, and it's a strong retention and referral driver ("this tool actually taught me something").

### 28.4 Trust & Transparency as Marketable Features

The security/privacy architecture (Sections 19, 21, 27) is a genuine competitive advantage in a market where users are increasingly wary of where their data goes — but only if they know about it. **Recommendation**: make the privacy posture user-visible and marketable — a plain-language trust page, the E2EE and "we can't read your prompts" guarantees stated prominently, the strength-score transparency framed as "no black box." For a tool handling potentially sensitive prompt content (business strategy, personal writing, proprietary ideas), "your prompts are yours" is a real wedge against bigger, less privacy-focused competitors.

### 28.5 Feedback Loops the User Can See

The continuous-improvement loop (Section 10.7) is internally powerful but invisible to users. Surfacing a lightweight version of it — "your prompts have improved 15% in strength this month," "you've saved an estimated X hours" — closes a motivational loop that drives retention. People stay with tools that visibly make them better.

### 28.6 A Realistic Take on the macOS SDK

The macOS SDK (Section 20.3) is architecturally interesting but, as a market bet, it's the weakest item in the roadmap — third-party developers embedding your assistant is a platform play that only makes sense after you have a proven, in-demand product. **Recommendation**: keep it as a stated long-term vision but be honest that it's speculative, and don't let it consume engineering attention until the core product has clear traction. The browser extension is where the real early adoption lives; that's where disproportionate effort should go.

### 28.7 Collaboration & Teams as a Growth Vector

The spec is heavily single-user. The Projects concept (Section 17.6) is a natural foundation for team features — shared Projects, shared libraries, team-standardized prompt templates — which is both a strong monetization lever (teams pay more readily than individuals) and a built-in growth mechanism (one user brings their whole team). **Recommendation**: design Projects from the start with an eventual multi-user model in mind, even if the first version is single-user, so team collaboration is an extension rather than a rebuild.

## 29. Additional High-Value Features & Loophole Remediation

Going through the product end to end, these are features that would meaningfully strengthen it, and gaps that could undermine it if left unaddressed.

### 29.1 Prompt Versioning & History

Users iterate on prompts, and they will want to return to an earlier version that worked better. A lightweight version history per saved prompt (and per Project) — "restore this earlier draft," "see what changed" — is a small feature with outsized user value, and it costs little given the node architecture already makes prompts diff-able. This also supports the compliance change-traceability principle (Section 27) for the user's own content.

### 29.2 Prompt Performance Feedback (Closing the Real Loop)

Here is the product's most important missing piece: **PromptForge drafts a prompt, but never learns whether the prompt actually produced a good result on the target platform.** The whole system optimizes against a *predicted* quality rubric (Section 10.1), not *actual* outcomes. This is a real loophole in the core value proposition. **Recommendation**: add an optional, lightweight feedback mechanism — after a user runs a drafted prompt on the target platform, let them signal "this worked / this didn't / here's what was off." Even sparse, opt-in signal here is gold: it's the difference between a system that *thinks* it writes good prompts and one that *knows* it does, and it feeds the continuous-improvement loop (Section 10.7) with ground truth instead of proxy metrics. This single addition materially strengthens the product's central claim.

### 29.3 Safety, Abuse & Responsible-Use Guardrails

A significant loophole: a tool that generates optimized, platform-specific prompts can be used to generate *effective harmful* prompts (jailbreaks, disinformation at scale, harassment, prompts designed to extract unsafe content from target platforms). The spec has no content-safety layer, which is both an ethical gap and a real business/legal/reputational risk. **Recommendation**: a content-safety check in the pipeline (a lightweight classification step before drafting and before library publishing) that declines to optimize prompts clearly intended for abuse, plus clear acceptable-use terms. This isn't about policing benign creativity — it's about not building a machine that makes harmful AI use *easier and more effective*, which is exactly what an un-guardrailed prompt-optimizer would be. This also protects your relationships with the target platforms whose users you're serving.

### 29.4 Platform Terms-of-Service & Relationship Risk

A structural risk the spec underweights: PromptForge's browser extension injects UI and reads the DOM of third-party platforms (ChatGPT, Gemini, etc.) that may not welcome a tool sitting on top of their product — and your model-recommendation feature (Section 15) explicitly steers users between competing platforms. This could provoke ToS enforcement or hostile technical countermeasures (DOM changes designed to break you). **Recommendation**: treat this as a first-class strategic risk — review each platform's ToS before adding it (already noted in Section 26, but elevate it), keep the extension strictly read-and-fill (never automate the platform, already the design), and have a contingency: the standalone web app must remain fully functional without the extension, so your product survives even if a platform actively blocks the overlay. Don't let the extension be a single point of failure for the whole business.

### 29.5 Accessibility (a11y)

Not mentioned anywhere, and it should be — both because it's the right thing to do and because accessibility is increasingly a legal requirement and an enterprise-procurement checkbox. The node editor, MCQ flows, and previews should meet WCAG standards (keyboard navigation, screen-reader support, sufficient contrast). Building this in from the start is far cheaper than retrofitting, and it widens your addressable market.

### 29.6 Internationalization & Multilingual Prompting

The spec is implicitly English-first. But prompting is a global need, and non-English prompting has its own platform-specific quirks (some models handle certain languages far better with specific phrasing). Designing the UI and — more importantly — the Prompt Quality Engine to be language-aware from the start is a meaningful market expander, especially outside the crowded English-language AI-tools space. Even if you launch English-only, don't hardcode assumptions that make multilingual support a rewrite later.

### 29.7 Offline & Degraded-Mode Behavior

What happens when the backend is unreachable, a model provider is down, or a rate limit is hit? The spec assumes the happy path. **Recommendation**: define graceful degradation — cached platform data for offline detection, clear user-facing messaging when generation is unavailable, and a fallback to a simpler local prompt-improvement pass when the full pipeline can't run. Reliability perception is a retention factor; a tool that fails opaquely loses trust fast.

### 29.8 Export, Portability & Anti-Lock-In

Let users export their prompts, libraries, and Projects in an open format. Counterintuitively, making it *easy to leave* builds trust and is itself a selling point ("your work is portable, not trapped"), and it aligns with the data-portability principles in Section 27.4. It's a small feature that signals confidence and respects the user.

### 29.9 A Note on the Central Product Risk

Stepping back: the deepest risk to this product isn't any single feature — it's that the target AI platforms could build "good enough" prompt assistance directly into their own products, eroding the need for a third-party layer. The defensibility has to come from the things a single-platform incumbent *structurally won't* do: being cross-platform and platform-neutral (recommending the best tool even when it's a competitor's), being privacy-first in a way ad-supported incumbents won't match, and compounding a proprietary dataset of real prompt-outcome signal (Section 29.2) that no single platform can replicate. Everything in Sections 28–29 that strengthens those three moats is worth more than any individual feature — build toward the moats, not just the feature list.

## 31. Build Plan & Development Workflow — Step-by-Step Execution

Starting without code means beginning with the things code can't change: the design, the data flow, the definitions, the workflows. This section maps the precise sequence to get from zero to a working MVP, deliberately deferring code until the thinking is done. Each step is listed with its specific deliverable and success criteria.

### 31.1 Phase 0: Foundation & Design (Weeks 1–2, Zero Code)

**Step 1: Finalize the Prompt Quality Rubric (Section 10.1)**

Output: A single, versioned document listing the eight rubric dimensions (specificity, unambiguity, non-conflict, platform-fit, constraint-completeness, format-determinacy, context-efficiency, technique-fit), with a definition and scored examples for each. Example: "Specificity: Does every node have a concrete value, not a placeholder? Score 1 = 'make an image', Score 3 = 'a chestnut horse mid-gallop, dust trailing, golden-hour lighting, cinematic wide shot.'")

Success criteria: A new person can read this and reliably score a prompt the same way you would. No ambiguity. Reviewable by a non-technical person.

**Step 2: Map the Platform Registry (Section 5.1)**

Output: A CSV or JSON file listing each supported platform (launch with 3–5): platform_id, display name, modalities (image/video/chat/code), URL patterns for detection, link to official docs, known quirks, prompt-syntax rules, practical prompt-length ceiling. This is the configuration that will live in your database later, but start it as a flat file.

Example entry:
```
platform_id: google_gemini
display_name: Google Gemini
modalities: text,image,video
url_pattern: gemini.google.com
docs_url: https://ai.google.dev/docs
quirk: Negative prompts are ignored in image generation
syntax_rule: Separate style and subject with commas
max_prompt_tokens: 4000
```

Success criteria: Every supported platform has an entry. A developer can read this and understand how to detect it and what constraints to respect.

**Step 3: Define the Clarification Question Taxonomy (Section 11)**

Output: A decision tree or matrix. For each platform + modality combo, what questions are asked, in what order? Which are MCQ (and what are the options)? Which are free text?

Example:
```
Platform: Gemini, Modality: text_to_image
Question 1: "What's the main subject?" [free text]
Question 2: "Visual style?" [MCQ: photorealistic, illustration, 3d_render, abstract, watercolor, oil_painting]
Question 3: "Setting or environment?" [free text with optional MCQ: indoor, outdoor, fantasy, sci_fi]
Question 4: "Composition?" [MCQ: close_up, wide_shot, medium_shot, overhead, low_angle]
```

Success criteria: A designer (not a coder) can hand this to a frontend person and they can build the MCQ/input flows without needing to call you for clarification.

**Step 4: Sketch the Memory & Project Data Model (Section 17)**

Output: A plain-text representation of what gets stored about a user. Format: human-readable field descriptions, not database schema yet.

```
USER:
  - name (plaintext)
  - email (plaintext)
  - created_at (timestamp)

MEMORY_ENTRY:
  - user_id
  - scope (global or project_id)
  - statement (e.g., "prefers photorealistic style")
  - source (agent_proposed or user_added)
  - created_at
  - user_approved (boolean)

PROJECT:
  - user_id
  - name
  - description
  - default_platform (optional)
  - pinned_style_node (optional)
  - created_at

PROMPT:
  - user_id
  - project_id (optional)
  - platform_id
  - nodes (ordered list of {type, value, alternatives, lock_state})
  - strength_score (numeric)
  - created_at
  - user_feedback (optional: worked/didn't_work/mixed)
```

Success criteria: A non-coder can understand what data the system tracks and why. No schema, just intent.

**Step 5: Define the Admin Roles & Permissions Matrix (Section 21)**

Output: A table mapping each admin role (support, security, infra, superadmin) to what they can and cannot see/do.

```
Role: Support
- Can: View user account status, quotas, support history
- Cannot: View encrypted prompts, see API keys, modify platform registry

Role: Security
- Can: View audit logs, access vulnerability reports, trigger security reviews
- Cannot: Decrypt user data, modify BYOK keys

Role: Infra
- Can: Deploy code, manage infrastructure, update feature flags
- Cannot: View user data, approve security policy changes
```

Success criteria: Each role's boundaries are clear, and "secure by construction" is evident — e.g. support can't see plaintext prompts because the role definition doesn't list it, not because a permission check was added.

### 31.2 Phase 1: Rough Infrastructure & Integration Tests (Weeks 3–4, Minimal Code)

**Step 6: Set up the Development Stack (Path B, Section 23)**

Deliverable: A working deployment pipeline, not a feature yet.

- Git repo created.
- GitHub Actions or equivalent CI configured to lint, secret-scan, run (empty) test suite, deploy to staging.
- Staging environment: Supabase free-tier project + Cloudflare Pages + Lambda Function URL all deployed, all talking to each other over HTTPS.
- Local development environment: Node.js, `npm`, a local `.env.example` file showing required secrets (all stubbed/empty).

No application code yet — just the infrastructure plumbing and a "hello world" Lambda that returns `{ ok: true }`.

Success criteria: A fresh clone of the repo, one `npm run dev` command, and a developer can hit the staging Lambda endpoint and see the response. Deployment takes <2 minutes.

**Step 7: Implement Authentication (Supabase Auth)**

Deliverable: A working login/signup flow.

- Frontend: A simple React page with email/password signup and login forms (copy-paste from Supabase docs, no custom styling yet).
- Lambda: A middleware function that validates JWT tokens from incoming requests.
- Test: A human can sign up, get a JWT, use that JWT to call a protected Lambda endpoint, and the identity is correctly verified.

Success criteria: The auth flow works end to end. A test user can sign up, sign out, sign in again. JWTs are valid and verified.

**Step 8: Implement Core Data Schema (Supabase Postgres)**

Deliverable: Database tables created, migrations set up.

- Create tables: `users`, `projects`, `prompts`, `prompt_nodes`, `memory_entries`, `sessions`.
- Add indexes on frequently-queried columns (`user_id`, `project_id`, `platform_id`).
- Write migration files (Supabase handles these) so schema can be version-controlled.
- Seed a test user with a test project and a few test prompts.

Success criteria: You can query the database directly (via Supabase's admin interface) and see the seeded data. A Lambda function can write and read from the schema without errors.

**Step 9: Implement Core API Routes (Hono Router in Lambda)**

Deliverable: A basic router structure with stubs for every route the spec needs.

- POST `/auth/signup` — calls Supabase Auth
- POST `/auth/login` — calls Supabase Auth
- GET `/projects` — returns user's projects (will be empty, but the route exists)
- POST `/projects` — creates a new project
- POST `/draft` — the main drafting endpoint (will be stubbed for now)
- GET `/library` — lists library entries (stubbed)
- POST `/feedback` — accepts user feedback on a prompt (stubbed)

Each route has a signature and an auth check; the business logic is `{ status: 'not_implemented_yet' }`.

Success criteria: An API client (curl, Postman, or a simple frontend form) can call any route and get a sensible response (authenticated or 401). Routes are all listed in a single router file with clear comments.

### 31.3 Phase 2: Guardrails & Agent Pipeline (Weeks 5–8, Core Logic)

**Step 10: Implement Content Safety Classifier (Section 33.2)**

Deliverable: A function that checks if a prompt is attempting to do something harmful.

- Model: Use a lightweight text classifier (can be a simple LLM call to a small model, or a hardcoded keyword-based classifier for MVP).
- Input: a draft prompt.
- Output: { safe: boolean, reason?: string, flagged_content: string[] }
- Examples of flagged content: jailbreak patterns, explicit instructions for harm, disinformation templates, explicit hate speech, child exploitation material references.

Test harness: A small set of test cases (both safe and unsafe prompts) that the classifier should categorize correctly.

Success criteria: The classifier correctly identifies at least 90% of clearly harmful prompts in a test set, and has <5% false-positive rate on benign creative prompts.

**Step 11: Implement the Supervisor/Planner State Machine (Section 7.2)**

Deliverable: The orchestration engine that sequences agents.

- Create a state machine with states: `context_resolved → intent_classified → docs_retrieved → clarifying → drafting → critiqued → alternatives_attached → governed → ready_for_review`.
- Implement transitions explicitly — each is logged.
- Create a `Supervisor` class that owns the state machine and decides which agent runs next.
- Stub each agent with `{ status: 'agent_placeholder', input, output: {} }`.

Success criteria: You can trace a single request through the full state machine. Every state transition is logged with input/output.

**Step 12: Implement Intent Classification Agent (Section 7.1)**

Deliverable: A working agent that understands what the user is asking for.

- Input: raw user idea (e.g., "create an image of a horse running").
- Output: `{ task_type, entities: {subject, action, ...}, platform_id, confidence_score }`.
- Implementation: Call a model (Claude, GPT, etc. via the Provider Abstraction) with a prompt that asks it to classify the input.

Test: "create an image of a horse running" → `{ task_type: 'text_to_image', entities: { subject: 'horse', action: 'running' }, platform_id: 'google_gemini', confidence: 0.95 }`.

Success criteria: The agent correctly classifies 10 example inputs. Confidence scores are reasonable.

**Step 13: Implement Doc Retrieval Agent (Section 6)**

Deliverable: RAG-backed retrieval from the PKB and MPKB.

- For MVP: Populate Supabase with a small set of manually-curated PKB chunks (e.g., 10–20 chunks per platform with known syntax rules, capability limits, quirks).
- Implement a `retrieve` function that takes a query and returns the top K matching chunks using pgvector similarity search.
- The agent calls `retrieve` and passes the results downstream.

Test: Query "Gemini image generation constraints" → returns 3–5 relevant chunks about aspect ratios, token limits, style compatibility.

Success criteria: Retrieval returns relevant results. Vector similarity search is working.

**Step 14: Implement Clarifying Question Agent (Section 11)**

Deliverable: An agent that generates follow-up questions.

- Input: task type, extracted entities, platform quirks (from PKB).
- Output: `{ questions: [{ text, type: 'mcq' | 'free_text', options?: [...] }] }`.
- Implementation: Use a model to generate questions in a structured format.

Test: For a text_to_image task on Gemini with subject="horse", action="running", the agent generates questions about style, environment, composition.

Success criteria: Generated questions are sensible and match the taxonomy from Step 3.

**Step 15: Implement Drafting Agent (Section 7.1, 10.3)**

Deliverable: The core drafting pipeline that produces the node-based prompt.

- Input: clarified node values, PKB data, platform syntax rules, strategy profile for the task type.
- Output: An ordered set of nodes with primary values and 2–4 alternatives each.
- Implementation: Call a model with the strategy profile's prompt template, have it generate the nodes, parse the response into structured data.

Test: Input (horse, running, photorealistic, wide-shot) → Output: nodes for Subject, Action, Style, Composition, Lighting with filled values and alternatives.

Success criteria: Generated prompts are well-structured. Alternatives are sensible.

**Step 16: Implement Critic Agent & Rubric Scoring (Section 10.4, 10.5)**

Deliverable: A quality check that scores drafts and triggers refinement.

- Input: a draft prompt (as a set of nodes).
- Output: `{ rubric_scores: {specificity: 3, unambiguity: 3, non_conflict: 3, ...}, overall_strength: 0–100, issues: [], needs_refinement: boolean }`.
- Implementation: A function (can be model-based or heuristic) that checks each rubric dimension.

Test: A vague draft ("make a nice image") → scores low on specificity. A well-formed draft → scores high across all dimensions.

Success criteria: Strength scores are consistent and defensible. Issues are specific and actionable.

**Step 17: Implement Response Shaping (Section 8, Layer 6)**

Deliverable: Converting raw nodes into the user-facing prompt structure.

- Input: nodes, strength scores, rubric findings.
- Output: User-facing prompt object with nodes, alternatives, inline rationale for each choice, strength score.

Test: Raw nodes → user-facing JSON/UI representation that shows the prompt, its strength score, and "why this works" explanations.

Success criteria: Output is what the frontend expects to render.

**Step 18: Implement the Token & Context Governor (Section 16)**

Deliverable: Deterministic cost and length checks.

- Input: assembled prompt.
- Output: `{ token_count, estimated_cost, exceeds_budget: boolean, exceeds_platform_length: boolean, suggestions: [...] }`.
- Implementation: Use actual tokenizers (Supabase can call external APIs or you use a lightweight JS tokenizer library).

Test: A 5000-token prompt on a platform with a 4000-token limit → flagged.

Success criteria: Token counts are accurate. Budget checks work.

**Step 19: Implement Memory Extraction Agent (Section 17.2)**

Deliverable: An agent that proposes user preferences to remember.

- Input: a completed session (user idea, clarifications, final prompt, platform).
- Output: `{ preferences: [{ statement: '...', confidence: 0.8 }] }`.
- Implementation: Model-based extraction; propose preferences that are durable and reusable.

Test: A session with multiple image-generation prompts → extracts "prefers photorealistic style".

Success criteria: Extracted preferences are sensible and wouldn't be surprising to the user.

**Step 20: Wire it all together in the `/draft` endpoint**

Deliverable: The full pipeline runs end to end.

- A user submits a raw idea via the `/draft` endpoint.
- The Supervisor orchestrates: detect platform → classify intent → retrieve docs → generate clarifying questions.
- User answers are POSTed as clarifications.
- Supervisor orchestrates: draft → critique → shape → govern.
- Final result is returned to the frontend.

Test: An end-to-end flow from raw idea to final prompt, with all 11 agents firing in sequence.

Success criteria: A user can get a complete, well-scored prompt in one session. No errors or stalls in the pipeline.

### 31.4 Phase 3: Production Hardening (Weeks 9–12, Quality & Scale)

**Step 21: Implement Logging & Observability (Section 27.3)**

Deliverable: Every meaningful event is logged immutably.

- Structured logging: every agent step, every API call, every user action, every content-safety decision, every error.
- Immutable log store: logs go to a separate, append-only table that admins cannot modify.
- Log fields: timestamp, user_id, action, status (success/failure), cost, details.

Test: Query logs for a specific session and see the full trace.

Success criteria: Logs are complete enough that an engineer or auditor can reconstruct exactly what happened in any session.

**Step 22: Implement Rate Limiting & Budget Enforcement (Section 16)**

Deliverable: Per-user token budget enforcement.

- On every `/draft` call, check the user's remaining monthly token budget.
- If they've exceeded it, return 429 and a message.
- Track per-session token spend accurately.

Test: A user with a 10K-token-per-month free tier tries to draft a prompt that would cost 11K tokens → rejected.

Success criteria: Budget enforcement works. Users see clear messaging about limits.

**Step 23: Implement Error Handling & Graceful Degradation (Section 29.7)**

Deliverable: The system doesn't crash or expose errors to users.

- Try/catch around every external call (model APIs, Supabase, etc.).
- Clear error messages shown to users.
- Fallback behavior when an agent fails (e.g., if the Critic Agent fails, use a simpler heuristic scoring; if drafting fails, return a template-based prompt).
- Monitoring alerts if error rate spikes.

Test: Simulate a model provider outage; the system degrades gracefully and tells the user "generation unavailable, try again later."

Success criteria: No unhandled exceptions. Users see helpful error messages. System stays up even during partial outages.

**Step 24: Implement Prompt Versioning & History (Section 29.1)**

Deliverable: Users can see and restore earlier versions of prompts.

- When a prompt is edited, save the previous version.
- Show a version history view listing all edits.
- "Restore to this version" button works.

Test: Edit a prompt 3 times, then restore to version 1; the earlier version is restored correctly.

Success criteria: Version history works correctly. Auditors can see the chain of changes.

**Step 25: Implement Prompt Performance Feedback Loop (Section 29.2)**

Deliverable: Users can signal whether a prompt worked.

- After inserting a prompt, offer a follow-up: "Did this work?" → Yes/No/Mixed with optional detail.
- Store this feedback.
- Aggregate feedback across users to identify prompts that consistently fail or excel.

Test: Collect feedback on 50 drafts; correlate high/low scores with rubric dimensions to validate the rubric.

Success criteria: Feedback is collected, stored, and used to validate/improve the rubric.

**Step 26: Set up CI/CD, Testing, and Deployment (Section 27.3)**

Deliverable: A fully automated, safe deploy pipeline.

- Every PR triggers: linting, unit tests, integration tests, secret scanning.
- Staging environment is always up to date with `main`.
- `npm run deploy:staging` and `npm run deploy:prod` are one-command deploys.
- Rollback is easy (previous version is just one deploy away).

Test: Make a code change, push to a branch, see CI pass, merge, see it auto-deploy to staging, then manually promote to prod.

Success criteria: A developer can deploy confidently. Rollback is instant. No manual steps in the deploy process.

**Step 27: Load Testing & Performance Tuning**

Deliverable: The system handles realistic load.

- Use a load-testing tool (e.g., k6 or Artillery) to simulate 100 concurrent users, each making a `/draft` request.
- Measure latency, error rate, and cost (tokens per request).
- Identify bottlenecks (e.g., slow pgvector queries, expensive model calls).
- Optimize: add caching, batch requests, use cheaper models for non-critical steps.

Test: 100 concurrent requests → p50 latency <2s, p99 <5s, zero errors.

Success criteria: The system handles 100 concurrent users without degradation.

**Step 28: Security Audit & Penetration Testing (Section 27)**

Deliverable: Third-party verification that the system is actually secure.

- Hire or consult a security professional to review the code and architecture for common vulnerabilities.
- Test: Can they extract a BYOK key? Can they access another user's encrypted prompts? Can they escalate to admin?
- Fix any findings before launch.

Success criteria: No critical or high-severity findings. Medium/low findings are documented and tracked.

### 31.5 Success Criteria for the Build

At the end of this sequence (≈12 weeks), you should have:

1. A working MVP that drafts prompts and scores them.
2. Full E2EE for prompt content.
3. Content-safety guardrails blocking harmful prompts.
4. Multi-user support, projects, memory, and feedback collection.
5. Logging and audit trails sufficient for future compliance.
6. A clean, modular codebase that new developers can understand and extend.
7. Automated testing and deployment.
8. Evidence (from load testing and user feedback) that the product works and is scalable.

## 32. Code Quality & Production Readiness Standards

You asked for clean code that allows easy updates and production readiness. This section defines the standards upfront so you're not retrofitting them later — they cost almost nothing to maintain if built in from day one, but are expensive to retrofit.

### 32.1 Code Organization (Modular, Not Monolithic)

PromptForge backend lives in a single Lambda, but *internally* it's rigorously modular to prevent it from becoming a spaghetti ball that's hard to change.

**Folder structure:**
```
backend/
├── src/
│   ├── agents/               # Each agent is a class
│   │   ├── IntentClassificationAgent.ts
│   │   ├── DocRetrievalAgent.ts
│   │   ├── DraftingAgent.ts
│   │   ├── CriticAgent.ts
│   │   ├── MemoryExtractionAgent.ts
│   │   └── index.ts          # Re-exports
│   ├── guardrails/           # Safety & validation
│   │   ├── ContentSafetyClassifier.ts
│   │   ├── TokenGovernor.ts
│   │   ├── InputValidator.ts
│   │   └── index.ts
│   ├── services/             # Business logic, no HTTP
│   │   ├── PromptService.ts      # Orchestrates agents
│   │   ├── PlatformService.ts    # Platform registry
│   │   ├── PKBService.ts         # Knowledge base queries
│   │   ├── UserService.ts        # User/auth operations
│   │   └── index.ts
│   ├── handlers/             # HTTP entry points only
│   │   ├── draft.ts
│   │   ├── feedback.ts
│   │   ├── auth.ts
│   │   ├── projects.ts
│   │   └── index.ts          # All handlers exported
│   ├── middleware/           # Cross-cutting concerns
│   │   ├── auth.ts           # JWT verification
│   │   ├── logging.ts        # Request/response logging
│   │   ├── errorHandler.ts
│   │   ├── rateLimit.ts
│   │   └── index.ts
│   ├── types/                # TypeScript interfaces (SoT)
│   │   ├── Agent.ts
│   │   ├── Prompt.ts
│   │   ├── User.ts
│   │   ├── Platform.ts
│   │   └── index.ts          # All types exported
│   ├── utils/                # Pure functions
│   │   ├── tokenizer.ts
│   │   ├── cosine-similarity.ts
│   │   ├── logger.ts
│   │   └── index.ts
│   ├── config/               # Environment & settings
│   │   ├── env.ts            # Load & validate ENV vars
│   │   ├── platforms.ts      # Platform registry (imported from external source)
│   │   └── index.ts
│   └── index.ts              # Lambda handler entry
├── tests/
│   ├── agents/
│   │   ├── IntentClassificationAgent.test.ts
│   │   └── ...
│   ├── services/
│   │   ├── PromptService.test.ts
│   │   └── ...
│   ├── handlers/
│   │   ├── draft.test.ts
│   │   └── ...
│   ├── guardrails/
│   │   ├── ContentSafetyClassifier.test.ts
│   │   └── ...
│   └── integration/
│       ├── end-to-end-draft-flow.test.ts
│       └── ...
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

**Key principle:** Agents don't import from handlers; handlers import from services; services import from agents and utilities. One-way dependency flow, no circular imports ever.

### 32.2 The Agent Interface (Contracts, Not Implementations)

Every agent implements a single, standard interface so they're swappable:

```typescript
// types/Agent.ts
export interface Agent {
  name: string;
  execute(input: AgentInput): Promise<AgentOutput>;
}

export interface AgentInput {
  context: PipelineContext;      // Everything an agent might need
  params: Record<string, unknown>; // Agent-specific params
}

export interface AgentOutput {
  status: 'success' | 'failure' | 'partial';
  data?: Record<string, unknown>;
  error?: string;
  tokensUsed?: number;
}

export interface PipelineContext {
  userId: string;
  sessionId: string;
  platform: Platform;
  userIdea: string;
  clarifications?: Record<string, string>;
  pkbChunks?: KnowledgeChunk[];
  memory?: MemoryEntry[];
  // ... other shared context
}
```

Every agent (IntentClassification, DocRetrieval, Drafting, etc.) conforms to this interface. Adding a new agent = 1 class that implements this interface. No special cases, no hardcoded dependencies.

### 32.3 Configuration Over Code

Anything that changes across environments (API keys, model names, rate limits, Platform Registry) lives in environment variables or a config file, *never* hardcoded.

```typescript
// config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  // Required
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string(),
  OPENAI_API_KEY: z.string(),
  
  // Optional with defaults
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  MAX_TOKENS_PER_SESSION: z.coerce.number().default(10000),
  CONTENT_SAFETY_ENABLED: z.enum(['true', 'false']).default('true'),
  
  // Feature flags
  ENABLE_VISUAL_PREVIEW: z.enum(['true', 'false']).default('false'),
});

export const config = envSchema.parse(process.env);
```

If you need to change a setting, change it in the `.env` file or deploy config, not the code. This is especially critical for guardrails thresholds — you want to be able to tighten safety rules without a code deploy.

### 32.4 Testing as a Design Tool, Not an Afterthought

Every piece of business logic has a test. This isn't about coverage percentage; it's about test-driven clarity: if you can't write a test for something, the design is probably unclear.

**Unit tests:**
- Each Agent class gets tests for success, failure, and edge cases.
- Each Service gets tests for its interactions with the database or external APIs (mocked).
- Utilities get tests for correctness.

```typescript
// tests/agents/IntentClassificationAgent.test.ts
describe('IntentClassificationAgent', () => {
  it('classifies text-to-image tasks correctly', async () => {
    const agent = new IntentClassificationAgent();
    const input: AgentInput = {
      context: { userIdea: 'create an image of a horse running' },
      params: {},
    };
    const result = await agent.execute(input);
    
    expect(result.status).toBe('success');
    expect(result.data.taskType).toBe('text_to_image');
    expect(result.data.entities.subject).toBe('horse');
  });

  it('extracts platform hints from the user idea', async () => {
    const agent = new IntentClassificationAgent();
    const input: AgentInput = {
      context: { userIdea: 'make a midjourney image of...' },
      params: {},
    };
    const result = await agent.execute(input);
    
    expect(result.data.suggestedPlatform).toBe('midjourney');
  });
});
```

**Integration tests:**
- The full `/draft` pipeline is tested end to end, with real (or mocked) model calls.

```typescript
// tests/integration/end-to-end-draft-flow.test.ts
describe('End-to-end draft flow', () => {
  it('produces a well-scored prompt from a user idea', async () => {
    const service = new PromptService();
    const result = await service.draftPrompt({
      userId: 'test-user',
      platform: 'google_gemini',
      userIdea: 'a horse running',
    });
    
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.strengthScore).toBeGreaterThan(50);
    expect(result.isSafe).toBe(true);
  });
});
```

**Test execution:**
- `npm test` runs all tests.
- `npm test -- --coverage` reports coverage.
- CI runs tests on every PR; merge is blocked if tests fail.

### 32.5 Error Handling & Logging Standards

Errors are not exceptions — they're data. Log them, return them, never swallow them.

```typescript
// utils/logger.ts
import pino from 'pino';

const logger = pino({
  level: config.LOG_LEVEL,
  transport: {
    target: 'pino-pretty', // Human-readable in dev; structured JSON in prod
  },
});

export function logEvent(event: {
  type: string;
  userId: string;
  sessionId: string;
  action: string;
  status: 'success' | 'failure';
  details?: Record<string, unknown>;
  error?: Error;
}) {
  logger.info(event);
}
```

Every agent logs its input, output, and any errors:

```typescript
// agents/DraftingAgent.ts
export class DraftingAgent implements Agent {
  async execute(input: AgentInput): Promise<AgentOutput> {
    const { userId, sessionId } = input.context;
    
    try {
      logger.info({
        type: 'agent:start',
        userId,
        sessionId,
        agent: 'DraftingAgent',
        input: input.params,
      });

      const output = await this.draft(input);

      logger.info({
        type: 'agent:success',
        userId,
        sessionId,
        agent: 'DraftingAgent',
        tokensUsed: output.tokensUsed,
      });

      return output;
    } catch (error) {
      logger.error({
        type: 'agent:error',
        userId,
        sessionId,
        agent: 'DraftingAgent',
        error: error.message,
        stack: error.stack,
      });

      return {
        status: 'failure',
        error: 'Drafting failed; please try again.',
      };
    }
  }
}
```

Logs go to stdout (Lambda captures them automatically). In production, they're streamed to a persistent log store (e.g., CloudWatch + Supabase audit tables).

### 32.6 Database Migrations as Code

Every schema change is a versioned migration file, checked into Git:

```
migrations/
├── 001_initial_schema.sql
├── 002_add_project_scope_to_memory.sql
├── 003_add_feedback_table.sql
└── 004_create_pgvector_indexes.sql
```

Running `npm run migrate` applies all pending migrations in order. Rollback is explicit and safe:

```typescript
// migration runner
async function migrate() {
  const appliedMigrations = await db.query(`
    SELECT name FROM schema_migrations
  `);
  
  const pendingMigrations = fs.readdirSync('migrations')
    .filter(f => !appliedMigrations.includes(f));
  
  for (const migration of pendingMigrations) {
    const sql = fs.readFileSync(`migrations/${migration}`, 'utf-8');
    await db.query(sql);
    await db.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [migration]);
  }
}
```

This ensures: (1) schema is reproducible, (2) you can see exactly what changed and when, (3) deployments are safe (migrations run before code).

### 32.7 Dependency Management & Vulnerability Scanning

Keep dependencies minimal and up to date:

- `npm audit` runs in CI and blocks merge if vulnerabilities exist.
- Use Dependabot (GitHub's built-in service) to auto-create PRs for security patches.
- A human reviews and merges within 24 hours.
- Major version bumps are discussed, not auto-merged.

Dependencies list (for MVP):
- `hono`: router
- `@supabase/supabase-js`: database + auth
- `@anthropic-ai/sdk`: Claude API (or equivalent for your chosen provider)
- `zod`: runtime type validation
- `pino`: logging
- `jest`: testing
- `typescript`: type safety

That's it. Small dependency tree = fewer vulnerabilities, faster installs, easier to understand.

### 32.8 API Documentation (Code Comments, Not Separate Docs)

Every public function has a JSDoc comment:

```typescript
/**
 * Orchestrates the full prompt-drafting pipeline.
 * 
 * @param input - User's raw idea, platform, and optional clarifications
 * @returns A scored, multi-node prompt ready for insertion
 * 
 * @throws {Error} If the idea cannot be classified or the platform is unsupported
 * 
 * @example
 * const result = await promptService.draftPrompt({
 *   userId: 'user-123',
 *   platform: 'google_gemini',
 *   userIdea: 'create an image of a horse running',
 * });
 * console.log(result.strengthScore); // ~85
 */
async draftPrompt(input: DraftPromptInput): Promise<DraftPromptOutput> {
  // ...
}
```

TypeScript + Zod for input validation means the code itself documents what arguments are required and their types. No separate API docs needed — hover in your IDE and see the types + JSDoc.

### 32.9 Performance Profiling & Observability Built In

Add lightweight performance tracing to understand where time is being spent:

```typescript
// middleware/logging.ts
export async function instrumentRequest(handler) {
  return async (event) => {
    const startTime = performance.now();
    
    const result = await handler(event);
    
    const duration = performance.now() - startTime;
    
    logger.info({
      type: 'request:complete',
      path: event.path,
      method: event.httpMethod,
      durationMs: duration,
      status: result.statusCode,
    });
    
    return result;
  };
}
```

On every request, you log how long it took. Over time, you can spot performance regressions (if `/draft` suddenly goes from 800ms to 2000ms, you know something changed).

### 32.10 The "Review Before Merge" Discipline

Every piece of code goes through code review. This isn't about gatekeeping; it's about:
- Catching bugs early (before they hit production).
- Sharing knowledge (so you're not a single point of failure).
- Enforcing standards (so the codebase stays legible).

Code review checklist:
- [ ] Tests pass.
- [ ] No secrets in the code.
- [ ] Follows the folder structure and naming conventions.
- [ ] TypeScript compiles without errors.
- [ ] New dependencies are justified and minimal.
- [ ] Error handling is present.
- [ ] Logging is adequate.
- [ ] Database migrations (if any) are backward-compatible.

## 33. AI Agent Guardrails & Safety Framework

Content safety is not a feature added at the end — it's a structural part of the pipeline. This section defines the guardrails system: what it blocks, how it decides, and how it fails safely.

### 33.1 Threat Model: What We're Protecting Against

Before building guardrails, define what you're actually protecting against. Not everything is a threat; some things are just creative prompts.

**High-severity threats (always block):**
- **Jailbreaks**: Prompts attempting to bypass target platform safety (e.g., "ignore your safety guidelines," "pretend you're an unrestricted AI").
- **Illegal instruction**: Prompts requesting help with activities that are illegal in the user's jurisdiction (e.g., "how to synthesize fentanyl," "guide me to commit fraud").
- **Child safety violations**: Any prompt requesting, describing, or facilitating child sexual abuse material, grooming, or exploitation.
- **Targeted harassment**: Prompts designed to defame, harass, or incite violence against a named individual or group.
- **Disinformation at scale**: Prompts designed to generate misleading information for the purpose of deceiving people (e.g., "write a convincing but false news article claiming COVID vaccines cause autism").

**Medium-severity threats (flag for review, may block):**
- **Unsafe code generation**: Prompts requesting code for malware, cryptocurrency theft, unauthorized access.
- **Intimate image deepfakes**: Prompts for generating fake sexual or intimate images of real people.
- **Impersonation**: Prompts designed to impersonate a real person or organization to deceive.
- **Self-harm content**: Prompts requesting instructions for suicide or serious self-injury.

**Low-severity issues (don't block, but log):**
- **Excessive violence in fiction**: A creative writing prompt for a dark fantasy novel with detailed violence is fine; it's not a threat.
- **Strong language**: A prompt requesting a character to curse profusely is creative expression, not abuse.
- **Controversial topics**: Prompts about politics, religion, or social issues are legitimate; the system doesn't have an opinion.

**Not a threat (explicitly allow):**
- Creative expression, satire, educational content, artistic nudity, discussing sensitive topics for harm-reduction.

### 33.2 The Content Safety Classifier (Architecture)

The guardrails system has three layers: **pre-flight checks** (before any generation), **output validation** (after generation, before user sees it), and **library publishing gates** (before publishing a prompt to the library).

**Layer 1: Pre-Flight Check (Classifier v1)**

Input: a draft prompt (as a set of nodes, or as the raw user idea).
Output: `{ safe: boolean, category?: string, reason?: string, confidence: 0–1 }`.

Implementation options:

1. **Hardcoded keyword matching (MVP)**: Fast, cheap, but imperfect.
   ```typescript
   // guardrails/ContentSafetyClassifier.ts (v1: heuristic)
   const JAILBREAK_KEYWORDS = ['ignore your instructions', 'bypass safety', 'unrestricted mode'];
   const ILLEGAL_KEYWORDS = ['fentanyl', 'cocaine', 'fraud', 'hack', 'malware'];
   // ... etc.
   
   export function classifyPrompt(prompt: string): SafetyDecision {
     for (const keyword of JAILBREAK_KEYWORDS) {
       if (prompt.toLowerCase().includes(keyword)) {
         return {
           safe: false,
           category: 'jailbreak',
           confidence: 0.8,
         };
       }
     }
     return { safe: true, confidence: 0.95 };
   }
   ```

2. **Model-based classification (production)**: Call a small, fast safety model (e.g., OpenAI's moderation API, or a fine-tuned classifier).
   ```typescript
   // guardrails/ContentSafetyClassifier.ts (v2: model-based)
   export async function classifyPrompt(prompt: string): Promise<SafetyDecision> {
     const response = await openai.moderations.create({
       input: prompt,
     });
     
     const result = response.results[0];
     const isSafe = !result.flagged;
     
     return {
       safe: isSafe,
       category: isSafe ? undefined : Object.keys(result.categories).find(k => result.categories[k]),
       confidence: result.category_scores.violence || result.category_scores.sexual || 0.9,
     };
   }
   ```

For MVP: use hardcoded keywords. For production: integrate a model-based classifier and update the keyword list based on false negatives/positives you encounter.

**Layer 2: Post-Generation Validation**

After the Drafting Agent produces a draft, the draft itself goes through the same classifier before being shown to the user. A prompt can be safe when it's a request ("show me how to...") but unsafe when it's a completion ("here's how to manufacture ricin..."). This layer catches completions that slipped through.

**Layer 3: Library Publishing Gate**

Before publishing a prompt to the library (whether human-submitted or autonomously curated), run it through the classifier. Flag unsafe submissions for manual review; auto-reject the most egregious ones.

### 33.3 The Guardrails Pipeline (Where It Sits in the Agent Flow)

The Content Safety Classifier runs at three points in the pipeline (Section 31.3, Step 10 should be early):

1. **Before Drafting Agent**: 
   - User's raw idea + clarifications are classified.
   - If unsafe, stop here and return an error: "This prompt may violate our acceptable-use policy. Please rephrase your request."
   - Logged as a blocked attempt.

2. **After Drafting Agent**:
   - The drafted prompt (as assembled text) is classified again.
   - If unsafe, the Critic Agent is told "safety issue detected" and the draft is flagged rather than returned to the user.
   - User sees: "This prompt was flagged as potentially unsafe. Consider rephrasing."

3. **Before Library Publishing**:
   - A prompt being saved to the library is checked.
   - Unsafe prompts are not published; users see clear feedback about why.

### 33.4 Handling False Positives (The Hardest Part)

Content classifiers are imperfect — they will flag legitimate creative writing as "violence," and they'll miss actual jailbreaks. The system needs a way to learn and correct:

**User appeals:**
- If a user's prompt was blocked but they believe it's legitimate, they can appeal.
- Appeals are logged and reviewed by humans (in the Admin Control Plane, Section 21).
- The human reviews the blocked prompt, the classifier's reasoning, and the user's appeal.
- If the human agrees it's safe, the prompt is unblocked and the classifier is updated to reduce false positives in the future.

```typescript
// handlers/appeal.ts
export async function handleSafetyAppeal(req: Request) {
  const { promptId, reason } = req.body;
  
  const appeal = {
    promptId,
    userId: req.user.id,
    reason,
    appearedAt: new Date(),
    status: 'pending',
  };
  
  await db.appeals.create(appeal);
  
  // Alert the safety team
  logger.info({
    type: 'safety:appeal_filed',
    userId: req.user.id,
    promptId,
  });
  
  return { status: 'appeal_filed', message: 'We\'ll review this within 24 hours.' };
}
```

**Feedback loop:**
- Over time, collect all blocked prompts, appeals, and their outcomes.
- Use this to retrain or recalibrate the classifier.
- Update the keyword list if certain patterns are consistently false positives.

### 33.5 Acceptable-Use Policy (Legal Protection)

Guardrails are technical; policy is legal. Write a clear, enforceable acceptable-use policy that:
- Explains what you don't allow (jailbreaks, illegal content, CSAM, harassment, disinformation).
- Explains that you scan for violations and may block or suspend accounts.
- Gives users the right to appeal.
- States consequences for repeated violations (account suspension, legal action for CSAM).

Example structure:
```markdown
# PromptForge Acceptable Use Policy

## Prohibited Content

You may not use PromptForge to:
- Attempt to bypass safety guidelines of target AI platforms
- Request help with illegal activities
- Create, describe, or request child sexual abuse material
- Harass, defame, or incite violence against individuals or groups
- Generate disinformation for the purpose of deceiving people
- Create deepfake intimate images of real people

## Enforcement

PromptForge automatically scans prompts for violations. If a violation is detected:
1. The prompt is blocked and not sent to the target platform.
2. The user is notified and may appeal.
3. Repeated violations may result in account suspension.

## Appeal Process

If your prompt was blocked and you believe it's legitimate, file an appeal with details. 
Our team reviews appeals within 24 hours.

## Reporting

If you encounter content you believe violates this policy, report it to [safety@promptforge.ai].
```

Publish this prominently. It's your legal protection against liability claims.

### 33.6 Logging & Auditing Safety Decisions

Every safety decision is logged immutably (Section 27):

```typescript
logger.info({
  type: 'safety:decision',
  userId: req.user.id,
  sessionId: req.session.id,
  promptId: prompt.id,
  classifierVersion: 'v2_openai_moderation',
  decision: 'blocked', // or 'allowed'
  category: 'jailbreak',
  confidence: 0.92,
  timestamp: new Date(),
});
```

In the Admin Control Plane, admins can query these logs to see:
- How many prompts were blocked this week.
- Which categories are most common.
- Which users are repeat offenders.
- Appeals and their outcomes.

This creates a audit trail that, if you ever face a legal challenge or regulatory inquiry, proves you took safety seriously.

### 33.7 Graceful Failure (The Safety Net)

If the classifier fails entirely (e.g., the API goes down), the system should **fail closed** (refuse to generate) rather than fail open (generate without checking):

```typescript
export async function safeDraft(input: DraftInput) {
  let safetyDecision: SafetyDecision;
  
  try {
    safetyDecision = await contentSafetyClassifier.classify(input.idea);
  } catch (error) {
    logger.error({
      type: 'safety:classifier_error',
      error: error.message,
    });
    
    // Fail closed: don't generate
    return {
      status: 'error',
      message: 'Safety system unavailable; please try again later.',
    };
  }
  
  if (!safetyDecision.safe) {
    return {
      status: 'blocked',
      reason: `This prompt may violate our policy (${safetyDecision.category}).`,
    };
  }
  
  // Safe to proceed
  return await draftingAgent.execute(input);
}
```

### 33.8 Security Implications Beyond Content Safety

Content safety (what you generate) is distinct from platform security (that no one can hack you). But they interact:

- **Rate limiting**: Don't let one user generate 10,000 prompts in an hour — that's potential abuse. Rate limits protect both your infrastructure and the target platforms (Section 32.5).
- **Prompt injection attacks**: Don't let a user craft a prompt that, when inserted into a target platform, tricks *that platform's* safety systems. This is an edge case, but it's a real one. Log suspicious patterns.
- **Account takeover**: If an account is compromised, an attacker might use it to generate harmful prompts. Implement account-security best practices (Section 27.2).

### 33.9 A Note on Over-Engineering Safety

It's possible to over-engineer safety in ways that harm usability and exclude legitimate users. Avoid:

- **Censoring controversial topics**: A user asking for a prompt about climate change or vaccine efficacy is legitimate, even if those topics are polarizing.
- **Blocking all requests that mention certain words**: The word "bomb" in "bomb.com" or "atomic bomb in World War 2" is not an abuse signal.
- **Punishing users for appeal rejections**: If a user's appeal is denied, explain *why*, don't just silence them.

The goal is to catch genuine abuse while letting legitimate creativity through. This is a product judgment call, not a technical one.

---

*This section (33) is written as the *right way* to approach safety. For MVP, you can simplify: a hardcoded keyword classifier (not a trained model), blocking only the highest-confidence threats, and allowing manual review/appeal. As you grow and collect data on real-world patterns, graduate to a more sophisticated classifier. The key principle: safety scales with your product, and you're always transparent about how it works.*
- **MPKB (Model & Prompting Knowledge Base)**: the parallel knowledge store of model-behavior and prompting-technique data that powers the Quality Engine (Section 10.2).
- **RAG (Retrieval-Augmented Generation)**: grounding a model's output in retrieved reference content rather than relying solely on training knowledge.
- **Node**: a single typed, editable component of a prompt (Section 13).
- **Prompt Quality Rubric**: the fixed set of checkable dimensions (specificity, unambiguity, non-conflict, platform-fit, constraint completeness, format determinacy, context efficiency, technique fit) used to define and evaluate "excellent" (Section 10.1).
- **Critic Agent**: the agent that evaluates a draft against the rubric and triggers a bounded refinement pass before the user ever sees the output (Section 10.4).
- **Prompt Strength Score**: the visible, rubric-derived score shown to the user alongside a drafted prompt (Section 10.5).
- **DEK (Data Encryption Key)**: the per-user symmetric key used for client-side content encryption (Section 19.2).
- **Zero-knowledge architecture**: a design where the server can store/relay encrypted data without ever holding a key capable of decrypting it.
- **MCQ**: multiple-choice question, used for enumerable, platform-relevant prompt parameters.
- **Context window**: the maximum amount of text a model/platform can consider at once.
- **Tool-calling**: an agent invoking an external function/API as part of producing its response.
- **Supervisor/Planner agent**: the component owning pipeline state and agent sequencing (Section 7.2).
- **Provider Adapter**: the swappable, per-provider implementation of raw text generation, isolated from all presentation/decision logic (Section 9.1).
- **Response Design Layer**: PromptForge's own post-processing stage that shapes raw model output into the product's node-based, branded result — the layer that guarantees output never looks like a raw API pass-through (Section 9.3).
- **BYOK**: Bring Your Own Key — a user connecting their own model-provider API credentials.
- **RBAC**: role-based access control, used throughout the Admin Control Plane (Section 21.1).
- **Autonomous Curation Agent**: the background agent that mines opted-in sessions and proposes new public library templates (Section 14.4).
- **Project**: a persistent, scoped context container grouping related drafting sessions and their own Memory (Section 17.6).
- **Manifest V3**: the current browser extension platform standard used by Chromium-based browsers.
- **Lambdalith**: a single Lambda function that internally routes and handles every backend endpoint itself (typically via a lightweight router library), instead of splitting routes across many separate functions (Section 23.1).
- **Lambda Function URL**: a direct, dedicated HTTPS endpoint for invoking a single Lambda function, used in Path B (Section 23.2) in place of API Gateway — free on its own, supports native response streaming, but lacks API Gateway's built-in auth-integration, WAF, and rate-limiting features (Section 23.3).

---

*This document is a v0.6 architectural and operational blueprint. Read it in this order: Sections 1–6 give the "why," Sections 7–17 give the "what," Sections 18–26 address the "how operationally," and Sections 27–32 address the "how to ship safely and scale."*

*Three sections in particular are critical reads before you write your first line of code:*

*Section 30 (Build Plan) is your roadmap — 28 concrete steps across 12 weeks, with success criteria for each. Use it as your sprint structure. The specificity matters: know what "Implement Intent Classification Agent" means (Step 12) before you start.*

*Section 31 (Code Quality) defines the standards for "clean code that's easy to update." If you follow the folder structure, testing approach, and logging discipline from day one, you avoid the common failure mode of early-stage codebases: they work until they don't, and then they're unmaintainable. Build it right the first time.*

*Section 32 (Guardrails) is not optional. A tool that makes harmful AI use more effective is not a good product, regardless of how elegant the architecture is. The three-layer content-safety classifier, the false-positive appeals process, and the fail-closed behavior aren't nice-to-haves — they're foundational.*

*Finally: the reason this document exists is that PromptForge is built on three defensible, hard-to-replicate moats (Section 29.9): being cross-platform and platform-neutral, being privacy-first, and building a proprietary dataset of real prompt-outcome signal (Section 29.2). Every technical decision in Sections 27–32 strengthens one of these three moats. Every feature you add that doesn't is worth questioning.*
