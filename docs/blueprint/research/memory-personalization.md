# Memory and personalization for PromptAI

Research lens: what PromptAI should remember about each person, how it learns that, how it uses it at prompt time, and what the person controls. Date: 2026-11-10.

## Bottom line

Do not adopt a memory framework or a graph database. One person's useful memory is small: a profile card plus tens to a few hundred short, typed statements. Store it as **user-owned, end-to-end-encrypted records in a local SQLite file on each device**, synced as encrypted rows through the existing Postgres with last-writer-wins. **Rank and select memories on the client**, and send only the chosen few as an ephemeral context block.

Borrow ideas, not runtimes:
- from mem0, operation-based updates;
- from Graphiti, "supersede, don't delete";
- from Letta, an always-in-context core block and background consolidation;
- from LangMem, procedural rules;
- from Claude, project-scoped memory, incognito mode and paste-based import.

New inferred statements are **proposed, never written silently**. Only low-risk, reversible signals are written automatically, and those come with undo.

The first win is not new architecture. **Today's memory feature is not wired end to end.**

## 1. What the repo does today

Spec §17 defines memory as human-readable preference statements: extracted at checkpoints, confirmed by the user, retrieved selectively, and client-encrypted. The implementation has five parts:
- `MemoryExtractionAgent.ts`, a small model at session end; proposals need confidence ≥0.6 and start `pending_confirmation`;
- `memory_entries`, holding ciphertext plus a plaintext `task_type`;
- CRUD and reset routes in `routes.ts`;
- `DraftingAgent`, which reads at most 5 × 500 characters;
- `crypto.ts`, an AES-GCM data key wrapped by a passphrase-derived key.

Gaps:
1. **The loop is disconnected.** `/draft` returns `memory_proposals`, but no client renders or saves them; the field appears only in `api-types.ts`. No client (web, extension, desktop, macOS) sends `memories` to `/draft`. Inferred memory never reaches a draft.
2. **The extractor is blind.** It never sees existing memories or past rejections, so it will propose "prefers photorealistic" again every session.
3. **The signals are weak.** It sees only final nodes and answers, not edit diffs, chosen or rejected alternatives, skipped questions, feedback or dictation corrections.
4. **The schema is thin:** no kind, provenance, validity window, usage counters or decay, and a fixed limit of 5 instead of ranking.
5. **Leaks:** the plaintext `task_type` column leaks metadata; `encrypt()` uses no AES-GCM `additionalData`, so the server could swap rows undetected; `GroqSTTAdapter.ts` never sends the `prompt` vocabulary hint.

| Keep | Change | Drop |
|---|---|---|
| Human-readable statements; checkpoint extraction | Extractor returns *operations* against existing memory | Memory as a Supervisor agent; make it a post-session job |
| Propose-and-confirm for inferred items | Inputs: edit diffs, alternatives, feedback, dictation corrections | "Max 5 × 500 chars" |
| E2EE DEK envelope; server stores ciphertext only | Typed schema; AAD = `user_id‖item_id` | Plaintext `task_type` |
| Global and project scope, reset, manual add | Client-side, token-budgeted retrieval | Server as source of truth |

## 2. Options compared

GitHub data is from `gh api` on 2026-11-10.

| Option | How it works | License / activity | Fit |
|---|---|---|---|
| **mem0** | An LLM extracts facts, then chooses ADD, UPDATE, DELETE or NOOP against similar existing memories in a vector store. Graph memory is optional. Has a Node SDK. | Apache-2.0, 68.8k★, pushed 2026-11-06 | Good update logic. But it assumes plaintext and embeddings on the server, writes silently by default, and adds a runtime for about 50 rows per user. **Borrow the operations.** |
| **Letta (MemGPT)** | An agent server with in-context memory blocks, archival and recall stores, and "sleep-time" agents that edit blocks in the background. | Apache-2.0, 25.4k★, pushed 2026-10-18 | Using it means making Letta the agent runtime. **Borrow** the core block and background consolidation. |
| **Zep / Graphiti** | A temporal knowledge graph. Each edge has `valid_at`, `invalid_at`, `created_at` and `expired_at`. An LLM invalidates contradicted edges instead of deleting them. | Graphiti Apache-2.0, 32.7k★, pushed 2026-11-09. Zep Community Edition is deprecated. | Best at modelling change over time. Needs a graph database, one LLM call per edge, Python, and plaintext on the server. **Borrow the validity fields.** |
| **LangMem** | Semantic, episodic and procedural memory primitives, plus a prompt optimizer. | MIT, 1.8k★, pushed 2026-11-03, pre-1.0, Python | The procedural-rules concept fits; the library does not fit a TypeScript stack. |
| **Cognee** | An extract-cognify-load pipeline that builds a graph plus vectors. v1.0 (June 2026) can run on Postgres. | Apache-2.0, 33.2k★, pushed 2026-11-10 | Better suited to the tool-knowledge base than to personal memory. |
| **ChatGPT / Claude / Gemini** | **ChatGPT:** explicit saved memories plus inferred chat history; automatic prioritization (Oct 2025). **Claude:** memory per project, editable summary, incognito, paste import (Mar 2026). **Gemini:** memory and chat import (Mar 2026). | Closed | These set expectations: two trust tiers, scoping, incognito, and "paste a list" portability. |
| **Memory as files** (non-obvious) | Letta reported 74.0% on LoCoMo with GPT-4o mini plus file tools, against Mem0's self-reported 68.5% (vendor-run). Claude's API memory tool runs client-side on `/memories`. | n/a | Context management beats retrieval machinery. |
| **Typed profile + records, ranked on device** (chosen) | Typed records in encrypted local SQLite, extracted deterministically plus by a small LLM. The client ranks; the server receives an ephemeral block. | Our code | Fewest moving parts. Keeps E2EE, works offline, and every item is auditable. |

**Do not choose by benchmark.** LoCoMo and LongMemEval scores are vendor-run and disputed: Zep rebutted Mem0's figures, Letta says Mem0 never explained its method, and an audit questions LoCoMo's answer key. Treat leaderboard figures as unverified.

Three findings drive the design:
- **Embeddings are content.** Vec2Text recovered 92% of 32-token inputs exactly from their embeddings, so a server-side vector index would break E2EE.
- **Memory writes are an attack surface.** Sleeper poisoning (arXiv 2605.15338) planted false user memories from documents and web pages in up to 99.8% of attempts on one model. A systematic study (arXiv 2606.04329) finds that agents which write more aggressively are easier to exploit.
- **Models drop preferences.** In PrefEval (ICLR 2025), zero-shot preference following fell below 10% by 10 turns. Inject compactly and explicitly, then check.

## 3. Recommendation

### 3.1 What to remember

| Kind | Example | Write tier | Half-life (unused) |
|---|---|---|---|
| `preference` | "Prefers 16:9 cinematic framing" | Propose | 180 days |
| `rule` (procedural) | "Always add a negative prompt for Midjourney" | Propose; active at once if user-stated | None |
| `fact` | "Teaches high-school biology" | Propose; active at once if user-stated | None |
| `goal` | "Build a ComfyUI workflow by March" | Propose | Due date + 30 days |
| `project` | "Brand X: muted palette, no people" | Propose | 60 days after project inactivity |
| `vocabulary` | "ComfyUI" (sounds like "comfy you eye") | Auto after 2 dictation corrections, with undo | 365 days |
| Tool + skill level | Midjourney: comfortable (estimated) | Auto numeric; user can override | Decays toward prior after 90 days |

**Never remember:**
- one-off request content or facts about the world;
- other people's personal data;
- credentials;
- anything from incognito sessions;
- anything sourced from third-party content: web pages, pasted documents, imported prompts, tool output.

**Never infer** special-category data (GDPR Art. 9). If the user states it, mark it `sensitive`: it is injected only when the request's tags match.

**Skill level.** An Elo-style update per tool: `score += k·(outcome − expected)`. The outcome combines three signals: the Critic score clears its bar, the user accepts with a small edit distance, and the user marks it "worked". The score decays toward the cohort prior when the tool goes unused; half-life regression is the reference model, and FSRS is the upgrade path if LEARN adds spaced practice. A level the user declares always wins. The level sets how much PromptAI explains: beginners get the "why", experts get terse output.

### 3.2 Schema (shared TypeScript, local SQLite)

```ts
type Kind = 'preference'|'rule'|'fact'|'goal'|'project'|'vocabulary';
type Scope = {level:'global'} | {level:'project'; id:string} | {level:'tool'; id:string};

interface MemoryItem {
  id: string; kind: Kind; scope: Scope;
  statement: string;               // ≤140 chars, what the user reads and edits
  slot?: string; value?: string;   // e.g. "image.aspect_ratio" = "16:9", for contradiction checks
  spoken?: string[];               // vocabulary: sounds-like forms
  tags: string[];                  // tool ids, task types, modality
  source: 'user_stated'|'user_confirmed'|'auto_low_risk'|'imported';
  evidence: {sessionId?: string; quote?: string}[];   // ≤3, the user's own words
  confidence: number;
  status: 'proposed'|'active'|'dormant'|'superseded'|'rejected';
  pinned: boolean; sensitivity: 'normal'|'sensitive';
  validFrom: string; validTo?: string; supersededBy?: string;
  createdAt: string; updatedAt: string; lastUsedAt?: string;
  useCount: number; helpful: number; notHelpful: number;
  proposalExpiresAt?: string;      // 14 days
  hlc: string; deleted?: true;     // sync clock + tombstone
}

interface Profile {                // the core block, always injected, ≤200 tokens rendered
  role?: string; field?: string; languages: string[]; register?: string;
  defaults: {length?: string; format?: string; readingLevel?: string};
  accessibility: string[];
  tools: {toolId: string; level: 'new'|'learning'|'comfortable'|'expert';
          levelSource: 'user'|'estimated'; score: number; lastUsedAt: string}[];
  stats: Record<string, {a: number; b: number; t: string}>; // Beta posteriors (learning lens)
  learningMode: 'ask'|'auto_low_risk'|'off'; hlc: string;
}
// Also: RejectedFingerprint {hash, kind, at} (synced) and EpisodeEvent (device-only, 30-day TTL):
// edit_diff | alt_chosen | alt_rejected | q_skipped | feedback | dictation_fix | node_locked
```

The server keeps one opaque table, which replaces `memory_entries`:

```sql
create table memory_records (
  user_id uuid not null references app_users(id) on delete cascade,
  record_id text not null,      -- item ULID or 'profile'
  scope_ref text,               -- opaque project id, for cascade on project delete
  hlc text not null,
  deleted boolean not null default false,
  ciphertext text,              -- AES-GCM(DEK, json, AAD = user_id||record_id)
  primary key (user_id, record_id)
);
```

### 3.3 Write pipeline

1. **Capture** `EpisodeEvent`s locally during the session, with no LLM involved.
2. **Trigger** at session end, on an explicit "remember this" (typed or spoken), or in weekly idle consolidation. Never per message.
3. **Generate deterministic candidates first.** Beta counters catch repeated choices; for example, "photorealistic" in 3 of the last 4 image sessions becomes a candidate whose confidence comes from the posterior. A word corrected twice becomes a vocabulary candidate.
4. **Ask a small LLM for operations.** Its input is the session summary, the edit diff, the candidates and the top-k related *existing* items. It returns zod-validated operations: `ADD | REINFORCE(id) | UPDATE(id) | SUPERSEDE(id→new) | NARROW_SCOPE(id) | NOOP`. Each operation cites user-authored evidence.
5. **Guard.** Reject anything whose evidence is not the user's own text or action, imperative text aimed at the assistant, URLs, inferred special-category data, and rejected fingerprints. A near-duplicate of an active item becomes `REINFORCE`. Cap at 3 proposals per session and 10 pending in total.
6. **Apply the tiered write policy.**
   - *User-stated* items go active immediately.
   - *Low-risk, reversible* changes apply automatically and appear in "Recently learned" with undo: reinforcement, counters, skill score, vocabulary.
   - *New inferred statements* and *any change of meaning* become proposal chips at the end of the session, at most 3: keep, no, edit, "only for this project or tool".
   - If the user dismisses proposals for 3 sessions in a row, halve the proposal rate. Unanswered proposals expire unsaved.
7. **Handle contradictions.**
   - A new item in the same slot and scope supersedes the old one, which gets `validTo` and `supersededBy` and stays in its history.
   - A conflict that holds only in one context narrows the scope instead.
   - If both items were stated by the user, ask: "Replace, or keep both for different contexts?"
8. **Decay.**
   - Strength = `0.5^(days since use / half-life)`, boosted by `log(1+useCount)` and helpfulness.
   - Below 0.25 an item becomes `dormant`: not injected, still visible, and offered in a monthly review.
   - User-stated items, rules and pinned items are never deleted automatically.
   - The idle job merges near-duplicates and rewrites the profile card. Any change of meaning goes through the proposal path.

### 3.4 Read pipeline (at prompt time)

1. **Load.** The client holds decrypted memory while the DEK is unlocked. If it is locked, run without memory and offer "Unlock to personalize".
2. **Filter.** Keep active items whose scope is global, the current project or the current tool. Keep `sensitive` items only when their tags match the request.
3. **Score.** `0.4·relevance + 0.25·tagMatch + 0.15·strength + 0.1·scopeSpecificity + 0.1·pinned`. In v1, relevance is BM25-style keyword overlap. Phase 2 adds on-device embeddings, which are never uploaded; brute-force cosine is fast enough at this scale. Later, refit the weights offline from helpfulness signals.
4. **Select under a budget.** The profile card (≤200 tokens) plus at most 8 items (≤300 tokens), with MMR so near-duplicates are not all picked.
5. **Inject** a delimited `<user_context>` block, labelled as data rather than instructions. Precedence: current message > project rules > tool rules > global rules > inferred preferences.
6. **Cover what the user forgot to say.** The clarifier skips questions memory already answers (memory's largest UX payoff), the drafter fills defaults, and the Critic checks "honors user context without over-applying it".
7. **Attribute.** The drafter returns `applied_memory_ids`. The UI shows "Used 3 memories" with "why" and a per-item "not this time"; repeated use of "not this time" proposes narrowing that item's scope.
8. **Dictation.** The top vocabulary items, chosen by recency, frequency and tool match, are formatted for each engine (Groq Whisper's `prompt` field holds up to 224 tokens).

The server treats the block as ephemeral [N]: it is never logged or stored.

### 3.5 Storage, sync, encryption and multiple devices

- **One SQLite schema everywhere**, behind the platform lens's `platform.store` port: `tauri-plugin-sql` on desktop, `@capacitor-community/sqlite` on mobile, and wa-sqlite on OPFS on the web (IndexedDB fallback).
- **Sync is deliberately boring.** Rows encrypted with AAD move through `GET` and `POST /memory/changes?since=hlc`. The newest HLC wins, deletions travel as tombstones, and each device keeps 5 encrypted prior versions per item for restore. Memory is tiny and rarely edited, so use no CRDTs and no sync engine. If the platform adopts a sync engine app-wide, memory rides along as encrypted columns; Evolu (MIT, E2EE SQLite) is the closest ready-made option.
- **Keys:** keep the DEK envelope and add AAD. Add QR device pairing, which wraps the DEK to the new device's public key. Optionally use a passkey (WebAuthn PRF) as a KEK source; platform support is unverified. Account deletion crypto-shreds the data, as today.
- **Plaintext metadata** is only user id, record id, opaque project id, HLC timestamp and the tombstone flag.
- **Teams.** Personal memory is never shared. Team conventions are a separate, explicitly shared object.

### 3.6 User controls

- **"What PromptAI knows about you":** an editable profile card, then cards grouped by kind and scope. Each card shows a source badge ("You said", "Learned from 3 sessions", "Imported"), its evidence session and when it was last used. Each can be edited, deleted, paused, pinned or re-scoped, and has a version history.
- **"Recently learned"** with undo; a **proposals inbox** (at most 10, expiring); "Used memories" with "why" and "not this time" on each request.
- **Incognito:** "Don't remember this session" (reads only) and "Fresh start" (no reads, no writes), one tap or one voice command away.
- **Learning mode** (Ask me by default, Auto-save low-risk, Off), and **reset** per project, per tool or globally.
- **Portability:**
  - Export to Markdown (pasteable into other assistants) and to versioned JSON (`promptai.memory.v1`).
  - Import another assistant's "List every memory you have stored about me" answer as *proposed* items for bulk review, screened for injection.
  - Later, a read-only local MCP server so the profile follows the person into other tools.

## 4. Evaluation

Build an in-house test set: 50 synthetic personas, each with scripted sessions covering contradictions, scope conflicts, a sensitive disclosure, injection attempts and dictation corrections.

- **Offline gates:** proposal precision; duplicates below 5%; at least 90% correct contradiction handling; **zero poisoned writes**; retrieval precision@8; "honored, not over-applied".
- **Online metrics:** proposal acceptance; "not this time" rate; clarifying questions per session for returning versus new users (fewer, with the same Critic score); dictation key-term recall.

## 5. What not to build

- A graph database or knowledge graph for personal memory.
- A hosted memory vendor: mem0 Platform, Zep Cloud and similar would hold plaintext as a new subprocessor.
- A server-side vector index of user memory. pgvector stays for the public knowledge base only.
- "Reference all chat history" memory in v1, because it cannot be audited.
- CRDTs, a sync engine, or per-user fine-tuning for memory.
- Memory writes from web content, page scrapes or MCP.
- Silent writes of new natural-language statements.

## 6. Phased plan for 1-3 engineers

1. **Week 1, wire what exists:** send ranked memories to `/draft`; render `memory_proposals` as chips; give the extractor existing items and rejected fingerprints; add AAD; send vocabulary through Groq's `prompt` field.
2. **Weeks 2-4:** new schema and `memory_records`; local SQLite with LWW sync; operations-based extractor with edit diffs; budgeted retrieval and `applied_memory_ids`; incognito; export and import.
3. **Months 2-3:** decay and consolidation; skill estimates; on-device embeddings (Qwen3-Embedding-0.6B, Apache-2.0, via Transformers.js, or model2vec, MIT); evaluation as a CI gate.
4. **Later:** learned ranking weights; QR pairing and passkeys; read-only MCP export; on-device extraction with Apple Foundation Models.

## Notes and limits

- My web-search budget ran out before I could check research on memory-induced sycophancy or narrowed output. That risk is **unverified**. The design limits it through precedence rules, "Fresh start", and the learning lens's diversity slots.
- License flags:
  - EmbeddingGemma uses the Gemma terms, which are not OSI-approved.
  - `modelcontextprotocol/servers` reports `NOASSERTION`, so check each package before reusing code.
  - `basic-memory` is AGPL-3.0 (copyleft), so do not embed it in a commercial app.

## Sources

- Mem0 paper: https://arxiv.org/abs/2504.19413
- Mem0 Node SDK: https://docs.mem0.ai/open-source/node-quickstart
- mem0 repo: https://github.com/mem0ai/mem0
- Letta sleep-time agents: https://docs.letta.com/guides/agents/architectures/sleeptime/index.md
- Letta, benchmarking agent memory: https://www.letta.com/blog/benchmarking-ai-agent-memory
- Zep paper: https://arxiv.org/abs/2501.13956
- Graphiti repo: https://github.com/getzep/graphiti
- Zep CE deprecation: https://help.getzep.com/ce-deprecation-notice
- Zep rebuttal of Mem0 numbers: https://blog.getzep.com/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/
- LangMem launch: https://blog.langchain.com/langmem-sdk-launch
- Cognee on PyPI: https://pypi.org/project/cognee/
- Claude memory: https://claude.com/blog/memory
- Claude memory import (MacRumors): https://macrumors.com/2026/03/02/anthropic-memory-import-tool/
- Claude API memory tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
- ChatGPT memory FAQ: https://help.openai.com/en/articles/8590148-memory-faq
- ChatGPT reference saved memories: https://help.openai.com/en/articles/11146739-how-does-reference-saved-memories-work
- ChatGPT automatic memory management (TechRadar): https://www.techradar.com/ai-platforms-assistants/chatgpt/chatgpt-is-smarter-now-that-its-learned-to-forget-a-huge-memory-upgrade-is-coming
- Gemini memory import: https://blog.google/innovation-and-ai/products/gemini-app/switch-to-gemini-app/
- Vec2Text: https://arxiv.org/abs/2310.06816
- Sleeper memory poisoning: https://arxiv.org/abs/2605.15338
- Systematic memory-poisoning study: https://arxiv.org/abs/2606.04329
- GhostWriter: https://promptfoo.dev/lm-security-db/vuln/ghostwriter-persistent-memory-poisoning-in-tool-using-agents-e9cd87a8
- PrefEval: https://arxiv.org/abs/2502.09597
- LoCoMo audit: https://dev.to/penfieldlabs/we-audited-locomo-64-of-the-answer-key-is-wrong-and-the-judge-accepts-up-to-63-of-intentionally-33lg
- Half-life regression: https://github.com/duolingo/halflife-regression
- ts-fsrs: https://github.com/open-spaced-repetition/ts-fsrs
- Groq speech-to-text: https://console.groq.com/docs/speech-to-text
- Evolu: https://github.com/evoluhq/evolu
- wa-sqlite: https://github.com/rhashimoto/wa-sqlite
- Transformers.js: https://github.com/huggingface/transformers.js
- model2vec: https://github.com/MinishLab/model2vec
- Qwen3 Embedding: https://simonwillison.net/2025/Jun/8/qwen3-embedding/
- EmbeddingGemma license: https://simonwillison.net/2025/Sep/4/embedding-gemma/
- Apple Foundation Models (secondary): https://createwithswift.com/exploring-the-foundation-models-framework/
- GDPR Article 9: https://gdpr-info.eu/art-9-gdpr/
- WebAuthn PRF: https://w3c.github.io/webauthn/#prf-extension
- basic-memory: https://github.com/basicmachines-co/basic-memory
- MCP servers: https://github.com/modelcontextprotocol/servers
