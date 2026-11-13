# Learning method for PromptAI: RL and alternatives

Research lens: how the product should improve from every interaction. Date: 2026-11-10.

## Bottom line

Do not train or fine-tune language models. PromptAI should learn in three cheap places that 1-3 engineers can debug:

1. **Per user, in real time:** a small Bayesian user model (discounted Beta and Gaussian posteriors, shrunk toward cohort priors) plus a natural-language preference memory learned from the user's own edits. These drive Thompson sampling over a few discrete decisions: which question to ask, which missing detail to fill, which alternative to show first, which tool or model to suggest, and what to offer next.
2. **Population-wide, in batch:** nightly cohort priors, weekly reflective prompt optimization (GEPA via DSPy) of our own system prompts and strategy profiles, and off-policy evaluation (self-normalized IPS and doubly robust estimators) on a logged decision table. Nothing ships unless it beats the current policy offline and passes guardrail checks.
3. **Never trained by us:** foundation LLMs, speech-to-text, embeddings, reward models, per-user LoRA adapters, PPO/GRPO pipelines. These are rented and swapped through config.

This is "RL" in the contextual-bandit sense (act, observe reward, balance exploring against exploiting), not RLHF on weights. The key non-obvious idea is to **learn in text space, not weight space**. For a product whose output is text, the cheapest and most inspectable learnable parameters are the instructions and preference statements we feed the model, and they survive every base-model swap.

## 1. What actually needs to be learned

Most PromptAI decisions have small, discrete action spaces, which is where bandits work best:

| Decision point | Action space | Reward arrives |
|---|---|---|
| Ask a clarifying question or skip it; which one | 5-20 templates plus "skip" | seconds |
| Which forgotten detail to fill or flag ("no audience given") | 10-30 slot types | seconds to minutes |
| Order of alternatives and variants | 2-6 candidates | seconds |
| Tool or model recommendation | 10-50 per task | minutes to days |
| Next-best action or coaching tip | 20-100 templates | minutes |
| Dictation vocabulary bias list | per-user term list | seconds (transcript corrected) |
| Draft quality itself | open text | not a bandit; handled by context and prompt optimization |

Today the repo treats learning as one population analytics job over three outcome buttons. That is too coarse to personalize anything and too sparse to learn from.

## 2. Reward design from noisy implicit signals

Explicit ratings are rare and biased. Implicit signals are plentiful and noisy:

- **Implicit feedback is useful but noisy.** An EMNLP 2025 study of WildChat and LMSYS logs found it helps you understand users but is a noisy training signal: it helped on short questions, not on long complex ones, and its value depended on the quality of the user's first prompt (arXiv 2507.23158).
- **Acceptance rate tracks perceived productivity.** GitHub's Copilot study found acceptance rate was the best predictor of perceived productivity among the measures it tested, with a 27% acceptance rate overall (arXiv 2205.06537).
- **Accept and reject can train a production model.** Cursor trains its Tab model with online policy gradients on these events. Its example reward is +0.75 for an accept, -0.25 for a reject and 0 for showing nothing. Cursor reports 21% fewer suggestions with a 28% higher accept rate (self-reported).

Proposed reward ladder per decision, clipped to [0, 1]. Weights are starting values to tune with off-policy evaluation, not measured results:

| Signal | Reading | Start weight |
|---|---|---|
| Ran it in the target tool and kept the result (extension or desktop) | strongest positive | 1.0 |
| Copied or inserted with no edits | strong positive | 0.8 |
| Copied after small edits (normalized edit distance < 0.2) | positive; the edit is memory data | 0.6 |
| Picked this alternative over others | pairwise preference | pair |
| Heavy rewrite (> 0.5) | negative, but rich memory data | 0.2 |
| Regenerate | negative | 0.1 |
| Abandon | confounded by interruptions | 0.3 |
| Dwell time | ambiguous | never used alone |
| Thumbs or "worked / didn't work" | sparse, sycophancy-prone | at most 25% of the blend |

Rules that matter more than the weights:

- **Attribute every reward to the decision that caused it.** Every decision row has an id. Copy, edit and run events cite the decision ids that were on screen, and late "worked" outcomes join back within 7 days.
- **Never let approval become the objective.** OpenAI's May 2025 GPT-4o sycophancy postmortem said a new reward built from thumbs-up and thumbs-down data weakened the primary reward that had kept sycophancy in check, and that no deployment eval tracked sycophancy (coverage: Simon Willison, Georgetown Tech Institute, Zvi Mowshowitz). Outcome signals (ran it, kept it) must dominate.
- **Keep guardrail metrics out of the reward, and block any policy that worsens them:** safety-flag rate, output-length drift, critic rubric scores, questions per session, time to first useful output.

## 3. Options compared

| Option | Data need | Small-team cost | Main risk | Verdict |
|---|---|---|---|---|
| **A. Contextual bandits:** Beta-Bernoulli Thompson sampling, linear or logistic Thompson sampling, LinUCB | hundreds of events per arm; priors work from day one | ~300 lines of TypeScript plus a table | needs propensity logging | **Adopt** as the decision core |
| **B. Online learning-to-rank:** interleaving, cascading or dueling bandits, position-bias-corrected LTR | thousands of impressions | medium | position bias | **Adopt lightly**: Thompson ranking with position propensities; skip dueling bandits |
| **C. RL on the generator from implicit feedback** (Cursor-style) | 400M+ requests a day at Cursor; frequent on-policy rollouts | owned model and GPUs | reward hacking, operations load | **Avoid** |
| **D. Preference fine-tuning:** DPO, KTO (needs only binary labels), ORPO, SimPO | thousands of clean pairs or labels | medium if hosted | freezes yesterday's taste; base-model churn | **Assess later**, only for a small router or ranker |
| **E. RLAIF and trained reward models** | large labeled set | high | judge bias, Goodhart's law | **Avoid training**; use a rented LLM judge offline only |
| **F. Per-user LoRA** (OPPU-style) | many samples per user | storage, serving, retraining on every base change | privacy, churn | **Avoid** |
| **G. Text-space learning (non-obvious):** CIPHER-style preferences inferred from edits plus GEPA prompt evolution | tens to hundreds of traces | LLM calls only; inspectable and deletable | optimizer overfits its eval set | **Adopt**: the main learning surface |
| **H. Bayesian hierarchical user model** | works from the first event | trivial | stale priors | **Adopt** |
| **I. Collaborative filtering:** co-occurrence, implicit ALS | thousands of users | low (batch) | popularity bias, filter bubbles | **Trial** at roughly 5k monthly active users |
| **J. LLM-generated bandit priors (non-obvious):** CBLI | none | low | LLM priors differ from real users | **Adopt** for new arms, with weak pseudo-counts |

Why A, G, H and J beat C, D and F here:

- **The action spaces are small.** Thompson sampling did well in practice on Yahoo's ads and news data (Chapelle and Li, NeurIPS 2011), and CBLI reports 14-20% less early regret when LLM-simulated preferences pretrain the bandit (arXiv 2406.19317, EMNLP 2024).
- **Text-space learning plays to LLM strengths.** CIPHER (NeurIPS 2024, arXiv 2404.15269) infers a short preference description from each user edit, retrieves the descriptions from the k nearest past contexts, and conditions generation on them with no fine-tuning. It had the lowest edit cost among the methods tested on simulated users. GEPA's authors report beating GRPO by about 6% on average (up to ~20%) with up to 35x fewer rollouts, and beating MIPROv2 by over 10% (arXiv 2507.19457 v2, ICLR 2026 oral; author-reported, no independent replication found).
- **Retrieval beat per-user fine-tuning.** On the LaMP benchmark, retrieval-based personalization averaged a 14.92% gain against 1.07% for per-user PEFT (Salemi and Zamani, arXiv 2409.09510).
- **Weight-based learning is fragile, even at vendors:**
  - OpenAI's DPO guide now says its fine-tuning platform is "winding down", is closed to new users, and accepts jobs from existing customers only until January 6, 2027.
  - Apple requires a new adapter for each Foundation Models toolkit version, and toolkit 26.0.0 does not work on OS 27.
  - Learning stored in weights expires whenever a base model changes. Posteriors and text carry over.

## 4. The recommendation: three layers

### Layer 1. Per user, in real time (milliseconds, on every event)

**1a. Bayesian user model** (a few KB of JSON per user)
- **What it stores:** discounted success and failure pseudo-counts (α, β) per (decision point, arm), plus Gaussian mean and variance for a few continuous traits: verbosity, formality, tolerance for questions, expertise per domain.
- **Posterior:** cohort prior plus the user's own counts. A new user behaves like their cohort; a heavy user behaves like themselves.
- **Changing tastes:** multiply old counts by γ on each update. Start with a ~30-day half-life and tune it. Discounted and sliding-window Thompson sampling are the standard non-stationary variants (Qi, Guo and Zhu, Entropy 2025).
- **Explicit settings** ("never ask me questions") are hard constraints, not priors.

**1b. Preference memory from edits** (CIPHER-style)
- When a user edits a draft, a small model turns the diff into one preference sentence ("puts constraints as bullets", "always 9:16").
- Proposals stay `pending_confirmation`, as today. Confidence rises each time a preference is re-inferred and decays with time.
- Only low-risk stylistic preferences auto-promote, and only after N repeats. Everything appears in an editable "What I've learned about you" panel.
- At draft time, the top-k preferences by embedding similarity to the current task go into the context.

**1c. Decision function**
- `decide(point, context, candidates) -> {chosen, ranking, propensities, policyVersion}`, a pure TypeScript function that can also run on-device.
- Start with Beta-Bernoulli per (cohort × arm) plus a per-user offset. Move to linear Thompson sampling (Agrawal and Goyal, arXiv 1209.3352) over 20-50 features once off-policy evaluation shows context matters.
- Prefer Thompson sampling over LinUCB (arXiv 1003.0146). LinUCB is deterministic, so its propensities are degenerate and off-policy evaluation gets harder.
- Estimate propensities by Monte Carlo (100 samples) and log them.
- If a heavier learner is ever needed, Vowpal Wabbit ships a WebAssembly npm build (`@vowpalwabbit/vowpalwabbit`) with a contextual-bandit API.

### Layer 2. Population-wide, in batch

**2a. Cohort priors (nightly)**
- Aggregate discounted counts per task type × target tool × skill tier × locale, with a minimum cell size.
- New arms, such as a new tool added to the registry, get LLM-rated fit priors with low pseudo-counts, so real data quickly overrides them.

**2b. Reflective prompt optimization (weekly, offline Python)**
- **Tool:** `dspy.GEPA` or standalone `gepa` evolves our drafting instructions per task type, our question policy text and our critic phrasing.
- **Inputs:** logged traces with composite rewards, plus text feedback derived from user edits. GEPA accepts text feedback alongside scores.
- **Promotion gate:**
  - beats the current version on a frozen holdout set;
  - no regression on guardrails (sycophancy probe, safety, length);
  - human review of the diff;
  - ships as a versioned strategy profile under a bandit arm with a small traffic share, and rollback is a config flip.
- This replaces revival.md's genetic-loop "Evolver" for internal prompts. It can later power a user-facing "optimize my prompt" feature.

**2c. Off-policy evaluation (every candidate policy)**
- From logged (context, action, propensity, reward), estimate a new policy's value with IPS, self-normalized IPS and doubly robust estimators (Dudík, Langford and Li, arXiv 1103.4601).
- Open Bandit Pipeline implements these estimators.
- For large action spaces such as prompt variants, use embedding-based MIPS (arXiv 2202.06317).
- Reserve A/B tests for big UX changes.

**2d. Cold-start "what next"**
- Start with item-item co-occurrence over session sequences. Move to implicit ALS only if co-occurrence plateaus.
- Meta's HSTU sequential recommender is out of scope until there are millions of events.
- Outputs feed layer 1 as priors, never as the final ranking.

### Layer 3. Never trained by us

- **Rented, swapped through config:**
  - foundation LLMs;
  - speech-to-text (Whisper-class, biased with each user's vocabulary from layer 1);
  - embeddings.
- **Not built:** reward models, per-user adapters, PPO/GRPO or online DPO, federated training.
- **One exception, revisited at a threshold.** If a small router or ranker becomes a cost or latency bottleneck and we hold tens of thousands of clean pairs, try KTO or DPO with LoRA on an open model using TRL or Unsloth. That threshold is a judgment call, not a benchmark.

## 5. Exploration that never annoys users

- **Safe set only.** Explore among candidates that already pass the critic and safety checks, so exploration chooses between good options.
- **Secondary slots.** The primary draft uses the posterior mean. Exploration lives in alternatives 2-3, "also try" chips and coaching tips.
- **Budget.** At most one exploratory element per screen, and none in a frustrated session (two regenerates in a row, or a heavy rewrite).
- **Thompson sampling decays naturally.** Keep a 2-5% uniform floor on secondary slots so logs stay usable for off-policy evaluation and new arms still get tried.
- **Learned question budget.** High posterior variance on a high-stakes slot triggers a question. Low variance fills the slot silently. This replaces the fixed "up to 4 questions".

## 6. Feedback loops, filter bubbles and reward hacking

Jiang et al. (arXiv 1902.10730) show that model accuracy, the amount of exploration and the growth of the candidate pool set how fast recommender feedback loops degenerate. Accurate, low-exploration systems degenerate fastest. Controls:

- **Propensity logging plus an exploration floor**, so the system keeps seeing outcomes of actions it would not pick.
- **Diversity:** at least one arm from a different family in every ranked list, and a cap on memory preferences per prompt.
- **A "stretch" coaching slot** chosen outside the user's comfort profile, rate-limited and dismissible, so users grow instead of plateauing.
- **Optimizer hacking:** GEPA candidates are scored on a holdout set they never see, by a judge model different from the generator, with human review. Our own critic's rubric is never the sole fitness signal.
- **No loops:** every agent loop has an iteration cap, and three identical regenerates switch strategy (ask a question or change family).
- **A sycophancy probe in the eval set:** cases where the right answer disagrees with the user.

## 7. Privacy

- **Per-user state is tiny** (counts and short sentences). It lives on-device with end-to-end-encrypted sync, or in an encrypted row. Deleting it means dropping one row.
- **No federated learning is needed.** Nothing on-device trains a network.
- **Population learning sees only aggregates:** minimum cell sizes, plus differential-privacy noise on small cells using OpenDP or Google's DP library.
- **No text without consent.** Prompt text enters population learning only with opt-in, preserving the intent of today's `library_opt_in` gate. GEPA traces come from opted-in users or seeded tasks.

## 8. Current repo: keep, change, drop

**Keep**
- **`backend/src/agents/MemoryExtractionAgent.ts` and its never-auto-active rule.** It is the seed of 1b. It should also receive the draft-to-final diff; today it sees only final node values.
- **`config/model-routing.json`.** It is the right abstraction for "rent and swap".
- **The no-text, no-id posture of `outcome_signals`** for population data.

**Change**
- **The feedback loop is disconnected.** `web/src/components/FeedbackDialog.tsx:22` and `web/src/components/ComparePanel.tsx:53` send only `task_type`, `platform_id` and `outcome`. But `analyzeImprovements()` (`backend/src/services/ContinuousImprovement.ts`) and `underperformingDimensions()` (`backend/src/services/OutcomeAnalytics.ts`) filter on `rubric_scores is not null`, so every web feedback row is ignored.
- **`backend/src/scripts/improvement-analysis.ts` queries columns that don't exist.** It selects `outcome` and `strength_score` from `outcome_signals`. The table (`backend/migrations/003_safety_and_metering.sql`) has `feedback` and no `strength_score`, so the script fails at runtime.
- **Replace `outcome_signals` with `decision_log` and `reward_events`.**
  - `decision_log`: id, pseudonymous user key, decision point, small feature vector, candidates, chosen action, propensity, policy version, time.
  - `reward_events`: decision id, signal, value, time.
  - An aggregate view replaces the old anonymous table. Without actions and propensities, nothing can be learned or evaluated off-policy.
- **Demote the three-button dialog to a secondary check.** Capture copy, insert, edit distance, regenerate and ran-in-target events from web, extension and desktop.
- **`AlternativesAgent` orders by an LLM-assigned `rank`.** Keep the generation and let the bandit do the ordering.

**Drop**
- **`autotuneStrategyProfile()`.** It appends free-text guidance to `strategy-profiles.json` at runtime: unbounded growth, no eval, no rollback, and a runtime write to config. Nothing calls it. Superseded by 2b.
- **The genetic "Evolver" as an internal mechanism.** Arena ELO votes can stay as a community feature, but they should feed model-recommendation priors only with a discount, because voters are a biased population.

## 9. What NOT to build

- **No owned model:** no PPO, GRPO or online-DPO stack, no GPU fleet, no base model.
- **No per-user LoRA or adapters**, and no trained reward model.
- **No neural bandits** until off-policy evaluation shows linear Thompson sampling underfits.
- **No federated or on-device gradient training.**
- **No separate learning service at launch**, including Vowpal Wabbit. A TypeScript module plus Postgres is enough.
- **No reward from dwell time or thumbs-up alone**, and no auto-applied guidance edits.
- **No dependence on vendor fine-tuning APIs.**

## 10. Build order

1. **Weeks 1-2:** the two tables, client events (copy, insert, edit distance, regenerate), and fixes for the two analytics bugs.
2. **Weeks 3-4:** Beta-Bernoulli `decide()` with cohort priors on two decision points (alternative order, question skip), propensity logging, an exploration floor.
3. **Weeks 5-6:** edit-diff preference memory, the "What I've learned" panel, preference retrieval into context.
4. **Weeks 7-8:** an off-policy evaluation notebook with Open Bandit Pipeline, and a nightly prior job with minimum cell sizes and DP noise.
5. **Month 3:** GEPA on one task type's drafting profile, with holdout set, guardrail evals and versioned promotion.
6. **Month 4 and later:** linear Thompson sampling with features, co-occurrence "what next", LLM priors for new tools, per-user dictation vocabulary.

## Open-source checked (gh api, 2026-11-10)

| Project | License | Last push | Verdict |
|---|---|---|---|
| stanfordnlp/dspy | MIT | 2026-11-10 | adopt (offline GEPA) |
| gepa-ai/gepa | MIT | 2026-11-09 | adopt (offline) |
| st-tech/zr-obp | Apache-2.0 | 2024-06-03 (stale; stable math) | trial (off-policy evaluation) |
| VowpalWabbit/vowpal_wabbit | BSD-3 text (GitHub shows NOASSERTION) | 2026-10-15 | assess (at scale) |
| online-ml/river | BSD-3-Clause | 2026-11-10 | assess (drift detectors) |
| benfred/implicit | MIT | 2026-05-08 | assess (ALS) |
| opendp/opendp | MIT | 2026-11-10 | trial (DP) |
| google/differential-privacy | Apache-2.0 | 2026-11-10 | assess |
| huggingface/trl | Apache-2.0 | 2026-11-10 | assess (later) |
| unslothai/unsloth | Apache-2.0 | 2026-11-10 | assess (later) |
| langfuse/langfuse | MIT core + commercial `ee/` | 2026-11-10 | assess; avoid `ee/` |
| growthbook/growthbook | MIT core + enterprise directories | 2026-11-10 | assess; enterprise directories are not MIT |
| adap/flower | Apache-2.0 | 2026-11-10 | avoid (not needed) |
| fidelity/mabwiser | Apache-2.0 | 2024-09-05 | avoid (stale) |
| lyst/lightfm | Apache-2.0 | 2024-07-24 | avoid (stale) |
| meta-recsys/generative-recommenders | Apache-2.0 | 2026-11-10 | avoid until large scale |

## Sources

- https://cursor.com/en/blog/tab-rl
- https://simonwillison.net/2025/May/2/
- https://www.law.georgetown.edu/tech-institute/insights/tech-brief-ai-sycophancy-openai/
- https://thezvi.substack.com/p/gpt-4o-sycophancy-post-mortem
- https://arxiv.org/abs/2507.19457
- https://dspy.ai/api/optimizers/GEPA/overview/
- https://arxiv.org/abs/2404.15269
- https://arxiv.org/abs/2409.09510
- https://arxiv.org/abs/2507.23158
- https://arxiv.org/abs/2205.06537
- https://arxiv.org/abs/2402.01306
- https://arxiv.org/abs/2305.18290
- https://arxiv.org/abs/2403.07691
- https://arxiv.org/abs/2405.14734
- https://arxiv.org/abs/2408.10075
- https://arxiv.org/abs/1902.10730
- https://arxiv.org/abs/2008.07146
- https://zr-obp.readthedocs.io/en/latest/
- https://arxiv.org/abs/1103.4601
- https://arxiv.org/abs/2202.06317
- https://arxiv.org/abs/1003.0146
- https://arxiv.org/abs/1209.3352
- https://papers.nips.cc/paper/2011/hash/e53a0a2978c28872a4505bdb51db06dc-Abstract.html
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11765042/
- https://arxiv.org/abs/2406.19317
- https://developers.openai.com/api/docs/guides/direct-preference-optimization
- https://docs.together.ai/docs/fine-tuning/preference-tuning
- https://developer.apple.com/apple-intelligence/foundation-models-adapter
- https://www.npmjs.com/package/@vowpalwabbit/vowpalwabbit
- https://github.com/stanfordnlp/dspy
- https://github.com/gepa-ai/gepa
- https://github.com/st-tech/zr-obp
- https://github.com/VowpalWabbit/vowpal_wabbit
- https://github.com/opendp/opendp
- https://github.com/huggingface/trl
- https://github.com/meta-recsys/generative-recommenders
