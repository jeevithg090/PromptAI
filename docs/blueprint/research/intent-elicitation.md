# Intent understanding and clarification: research lens

Agent lens: intent understanding and clarification. Date: 2026-11-10. Scope: how PromptAI works out what a person actually wants (their goal, context, constraints, expertise and taste), decides whether to ask or to assume, and turns that understanding into a prompt that covers what the person forgot to say.

## 1. Bottom line

Replace "IntentClassificationAgent + ClarifyingQuestionAgent" with three pieces:

1. **Intent Reader.** One structured LLM call that produces an **IntentFrame**: goal, deliverable, target tool, slots with confidence and impact, 2 to 4 competing interpretations, and candidate "latent requirements".
2. **Ask Gate.** A pure function that decides in code whether any question is worth asking. It scores each candidate by expected value of information minus a per-user cost, with hard stop rules.
3. **Assume-and-show.** Every slot not asked is filled from the user's history or the task pack's default, then shown as an editable assumption chip. Edits to those chips are the main learning signal.

The expected common case is zero questions. The gate cannot loop: each slot is asked at most once, and both questions and rounds are capped.

## 2. What the research says (2024-2026)

- **Models are bad at deciding when to ask.** The hard part is detecting when clarification is needed, not using the answer:
  - Ambig-DS (2026): data-science agents use clarification well when they get it, but cannot tell when to ask. It also penalises asking on fully specified tasks.
  - "Ask or Assume?" (Edwards & Schuster, 2026): coding agents are tuned toward execution and assume too often. Its scaffold separates underspecification detection from execution; the reported resolve rate is 69.4%.
  - AskBench and ClarifyMT-Bench measure both under- and over-asking. CLAMBER (2024) traces poor questions to models misjudging their own knowledge limits.
  - **Implication:** the drafting model must not decide on its own when to ask.
- **Treat a question as an experiment.**
  - Active Task Disambiguation (ICLR 2025) frames clarification as Bayesian experimental design: sample candidate solutions, then ask the question with the highest expected information gain minus cost.
  - Uncertainty of Thoughts (NeurIPS 2024) uses an information-gain reward over simulated futures.
  - SAGE-Agent (2025/26) scores questions by **expected value of perfect information (EVPI) over tool parameters**, with per-aspect cost. It reports 7 to 39% higher coverage with 1.5 to 2.7 times fewer questions.
  - This goes back to Rao & Daumé's neural EVPI (ACL 2018).
  - **Implication:** the unit of decision is "slot × expected loss of guessing wrong". SAGE's per-parameter EVPI maps directly onto PromptAI's slots.
- **Clarification is a policy, scored over the whole conversation.**
  - RegretBench (July 2026) scores whether to ask, what to ask and when to stop by regret and interaction cost, not by final accuracy alone.
  - Zhang, Knox & Choi (ICLR 2025) label preferences by simulating the next turn. This teaches models both to ask and to answer directly.
  - CollabLLM (ICML 2025) trains with multiturn-aware rewards. In a 201-person study it reports 17.6% higher satisfaction and 10.4% less time.
  - STaR-GATE (COLM 2024) self-trains a questioner against simulated users with hidden preferences; 72% win rate after two iterations. ACT (ICLR 2025) uses DPO.
  - All of these need training infrastructure and data. **Phase 3 at the earliest.**
- **For taste, compare instead of interrogate.**
  - GATE (ICLR 2025) shows that model-driven elicitation surfaces considerations users had not anticipated, with less user effort.
  - OPEN (2024) combines LM-chosen features with Bayesian *pairwise comparisons* and beats both pure approaches.
  - **Implication:** for style, tone and visual taste, show two variants rather than asking "what lighting?".
- **Show the inferred intent so people can edit it.**
  - IntentFlow (2025/26, N=12) renders extracted intents as editable components. Users needed less effort and felt more in control.
  - Just-In-Time Objectives (Bernstein lab, 2025/26) infers the user's current objective from passive context. Its outputs won 66 to 86% of comparisons against a standard LLM.
- **What the user forgot to say is the real problem.**
  - "What Prompts Don't Say" (Findings of ACL 2026): models guess unstated requirements 41.1% of the time, but inconsistently. Underspecified prompts regress by more than 20% when the model or prompt changes.
  - **Listing every requirement also hurts.** A requirements-aware optimiser beats "specify everything" by 4.8%.
  - **Implication:** add a ranked, capped set of latent requirements.
- **Clarifying questions help only when they are good.**
  - Zou et al. (TOIS 2023): high-quality questions raise satisfaction; low- and mid-quality ones harm it.
  - A 2025 spoken-search study found that explicit clarifications *lowered* the experience. Voice surfaces need a higher bar for asking.
- **Theory of mind and persona.**
  - SimToM (ACL 2024): a two-step "filter to what this person knows, then infer" prompt is enough.
  - MetaMind (NeurIPS 2025) is a heavy multi-agent ToM pipeline, and its gains are contested (Lombardi & Lenci, 2025).
  - PrefEval (ICLR 2025): preference-following decays in long contexts even with retrieval. Store preferences as structured counts and inject them explicitly.
- **Taxonomy.**
  - Usage studies use a tiny top-level mode layer: NBER finds Asking 49%, Doing 40%, Expressing 11%.
  - Fine-grained families are *discovered* from logs: TnT-LLM for Bing Copilot, Clio and the Economic Index mapping usage onto O*NET.
  - **Implication:** keep a fixed mode layer and an open, data-driven family catalog.

## 3. The current repo: keep, change, drop

Files read: the two agents, `Supervisor.ts`, `types/Prompt.ts`, the clarify route in `routes.ts`, the taxonomy doc and JSON, `web/src/app/build/page.tsx` and `MemoryExtractionAgent.ts`.

**Keep (good principles):**
- The selector is deterministic and lives in code. An LLM proposes; code decides. This is the single best decision in the current design.
- The question bank is config-driven, with MCQ chips plus "Other".
- "Just generate now" is always available.
- Defaulted nodes carry a `defaulted` flag.
- Answered questions are never re-asked.
- Memory pre-fills answers.
- The UI asks one or two questions at a time.
- The accessibility contract.
- Zod-validated JSON with one retry, and agents never throw.
- The memory "propose, then confirm" rule.

**Change:**
- **Intent schema is too thin.** `task_type` is a 6-value enum, `entities` is a flat `Record<string,string>`, and `confidence` is computed but **never used** anywhere downstream. The schema has no goal, success criteria, audience, expertise or interpretations. Replace it with the IntentFrame (§4).
- **Lexical skip matching is brittle.** `answered_by_entities` only matches if the LLM happens to emit the key `subject` rather than `main_subject`. The fix: the task pack declares slot IDs, and the Intent Reader must fill slots by ID.
- **Priority order is not value.** The selector fills the cap with P3 polish questions (aspect ratio, "avoid") whenever any P1 or P2 question is open; the test at `ClarifyingQuestionAgent.test.ts` expects `['composition','lighting','aspect_ratio','avoid']` in round 2. Aspect ratio is low-impact and reversible, so it should be defaulted and shown, not asked.
- **Questions target prompt-surface nodes, not the user's goal.** The bank asks about lighting before purpose, and never about success criteria. Reorient it: purpose and deliverable first, surface parameters last, and taste via comparison.
- **The 6 hard-coded task types cannot serve "any tool, any field".** Move task families into a versioned catalog (config or DB).

**Bugs found (loop and consistency risks):**
1. `web/src/app/build/page.tsx` sends `clarifications: justGenerate ? {} : answers`. Clicking "Just generate" mid-clarification **throws away the answers already given**.
2. `POST /draft/:sessionId/clarify` rebuilds the context and **re-runs intent classification from scratch**. That costs an extra LLM call, ignores the answers, and can flip `task_type`, which yields a different question set on resume.
3. There is no "skipped" state. A P1 or P2 question the user leaves blank is **asked again** on the next round. The pipeline only ends when the user answers everything or gives up.

**Drop:**
- Two separate "agents" for intent and clarification. Use one Intent Reader call plus a pure gate function.
- `questions_remaining_estimate`. It is meaningless under EVOI.
- Anchoring questions on the 11-node prompt taxonomy. Nodes are an *output* serialisation concern; slots belong to intent.

## 4. The intent model (data structure)

```ts
type SlotSource = 'said' | 'inferred' | 'profile' | 'pack_default' | 'answered' | 'assumed';

interface Slot {
  id: string;                    // declared by the task pack, e.g. "audience", "aspect_ratio"
  value: string | null;
  source: SlotSource;
  confidence: number;            // P(value matches what the user wants), calibrated (see §5.4)
  options?: { value: string; p: number }[]; // posterior over discrete choices; prior = profile counts
  impact: 0 | 1 | 2 | 3;         // pack-declared: how much output changes if wrong
  reversible: boolean;           // cheap to fix after seeing output (chip edit, re-roll)?
  state: 'open' | 'asked' | 'skipped' | 'answered' | 'assumed';
}

interface Hypothesis {           // competing readings of the request
  summary: string;               // one line, user-facing, usable as an MCQ option
  weight: number;                // normalised across hypotheses
  slotDiffs: Record<string, string>; // where this reading differs from the top one
}

interface LatentRequirement {    // "what you forgot to say"
  id: string; text: string;      // from the task/tool pack or mined from edits
  relevance: number;             // to this request
  impact: 0 | 1 | 2 | 3;
  decision: 'state' | 'assume_silently' | 'skip';
}

interface IntentFrame {
  frameVersion: number;          // checkpointed per session; answers PATCH, never re-derive
  mode: 'ask' | 'do' | 'learn' | 'automate' | 'express';
  taskFamily: { id: string; confidence: number };  // open catalog id, e.g. "image.product_shot"
  targetTool: { id: string; confidence: number } | null;
  goal: string;                  // the "why", in the user's words where possible
  deliverable: string;           // the artifact that comes out
  successCriteria: string[];     // checkable statements, become acceptance checks
  constraints: string[];
  userModel: { expertise: 'novice' | 'intermediate' | 'expert'; locale: string;
               lowConfidenceSpans?: [number, number][] }; // from dictation ASR confidence
  slots: Slot[];
  hypotheses: Hypothesis[];      // K = 2..4
  latentRequirements: LatentRequirement[];
  safetyFlags: string[];
  budget: { asked: number; rounds: number; maxAsked: number; maxRounds: number };
}
```

Design notes:
- **Task packs are data.** A pack is per task family, optionally per tool. It holds slot schemas (id, impact, reversible, options, default), latent requirements with `applies_when` predicates, and comparison templates. The current `clarification-questions.json` becomes the seed for six packs. New tools and fields arrive as new packs, with no code change.
- **`mode` is the only fixed enum.** It is NBER's Asking/Doing/Expressing plus Learn and Automate, which tie to the LEARN and FIRE pillars. `taskFamily` is an open ID string resolved against the catalog. An unknown family falls back to a generic pack (goal, deliverable, audience, format, constraints).
- **Perspective-taking happens inside the Intent Reader prompt.** It follows SimToM: (1) restate what the user knows and has, from the idea, profile and project context; (2) infer goal and expertise from that. It is not a separate agent.
- **Dictation hook.** If the speech-to-text layer returns per-word confidence, words below threshold are marked `lowConfidenceSpans`. Any slot filled from those words gets `source:'inferred'` and capped confidence. Words the user may not have said must not become facts the user "said".

## 5. Question selection: the Ask Gate

### 5.1 Candidates
- **Interpretation question.** Generated if the top hypothesis has weight below τ_h and the hypotheses differ on any slot with impact ≥ 2. It is one MCQ, "Which of these did you mean?", built from the hypothesis summaries plus "Other". One answer can resolve several slots, so it is usually the highest-value question available.
- **Slot questions.** Generated for every slot in state `open` whose value is uncertain.
- **Taste comparison.** For slots the pack marks `taste:true` (style, tone, voice), show 2 or 3 variants and ask "which is closer?" (OPEN- and GATE-style). This is usually offered after the first draft, as a re-roll.

### 5.2 Scoring (pure function, no LLM)
For discrete slot *s* with posterior *p*:
- `P_wrong(s) = 1 − max_i p_i`
- `Loss(s) = impact(s) × P_wrong(s) × (reversible(s) ? ρ : 1)`, where ρ is between 0 and 1 and discounts slots fixable by a chip edit.
- `EVOI(q) ≈ Loss(s) × κ(q)`, where κ is the expected informativeness of the answer. It is near 1 for MCQ and lower for free text, since free-text answers can be vague. This is an EVPI-style upper bound, as in SAGE-Agent and Rao & Daumé.
- For the interpretation question: `EVOI ≈ max_impact(diff slots) × (1 − w_top)`.
- `Cost(q) = λ_u × (1 + asked) × surface × (freeText ? 1.5 : 1)`.
  - `λ_u` is the per-user patience parameter.
  - The cost rises with every question already asked.
  - `surface` is higher for voice and mobile, given the spoken-search evidence.
- `Net(q) = EVOI(q) − Cost(q)`.
- Starting values (for example τ_h ≈ 0.6, ρ ≈ 0.4, λ set so that a clear request asks nothing) are untested guesses. Tune them in offline simulation before launch; treat them as unverified.

### 5.3 Selection and stop rules
1. Ask the top questions with `Net > 0`: at most 2 per round (1 on voice or mobile), on different slots. Prefer the interpretation question when it qualifies.
2. **Stop** as soon as any of these is true:
   - no candidate has `Net > 0`;
   - `asked ≥ maxAsked` (default 3; the user can set 0);
   - `rounds ≥ maxRounds` (default 2);
   - the user presses Go;
   - the last round changed no posterior by more than ε;
   - a safety flag is raised;
   - a latency budget is exceeded.
3. **On answer**, patch the frame: `state='answered'`, `confidence=1`. A blank or skipped question is set to `skipped` and **never re-asked**. Free-text answers go through a tiny "apply answer" call that may only update slot values. Only the interpretation answer may change `taskFamily`. Intent is never re-classified from scratch.
4. **Fill everything else** from the posterior argmax, in priority order: profile prior, then population prior for (tool, family), then pack default, then LLM inference. Mark the slot `assumed` and surface it as a chip.
5. **"Go" keeps partial answers** (fixes bug 1).

**Termination guarantee.** Every round either asks at least one never-asked slot or stops. Slots are finite, and both `asked` and `rounds` are capped. No state transition can re-open an `asked` or `skipped` slot. So the gate stops in at most `maxRounds` rounds. This guarantee is a property of the code and can be unit-tested; it does not rest on model behaviour.

### 5.4 Calibration and learning (no RL training in v1)
- **Slot priors.** Dirichlet counts per (user, family, slot), seeded by population counts per (tool, family, slot). Answers, accepted assumptions and chip edits increment the counts. Counts decay over time, with occasional exploration, so users are not locked into past choices.
- **Hypothesis weights.** For high-impact slots, add a second sample and use cross-sample agreement, a semantic-entropy-style signal (Farquhar et al., Nature 2024), rather than self-reported confidence. Check calibration against logs.
- **Patience `λ_u`.** A Beta-Bernoulli estimate of "was asking welcome?":
  - Go, a skip, or an answer equal to the assumed default raises `λ_u`;
  - an edited chip on a slot the gate chose not to ask lowers it ("should have asked").
- **Pack tuning.** Wrong-default rates per slot across all users tune `impact` and the defaults.
- **Phase 3, if offline evaluation shows the heuristic is the bottleneck.** Build a simulated-user harness (STaR-GATE or CollabLLM style: hidden personas, multiturn reward). First use it to tune τ_h, ρ and λ; only then consider DPO fine-tuning of a questioner.

## 6. From intent to prompt: covering what the user forgot

The frame compiles into a tool-agnostic **brief**. The per-tool serializer then renders it: comma-weighted tags for image models, sections for chat LLMs, a spec file for coding agents. Sections, in order:

1. **Role and calibration.** Set from `userModel.expertise` and the audience; for example, explain for a novice, be terse for an expert.
2. **Goal and why.** The purpose lets the target model make sensible tradeoffs.
3. **Context.** What the user has: inputs, project and history.
4. **Deliverable and format.**
5. **Success criteria.** Written as a checklist. These double as the Critic's acceptance checks and as the eval assertions for EVOLVE.
6. **Constraints.**
7. **Assumptions, stated explicitly.** For example: "Assumed: audience = hiring managers (not specified)." For chat and agent targets, add one instruction: if an assumption is wrong for the task, or a blocking unknown remains, raise it before proceeding. This passes residual ambiguity downstream instead of guessing.
8. **"Covered for you" latent requirements.** Choose the top N by `relevance × impact`, with N capped at about 3 to 5 and tuned by evaluation, because "What Prompts Don't Say" shows that dumping everything backfires. Each item is visible in the UI as a removable chip with a one-line "why experts specify this".

Latent requirements come from three sources:
- tool-pack knowledge, from the platform knowledge base and docs;
- expert checklists per family; for example, `code.bugfix` includes the error text and repro steps, pins the language version, and preserves the public API;
- **edit mining**: what users repeatedly add after generation, clustered offline and promoted to a pack after human review.

These chips are also the coaching surface for the LEARN pillar: users see what experts specify.

## 7. Options compared

| Option | How it works | Pros | Cons | Verdict |
|---|---|---|---|---|
| A. Static slot-filling (current) | Per-type question lists, priority order, lexical skip | Predictable, testable, no LLM cost | Covers only 6 types; asks polish questions; brittle; misses goals and criteria; re-ask bugs | Keep its principles, replace its logic |
| B. LLM decides (prompted "ask if needed", as in Claude Code's AskUserQuestion) | Model decides whether and what to ask | Open-domain, no taxonomy | Benchmarks show both over- and under-asking; no principled stop; possible loops; hard to evaluate | Use the LLM only to *propose* candidates |
| C. Full Bayesian experimental design (Active Task Disambiguation, UoT) | Sample solutions and pseudo-answers; maximise EIG | Principled, open-domain | Many LLM calls per turn; latency; heavy for 1 to 3 engineers | Use a cheap approximation (hypotheses plus slot EVOI) |
| D. Assume-and-show, plus compare-for-taste (non-obvious) | Zero questions by default; editable assumption chips; variant comparison | Fastest path; respects users; produces learning labels | Needs good chip UX; ambiguous goals still need one question | **Core default** |
| E. Trained ask/act policy (STaR-GATE, CollabLLM, ACT, GRPO) | Fine-tune on simulated or logged multi-turn rewards | Best long-run quality in papers | GPU training, data, evaluation infrastructure; open models only | Phase 3, gated on data |

**Recommendation: D + gated C-lite inside A's deterministic shell.** E is a later option.

## 8. Open-source tools

All verified with `gh api` on 2026-11-10.

- **vercel/ai** (Apache-2.0, per LICENSE text; GitHub reports NOASSERTION; pushed 2026-11-10). Typed `generateObject` with zod for the Intent Reader. **Trial.** Plain zod plus provider JSON mode (current) is fine too.
- **BoundaryML/baml** (Apache-2.0, pushed 2026-11-10). Schema-first structured prompts with TS codegen. **Assess.** Adopt it only if multi-provider JSON robustness becomes a pain point.
- **huggingface/transformers.js** (Apache-2.0, 2026-11-10) and **MinishLab/model2vec** (MIT, 2026-11-10). On-device embeddings for instant task-family and tool pre-routing (kNN over catalog examples) in the extension, desktop and mobile web, with no server call. **Trial.**
- **aurelio-labs/semantic-router** (MIT, 2026-11-09). Embedding-based intent routing; Python. **Assess** as a reference. The same idea is about 50 lines in TS.
- **stanfordnlp/dspy** (MIT, 2026-11-10) and **ax-llm/ax** (Apache-2.0, TS, 2026-11-06). Offline optimisation of the Intent Reader prompt against a labelled frame set. **Assess.** Offline only.
- **Eladlev/AutoPrompt** (Apache-2.0, 2025-12-02). Intent-based prompt calibration. **Assess** for offline tuning of packs.
- **Phylliida/OpenClio** (MIT, 2025-08-19). Clio-style clustering for discovering task families from logs. **Assess.** Offline and privacy-gated.
- **jxnl/kura** (formerly 567-labs; no license declared, 2025-09-10). **Avoid** as a dependency: no licence means all rights reserved.
- **Wuyxin/collabllm** (MIT, 2025-09-25). User simulator and multiturn-aware reward for an offline evaluation harness. **Assess**, phase 3.
- **scandukuri/assistant-gate** (STaR-GATE; MIT, 2024-05-29, stale). Reference for oracle and roleplayer simulation. **Assess**, reference only.
- **XMZhangAI/MetaMind** (Apache-2.0, 2025-08-19). **Avoid** at runtime because it is too heavy; borrow its hypothesis-then-check idea only.
- **zhiyuanhubj/UoT** and **mikejqzhang/clarifying_questions** (no license). **Avoid** as code; papers only.

## 9. What NOT to build

- Hand-coded question trees per tool, or a growing task-type enum in code.
- A runtime multi-agent theory-of-mind pipeline.
- Full Monte-Carlo experimental design per turn.
- Letting any LLM decide when to stop asking.
- An upfront persona questionnaire. Infer from use; let users view and edit what is inferred.
- RL fine-tuning of a questioner before an offline simulated-user evaluation shows the heuristic gate is the bottleneck.
- Free-text "memories" as the main personalisation store. Use structured per-slot counts; free text is for notes only.
- A separate intent microservice. The Intent Reader is one function in the existing backend.

## Sources

- https://arxiv.org/abs/2403.19154 (STaR-GATE)
- https://arxiv.org/abs/2502.04485 and https://iclr.cc/virtual/2025/poster/30123 (Active Task Disambiguation)
- https://arxiv.org/abs/2402.03271 (Uncertainty of Thoughts)
- https://arxiv.org/abs/2511.08798 (SAGE-Agent / ClarifyBench, EVPI)
- https://aclanthology.org/P18-1255/ (Rao & Daumé, neural EVPI)
- https://arxiv.org/abs/2607.21143 (RegretBench)
- https://arxiv.org/abs/2603.26233 (Ask or Assume?)
- https://arxiv.org/abs/2602.11199 (AskBench)
- https://arxiv.org/html/2605.09698v1 (Ambig-DS)
- https://arxiv.org/html/2512.21120 (ClarifyMT-Bench)
- https://arxiv.org/abs/2405.12063 (CLAMBER)
- https://arxiv.org/abs/2410.13788 (Modeling Future Conversation Turns)
- https://arxiv.org/abs/2502.00640 (CollabLLM)
- https://arxiv.org/abs/2406.00222 (ACT, Learning to Clarify)
- https://arxiv.org/abs/2310.11589 (GATE)
- https://arxiv.org/abs/2403.05534 (OPEN, Bayesian preference elicitation)
- https://arxiv.org/abs/2505.13360 (What Prompts Don't Say)
- https://arxiv.org/abs/2507.22134 (IntentFlow)
- https://arxiv.org/abs/2510.14591 (Just-In-Time Objectives)
- https://aclanthology.org/2024.acl-long.451/ (SimToM)
- https://neurips.cc/virtual/2025/poster/115802 (MetaMind)
- https://arxiv.org/pdf/2510.13395v1 (ToM critique)
- https://arxiv.org/abs/2502.09597 (PrefEval)
- https://www.nature.com/articles/s41586-024-07421-0 (semantic entropy)
- https://www.nber.org/papers/w34255 (How People Use ChatGPT)
- https://www.microsoft.com/en-us/research/publication/tnt-llm-text-mining-at-scale-with-large-language-models/ (TnT-LLM)
- https://www.anthropic.com/news/clio (Clio)
- https://www.anthropic.com/research/anthropic-economic-index-january-2026-report (Economic Index, O*NET)
- https://irlab.science.uva.nl/wp-content/papercite-data/pdf/zou2022asking.pdf (Zou et al., clarifying question quality)
- https://ideas.repec.org/a/bla/jinfst/v76y2025i5p819-839.html (spoken conversational search clarification study)
- https://code.claude.com/docs/en/agent-sdk/user-input (AskUserQuestion pattern)
- https://github.com/vercel/ai
- https://github.com/BoundaryML/baml
- https://github.com/huggingface/transformers.js
- https://github.com/MinishLab/model2vec
- https://github.com/aurelio-labs/semantic-router
- https://github.com/stanfordnlp/dspy
- https://github.com/ax-llm/ax
- https://github.com/Eladlev/AutoPrompt
- https://github.com/Phylliida/OpenClio
- https://github.com/jxnl/kura
- https://github.com/Wuyxin/collabllm
- https://github.com/scandukuri/assistant-gate
- https://github.com/XMZhangAI/MetaMind
- https://github.com/zhiyuanhubj/UoT
- https://github.com/mikejqzhang/clarifying_questions

Note: figures quoted above come from paper abstracts or listing pages, not full-text re-analysis. The Ambig-DS, ClarifyMT-Bench and spoken-search details come from search snippets and are unverified against the full papers.
