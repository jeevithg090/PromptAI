# Prompt generation and optimization

Research lens for the PromptAI redesign. Written 2026-11-10. Repo facts come from reading `/Users/gangadhara/Documents/PromptAI/repo`. Web facts are cited inline and in the Sources list. Anything I could not verify is marked "unverified".

## TL;DR

1. **Replace the fixed 11-node taxonomy with three pieces of data.** An **Intent Spec** captures what the user wants: goal, constraints, a success checklist and labelled assumptions, and it is the same for every tool. A **Tool Card** is a versioned Markdown/YAML file, compatible with SKILL.md, that says how one tool takes input: its fields, limits, parameter grammar, quirks and examples. A **Playbook** is a small, learned list of bullets for each tool. A new tool then needs a new card and no code.
2. **Keep generation cheap at request time.** One compile call, one cheap checklist verify, and at most one targeted repair: 1 to 3 calls in all. Today the Critic alone can make 5 large-tier calls: one score plus up to 2 refine-and-rescore pairs (`CRITIC_MAX_REFINEMENTS=2`).
3. **Optimize the shared compiler offline, not each user's prompt online.** Use GEPA, the reference library (MIT), to tune each Tool Card's compile instructions on real, consented, outcome-labelled requests. Use an ACE-style curator for the Playbook bullets. Use a bandit, with no LLM, to choose online between promoted variants.
4. **Trust real outcomes first and LLM judges last.** Score with yes/no checklists and deterministic verifiers, not a holistic 1–3 rubric. Use a judge from a different model family, or several judges. Keep a held-out set the optimizer never sees. Penalize growth in prompt length.
5. **The value has moved.** Targets follow instructions closely, rewrite prompts themselves and change syntax every few months. PromptAI wins on intent completeness ("what you forgot to say"), correct tool options and learning from outcomes, not on adjectives.

## 1. What changed in 2025–2026

- **Instruction-following models punish conflicts and over-emphasis.** OpenAI's GPT-5.1 guide says the main lever is removing conflicting instructions. It recommends metaprompting: diagnose in one call, make small edits in another, re-run evals. Anthropic's guide says to explain *why*, say what to do rather than what not to do, and soften "CRITICAL: You MUST" wording, which now causes over-triggering. Google says to keep Gemini 3 at temperature 1.0. A fixed "more specificity is better" rubric fits none of this.
- **Targets rewrite prompts themselves.** Imagen and Veo on Vertex AI have an LLM prompt rewriter (`enhancePrompt`) that is on by default for the listed models. Runway has its own prompt enhancer. For these tools, piling on descriptors is wasted effort. What still matters is the intent the rewriter cannot guess: exact copy, brand assets, aspect ratio, what must survive.
- **Syntax churns.** Midjourney V8.x dropped `--cref`/`--cw` and changed `--q`; reports differ on whether Omni Reference survives in V8.2 (unverified). FLUX.2 accepts structured JSON prompts and does not support negative prompts. Suno v5 has separate Style and Lyrics fields and a style limit of about 1,000 characters (community-sourced). The repo hardcodes `--no` negatives for Midjourney in `PromptSerializer.ts`, which is exactly the kind of code that goes stale.
- **Vendors now publish their own prompting knowledge as Agent Skills.** SKILL.md became an open standard in December 2025 and was quickly adopted by Codex, Copilot and Gemini CLI (secondary sources). Black Forest Labs maintains an MIT-licensed `skills` repo. Its `flux-3-prompt-doctor` skill says to ask only blocking questions and to use documented defaults or label assumptions, which is PromptAI's clarify step written by the vendor. AGENTS.md is now a Linux Foundation (AAIF) project for coding-agent instructions.
- **Optimization became reflective and sample-efficient.** GEPA beats MIPROv2 (+13% aggregate against +5.6%, paper v2) and GRPO (+6% on average with up to 35x fewer rollouts). It was accepted as an ICLR 2026 oral (secondary source). It graduated from experimental in DSPy 3.5 (released 2026-11-10). ACE ("evolving playbooks") reports +10.6% on agent benchmarks and +8.6% on finance tasks without labelled supervision. It also names two failure modes to design against: *brevity bias* and *context collapse*.
- **Vendor optimizers are locked to one vendor and change often.** OpenAI's docs say its dataset-backed optimizer retires with Evals (read-only 2026-10-31, shut down 2026-11-30). Vertex's data-driven optimizer supports only GA Gemini models. Anthropic's improver (Nov 2024) runs no benchmark tests. Use them as references, not foundations.

## 2. The current repo: keep, change, drop

| Element (file) | Verdict | Why |
|---|---|---|
| `defaulted` and `locked` flags (`types/Prompt.ts`) | **Keep** and promote | `defaulted` surfaces assumptions instead of hiding them, which is the core of "cover what the user forgot". `locked` is the right edit-safety rule. Both move onto Intent Spec items and Tool Card fields. |
| `platform-registry.json` (quirks, syntax_rules, max_prompt_tokens, modes) | **Keep as seed, change shape** | Becomes the frontmatter of each Tool Card. Add `version`, `verified_at`, `sources[]`, `fields`, `param_grammar`, `rewrites_prompt`, `unsupported[]`. |
| `strategy-profiles.json` ("tuning is config, not code") | **Keep the principle, merge** | Task strategy becomes part of the card and the Playbook, and is the thing GEPA optimizes. |
| 11 global `NODE_TYPES` + `maps_to_node` | **Change** | Slots become tool-declared (JSON Schema in the card). "composition_camera" means nothing to Claude Code, and "lyrics" has no node at all. |
| `PromptSerializer.ts` switch on `platform_id` | **Drop the code path** | Replace it with a card-declared field mapping plus deterministic validators. Keep one generic text fallback. |
| 8-dimension, 1–3 rubric with weights and the 0–100 Strength Score | **Change** | Keep `non_conflict` and `platform_fit` as deterministic or narrow lint checks. Replace the holistic score with a per-request checklist ("7/8 of your requirements covered, 2 assumptions made"). A weighted LLM opinion shown as a precise number invites Goodhart effects. |
| Critic refine loop on every request (`CriticAgent.ts`) | **Drop as default** | Costs up to 5 large-tier calls, makes the judge the target, and duplicates what offline optimization should fix once for every user. |
| AlternativesAgent on every request | **Make on-demand** | Generate alternatives only when the user opens a field. |
| `outcome_signals` + `ContinuousImprovement.ts` + `OutcomeAnalytics.ts` | **Keep and expand** | The seed of the data flywheel. Today it only *suggests* tuning; make it feed the offline optimizer. |
| `HeuristicScorer.ts`, `TokenGovernor.ts` | **Keep** | Deterministic verifiers are the most trustworthy signal you have. |
| `PlatformProfileAgent`, `ModelRefreshAgent` | **Keep, repurpose** | They become the Tool Card authoring and refresh pipeline: read docs or a vendor SKILL.md, propose a card diff, a human approves. |
| revival.md 2.1 "Prompt Evolver" (hand-rolled genetic loop) | **Change** | Ship it as a power feature for users who bring test cases, built on GEPA rather than a custom GA. Skip the evolution-tree UI at first. |

## 3. Representation: options compared

| Option | New tool without code? | Optimizable? | User-editable? | Runtime cost | Verdict |
|---|---|---|---|---|---|
| A. Fixed typed nodes + code serializers (today) | No: needs a new enum value and serializer case | Partly (per node) | Yes | High (structured JSON drafting plus alternatives) | Retire |
| B. DSPy/Ax typed programs per tool (signatures) | No: a program for each tool | Excellent | No (developer-facing) | Low | Use only *inside* the offline optimizer |
| C. Prompt markup / typed LLM functions (POML, BAML, Prompty) | Template files, not code, but the template author must know the tool | Moderate | Developer-facing | Low | Not for end users. POML activity has slowed (last push Jan 2026). |
| D. Free text + structured spec: **Intent Spec + Tool Card + Playbook** | **Yes** (new card) | **Yes**: card instructions and playbook are text, which GEPA/ACE optimize | **Yes**: spec checklist and card fields render as forms | **Low** (1 compile call) | **Recommend** |
| E. (Non-obvious) Do not write the prompt: delegate to the target's own rewriter or the vendor's SKILL.md | Yes | No | Little | Lowest | Use **per card** where `rewrites_prompt: true`. PromptAI then sends a short, intent-complete brief instead of a long prompt. |

### Recommended shapes

**Intent Spec** (tool-agnostic; what clarifying questions fill in; what memory personalizes):

```yaml
goal: "15s launch teaser for an eco sneaker"
deliverable: {kind: video, duration_s: 15}
audience: "Gen-Z, Instagram Reels"
inputs: [{ref: "asset://logo.png", role: "must appear exactly"}]
constraints:            # hard; never dropped
  - {id: c1, text: "brand name 'Verde' spelled exactly", verifier: contains}
preferences:            # soft; user or memory sourced
  - {id: p1, text: "warm, hopeful tone", source: memory}
checklist:              # the success criteria; doubles as the verifier
  - {id: k1, text: "one subject action, one camera move", must: true, verifier: llm_yesno}
assumptions:            # the `defaulted` idea, now first-class
  - {id: a1, text: "9:16 aspect ratio", why: "Reels", confirmed: false}
```

**Tool Card** (one Markdown file with frontmatter, SKILL.md-compatible so vendor skills can be imported and their license checked):

```yaml
id: midjourney@v8.1
verified_at: 2026-11-01
sources: [https://docs.midjourney.com/...]
rewrites_prompt: false
fields:                         # what the compiled output is made of
  prompt: {type: string, max_chars: 6000}
  params: {type: string, grammar: "(--(ar|sref|oref|sw|ow|s|chaos) \\S+ ?)*"}
unsupported: [cref, cw]        # verifier rejects these
compile_instructions: |         # <- the text GEPA optimizes
  ...
playbook: []                    # <- the bullets ACE curates (id, text, helpful, harmful)
examples: [...]
```

Other cards declare other fields: Suno `style` + `lyrics`, FLUX.2 `json_prompt`, Claude Code `task_message` + `agents_md_patch`, GPT-5.x `system` + `user`. The compiled result is `{fields, coverage: {k1: span…}, assumptions, card_version, variant_id}`. The coverage map drives the UI: an Astryx form generated from the field schema, checklist items highlighted inside the prompt, and lock or redraft per field.

Why D beats A: each tool declares its own structure, which no global taxonomy can match, and it is exactly what the optimizers act on (text instructions plus bullets).

## 4. Optimization: options compared

| Method | What it optimizes | Data needed | Runtime cost | Fit for PromptAI |
|---|---|---|---|---|
| Critic + refine loop (today) | One prompt, per request | None | Up to 5 large-tier calls | Drop as default |
| APE / OPRO / EvoPrompt / PromptBreeder | Instruction search per task | Dev set + scorer | Many calls | Ideas absorbed by GEPA. Research repos, low activity. Avoid as dependencies. |
| TextGrad | Text "gradients" through a computation graph | Loss function | Several calls per step | Concept is fine. Repo inactive since Jul 2025, and 2026 work (TextReg) shows its prompts overfit out of distribution. Avoid. |
| PromptWizard | Critique-and-synthesize loop over instructions and examples | Small dev set | Offline | Assess only; superseded by GEPA |
| DSPy MIPROv2 / SIMBA | Instructions + few-shot demos (Bayesian search / introspective mini-batches) | 20–200 examples | Offline | Good alternative when feedback is only a score with no text |
| **GEPA** | Any text artifact, using textual feedback ("ASI") and a Pareto frontier | Works from very few examples (README) | **Offline**, budget via `max_metric_calls` | **Adopt for compile_instructions** |
| **ACE** (generator/reflector/curator) | An evolving bullet playbook, updated in small deltas | Execution feedback, no labels needed | Offline or batched | **Adopt the curator pattern for Playbooks** (borrow the design; no need for the code) |
| RL fine-tune (GRPO, Agent Lightning) | Model weights | Thousands of rollouts | Hosting open weights | Not now; GEPA matches it with far fewer rollouts |
| Vendor optimizers | One vendor's prompts | Datasets + graders | N/A | Reference only; one is being retired this month |

### Recommended loop: three speeds

**Fast, per request (1–3 calls, no judge loop).**
1. *Compile:* Intent Spec + Tool Card + top Playbook bullets + user preference bullets go to the card's fields, using a mid-tier model.
2. *Verify:* deterministic checks first (limits, parameter grammar, `unsupported`, exact-copy `contains`), then yes/no answers per `must` checklist item from a small model in one batched call.
3. *Repair once,* only if a `must` item fails, touching only that field and never a `locked` one. Hard cap 1; then ship and show the gap ("couldn't fit X").

**Medium, online, no LLM.** Each card keeps 2–3 promoted `compile_instructions` variants. A Thompson-sampling bandit picks one per request, rewarded by implicit outcomes: copied unchanged (good), heavily edited by edit distance (weak bad), regenerated (bad), "worked / didn't" (strong), and for FIRE runs whether the output was kept. This also absorbs model drift.

**Slow, offline, weekly per tool with enough traffic.**
- *GEPA* over `compile_instructions`. The training set is sampled real requests (consented and anonymized), each with its Intent Spec and outcome. The metric combines real-outcome preference pairs (the user's final edited prompt beats ours), deterministic checks and multi-judge checklist scores. Textual feedback for GEPA's reflection comes straight from the failed checklist items and verifier messages. Cap the budget with `max_metric_calls` (GEPA's README cites roughly 100–500 evaluations for typical runs).
- *ACE curator* over `playbook`. A reflector proposes delta bullets from failures. Non-LLM merge logic dedupes them, keeps helpful/harmful counters, retires bullets whose harmful count exceeds their helpful count, and enforces a size cap.
- *Promotion gate.* The candidate must (a) beat the incumbent on a held-out split the optimizer never saw, (b) not regress on any deterministic check, and (c) then win a shadow slot in the bandit before replacing a variant. Version every promotion in git, like `docs/quality-rubric.md` today.

**Personalization.** Do not run GEPA per user. Learn per-user *preference bullets* (ACE-style deltas, such as "always 16:9 for YouTube thumbnails" or "British spelling") from the user's edits, and inject them as Intent Spec defaults that are visible and editable. The memory lens owns storage.

**Language choice.** Run GEPA as an offline Python job (a scheduled CI job is enough). Its results are text committed to the cards, so the TypeScript runtime never imports Python. Ax (Apache-2.0) offers `AxGEPA` and ACE in TypeScript if the team wants one language.

## 5. Avoiding overfitting to an LLM judge

1. **Rank signals by how much to trust them, and say so in the metric:** real outcomes > deterministic verifiers > human pairwise labels > LLM yes/no checklist > LLM holistic score. Never optimize on the holistic score alone.
2. **Use yes/no checklists, not Likert scales.** Apple/CMU's RLCF showed checklist-derived rewards helped on every benchmark they tested, where reward models did not. They also argue reward models are "arbitrary" and hackable. Per-request checklists also come straight from the Intent Spec.
3. **Separate the judge from the generator and use more than one judge.** Use a different model family to limit self-preference, or a panel of small judges (GMPO, ACL 2026, says single-evaluator optimization "weakens transfer").
4. **Keep hidden anchors.** Keep a frozen held-out set with exact-match or human-labelled answers that the optimizer never sees. A July 2026 study saw judge pass rates rise from 0.72 to 0.94 while anchor-verified accuracy stayed at 0.20.
5. **Judge outputs, not prompt self-claims.** Where possible (FIRE), score what the target tool produced. Strip any text addressed to the judge: "One Token to Fool LLM-as-a-Judge" shows a single superficial token can flip verdicts.
6. **Regularize for length and scope.** TextReg (2026) documents "prompt distributional overfitting": optimized prompts grow and pile up narrow, sample-specific rules. Penalize growth in characters and new rules in the metric, and cap Playbook size.
7. **Calibrate monthly** against about 50 human-labelled items; replace the judge if agreement drops.
8. **Re-optimize when the model changes.** PromptBridge (Dec 2025) measured significant "model drifting" when prompts move between models. A card's variants are tied to a target model version; a version bump triggers re-verification and an offline run, not silent reuse.

## 6. Seed notes for the first Tool Cards (verify before shipping)

| Target | Card-level rules to encode |
|---|---|
| Claude (5.x family per docs) | XML-tag sections; explain why; say what to do instead of what not to do; no ALL-CAPS urgency; long documents at the top. |
| GPT-5.x | Resolve conflicts explicitly (hierarchy or conditional rules); use the `verbosity` parameter plus per-response length rules; plan before tools. |
| Gemini 3 | Short, direct prompts; leave temperature at 1.0; put key restrictions near the end (secondary source). |
| Midjourney V8.x | Field split `prompt` + `params`; `--sref`/`--oref` need text; V6-only flags rejected (secondary docs mirror). |
| FLUX.2 / FLUX 3 | Optional JSON prompt; no negative prompts; subject first. Import BFL's MIT `skills` repo as a source. FLUX 3 release details unverified beyond that repo. |
| Imagen / Veo | `rewrites_prompt: true`; send a short, intent-complete brief; keep exact copy and must-keep items explicit. |
| Suno v5 | `style` (≤1,000 chars, unverified) + `lyrics` with section tags. |
| Coding agents (Claude Code, Codex, Cursor) | Two fields: the task message (goal, acceptance tests, constraints, files) and an optional AGENTS.md/CLAUDE.md patch; discourage overengineering. |

## 7. What NOT to build

- No hand-rolled genetic optimizer (use GEPA), no request-time search or critic loop, no per-user optimization runs.
- No RL fine-tuning of a compiler model until offline GEPA plus the bandit hits a measured ceiling.
- No per-tool serializer code. The only code is the generic field mapper and the verifier engine.
- No dependence on vendor optimizers, and no adopting TextGrad, OPRO, APE, EvoPrompt or PromptWizard repos as dependencies.
- No user-facing 0–100 "strength" number. Show coverage and assumptions.
- No 13-agent supervisor for the compile path. It is 1–3 calls; intent and clarify stay separate only because they talk to the user.

## 8. Build order for 1–3 engineers

1. **Weeks 1–2.** Spec and card schemas (Zod plus JSON Schema). Convert the 13 registry entries into cards with a script. Generic field mapper and verifier engine. *Check:* parity with today's demo examples at ≤3 calls.
2. **Weeks 3–4.** Checklist verify and single repair. Coverage map in the UI. Log outcome events, with `variant_id` and `card_version`.
3. **Weeks 5–6.** Card authoring from docs or SKILL.md, with human review. *Check:* add 5 tools with no code changes.
4. **Weeks 7–10.** Offline GEPA for the top 3 tools, held-out gate, bandit, ACE curator.
5. **Later.** Developer-facing Evolver on the same GEPA job. Promptfoo in CI for card regressions.

## Sources

- https://arxiv.org/abs/2507.19457 (GEPA paper)
- https://github.com/gepa-ai/gepa
- https://github.com/stanfordnlp/dspy/releases (3.4.1, 3.5.0 notes)
- https://dspy.ai/current/api/optimizers/SIMBA/
- https://arxiv.org/abs/2510.04618 (ACE)
- https://github.com/ace-agent/ace
- https://github.com/ax-llm/ax
- https://arxiv.org/abs/2406.11695 (MIPROv2)
- https://arxiv.org/abs/2406.07496 (TextGrad)
- https://arxiv.org/abs/2309.03409 (OPRO)
- https://arxiv.org/abs/2211.01910 (APE)
- https://arxiv.org/abs/2309.16797 (PromptBreeder)
- https://arxiv.org/abs/2309.08532 (EvoPrompt)
- https://arxiv.org/abs/2405.18369 (PromptWizard)
- https://arxiv.org/abs/2401.12954 (Meta-prompting)
- https://arxiv.org/abs/2605.21318 (TextReg)
- https://aclanthology.org/2026.acl-long.1089/ (GMPO)
- https://arxiv.org/abs/2512.01420 (PromptBridge)
- https://arxiv.org/abs/2507.18624 (Checklists Are Better Than Reward Models)
- https://arxiv.org/abs/2507.08794 (One Token to Fool LLM-as-a-Judge)
- https://arxiv.org/abs/2607.05904 (Self-play reward hacking of reference-free judges)
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- https://www.anthropic.com/news/prompt-improver
- https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide
- https://developers.openai.com/api/docs/guides/prompt-optimizer
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/gemini-3-prompting-guide
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/prompts/prompt-optimizer
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/use-prompt-rewriter
- https://cloud.google.com/vertex-ai/generative-ai/docs/video/turn-the-prompt-rewriter-off
- https://help.runwayml.com/hc/en-us/articles/50012632982163-Enhancing-your-Prompts
- https://docs.midjourney.com/docs/style-reference
- https://evolink.ai/docs/en/api-manual/image-series/midjourney/midjourney-v8-1-prompt-guide.md
- https://docs.together.ai/docs/quickstart-flux-2
- https://fal.ai/learn/devs/flux-2-prompt-guide
- https://github.com/black-forest-labs/skills
- https://blakecrosley.com/guides/suno-ai-music-generation
- https://agentskills.io/
- https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation
- https://github.com/agentsmd/agents.md
- https://openai.com/blog/openai-to-acquire-promptfoo
- https://github.com/promptfoo/promptfoo
- https://github.com/microsoft/poml
- https://github.com/BoundaryML/baml
- https://github.com/comet-ml/opik
- https://github.com/microsoft/agent-lightning
