# Orchestration Review (V1.7)

*Requested: "review how well you have implemented LangGraph."*

## TL;DR — the honest finding

**LangGraph is not used anywhere in this codebase, and never was.** There is no
`@langchain/langgraph` (or any LangChain) dependency in `backend/package.json`,
and no import of one anywhere in `backend/src`. Verify:

```bash
grep -ri "langgraph\|langchain" backend/src backend/package.json   # → no matches
```

The pipeline is orchestrated by a **hand-rolled Supervisor state machine**
(`backend/src/services/Supervisor.ts`) — a sequential `for` loop over a fixed
`STEP_SEQUENCE`, with safety gates and a clarification pause bolted in as
special cases inside the loop. The architecture doc's "Supervisor/Planner"
(§7.2) describes this custom component; it never claimed LangGraph. So there is
no LangGraph implementation to grade — there is a custom orchestrator to
**assess against graph-orchestration criteria**, which is what this review does,
followed by the upgrade it motivated.

## The pre-V1.7 orchestrator, graded against graph-orchestration criteria

| Criterion | Before V1.7 | Notes |
|---|---|---|
| **Explicit topology** | ❌ | Flow was an implicit `for`-loop over an array; branches (block, fail, interrupt, safety-gate-2) were `if`/`return` statements scattered through the loop body. You could not see the graph. |
| **Conditional edges** | ⚠️ implicit | Routing decisions existed (block → END, fail → END, clarify → interrupt) but were imperative early-returns, not declared edges. |
| **Checkpoint / resume** | ✅ partial | Clarification genuinely suspends and resumes (`awaiting_clarification` → `/draft/:id/clarify`), but resume re-enters the whole loop and relies on agents skipping already-answered work, rather than resuming *at the interrupted node*. |
| **Interrupts** | ⚠️ ad-hoc | The clarify pause was a bespoke `if (pendingQuestions) return`, not a first-class interrupt concept. |
| **Retries / fallbacks** | ✅ per-agent | Each agent retries-once-then-degrades internally (`extractJson` + retry loop); the Supervisor had no retry policy of its own. |
| **Parallel branches** | ❌ | Everything is strictly sequential. `alternatives` could run in parallel with `critic` but doesn't. (Still sequential after V1.7 — see "Deliberately unchanged".) |
| **Observability** | ✅ | `trace: TransitionRecord[]` + structured `pipeline:transition` logs + immutable audit + live progress. This was already good. |
| **Typed state channels** | ⚠️ | `PipelineContext` is one wide mutable bag; `applyOutput` is the single writer, but there are no per-node input/output channel types. |

Net: the *behavior* was correct and well-observed, but the *structure* was
implicit — the thing a graph runtime makes explicit (topology, edges,
interrupts) lived in loop control flow.

## What V1.7 changed

Added `backend/src/services/PipelineGraph.ts` — a small, dependency-free typed
graph runtime:

- **Nodes** are named handlers `(state) => NodeResult` that return one of
  `continue` (advance along edges), `goto(name)`, `halt(reason)`, or
  `interrupt(reason)`.
- **Edges**: unconditional (`addEdge`) and **conditional**
  (`addConditionalEdge(from, state => nextName | END)`).
- **Interrupts** are first-class: a node returning `interrupt` stops the run
  with `halted: { kind: 'interrupt' }`, so the caller can resume.
- **Retry policy** per node (`{ maxAttempts }`) with the runtime re-invoking the
  handler.
- **Cycle guard**: `maxVisitsPerNode` bounds any loop so a cyclic edge (e.g. a
  refine→critique cycle) can't run away.
- **Trace**: every node visit is recorded, mirroring the old `TransitionRecord`.

`Supervisor.run` now **declares** the draft and enhance pipelines as explicit
graph topologies (`buildGraph()`), executed by that runtime. The safety
pre-flight, each agent step, safety gate 2, the clarify interrupt, and
governance are all nodes with declared edges. **Behavior is identical** — every
pre-existing Supervisor and integration test passes unchanged.

## Deliberately unchanged (and why)

- **No `@langchain/langgraph` dependency.** This backend is a Lambda
  "Lambdalith" where cold-start time is a product metric (§23.2). LangGraph +
  LangChain pull in a large dependency tree we'd load on every cold start, for
  orchestration needs (≤10 nodes, one interrupt, one bounded cycle) our ~200-line
  runtime covers exactly. The minimal-dependencies rule (task.md §0) applies.
  **Migration path if that ever changes:** the node handlers are already pure
  `(state) => result` functions with declared edges — porting them to
  `StateGraph.addNode/addConditionalEdges` is mechanical, and `PipelineContext`
  becomes the graph's state channel. This review is the migration's design doc.
- **The Critic's refine loop stays inside `CriticAgent`.** The
  critique→refine→re-score cycle is an agent's internal concern (it owns the
  rubric and the refinement prompt). Hoisting it into the Supervisor graph would
  leak rubric logic into the orchestrator and break the `Agent` contract
  (§32.2). The graph runtime *supports* cycles (cycle-guard tested); we simply
  don't need one here because the cycle is correctly encapsulated. If we later
  want per-iteration observability of refinement, that's the node to split out.
- **Still sequential (no parallel `alternatives || critic`).** Free-tier
  provider rate limits make parallelism a false economy at current volumes; the
  runtime doesn't yet model parallel fan-out. Noted as the next structural
  improvement if throughput ever matters.

## Files

- `backend/src/services/PipelineGraph.ts` — the runtime.
- `backend/src/services/Supervisor.ts` — now declares pipelines as graphs.
- `backend/tests/services/PipelineGraph.test.ts` — topology, conditional edges,
  interrupt/resume, retry policy, cycle guard.
- `backend/tests/services/Supervisor.test.ts` — unchanged, still green.
