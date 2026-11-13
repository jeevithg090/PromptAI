# Prediction and Anticipation Engine

Research lens: predicting the user's next need with high accuracy and low latency. Written 2026-11-10.

## Bottom line

Build the predictor as a **cascade, not a model**. A small on-device TypeScript library, `predict-core`, produces candidates in under 16 ms from three sources: frecency, a variable-order Markov model (PPM) over action tokens, and nearest-neighbour retrieval of similar past sessions. A **calibrated gate** then decides whether to show anything at all. A LightGBM ranker comes later, once logs justify it. An LLM, preferably on-device, is used only when the cheap tiers abstain or when the output is open text. Time, location and app context are delegated to the OS through App Intents donations and Android shortcut usage reports.

Optimise **accepted-and-kept rate**, not clicks. Measure time saved against a permanent 5% holdout. Defer neural sequential recommenders (SASRec, BERT4Rec, HSTU) and online RL.

## 1. What to predict

| # | Target | Example | Surface | Latency budget |
|---|---|---|---|---|
| P1 | Next action | After "copy": "Insert into ChatGPT tab?"; after "didn't work": "Refine with critic notes?" | Action chips | ≤50 ms |
| P2 | Task type from partial input | Classify while the user types or dictates | Silent; drives P4 and prefetch | ≤16 ms |
| P3 | Tool + mode | "Midjourney v7, not niji" for this idea | Chip / pre-selected picker | ≤50 ms |
| P4 | Missing slots ("what you forgot to say") | Aspect ratio, audience, tone, your usual British spelling | "Add: 16:9?" pills | ≤50 ms (Tier 0/1), ≤1 s (Tier 2) |
| P5 | Ghost-text completion | "cover letter for…" → "…a senior PM role, warm but concise" | Ghost text | ≤100 ms or after a pause |
| P6 | Context-triggered offer | Monday 09:00 weekly-report prompt | OS suggestion / widget | Background |
| P7 | Next learning step | After 5 Midjourney sessions: "Try the --sref drill" | LEARN card | Background |

P2 and P4 do the most for "cover what they forgot", and both are cheap. P5 is the most visible target, and the most distracting when it is wrong.

## 2. Options compared

| Option | How it works | Cold start | Data needed | Latency / where | Explainable | Verdict |
|---|---|---|---|---|---|---|
| **A. Frecency + PPM / variable-order Markov** | Counts what follows the last 1–3 action tokens, blended with recency-decayed frequency | Mixed with a global prior | None; learns online | <1 ms, any JS runtime | Yes | **Adopt, Tier 0** |
| **B. Session-kNN "predict by analogy"** (non-obvious) | Embeds the partial session (idea text + action tokens), retrieves similar completed sessions (own + anonymised community playbooks); their next steps and filled slots vote | Good via playbooks | A few hundred sessions | 2–10 ms with static embeddings | Yes | **Adopt, Tier 0** |
| **C. GBDT ranker + calibrated gate** | LightGBM over context and candidate features, trained offline, outputs isotonic-calibrated P(accept-and-keep) | Needs pooled logs | ~20–50k labelled impressions (heuristic, unverified) | <5 ms, tree walk in TS | Partly | **Adopt, Tier 1, phase 3** |
| **D. Neural sequential recommender** (SASRec / gSASRec / BERT4Rec / HSTU) | Transformer over item sequences | Poor | Large | GPU training | No | **Defer** |
| **E. LLM-as-predictor** | Small LLM with recent context returns structured next intent, slots, completion | Excellent | None | 150 ms – 2 s | Can give a rationale | **Tier 2 only** |
| **F. OS-native prediction** (non-obvious) | Donate completed actions; the OS learns time, location and app patterns on device | OS-handled | None held by us | Free | The OS shows it | **Adopt for P6** |
| **G. Online RL policy** (Cursor Tab style) | Policy gradient on show/no-show | n/a | Very high volume, fast rollout infra | n/a | No | **Defer** |

Evidence behind the verdicts:

- **Simple beats fancy for session prediction.** Ludewig, Mauro, Latifi and Jannach compared 12 session-based algorithms (6 neural) under identical conditions. Simple nearest-neighbour heuristics usually outperformed the neural ones, and users in a study accepted the heuristic recommendations well. This supports option B.
- **Action prediction is old and cheap.** Davison and Hirsh's IPAM was essentially an online first-order Markov model over UNIX commands, evaluated on 168,000+ commands from 77 users. It matched the alternatives they tested, with online accuracy of up to about 38%. PPM generalises it to variable order.
- **Sequential transformers are fragile at small scale.** Petrov and Macdonald could not reproduce BERT4Rec's results under default settings. Their gSASRec matches or beats BERT4Rec with less training by fixing the overconfidence that negative sampling causes. HSTU (Meta, ICML'24) reports large online gains, but at trillion-parameter scale serving billions of users. That does not fit a 1–3 person team.
- **A show/no-show gate is the proven pattern.** Cursor reports, citing a 2022 reverse-engineering, that GitHub Copilot used an 11-feature logistic regression filter and skipped suggestions scoring below 15%. Cursor's own Tab RL rewards an accept with +0.75 and a reject with −0.25, which means a suggestion is shown only when p > 0.25. Cursor says the result is 21% fewer suggestions with a 28% higher accept rate (its own figures).
- **Acceptance rate is what users feel.** Copilot's productivity study found that the acceptance rate of shown suggestions predicts perceived productivity better than persistence metrics do.

## 3. Recommended design

```
 events (local log) ──► Tier 0  predict-core (TS, on-device, <16 ms)
                         ├─ frecency(item | context bucket)
                         ├─ PPM order≤3 over action tokens (user ⊕ global prior)
                         ├─ session-kNN (static embeddings + sqlite-vec / in-memory)
                         └─ registry rules (platform modes, slot schemas)
                                ▼
                        Tier 1  ranker + calibrated gate (<5 ms)
                         ├─ v0: logistic score with hand priors
                         ├─ v1: LightGBM lambdarank + isotonic calibration
                         └─ show iff p ≥ τ(surface), else abstain
                                ▼  (abstain / open text)
                        Tier 2  LLM, async, never blocks input
                         ├─ on-device: Apple Foundation Models / Gemini Nano / Chrome Prompt API
                         └─ fallback: cloud small model (current Groq 8B route)
                        Speculator: read-only pre-compute for top-1 if p ≥ θ_spec
                        OS bridge: iOS intent donations / Android shortcut usage
```

### Tier 0: instant heuristics (day 1, every surface)

- **Action vocabulary.** About 40 stable tokens, which are the logging contract for every client:
  - Input: `dictate.start`, `idea.submit`, `intent.override`, `question.answer`, `question.skip`.
  - Shaping: `slot.add:<slot>`, `node.edit`, `refine`.
  - Use: `prompt.copy`, `prompt.insert:<host>`, `prompt.run:<target>`, `outcome.worked`, `outcome.failed`.
  - Library and learning: `template.save`, `template.use`, `learn.drill.start`.
  - Feedback on predictions: `suggestion.accept`, `suggestion.dismiss`, `suggestion.mute`.
- **PPM.** Estimates `P(next | last k tokens)` for k = 3, 2, 1, falling back to shorter contexts by escape. It blends personal and global counts with `P = λ·P_user + (1−λ)·P_global`, where `λ = n_user/(n_user+20)`. The global table is a small JSON file refreshed weekly. This handles cold start without any training.
- **Frecency.** `Σ exp(−Δt/τ)` per context bucket (surface × host tool × hour-of-week band). τ ≈ 14 days lets habits change.
- **Session-kNN.** Embed the idea text with model2vec `potion-base-8M` (MIT, ships ONNX weights; a static token lookup plus mean, milliseconds on a phone). Add a bag of recent action tokens. Retrieve the top 20 neighbours from two pools:
  - The user's last 500 local sessions.
  - Community playbooks: `{task_type, tool, action sequence, filled-slot names}`, with no text, published only when ≥20 sessions share a pattern.

  Neighbours vote on the next action (P1) and on **slots they filled that the current idea lacks**. That vote is the main P4 signal, and it explains itself: "Most Midjourney portrait requests set lighting and aspect ratio."
- **Registry rules.** `config/platform-registry.json` supplies slot schemas and hard constraints, for example "no video modes on image-only tools".

### Tier 1: learned ranker and gate

- **Versions.**
  - v0 (launch): a hand-weighted logistic score over the Tier 0 signals, with fixed thresholds per surface. It abstains from day one.
  - v1: LightGBM, with a `lambdarank` head for ordering and a binary head for the gate. Train it nightly on consented pooled logs and calibrate it isotonically on a time-split holdout. Export it with `dump_model()` to JSON and evaluate it with a ~100-line TS tree walker, so clients carry no runtime dependency.
- **Features.**
  - Candidate: the Tier 0 scores (PPM probability, frecency, kNN vote share), candidate type, popularity within the task type, times this user saw it and dismissed it in the last 7 days, and recency of the last accept.
  - Context: surface, host tool, voice or keys, hour-of-week band, position in the session, seconds since the last event, task type and its confidence, text length, locale.
  - User: tenure, smoothed accept rate, per-tool expertise (from LEARN), and the number of confirmed memories.
- **Label.** Accepted, then not undone within 30 s, and, for prompt-shaping suggestions, followed by copy, insert or run. An undo within 30 s counts as a **negative** label.
- **Threshold.** Show iff `p > c/(b+c)`, where b is the benefit of an accept and c is the cost of a wrong interruption. Cursor's numbers give 0.25. Starting points to tune, not verified values:

  | Surface | τ |
  |---|---|
  | Chip | ≈0.25 |
  | Ghost text | ≈0.35 |
  | Pre-filled default (visible, one-tap undo) | ≈0.7 |
  | Unprompted proactive card | ≈0.8, capped at 2 per day |
- **Chip count.** Show the smallest set whose cumulative calibrated probability reaches ≈0.8, up to 3, so the number of chips itself signals uncertainty. A pre-registered study found that conformal prediction sets improved human accuracy over fixed-size top-k sets. MAPIE can calibrate this offline.

### Tier 2: LLM, only where it earns the latency

Tier 2 is used in three places:

- Ghost text (P5), after about 400 ms of idle.
- Missing-slot questions that need generated wording.
- Intent on long or unusual inputs when Tier 1's task-type confidence is below 0.6.

Output is always structured: `@Generable` on Apple, `responseConstraint` (JSON Schema or regex) in Chrome. A result that arrives late is discarded.

Runtimes, preferring on-device:

- **Apple.** The Foundation Models framework. At WWDC26 it added image input and routing to Private Cloud Compute or third-party server models through the same Swift API. Apple also plans to open-source it.
- **Android.** Gemini Nano through the ML Kit GenAI Prompt API. It was in alpha in October 2025, with battery quotas and no background execution. Its 2026 status is unverified.
- **Desktop Chrome.** The Prompt API: extensions since Chrome 138, the web in Chrome 148. It needs about 22 GB of free disk and more than 4 GB of VRAM or 16 GB of RAM, and it does not run on Android or iOS (docs updated 2026-10-21).
- **Fallbacks.** The existing Groq `llama-3.1-8b-instant` route (≈0.2–0.3 s according to the repo's routing note), or Qwen3-0.6B (Apache-2.0) through Transformers.js or llama.cpp in Electron.

### Speculative pre-computation

*Speculative Actions* (ICLR 2026) guesses the next step with a cheap model, executes it in parallel, and commits only on a match. Its authors report up to 55% next-action accuracy.

PromptAI's rule: speculate when the top-1 `p ≥ θ_spec` (start at 0.5), the work is **read-only and idempotent**, and the session budget allows it (for example, 3 speculative LLM calls per session). Cancel with `AbortController` as soon as the user diverges.

Examples:

- During dictation, run Tier 0 on the streaming partial transcripts. Prefetch knowledge-base chunks for the predicted tool, and warm the provider's prompt cache with the predicted task type's system prompt.
- After `outcome.failed`, pre-draft the refine.

Speculation never sends, posts, buys or writes.

**Dictation tie-in.** Feed the predicted tool names, the user's vocabulary from accepted prompts, and the slot values into the transcription API's `prompt` / biasing field. Prediction then improves dictation at no extra model cost. The effect is unverified; the dictation lens should measure it.

### OS bridge (P6)

- **iOS.** Donate an App Intent through `IntentDonationManager` whenever the user completes a meaningful UI action, such as "Forge weekly-report prompt". Apple says donations help the system "predict their future actions" and surface them proactively, and that apps should donate only direct UI interactions. `RelevantIntentManager` adds explicit relevance hints.
- **Android.** `pushDynamicShortcut` and `reportShortcutUsed` let the launcher rank shortcuts by history. AppFunctions (Android 16+, experimental, Gemini in private preview) can later expose "forge a prompt" to system agents.

The result is time- and location-aware suggestions with **no location data held by PromptAI**.

## 4. Data needs

- **Local event log** (SQLite or IndexedDB, append-only): `{t, session_id, surface, host, action, obj_hash, task_type, input_mode, pred:{id, shown[], propensity, chosen}}`. Log impressions with propensities from day 1, or off-policy evaluation is impossible later.
- **Server, opt-in.** Encrypted sync of the same events for cross-device use, plus a k-anonymised aggregate that builds the global PPM tables and playbooks. Raw idea text never leaves the device for prediction.
- **Volume heuristics** (unverified):
  - Tier 0 works from session 1.
  - GBDT pays off at roughly 20–50k labelled impressions.
  - A gSASRec experiment is worth trying at 100k+ sessions.

## 5. Evaluation

- **Offline** (replay with a time-based split):
  - hit@1, hit@3, MRR and NDCG@3 per target.
  - Expected calibration error, with reliability plots.
  - A **precision–coverage curve** to choose τ.
  - Slices by tenure, surface, tool and input mode.
- **Online:**
  - Show rate and acceptance rate (the Copilot-validated proxy).
  - **Accepted-and-kept rate** (primary).
  - Seconds or keystrokes saved per session.
  - Time from open to first prompt run.
  - Dismiss and mute rates.
  - `outcome.worked` share.
  - Guardrails: retention and "creepy/annoying" feedback.
- **Causal:** a persistent 5% holdout with predictions off. Time saved is the holdout delta, never a self-report. Before a ranker ships, estimate its effect with IPS or SNIPS on the logged propensities (Open Bandit Pipeline implements these estimators).
- **Latency SLOs:**
  - Ghost text: p95 ≤ 100 ms, Smart Compose's "ideally within 100ms" target. Otherwise it is not shown.
  - Chips: render in the same frame.
  - Interactions: within the 200 ms "good" INP threshold.

## 6. Not creepy, not self-reinforcing, never stuck

**Not creepy**

- Every suggestion carries a one-line "why" built from its strongest feature ("You add 'British English' to 9 of your last 10 cover letters").
- Prediction draws only on what the user did in PromptAI. OS context requires explicit permission and stays on device.
- Clipboard and screen are read only on an explicit action, as the desktop app's "Enhance Clipboard" already does.
- Sensitive attributes (health, religion, politics, sexuality) are never inferred or used as features, and sensitive task types get no proactive triggers.
- Users can say "don't suggest this", "pause predictions", or "forget this session" (deletes locally and on the server).
- A personal fact becomes a persistent default only after the existing memory-confirmation flow.

**Not self-reinforcing**

When a recommender's outputs shape its own training data, user interest can degenerate into echo chambers (Jiang et al., AIES'19). Countermeasures:

- Reward kept outcomes, not clicks.
- Use about 10% of impressions as an exploration slot showing an unseen community or kNN candidate, with its propensity logged.
- Keep feeding the candidate pool with community playbooks.
- Decay old habits.
- Have LEARN suggest the *next* skill, not the one already mastered.

**Never stuck**

- A dismissed candidate is suppressed for the session, and that surface's τ rises by 0.1.
- After 3 consecutive dismissals, the surface goes quiet for the session.
- A prediction may trigger at most one speculative step.
- Nothing auto-executes.
- Each surface has a kill switch in the existing `feature_flags` table.

## 7. Current repo: keep, change, drop

**Keep**

- `memory_entries` with its `agent_proposed → pending_confirmation → active` flow (migration 001). It is the right consent pattern for personal defaults.
- `feature_flags` (013), for kill switches and the holdout.
- The registry's `modes` and slots, used as Tier 0 rules.
- `RecommendationService`'s deterministic quality/cost/latency score, demoted to a Tier 1 *prior feature*.
- The extension's platform detection (`extension/src/shared/platformMap.ts`), which becomes the `host` feature.
- The ciphertext-at-rest pattern, applied to synced events.

**Change**

- `IntentClassificationAgent` makes an LLM call on every draft. Run Tier 0/1 locally on partial input first, and call the LLM only when confidence is below 0.6.
- `ModeSuggestion.tsx` waits out a 500 ms debounce and then makes a server round-trip for a deterministic ranking. Move that ranking into `predict-core` so it is instant and works offline.
- `usage_events` stores tokens and cost per step. Keep it for billing, and add the interaction log from §4.
- `outcome_signals` deliberately has no `user_id`. Keep it for aggregates; personal learning needs the local log instead.
- The `AccessibilityDetector.swift` stub becomes an opt-in, on-device `host` source.

**Drop**

- `ContinuousImprovement.autotuneStrategyProfile`. It appends unevaluated "[auto-tuned] Increase emphasis on X" notes to strategy guidance without limit, a self-reinforcing loop driven by its own outputs. Replace it with flag-gated variants that are evaluated offline.
- Running the full multi-agent pipeline to guess what the user wants next.

## 8. What NOT to build

- HSTU or other generative-recommender training, and BERT4Rec.
- Online policy-gradient RL, which needs Cursor-scale traffic and hourly rollouts.
- Federated learning.
- A prediction microservice: `predict-core` is a library, and training is a nightly script.
- Passive keylogging, screen scraping or location tracking.
- An LLM call per keystroke.
- Per-user neural models.
- Training our own embeddings.

## 9. Build sequence

1. **Weeks 1–2:**
   - The action taxonomy and a local event log with propensities.
   - Tier 0 of `predict-core`.
   - The v0 gate with "why" lines.
   - Metrics and the 5% holdout.
2. **Weeks 3–4:**
   - P4 slot pills.
   - Speculative prefetch during dictation.
   - iOS donations and Android shortcut reporting.
3. **After about 20k impressions:**
   - The LightGBM ranker with calibration.
   - The exploration slot.
   - An IPS/SNIPS gate on every ranker release.
4. **Then:** on-device ghost text behind a flag, judged against the holdout.
5. **Only if the data demands it:** a gSASRec bake-off in RecBole.

## Sources

- Zhai et al., HSTU, ICML 2024: https://proceedings.mlr.press/v235/zhai24a.html ; https://arxiv.org/abs/2402.17152
- facebookresearch/generative-recommenders: https://github.com/facebookresearch/generative-recommenders
- Cursor, "Improving Cursor Tab with online RL" (2025-09-12): https://cursor.com/en/blog/tab-rl
- Ziegler et al., "Productivity Assessment of Neural Code Completion": https://arxiv.org/abs/2205.06537 ; CACM: https://cacm.acm.org/research/measuring-github-copilots-impact-on-productivity
- Google Smart Compose blog: https://research.google/blog/smart-compose-using-neural-networks-to-help-write-emails/ ; paper: https://arxiv.org/abs/1906.00080
- Ludewig et al., session-based recommendation analysis: https://arxiv.org/abs/1910.12781 ; https://github.com/rn5l/session-rec
- Petrov & Macdonald, gSASRec: https://arxiv.org/abs/2308.07192 ; BERT4Rec replicability: https://arxiv.org/abs/2207.07483
- Davison & Hirsh: https://www.cse.lehigh.edu/~brian/pubs/1998/aaaiws/ ; https://www.cse.lehigh.edu/~brian/pubs/1997/mltr41/
- Ye et al., Speculative Actions (ICLR 2026): https://arxiv.org/abs/2510.04371
- Jiang et al., Degenerate Feedback Loops: https://arxiv.org/abs/1902.10730
- Lu et al., Proactive Agent / ProactiveBench: https://arxiv.org/abs/2410.12361 ; https://github.com/thunlp/ProactiveAgent
- Conformal sets vs top-k for humans: https://arxiv.org/abs/2401.13744
- Apple, Donations and discovery: https://developer.apple.com/documentation/appintents/donations-and-discovery
- Apple, IntentDonationManager: https://developer.apple.com/documentation/appintents/intentdonationmanager
- WWDC26 State of the Union (MacRumors): https://www.macrumors.com/2026/06/09/apple-outlines-major-ai-and-developer-tool-updates/
- Android shortcuts: https://developer.android.com/guide/topics/ui/shortcuts/managing-shortcuts
- Android AppFunctions: https://developer.android.com/ai/appfunctions
- ML Kit GenAI Prompt API: https://android-developers.googleblog.com/2025/10/ml-kit-genai-prompt-api-alpha-release.html ; https://www.infoq.com/news/2025/11/android-genai-prompt-api
- Chrome Prompt API: https://developer.chrome.com/docs/ai/prompt-api
- NN/g response times: https://www.nngroup.com/articles/response-times-3-important-limits/
- web.dev INP: https://web.dev/articles/inp
- LightGBM: https://github.com/microsoft/LightGBM
- model2vec / potion-base-8M: https://github.com/MinishLab/model2vec ; https://huggingface.co/minishlab/potion-base-8M
- sqlite-vec: https://github.com/asg017/sqlite-vec
- MAPIE: https://github.com/scikit-learn-contrib/MAPIE
- Open Bandit Pipeline: https://github.com/st-tech/zr-obp
- Vowpal Wabbit: https://github.com/VowpalWabbit/vowpal_wabbit
- RecBole: https://github.com/RUCAIBox/RecBole
- Transformers.js: https://github.com/huggingface/transformers.js
- llama.cpp: https://github.com/ggml-org/llama.cpp
- Qwen3-0.6B: https://huggingface.co/Qwen/Qwen3-0.6B
- Gemma 3 270M: https://huggingface.co/google/gemma-3-270m
- LFM2-350M: https://huggingface.co/LiquidAI/LFM2-350M
