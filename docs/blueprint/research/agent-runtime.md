# Agent runtime and orchestration

Research lens: how PromptAI's agents and workflows run. Written 2026-11-10. Repo facts come from `backend/` (Supervisor.ts, PipelineGraph.ts, BudgetService.ts, agents/, config/model-routing.json, docs/orchestration-review.md). Licenses and versions were checked with `gh api` and `npm view` on 2026-11-10. Unverifiable claims are marked "unverified". The web-search budget ran out partway through, so later claims rest on fetched primary pages.

## 1. Bottom line

1. **Own the control flow, rent the plumbing.** Keep a small, typed run kernel of our own: a reducer over an append-only event log in Postgres. Use the **Vercel AI SDK 7** (`ai` 7.0.168, Apache-2.0) for model and tool calls across providers. Use **DBOS Transact** (`@dbos-inc/dbos-sdk` 5.5.0, MIT) for durability. DBOS is a library on the Postgres we already run, with no workflow server. Do not adopt LangGraph, Mastra, Temporal or a vendor agent SDK as the core.
2. **Three agents, not thirteen.** Only three things need a model-driven loop: the foreground **Companion**, and two background agents, the **Librarian** (keeps tool knowledge fresh) and the **Optimizer** (EVOLVE). Everything else becomes either a **skill** (one typed LLM call) or plain code. The prompt "forge" stays a fixed **workflow** of 1 to 3 model calls, not an agent.
3. **Fix two real problems today.** Clarification resume re-runs the pipeline from the start (docs/orchestration-review.md), and progress lives in an in-process `Map` (SessionProgress.ts) that breaks with more than one instance. Durable waits and an event log fix both.
4. **Make "never stuck" a property of the kernel, not of each agent.** Step, token, dollar and wall-clock budgets; loop detection; idempotency keys; cancellation through `AbortSignal`; human checkpoints with timeouts that fall back to defaults; a degradation ladder; and record-and-replay for debugging.
5. **Expose PromptAI as a stateless MCP server** using the 2026-07-28 spec and the v2 TypeScript SDK's Hono adapter, so people can use it from inside the AI tools they already work in. Add an MCP client later, with approvals. Do not build on A2A yet.

## 2. The current repo: keep, change, drop

| Today | Verdict | Why |
|---|---|---|
| A uniform `Agent` contract (`execute(input) → AgentOutput`), where only the Supervisor writes context (`applyOutput`) | **Keep the idea, add types** | Single-writer state is right. But `data: Record<string, unknown>` throws away types, so each skill should get Zod input and output schemas. |
| Safety pre-flight and post-flight as graph nodes that fail closed | **Keep** | Safety gates belong to the orchestrator, not to an agent. Keep them as kernel middleware around every run. |
| Config-driven model routing (`model-routing.json`) | **Keep, extend** | Key by `skill + tier`, and add an ordered `fallbacks[]` list per route. |
| TokenGovernor as code; "just generate now" | **Keep** | Code where code is enough; a built-in escape hatch. |
| PipelineGraph: typed outcomes, interrupts, a cycle guard | **Evolve** | This becomes the kernel. Add persistence, budgets and parallel fan-out. |
| Critic refine loop that keeps the best draft so far | **Shrink** | Up to 5 large-tier calls today. Compile, verify, then at most one repair (as in the prompt-optimization lens). |
| Clarification resume that re-runs the intent and retrieval steps | **Change** | Use a durable wait that resumes at the node where it stopped. Re-running wastes tokens and can change the classification between turns. |
| `SessionProgress` stored in an in-memory `Map` | **Change** | Derive progress from `run_events` and stream it to clients over SSE. |
| Session token cap checked *after* each step; monthly budget fails open | **Change** | Check before each call using an estimate. Add dollar and deadline caps. Keep hard in-process per-run ceilings, so a database outage cannot cause a runaway. |
| 11 hand-written provider adapters | **Drop, mostly** | Replace them with AI SDK providers. Keep the official `@anthropic-ai/sdk` behind the same port for Claude-only features (task budgets, compaction, effort, caching breakpoints). |
| Separate agents for intent, clarify, import, alternatives | **Merge** | Into one Intent Reader skill plus a pure Ask Gate function (matches the intent-elicitation lens). Alternatives come from `compile` with `n > 1`. |
| ModelRefreshAgent (492 lines), OpenRouterModelFetcher, PlatformProfileAgent, DocIngest, crawl-pkb | **Merge** | Into the scheduled Librarian agent plus plain fetch jobs. |
| WorkflowService (its own `{{var}}` chain executor) | **Change** | User workflows become data that the same kernel runs. One runtime, not two. |
| Lambda "lambdalith" | **Change** | Durable recovery, streams that last minutes and background queues all want a long-lived process. Run one Hono service on always-on containers with Postgres. |

## 3. Options compared

| Option | TS-native | Provider-neutral | Durable state and human-in-the-loop | Debug replay | Ops weight | License (checked 2026-11-10) | Fit |
|---|---|---|---|---|---|---|---|
| **A. Hand-rolled kernel only** (evolve PipelineGraph) | Yes | Yes | Only what we build | Only what we build | None | n/a | Good for control flow. Building durability ourselves is a trap. |
| **B. LangGraph.js** (1.7.3) | Yes | Via LangChain | Postgres checkpointers, `interrupt()` | Checkpoint time travel | Low to medium | MIT | Capable, but a large LangChain surface; JS reportedly lacks node timeouts (unverified). |
| **C. Mastra** (1.82.0) | Yes | Yes (on the AI SDK) | Suspend/resume; network HITL since 1.0 | Traces | Medium | Apache-2.0, except `ee/` folders | Best all-in-one TS option, but it owns your control flow and moves very fast. |
| **D. AI SDK 7 + Workflow SDK** (`workflow` 5.4.0) | Yes | Yes | `WorkflowAgent` on durable "worlds", incl. Postgres | Event-sourced replay | Low to medium | Apache-2.0 | Strong, but needs a compiler, directives and deterministic code. Postgres-world maturity unverified. |
| **E. Vendor SDKs**: OpenAI Agents JS (0.21.0), Google ADK JS (2.4.0), Claude Agent SDK | Yes | Partly | RunState serialization; sessions | Varies | Low (Claude Agent SDK: high) | MIT / Apache-2.0 / **proprietary** (Anthropic Commercial Terms) | Vendor gravity. The Claude Agent SDK runs one CLI subprocess (~1 GiB) per session: wrong for a consumer backend. |
| **F. Workflow servers**: Temporal, Inngest, Restate, Trigger.dev, Cloudflare Workflows | Yes | Yes | Excellent | Excellent (Temporal) | **High**, or SaaS | Temporal SDK MIT; Inngest server **SSPL**; Restate server **BSL 1.1**; Trigger.dev Apache-2.0; Cloudflare = Workers lock-in | Built for platform teams, not 1 to 3 engineers. |
| **G. Durable execution as a Postgres library**: **DBOS** (non-obvious), Absurd | Yes | Yes | Checkpointed steps, durable waits, queues | DBOS: workflow fork and replay (exact v5 API unverified) | **Very low**: just our Postgres | MIT / Apache-2.0 | **Recommended for durability.** |
| **H. Python stack**: Pydantic AI (9 durable backends), BAML | No | Yes | Via Temporal/DBOS/Restate/Absurd | Varies | Medium | MIT / Apache-2.0 | Mismatched with a TS product. Use Python only for the offline optimizer (GEPA). |

**Why G is the non-obvious winner.** The usual choice is "a framework" (B, C) or "a workflow server" (F). DBOS is neither. Workflows are ordinary TypeScript functions whose step outputs are checkpointed in the Postgres we already run. Its `@dbos-inc/vercel-ai` package makes model calls (`durableCalls`), tools (`durableTools`), MCP tools and sub-agents checkpointed steps for AI SDK v7+, so our two chosen libraries already fit together. Absurd (Armin Ronacher's single-SQL-file engine, Apache-2.0, 0.5.1, with TS and Python SDKs) is the smaller fallback. Its README calls it "an experiment in durability", so its verdict is assess.

## 4. Recommended runtime

```
clients (web · Tauri desktop · Capacitor iOS/Android · extension · MCP hosts)
        │  one protocol: POST /runs, GET /runs/:id/events (SSE), POST /runs/:id/{input,approve,cancel}
        ▼
Hono service (always-on containers, horizontally scaled)
  ├─ Run Kernel (ours, ~500 LOC): reducer(state, event) → {state, effects}; budgets; loop guard; safety middleware
  ├─ Workflows (DBOS): forge, onboarding-coach, user workflows, memory consolidation, nightly jobs
  ├─ Agents (AI SDK ToolLoopAgent): Companion (foreground) · Librarian, Optimizer (background, DBOS-scheduled)
  ├─ Skills (typed single calls via AI SDK; Claude-specific routes via @anthropic-ai/sdk)
  └─ MCP server (@modelcontextprotocol/server + hono adapter, stateless 2026-07-28)
        ▼
Postgres + pgvector: app tables · runs · run_events · DBOS system tables · knowledge · memories
```

- **The kernel** is the 12-factor "stateless reducer": read `RunState`, apply one event, append events. The UI timeline, analytics, learning signals and replay all read that one log.
- **The forge is a workflow** (prompt chaining plus evaluator-optimizer): `read_intent` (in parallel with `retrieve`) → Ask Gate (code) → optional durable `ask_user` wait → `compile` → `verify` → at most one `repair`. That is 1 to 3 model calls, predictable.
- **The Companion is an agent** for open-ended work ("help me get good at Figma", coaching, running prompts on a target). It calls the forge as a tool. It is an AI SDK `ToolLoopAgent` with our own `stopWhen` conditions instead of the 20-step default, and `prepareStep` for compaction and tool gating.
- **Model calls** go through one `ModelPort`. AI SDK providers cover Groq, Gemini, Cerebras, OpenAI-compatible and local models. Claude routes use the official Anthropic SDK for task budgets (beta), effort, compaction and cache-stable mid-conversation system messages. Claude API version 2026-10-21 rejects `temperature`/`top_p`/`top_k`, so determinism must come from recording, not sampling settings.

## 5. Agent roster (3 agents, 6 skills, the rest code)

| Unit | Kind | Responsibility | Replaces |
|---|---|---|---|
| **Companion** | Agent, foreground | The one conversational surface; picks the next tool from `forge`, `search_knowledge`, `recall_memory`, `ask_user`, `run_on_target` (FIRE), `save_artifact` and approved MCP tools. | Chat refine, chat draft, LEARN coaching |
| **Librarian** | Agent, background (scheduled) | Keeps Tool Cards, knowledge base and model registry current: fetches docs and release notes, diffs, proposes updates (low confidence needs human approval). | ModelRefresh, OpenRouterFetcher, PlatformProfile, DocIngest, crawl-pkb, Curation |
| **Optimizer** | Agent, background (queued) | EVOLVE: GEPA over Tool Card instructions on consented, outcome-labelled data (Python worker), with offline evaluation before promotion. | Prompt Evolver, ContinuousImprovement, improvement-analysis |
| `read_intent` | Skill | Produces the IntentFrame: goal, slots with confidence, competing readings, latent requirements. Also parses pasted prompts ("enhance" mode). | IntentClassification, PromptImport, half of Clarifying |
| `compile` | Skill | Turns Intent Spec + Tool Card + Playbook into an artifact. `n` controls variants. | Drafting, Alternatives |
| `verify` | Skill (cheap, preferably a different model family) | Checks the artifact against the yes/no checklist and returns issues. | Critic scoring |
| `repair` | Skill | Makes one targeted fix of the flagged issues. | Critic refine |
| `extract_memory` | Skill (async, after the session) | Proposes preference and memory statements from edits and outcomes. | MemoryExtraction |
| `explain_choice` | Skill (optional) | Writes a natural-language reason for a recommendation that a deterministic ranker produced. | Part of ModelRecommender |
| Ask Gate, retrieve (hybrid BM25 + pgvector), recommend ranking, TokenGovernor, safety classifier, serializer | Code | Deterministic, testable, free to run. | The rest of the 13 |

The background agents never talk to the Companion directly. They communicate through Postgres rows (cards, priors, promoted variants), with no chatter between agents.

## 6. Contracts

```ts
// Skill: one typed model call. Pure given (input, snapshot). Swappable model, swappable executor (cloud or on-device later).
interface Skill<I, O> {
  id: string; version: string;                      // version bumps invalidate replay caches
  input: z.ZodType<I>; output: z.ZodType<O>;        // validated both ways; invalid output = typed error, never a throw
  route: { tier: 'fast' | 'standard' | 'deep' };    // resolved by routing config with ordered fallbacks
  limits: { maxOutputTokens: number; timeoutMs: number };
  run(input: I, ctx: SkillCtx): Promise<Result<O>>;
}
type Result<O> =
  | { ok: true; value: O; usage: Usage; model: string; cacheKey: string }
  | { ok: false; error: { kind: 'timeout'|'invalid_output'|'refusal'|'provider'|'budget'|'cancelled'; retryable: boolean } };

interface SkillCtx { runId: string; seq: number; signal: AbortSignal; budget: BudgetView; user: UserContextSlice }

// Run log: the single source of truth for UI progress, replay, analytics and learning.
type RunEvent =
  | { t: 'user_input'; text: string; modality: 'text'|'voice' }
  | { t: 'skill_done' | 'tool_done'; name: string; ok: boolean; usage: Usage; outputRef: string }
  | { t: 'tool_requested'; name: string; args: unknown; needsApproval: boolean; idemKey: string }
  | { t: 'input_requested'; questions: Question[]; defaults: Record<string, string>; expiresAt: string }
  | { t: 'approved' | 'denied' | 'input_received' | 'cancelled'; by: 'user'|'timeout'|'policy' }
  | { t: 'degraded'; from: string; to: string; reason: string }
  | { t: 'halted'; reason: 'budget'|'loop'|'deadline'|'safety'|'error' }
  | { t: 'artifact'; artifactId: string; kind: 'prompt'|'plan'|'checklist'|'workflow' }
  | { t: 'outcome'; artifactId: string; signal: 'copied'|'edited'|'ran'|'kept'|'regenerated'|'abandoned'; value?: number };
```

- **Tool contract** (Companion and MCP): a name, a description written for a new teammate, JSON Schema 2020-12 input and output schemas, and MCP hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`). Results are token-capped, errors return compacted, and tools are listed in a fixed order so the cache prefix stays stable.
- **UserContextSlice:** a Context Assembler gives each skill only what it needs, with a token budget per section (profile, active tool, top-k memories, recent artifacts, surface). Retrieval happens just in time, through tools.
- **Client protocol:** every surface, including the MCP server, uses the same four endpoints plus one SSE stream of `RunEvent`s.

## 7. Guarantees against getting stuck

| Risk | Mechanism |
|---|---|
| Runaway loops | Per-run `{maxSteps, maxTokens, maxUSD, deadline}`, checked *before* each call. Companion: 12 steps, 60 s interactive deadline. Forge: at most 3 model calls. Enforced via AI SDK `stopWhen` plus the kernel; Claude routes also get a task budget. |
| Repeating the same action | Hash `(tool, normalized args)`. A second identical call gets an "already done" note; a third halts with `halted: loop`. Stop if no new state appears in 3 steps. Repair stops when verify improves by less than δ, keeping the best draft. |
| Hung providers | `AbortSignal.timeout` on every call, set from measured p95. Per-provider circuit breakers. Fallback order: route fallbacks → smaller model → deterministic template (Tool Card skeleton plus HeuristicScorer) → partial result with an explanation. |
| Duplicate side effects on retry | DBOS checkpoints each step, so recovery does not re-run completed steps. Side-effecting tools take `idemKey = runId:seq` and upsert. |
| Waiting forever on a human | `ask_user` and `approve` are durable waits with `expiresAt`. On timeout the run continues on the shown defaults ("assume-and-show") or cancels the side effect. It never blocks indefinitely. |
| Users can't stop it | `POST /runs/:id/cancel` → a `cancelled` event → abort signals plus DBOS workflow cancellation. Closing the tab cancels interactive runs, not background ones. |
| Harmful output, or injection through tools | Safety gates run before and after as kernel middleware. Retrieved and tool content is marked as data. Side-effecting tools always require approval when the request came from retrieved content. |
| "Why did it do that?" | Record every model call: input hash, model, parameters, output. `replay(runId)` re-runs the reducer offline with the recorded outputs. `fork(runId, fromSeq, overrides)` tests a new Tool Card against real past runs, which also gives the Optimizer an evaluation harness. Store prompt content only with consent, encrypted, under the retention policy. |

## 8. MCP and A2A

- **MCP server (adopt now).** `@modelcontextprotocol/server` 2.4.0 (2026-10-23) implements the 2026-07-28 spec, which drops protocol sessions and the `initialize` handshake, a good fit for scaled-out containers. It has a Hono adapter and Skills-over-MCP. Expose `forge_prompt`, `improve_prompt`, `explain_tool` and `my_library`, so PromptAI works inside Claude, ChatGPT, Cursor and other hosts.
- **MCP client (later, with approval).** Lets the Companion act in the user's tools (Notion, Figma). Skip Sampling and Roots, both deprecated in 2026-07-28. Use the multi-round-trip `input_required` results for elicitation.
- **A2A (do not build).** v1.0 and Signed Agent Cards are reported (unverified). There are no partner agents to talk to yet.

## 9. Principles check

Anthropic's "start simple": the forge is a workflow, and only three units are agents. Its framework advice: the kernel is ours, and libraries do only I/O and durability. Context engineering: per-section token budgets, just-in-time retrieval, compaction, a stable cache prefix. All 12 factors map onto the design: versioned Tool Cards as owned prompts, the assembler as the owned context window, one Postgres for execution and business state, four launch/pause/resume endpoints, `ask_user`/`approve` as human contact, three small agents, any trigger surface, and a stateless reducer.

## 10. What NOT to build

- No society of agents messaging each other.
- No LangChain/LangGraph, Temporal cluster, Kafka, or separate vector database or queue: Postgres does it all.
- No custom provider adapters, tracing UI (emit OpenTelemetry to Langfuse, MIT core) or workflow DSL.
- No free-roaming forge agent, no computer-use agent in v1, no Claude Agent SDK containers in the request path.
- No MCP Sampling or Roots, and no reliance on `temperature: 0` for reproducibility.

## 11. Build order (1 to 3 engineers)

1. **Weeks 1–2:** Add the `runs` and `run_events` tables, the kernel, budgets, `AbortSignal` and the replay CLI. Wrap today's agents as skills unchanged and port the Supervisor graph onto the kernel. Verify: the existing Supervisor tests pass, and a recorded run replays byte-identically.
2. **Weeks 3–4:** Replace the adapters with the AI SDK. Spike DBOS for one week, where the pass criterion is that the clarification resumes at its node after a process kill. If the spike fails, fall back to Absurd. Merge the skills into `read_intent`/`compile`/`verify`/`repair`. Add the SSE event stream for all clients.
3. **Weeks 5–7:** Build the Companion agent, using the forge as a tool. Ship the MCP server.
4. **Weeks 8+:** Move the Librarian and Optimizer onto DBOS schedules and queues, with the Optimizer's GEPA running in a Python worker. Add the MCP client with approvals.

## 12. Risks and open questions

- DBOS fits Lambda poorly, because recovery needs a long-lived process. This plan assumes containers.
- AI SDK majors arrive about every 6 months (v6 2025-12-22, v7 2026-06-25, per npm). Pin versions and keep the `ModelPort` thin.
- Whether DBOS queues can be shared across TS and Python (for the Optimizer) is unverified. A plain `SKIP LOCKED` job table works either way.
- GitHub metadata says GPL-3.0 for `inngest-js`, but `packages/inngest/LICENSE.md` is Apache-2.0. Moot unless adopted.

## Sources

- https://www.anthropic.com/engineering/building-effective-agents
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://www.anthropic.com/engineering/writing-tools-for-agents
- https://github.com/humanlayer/12-factor-agents
- https://modelcontextprotocol.io/specification/2026-07-28/changelog
- https://github.com/modelcontextprotocol/typescript-sdk/releases
- https://ai-sdk.dev/docs/agents/loop-control
- https://ai-sdk.dev/docs/reference/ai-sdk-workflow
- https://workflow-sdk.dev/docs/getting-started
- https://github.com/vercel/workflow
- https://docs.dbos.dev/integrations/vercel-ai
- https://dbos.dev/blog/dbos-transact-v2-typescript
- https://github.com/dbos-inc/dbos-transact-ts
- https://github.com/earendil-works/absurd
- https://lucumr.pocoo.org/tags/announcements
- https://docs.langchain.com/oss/javascript/releases/langgraph-v1
- https://docs.langchain.com/oss/javascript/langgraph/persistence
- https://mastra.ai/blog/changelog-2026-01-20
- https://github.com/mastra-ai/mastra/blob/main/LICENSE.md
- https://openai.github.io/openai-agents-js/guides/human-in-the-loop
- https://github.com/google/adk-js
- https://code.claude.com/docs/en/agent-sdk/hosting
- https://docs.temporal.io/develop/typescript/integrations/ai-sdk
- https://www.inngest.com/docs/features/inngest-functions/steps-workflows/step-ai-orchestration
- https://github.com/inngest/inngest/blob/main/LICENSE.md
- https://github.com/restatedev/restate/blob/main/LICENSE
- https://developers.cloudflare.com/workflows/
- https://github.com/triggerdotdev/trigger.dev
- https://pydantic.dev/docs/ai/integrations/durable_execution/overview/
- https://docs.boundaryml.com/home
- https://github.com/a2aproject/A2A
- https://tyk.io/blog/a2a-protocol/
- https://github.com/langfuse/langfuse
- https://platform.claude.com/docs (task budgets, effort, compaction, the sampling-parameter removal in API version 2026-10-21; per the claude-api skill reference cached 2026-10-06)
