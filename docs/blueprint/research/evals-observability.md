# Evals, observability and experimentation

Research lens for the PromptAI redesign. Date: 2026-11-10.

**Method note.** The shared web-search budget ran out at the start of this run. Findings come from fetching primary docs and papers directly, from `gh api` checks done today, and from reading the repo. Anything I could not re-verify is marked *unverified*.

## 1. Bottom line

1. **Measure outcomes, not self-grades.** Today's headline number is the Critic's 0-100 "strength". The model family that drafts the prompt also grades it. The new north star is **good outputs per weekly active user**: outputs that were copied, inserted or sent to a tool, and were not regenerated or abandoned within 2 minutes.
2. **Instrument once with OpenTelemetry GenAI conventions.** Use a thin in-house wrapper, because the conventions are still at *Development* status. Send traces to **Langfuse** (MIT core, OTLP-native, with datasets, judges and annotation queues). Use Cloud first and self-host later.
3. **Offline evals: promptfoo in CI.** It is Node-native, MIT and file-based. Golden sets live in the repo and get reviewed like code.
4. **One first-party event pipe for learning signals.** Events go into Postgres, the source of truth for personalization and learning. A content-free copy goes to **PostHog** for funnels, retention, flags and experiments. Clients get no third-party SDK.
5. **Gate every change, especially automatic ones.** Prompt edits, model swaps, routing changes and learned-policy updates all pass the same gates. An LLM judge may block a merge only once it has been calibrated against human labels.

## 2. The current repo: keep, change, drop

| Area | Verdict | Why |
|---|---|---|
| `docs/quality-rubric.md` + `rubric_version` logging | **Keep, demote** | A good versioned spec. It becomes one judge rubric among several and is validated against outcomes, not treated as truth. |
| `CriticAgent` on the same `llama-3.3-70b` route as drafting | **Change** | Self-enhancement bias (MT-Bench). Use a judge from a different model family. Keep the 2-pass cap, which prevents loops. |
| `HeuristicScorer`, `TokenGovernor` | **Keep** | Cheap deterministic checks. They form Gate 0. |
| `PromptTestService` assertions | **Keep, align** | Becomes user-facing evals, with assertion kinds renamed to promptfoo's vocabulary so users and CI share one harness. |
| `outcome_signals` (no user or session id) | **Replace** | It cannot link an outcome to a prompt version, an experiment arm or a user, so learning and experiments are impossible. Replace with the consent-tiered `events` table (§5). |
| `OutcomeAnalytics`, `ContinuousImprovement` | **Replace** | Thresholds of n≥10 and 30%, raw averages, no intervals. |
| `autotuneStrategyProfile()` | **Drop** | Appends notes to config without any check that they help. An ungated self-modification loop. |
| `usage_events.cost_usd`; the pino "never log content" rule | **Keep** | Cost also becomes a span attribute. Content enters traces only by consented reference. |
| `/admin/trace` over `audit_log`; `/admin/dashboard` `avgStrength` | **Drop** | Langfuse covers traces, and the north star replaces the KPI. `audit_log` stays for security. |
| `feature_flags` table | **Keep for kill switches** | Safety switches must not depend on a vendor. Rollouts move to PostHog. |
| CI: typecheck, gitleaks, audit, jest with mocked providers | **Extend** | No job measures output quality yet. Add gates (§7). |

## 3. Options compared

### 3.1 Tracing and LLM observability

| Option | License / activity (gh, 2026-11-10) | Fit |
|---|---|---|
| **Langfuse** | MIT outside `ee/`. Copyright now "ClickHouse, Inc." 37.3k★, v4.78.0 released today | OTLP over HTTP at `/api/public/otel` (no gRPC). The TS SDK is built directly on the official OTel client. Has datasets, online and offline LLM-as-judge, annotation queues, human-vs-AI agreement analytics, and `experiment-action` (MIT), which fails CI on `RegressionError`. Self-hosting needs web + worker + Postgres + Redis + ClickHouse + S3. |
| Arize Phoenix | **Elastic License 2.0, not OSI**: no offering it as a hosted service. 12.2k★, active | Strong, but the license shuts off options. **Assess.** |
| Opik | Apache-2.0, 23.3k★, release 2.2.143 on 2026-11-06 | The closest alternative: online eval rules plus a prompt optimizer. **Trial** it if Langfuse's ownership becomes a concern. |
| PostHog LLM analytics | MIT core | `$ai_generation` events with `$ai_model`, `$ai_input_tokens`, `$ai_total_cost_usd`, `$ai_latency`. Annotation and calibration depth is *unverified*. |
| Helicone | Apache-2.0, 6.3k★ | A gateway proxy. Do not add a network hop only for logging. |
| *Non-obvious:* raw OTel → Collector → own ClickHouse + Grafana | Apache-2.0 | The fewest vendors, but it means rebuilding annotation, datasets and judge UIs. Too much for 1-3 engineers. |

**Decision:** emit OTel spans everywhere and send them to Langfuse Cloud. A backend swap becomes a config change. Use `@hono/otel` (MIT) for HTTP spans.

The GenAI conventions now live in `open-telemetry/semantic-conventions-genai` (Apache-2.0; repo created 2026-05-05). They are still **Development** status, so pin a version. Use these names:

- spans: `gen_ai.operation.name`, `gen_ai.provider.name` (`groq` and `gcp.gemini` are well-known values), `gen_ai.request.model`, `gen_ai.usage.input_tokens` / `output_tokens`, `gen_ai.conversation.id`
- operations: `invoke_agent`, `invoke_workflow`, `execute_tool`
- judge scores: the `gen_ai.evaluation.result` event (`gen_ai.evaluation.name`, `.score.value`, `.score.label`, `.explanation`)

Content attributes are **Opt-In** in the spec. Their `*_ref` variants (for example `gen_ai.input.messages_ref`) point to external storage. Use the refs: content stays in our encrypted store (the repo already has `content_ciphertext`), and traces hold only pointers.

### 3.2 Offline evals

| Option | License / activity | Fit |
|---|---|---|
| **promptfoo** | MIT, 27.0k★, 0.125.1 on 2026-10-25 | TS-native YAML matrices, red-teaming, an output cache, and a PR before/after GitHub Action. **Ownership flag:** it agreed on 2026-03-09 to be acquired by OpenAI and commits to staying open source and supporting many providers. MIT makes a fork possible. |
| DeepEval | Apache-2.0, 19.4k★ | G-Eval, DAG, Arena G-Eval, multi-turn and agentic metrics, pytest-native. Some features are Python-only. **Trial.** |
| Inspect AI (UK AISI) | MIT, 3.2k★, active | The best harness for sandboxed agent evals, in Python. **Assess** once PromptAI runs tool-using agents. |
| Braintrust | Proprietary. `autoevals` is MIT | Borrow its scorers, not the platform. |
| Ragas | Apache-2.0. Last release 2026-01-13, last push 2026-02-24 | Slowing and RAG-only. **Avoid** as core. |
| OpenAI Evals | License NOASSERTION; last push 2026-04-14 | Legacy. **Avoid.** |

**Decision:** promptfoo authors and runs golden sets in CI, and results are mirrored to Langfuse experiments for history. A small gate script reads promptfoo's JSON output and applies §7, so the thresholds stay ours.

### 3.3 Analytics, flags and experiments

| Option | License / activity | Fit |
|---|---|---|
| **PostHog** | MIT outside `ee/`. iOS SDK MIT, JS SDK Apache-2.0 | Analytics, flags, experiments and surveys in one tool, with an EU region. Its docs put the Cloud free tier at 1M events a month. PostHog does not support self-hosting, and self-hosted instances get free-plan features only. |
| GrowthBook | MIT outside enterprise directories. v5.2.0 on 2026-11-03 | **Warehouse-native**, including Postgres: it runs read-only SQL on our events. Bayesian by default, CUPED, sequential tests, guardrails and sample-ratio-mismatch checks. **The fallback.** |
| Statsig | Proprietary | Its homepage now describes it as part of Amplitude; the ownership history is *unverified*. **Avoid** (lock-in plus churn). |
| Unleash / Flipt | **AGPL-3.0** / **FCL-1.0-MIT (not OSI)** | Flagged licenses. **Avoid.** |
| *Non-obvious:* OpenFeature (Apache-2.0) + interleaving + pairwise | — | Low traffic leaves quality A/B tests underpowered. Interleaving merges two rankers' alternatives into one list and credits whichever ranker's item the user picks, so each user acts as their own control. Netflix reports large sensitivity gains; the figure is *unverified* (the page returned 403). PromptAI already ranks alternatives. |

**Decision:** PostHog Cloud (EU). Flags are evaluated **server-side** and bootstrapped in the session payload, so no native SDK is needed on iOS or Android and there is one consent gate. Ranker and alternative changes use interleaving or pairwise comparison. Classic A/B tests are reserved for funnel and retention changes.

## 4. Eval architecture

There are two loops. **Offline:** golden sets in the repo, run by promptfoo, then the gate script, then a PR comment or a block. **Online:** OTel spans go to Langfuse, where sampled judges score them and an annotation queue collects human labels; events go to Postgres and PostHog. Consented failures and judge-human disagreements are promoted into golden sets by PR, which closes the loop.

### 4.1 The measurement ladder

Each rung is cheaper and noisier than the one above it.

- **L0, deterministic:** schema, required slots, platform syntax, token budget, safety, no loop (3 or more regenerations).
- **L1, LLM judge:** rubric, intent coverage, and **missing-context recall**: of the facts an annotator says the user forgot, how many did the system ask about or supply. This tests "covers what they forgot to say" directly.
- **L2, human:** pairwise preferences from the team and from users who opt to share.
- **L3, outcome:** the §5 signals. This is the only rung that proves value.

### 4.2 Judge calibration

1. Keep a separate **calibration set** of about 200 human pairwise labels per major slice.
2. **Swap positions** on every judgment. A judge that flips its answer scores a tie.
3. **Control for length.** Length-controlled AlpacaEval raised its Spearman correlation with Chatbot Arena from 0.94 to 0.98.
4. The judge comes from a **different model family** than the generator.
5. **Promotion rule:** a judge may block merges only at ≥0.75 pairwise agreement and κ ≥ 0.6 on pass/fail, per slice. These thresholds are our policy. MT-Bench reports that strong judges agree with humans more than 80% of the time, about as often as humans agree with each other. Below the bar, the judge is advisory only.
6. **Recalibrate** when the judge model, the rubric or the slice mix changes. EvalGen documents "criteria drift", so version the rubric.

### 4.3 Golden sets

- **Slices:** tool (top 10 by traffic, not all 13 registry entries) × segment (novice/expert, language, typed/dictated, device). Start with about 50 cases per tool and grow to about 200.
- **Mix:** 60% consented, stratified production cases; 25% adversarial (injection, conflicting constraints, vague one-liners); 15% synthetic edge cases.
- **Case format:** JSONL `{id, slice, input, input_mode, user_profile_fixture, expected:{must_cover[], must_not[], format}, reference?, tags[]}`.
- **Held-out canary:** 20% of each slice is never used by optimizers (DSPy, the Evolver), which guards against Goodhart's law.
- **Dictation:** consented and CC0 audio, sliced by accent, language and noise. Score with WER/CER (`jiwer`, Apache-2.0), entity error rate on personal vocabulary, and **intent preservation**: does the intent classified from the ASR transcript match the intent classified from the human transcript?

### 4.4 Statistics sized for 1-3 engineers

- **Bootstrap 95% intervals** on every slice metric. Hide slices with n < 30.
- **Prediction-Powered Inference** (Angelopoulos et al.): combine a few human labels with many judge labels to get a valid confidence interval on true success, corrected for judge bias.
- **Log the propensity of every policy choice** (alternative order, next-action chips, model route). Replay or IPS evaluation of a new policy then becomes possible before it ships (Li et al.).

## 5. Event schema for learning signals

```json
{ "event": "suggestion.accept", "v": 1, "event_id": "uuid", "ts": "iso8601", "seq": 42,
  "pid": "pseudonymous, rotatable, deletable", "session_id": "uuid", "task_id": "uuid", "run_id": "uuid|null",
  "surface": "web|extension|desktop|ios|android", "app_version": "x.y.z",
  "tool_id": "midjourney", "task_type": "image_gen",
  "artifact": { "prompt_version_id": "uuid", "rubric_version": "v1.0" },
  "exp": [{ "flag": "alt_ranker", "variant": "b" }],
  "decision": { "policy_id": "ranker@3", "item_id": "alt_2", "rank": 2, "propensity": 0.31 },
  "consent_tier": 0, "props": {} }
```

Names match the prediction and memory lenses; harmonize them at the blueprint merge.

| Event | Key props (no content) | Use |
|---|---|---|
| `idea.submit` | input_mode, chars, lang, predicted_task_type, confidence | intent model, slicing |
| `dictate.end` | audio_ms, asr_model, words, post_edit_ratio_60s, undo | dictation reward, WER proxy |
| `intent.override` | from, to | intent labels |
| `question.shown/answer/skip` | slot, position | clarify-policy reward |
| `suggestion.shown/accept/reject` | items[{id, rank, propensity}], edit_ratio | ranker, interleaving credit |
| `prediction.shown/hit` | k, calibrated_p, hit_rank | next-action accuracy, calibration |
| `output.generate` | latency_ms, cost_usd, model, refinements | cost, latency |
| `output.copy/insert/send` | destination_tool | **strong implicit success** |
| `output.edit/regenerate` | edit_ratio, secs_since_output | partial or negative reward |
| `outcome.report` | worked / didnt_work / mixed, reason_code | explicit reward |
| `task.complete/abandon` | duration_ms, turns | success, stuck rate |
| `skill.update`, `memory.propose/accept/reject` | tool_id, levels, kind | LEARN progress, personalization precision |
| `safety.block`, `appeal.open`, `consent.change` | category, tiers | guardrails, compliance |

**Consent tiers**

- **Tier 0 (default):** content-free events, kept 13 months. They feed PostHog and personalization.
- **Tier 1 (opt-in "help improve"):** traces carry `*_ref` pointers to redacted content, kept 30 days and sampled for judges.
- **Tier 2 (per-item "share this example"):** the item goes to the annotation queue and can be promoted to a golden set by PR.

Data is deletable by `pid`. Owner aggregates suppress cells with fewer than 20 users. Differential privacy (OpenDP, MIT) waits until we publish public stats.

**Pipe.** Clients capture events locally and batch-sync them to `POST /v1/events`. One shared Zod schema validates them. They are appended to a monthly-partitioned Postgres `events` table, and Tier-0 events are forwarded to PostHog. A CI contract test fails on any event the schema lacks.

## 6. Metrics tree

- **North star:** good outputs per WAU.
- **Quality:**
  - task success: `worked`, OR copy/insert with no regenerate within 2 minutes, AND not abandoned
  - calibrated judge pass rate
  - missing-context recall
  - pairwise win rate against the previous release
- **Speed:** time to the first good output (p50/p75), questions asked per success, skip rate.
- **Prediction:** top-1/top-3 hit rate, ECE/Brier calibration, abstain rate.
- **Dictation:** WER and intent preservation on the golden set; production post-edit words per 100.
- **Personalization:** memory acceptance rate; success gain against a no-memory holdout.
- **Growth:** W1/W4 retention by cohort and surface; tools per user; skill progression.
- **Guardrails:** cost per good output, p95 latency, error rate, stuck rate (3 or more regenerations, or more than 6 turns without success), upheld appeals.

## 7. Quality gates

| Gate | Trigger | Runs | Blocks when |
|---|---|---|---|
| **G0** | every PR | jest, typecheck, L0 on cached golden outputs, event-schema contract | any failure |
| **G1** | PR touching prompts, `model-routing.json`, the rubric or agents | promptfoo golden set (about 300 cases, stratified) + pairwise against `main` with a calibrated judge | win-rate CI upper bound < 0.5 overall or on a top-5 slice; any critical case fails (safety, format, locked node); cost +20%; p95 latency +25% |
| **G2** | nightly | full suite, red-team, dictation WER, judge κ check, model drift | opens an issue; demotes a judge whose κ falls below 0.6 |
| **G3** | release | PostHog rollout 5% → 25% → 100% with guardrail metrics | a breach turns the flag off |
| **G4** | any automatic adaptation (Evolver, bandit, memory rules) | G1, plus replay/IPS on logged propensities | lower bound below the incumbent |

G4 replaces `autotuneStrategyProfile`: the system can keep adapting without regressing silently.

## 8. Dashboards (dataviz spec)

These follow the dataviz method throughout:

- **Form before color.** One y-axis per chart (cost and quality are separate charts).
- **Filters in one row above the charts:** date presets, surface, tool, segment.
- **Interaction:** a crosshair tooltip on lines, a per-mark tooltip on bars and cells, and a table view for every chart.
- **Color:** status colors only for gate states, with an icon and a label.
- **Placeholder palette** until Astryx tokens are mapped, checked with `validate_palette.js`:
  - categorical slots 1-3 (`#2a78d6`, `#eb6834`, `#1baf7a`) pass every check in light mode; aqua is below 3:1 contrast, so it needs direct labels.
  - the dark steps (`#3987e5`, `#d95926`, `#199e70`) pass every check.
  - the funnel's ordinal blue ramp passes in light mode. In dark mode, steps 600/550 **failed** ΔL, so use steps 600, 500, 400, 300, 200, which pass.

### 8.1 Owner view ("Is the product getting better?")

1. **Hero figure:** good outputs per WAU, with the delta against the prior period.
2. **KPI row** of stat tiles (value + delta + sparkline): task success, time to the first good output (p50), acceptance, W4 retention, cost per good output, p95 latency.
3. **Line chart:** task success over time, with release markers labeled directly.
4. **Ranked horizontal bars:** success by tool, one hue, n labels, slices with n < 30 hidden.
5. **Heatmap:** golden-set pass rate, tool × dimension, sequential blue.
6. **Experiment panel:** a diverging bar per metric (variant minus control, blue↔red, gray midpoint) with CI whiskers.
7. **Funnel:** idea → output → copy/insert → worked, on the ordinal ramp.
8. **Dumbbell:** WER before → after per language.
9. **Tables:** judge calibration per slice; gate history with status labels.

### 8.2 User "Insights" view ("Am I getting better at my tools?")

These numbers are personal and never ranked against other users.

1. **Hero:** "This week, 14 prompts worked first time" (example copy).
2. **Stat tiles:** your median time to a good output compared with last month; first-try acceptance; dictation corrections per 100 words.
3. **Meters:** skill level per tool against the next level, for at most four tools.
4. **Emphasis line:** your time to a good output over time, with your personal best highlighted.
5. **"What PromptAI learned about you":** an editable list with undo and delete. This is transparency, not a chart.
6. **Next-skill card:** one coaching tip, drawn from your most frequent failure category.

## 9. What NOT to build

- A homegrown trace viewer, judge UI or annotation tool.
- Self-hosted PostHog (PostHog does not support it), or self-hosted Langfuse on day one (four stateful services). Move only when volume or residency requires it.
- Phoenix (ELv2), Unleash (AGPL), Flipt (FCL) or Statsig as core. Ragas or OpenAI Evals as foundations.
- A logging-only proxy gateway. A bespoke experiment statistics engine.
- Underpowered quality A/B tests. Use offline pairwise evaluation and interleaving.
- Session replay on screens that show prompt content.
- Per-agent evals for all 13 legacy agents before an end-to-end eval exists.
- Treating the Critic score as a KPI, or any ungated self-tuning.

## 10. Build order

1. **Weeks 1-2:**
   - OTel wrapper + `@hono/otel` + Langfuse Cloud
   - `events` table, schema and endpoint
   - north-star SQL view
2. **Weeks 3-4:**
   - promptfoo golden sets for the top 3 tools
   - gates G0 and G1
   - 200 calibration labels
   - judge on a different model family
3. **Weeks 5-6:**
   - PostHog server-side flags with G3
   - owner dashboard
   - dictation set
4. **Then:**
   - interleaving
   - propensity logging and G4
   - Insights view
   - nightly G2

## Sources

- https://github.com/open-telemetry/semantic-conventions-genai
- https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/README.md
- https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/client-inference.md
- https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-events.md
- https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md
- https://opentelemetry.io/docs/specs/semconv/gen-ai/
- https://github.com/honojs/middleware/tree/main/packages/otel
- https://github.com/langfuse/langfuse/blob/main/LICENSE
- https://langfuse.com/self-hosting
- https://langfuse.com/integrations/native/opentelemetry
- https://langfuse.com/docs/evaluation/overview
- https://github.com/langfuse/experiment-action
- https://github.com/Arize-ai/phoenix/blob/main/LICENSE
- https://www.comet.com/docs/opik/
- https://github.com/Helicone/helicone
- https://github.com/promptfoo/promptfoo
- https://www.promptfoo.dev/blog/promptfoo-joining-openai/
- https://www.promptfoo.dev/docs/integrations/github-action/
- https://deepeval.com/docs/metrics-introduction
- https://inspect.aisi.org.uk/
- https://github.com/explodinggradients/ragas
- https://github.com/openai/evals
- https://github.com/braintrustdata/autoevals
- https://posthog.com/docs/llm-analytics
- https://posthog.com/docs/llm-analytics/manual-capture
- https://posthog.com/docs/libraries
- https://posthog.com/docs/self-host
- https://github.com/PostHog/posthog/blob/master/LICENSE
- https://docs.growthbook.io/statistics/overview
- https://docs.growthbook.io/warehouses
- https://github.com/growthbook/growthbook/blob/main/LICENSE
- https://www.statsig.com/
- https://github.com/Unleash/unleash
- https://github.com/flipt-io/flipt/blob/main/LICENSE
- https://github.com/open-feature/spec
- https://github.com/opendp/opendp
- https://github.com/jitsi/jiwer
- https://arxiv.org/abs/2306.05685
- https://arxiv.org/abs/2404.04475
- https://arxiv.org/abs/2404.12272
- https://arxiv.org/abs/2301.09633
- https://arxiv.org/abs/1003.5956
- https://netflixtechblog.com/interleaving-in-online-experiments-at-netflix-a04ee392ec55 (returned 403; claim unverified)
