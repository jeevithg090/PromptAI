# Learning science and coaching: how PromptAI makes people better at their tools

Research lens: learning science and coaching. Date: 2026-11-10.

## Bottom line

PromptAI should **not** build an academy. People come to get work done, and recent evidence is blunt: unrestricted AI help raises output today and lowers skill tomorrow, while a well-designed tutoring mode avoids that harm. The product should therefore:

1. Infer skill **from real work**, with no tests, using a per-user, per-tool **skill graph** whose nodes carry an **Elo-style estimate with uncertainty**.
2. Run a **coaching engine** that adds at most one small, skippable, *faded* intervention per task. It starts with worked examples, moves to hints, then goes silent as the user improves.
3. Ship six evidence-backed features:
   - an annotated before/after;
   - an opt-in hint-first "Coach me" mode;
   - a transparent Skill Map with one "Next up";
   - micro-drills ("Reps") pitched at the edge of competence;
   - opt-in FSRS spaced retrieval built from the user's own repeated misses;
   - a predict-then-check prompt.

Drop or defer the rest of revival.md's LEARN pillar: XP, streaks, leaderboards, Golf, Roast and the radar "Genome".

The north-star metric is **unassisted quality**: the rubric score of what the user writes *before* the AI helps, tracked per tool over time. If it rises, PromptAI is teaching. If it stays flat while assisted output looks great, PromptAI is building dependence.

---

## 1. Evidence and implications

| Finding | Evidence | Implication |
|---|---|---|
| **Unrestricted AI help can harm learning** | ~1,000 high-school students. GPT-4 helped during practice, but students who had used the unrestricted "GPT Base" did *worse* once access was removed. A hint-giving "GPT Tutor" largely prevented the harm (Bastani et al., PNAS 2025). | Never default to "AI silently does it" with nothing transferred. Offer hint-first. |
| **Same for adults learning a new tool** | Anthropic RCT, 52 mostly junior engineers learning Trio. Quiz scores were 50% with AI vs 67% without (d = 0.738, p = 0.01). The ~2 min time saving was not significant (p = 0.391). Generation-then-comprehension, code plus explanation, and conceptual inquiry kept scores ≥ 65%. Delegation and iterative AI debugging scored 24–39% (pattern analysis not causal). | *How* the user works with AI decides whether they learn. Steer toward try-first / ask-why patterns. |
| **Well-designed AI tutors work** | Research-based AI tutor beat in-class active learning in a Harvard physics RCT (Kestin et al., Sci. Rep. 2025; effect sizes unverified here). Nigeria GPT-4 after-school program: ~0.3 SD in six weeks, beating ~80% of comparable interventions (World Bank). LearnLM treats pedagogy as "pedagogical instruction following." | Pedagogy is largely a system-instruction problem, which suits a config-driven product. |
| **In-flow AI guidance upskills workers** | Tutor CoPilot RCT (900 tutors, 1,800 students): +4 pp mastery overall, +9 pp for lower-rated tutors, ~$20 per tutor per year. | Coach inside the work. Novices gain most. |
| **Over-trust erodes judgment** | Microsoft CHI 2025 (n = 319): higher confidence in GenAI went with less critical thinking, higher self-confidence with more. METR RCT: experienced devs measured 19% slower while believing they were 20% faster. EEG preprint (Kosmyna 2025, not peer-reviewed): weakest engagement and recall in the LLM group. | Build self-efficacy and verification habits. Show measured progress, not feelings. |
| **Retrieval and spacing** | Dunlosky et al. 2013 rate practice testing and distributed practice "high utility" and rereading and highlighting "low". See also Rowland 2014. | Spaced retrieval only for fact-like knowledge (parameters, syntax, shortcuts), opt-in. |
| **FSRS** | srs-benchmark (~10k collections, ~350M evaluation reviews), log loss: FSRS-6 0.3460, FSRS-7 0.3370, HLR 0.4694, average baseline 0.3945. Model is Difficulty, Stability, Retrievability. Used in Anki 23.10+. | Use ts-fsrs. Do not invent a scheduler. |
| **Worked examples, fading, expertise reversal** | Renkl & Atkinson 2003. Kalyuga 2007: guidance that helps novices hurts experts. | Explanations fade *per skill*. A global "Teaching mode" toggle is the wrong abstraction. |
| **Deliberate practice is limited in professions** | Macnamara et al. 2014, variance explained: 26% games, 21% music, 18% sports, 4% education, under 1% professions. | Feedback on real work carries the weight. Drills are a small supplement. |
| **Desirable difficulty** | Wilson et al. 2019: ~85% accuracy is optimal, derived for binary classification learned by gradient descent. ZPDES bandit sequences activities by measured learning progress (Clement et al. 2015, n = 400). | Target ~70–85% predicted success as a starting heuristic. A bandit later, not RL. |
| **Gamification cuts both ways** | Sailer & Homner 2020: positive average effects (figures unverified). Broken streaks *reduce* later engagement, worse when people blame themselves, softened by repair (Silverman & Barasch, JCR 2022). Duolingo's streak-freeze effect: +0.38% daily active learners. Self-focused feedback can lower performance (Kluger & DeNisi 1996). | Show progress and real mastery. No loss-framed streaks, volume XP or learning leaderboards. Critique the prompt, never the person. |
| **Knowledge-tracing complexity** | Extended BKT matches DKT (Khajah et al. 2016). Many deep KT models barely beat the original DKT, and leakage inflates gains (pyKT, NeurIPS 2022). | A simple, interpretable model suffices. |

---

## 2. Skill-model options

| Option | Strengths | Weaknesses for PromptAI |
|---|---|---|
| **A. BKT** (pyBKT): known/unknown state per skill, 4 fitted params | Classic, interpretable | Binary state does not fit partial-credit rubric scores. Fitting thousands of sparse, LLM-generated per-tool skills is infeasible. No forgetting. Python only. |
| **B. Deep/transformer KT** (pyKT) | Learns cross-skill structure | Needs large logs, is opaque ("why next?"), and shows small benchmark gains. |
| **C. LLM-as-assessor** *(non-obvious)*: an LLM writes a narrative profile from history | Works for any tool on day one | Uncalibrated, irreproducible, costly. Needs content the current design encrypts ([E]). Can hallucinate deficits. |
| **D. FSRS as the skill model** *(non-obvious)*: each skill is a card, each real use a review | Free "rust" and scheduling | Models recall of an item, not growth on items of varying difficulty. A hard success counts the same as an easy one. |
| **E. Elo with uncertainty on a prerequisite graph, fed by stealth evidence (recommended)** | Works with sparse data and partial credit. Online, ~100 lines of TS, explainable. Elo in adaptive learning is established (Pelánek 2016). Supports transfer priors. | Quality depends on evidence mapping. Calibration must be checked against held-out outcomes. |

**Decision: E.** It borrows D's rust idea, uses FSRS only for explicit retrieval cards, and uses C only at the edges: tagging events to skills, drafting skill packs, phrasing explanations. A and B stay as **offline baselines**. Above ~1M events, compare log loss on "next independent outcome" and switch only if E is beaten.

---

## 3. The recommended per-user, per-tool skill model

**Structure**

- **Meta-skills (cross-tool, versioned).** The 8 dimensions of `docs/quality-rubric.md`, plus five AI-literacy skills: give context, decompose, iterate, verify output, pick the right tool.
- **Tool skill packs (config, not code).** JSON per tool, like `config/platform-registry.json`:
  `{tool, version, skills:[{id, name, description, prereqs[], transfers_from[], difficulty_prior 1-5, signals[], practice_templates[], doc_refs[]}]}`
  Each pack holds 15–40 skills. An LLM drafts it from the PKB, a human reviews it in admin, and it is versioned like the rubric. Packs work for prompting tools now and for Excel, Figma or Cursor later.
- **State per (user, skill):** θ, σ, evidence counts (total and independent), last evidence and last independent success timestamps, status.

**Evidence from work (stealth assessment)**

| Source | Signal | Weight |
|---|---|---|
| **Raw-input coverage** | Which P1/P2 clarification slots and rubric dimensions the user's *own* idea covers. The clarification flow already detects "pre-answered" slots, so every question it must ask marks a missed dimension. | 1.0 |
| User edits after a forge | Critic-scored improvement made by the user | 1.0 |
| Tool-context signals (extension/desktop) | Pack `signals`: regex/event first (e.g. uses `--ar`), in-flight LLM tagger as fallback | 0.7 |
| Reps | Rubric-graded attempt | 0.8 |
| FSRS card | Again/Hard/Good/Easy | 0.3 |
| Onboarding self-report | "I already do this" | 0.2 (prior only) |

Each event also carries an **assistance multiplier**: independent ×1.0, hinted ×0.6, after a worked example ×0.3, AI did it ×0.1. This encodes the Anthropic and Bastani findings: credit follows what *the user* did. Reverting an AI fix counts as a **preference** (sent to memory with confirmation), not a skill failure.

**Update rule**

- Expected success: `p = 1/(1 + e^-(θ - b))`. Item difficulty `b` is seeded as `0.8·(difficulty_prior - 3)` and refined across users by the mirror Elo update.
- Rust: `σ² ← min(σ_max², σ² + τ²·days_since_last)`.
- Update with outcome `o ∈ [0,1]`:
  - `K = k_max·σ²/(σ² + s₀²)`
  - `θ ← θ + w·K·(o - p)`
  - `σ² ← σ²·(1 - c·w·K)`
- **Transfer prior:** θ₀ is a similarity-weighted mean over `transfers_from` and related meta-skills, shrunk to the population mean, with a large σ₀. Midjourney skill warms up Flux.
- **Status (conservative mastery):**
  - *Proficient:* `p(θ - σ, b = 0) ≥ 0.8` with ≥ 3 independent events on ≥ 2 days.
  - *Mastered:* proficient, plus an independent success on a harder item (`b ≥ 0.8`) after a gap of ≥ 7 days.
  - *Needs a refresh:* rust pushes the conservative estimate below 0.65.
- **Next up:** argmax over the KST-style *ready-to-learn fringe* (prerequisites proficient, skill not) of relevance-to-recent-intents × (1 - P) × novelty. Example: "Next up: output format. It came up in 4 of your last 6 tasks."

**Data**

Add a new `SKILL_EVIDENCE` table: numeric/enum only, [P], like today's rubric sub-scores. Content tagging runs in flight ([N]). Unlike the anonymous `OUTCOME_SIGNAL`, it is user-linked, so it must be visible, exportable and resettable per tool. No employer view without opt-in.

---

## 4. Coaching engine

The coach is **an event-driven policy module, not another Supervisor agent**:
`(evidence, task context, dial) → 0 or 1 CoachingCard`.

1. **Candidates:** non-proficient skills with a detected gap in this task, plus Next-up if relevant.
2. **Score:** relevance × (1 - P) × prerequisite readiness × cooldown novelty × dial.
3. **Form by estimate (fading):**
   - P < 0.4: **worked example** (the user's own text improved, each change annotated by skill).
   - 0.4–0.8: **hint** ("No output format yet. Add one?"); the user applies it.
   - ≥ 0.8: **silent** unless the user regresses.
4. **Placement:** after submit or in the post-task diff, never mid-typing. In other tools, through the extension/desktop overlay.
5. **Anti-loop budgets:**
   - at most 1 card per task and 3 per day;
   - two dismissals pause that skill for 14 days;
   - "never for this skill" is permanent;
   - no repeats inside a card's cooldown;
   - **never gating**: "just give me the answer" is always one click.
6. **Autonomy dial per tool:**
   - **Just do it:** evidence is discounted, no cards.
   - **Show me why:** the default.
   - **Coach me:** hint-first. The clarification flow switches from multiple-choice *recognition* to *generation* ("what format do you want, and why?"), then shows the forged version for comparison. This mirrors the generation-then-comprehension pattern.
7. **Metacognition:** optional **predict-then-check**. Rate expected quality 1–5 before firing, compare with the outcome, and show a calibration stat. "Explain back" appears at most once a week, in Coach-me only.
8. **Content:** a small-tier LLM writes each card (two sentences or fewer) from the pack text plus the user's own before/after, in flight, grounded in `doc_refs`. Cards are cached per (skill, gap pattern).
9. **Learning to coach:**
   - Log shown, applied and dismissed.
   - Reward = Δθ over the next 3 independent uses, minus time cost.
   - At volume, swap step 3's fixed thresholds for Thompson sampling over forms (ZPDES-style).
   - **No full RL:** rewards are sparse and delayed, the team is small, and a mis-specified reward could pressure users.

---

## 5. Minimal feature set (by evidence, then cost)

1. **Annotated before/after ("why this is better").** Faded worked examples from the user's own work. Reuses Critic rationales.
2. **Coach-me mode** (hint-first, opt-in per tool). Reuses the clarification flow.
3. **Skill Map with one Next-up.** An open learner model, replacing Genome.
4. **Reps.** 2-minute rubric-graded drills on the Next-up skill at ~70–85% predicted success. This keeps revival.md's "no content team" insight without an academy.
5. **Tune-ups.** ts-fsrs cards created only from *repeated* misses of fact-like skills. Desired retention 0.85–0.9. At most a 1-card nudge when a tool opens, or a weekly 3-minute session. No guilt notifications.
6. **Predict-then-check calibration.**

Gamification that stays:

- visible progress;
- **mastery milestones** earned only through the Mastered rule, shareable later as credentials via SHARE;
- a forgiving weekly rhythm (3 of 7 days) with automatic freeze and repair, never loss-framed.

---

## 6. Skill Map visualization (dataviz method)

**Form.** The jobs are: compare 15–40 *nominal* skills on one axis, show change, show uncertainty, and highlight one skill. The forms that fit are horizontal rows on a shared 0–100 axis, a **dumbbell** for change, and **emphasis** (accent for the current value, gray for context).

**Radar is rejected.** Area grows quadratically, axis order changes the shape, it cannot show uncertainty, and it fails past ~6 axes. Coloring skills by band is also rejected, because a value ramp on nominal categories double-encodes position.

**View A: all tools.** One row per tool:

- tool name;
- "14 of 32 proficient+" in text tokens;
- an 8px **thin segmented bar** with no text, showing *ordered* bands (Introduced, Practicing, Proficient, Mastered), with the unfilled track meaning "not started".

There is one legend for the list. The ordinal ramp was validated with `validate_palette.js --ordinal` and all checks pass:

- light `#86b6ef, #3987e5, #1c5cab, #0d366b`;
- dark `#184f95, #2a78d6, #6da7ec, #b7d3f6`.

A first dark candidate failed the adjacent-ΔL check and was re-stepped.

**View B: per-tool map.**

- **Filter row** above everything: a tool combobox and range presets (30 / 90 days / all).
- **One hero figure:** "Proficient skills: 14 of 32", with a signed 30-day delta.
- **Stat tiles:**
  - Next up, with its one-line reason;
  - Unassisted quality, with a 12-point sparkline;
  - Tune-up due, only if opted in.
- **Rows** grouped by area, in prerequisite order so positions stay stable (with a sort-by-estimate toggle). Each row:
  - the skill name;
  - a hollow 8px gray marker (`#898781`) for 30 days ago, joined by a 2px gray line to a filled 8px **accent** marker (light `#2a78d6`, dark `#3987e5`, 2px surface ring) at the conservative estimate;
  - a **10%-opacity accent wash** spanning the 80% interval (θ ± 1.28σ);
  - a status word with an icon, never color alone.
- **Proficient threshold:** a solid hairline tick (never dashed), labeled once at the top.
- **The Next-up row** gets a bold label and a "Next up" chip in text tokens. No second hue.
- **Validator results:** the accent and gray separate (CVD ΔE 15.9 and normal ΔE 17.8 in light; 15.9 and 17.0 in dark). The gray "chroma-floor fail" is expected, because gray is the de-emphasis role, not a categorical slot.
- **Interaction:**
  - a focusable row tooltip (24px+ hit target) shows the estimate and range, independent vs assisted evidence counts, last practiced, next review, and why it is next;
  - a **table-view twin**;
  - accessible names per row, e.g. "Output format: 72, range 61–80, Proficient, up 12";
  - texture only for forced-colors or print.
- **Never shown:** a single "tool IQ", XP, or rank against other users.
- **Build:** Astryx for chrome (cards, select, tooltip, table, chip). The plot is SVG or visx, because no Astryx chart component could be confirmed (unverified; check with `npx @astryxdesign/cli search chart`).

---

## 7. revival.md LEARN and current repo: keep, change, drop

| Item | Verdict | Reason |
|---|---|---|
| 4.1 Dojo | **Change**: keep auto-graded drills as Reps; drop the academy, XP and streaks | Courses lose adults, real-work feedback dominates, broken streaks demotivate |
| 4.2 Prompt Golf | **Drop from LEARN** (SHARE toy at most) | Rewards token-minimizing, which conflicts with Specificity (weight 20) |
| 4.3 Daily Challenge | **Defer to SHARE** | Community feature, not learning |
| 4.4 X-Ray | **Keep, reframed** as phrase-to-skill feedback on the diff and on the user's own text | Builds on `AmbiguityService`, `styleLint`, token estimator |
| 4.5 Genome radar | **Replace** with the Skill Map | Wrong chart form; "genome" implies fixed traits |
| 4.6 Roast | **Drop from LEARN** | Self-directed harsh feedback (Kluger & DeNisi) |
| 8-dimension rubric | **Keep** as meta-skills and grader | Already versioned and numeric |
| Clarification "never re-ask pre-answered" | **Keep and reuse** as raw-input assessment | Free evidence |
| Critic rationales | **Keep** as worked-example annotations | Already generated |
| `HeuristicScorer` | **Extend** to score raw input, not only drafts | Cheap unassisted-quality metric |
| "Teaching mode" toggle (`web/src/lib/strings.ts`) | **Replace** with the autonomy dial and automatic fading | Expertise reversal |
| `MemoryExtractionAgent` | **Keep for preferences only**; skills never flow through LLM-written memory | Separation of concerns |
| `OUTCOME_SIGNAL` | **Keep**; add the user-linked `SKILL_EVIDENCE` | Different consent and purpose |
| "Platform Usage Coaching" tips | **Change**: skill-model-driven and rate-limited | Generic tips are noise |

## 8. What NOT to build

- A course catalog or video academy.
- XP economies, learning leaderboards, or daily-streak push notifications.
- Deep KT or full-RL coaching before the simple model is beaten on data.
- An upfront placement test.
- Hand-written per-tool lessons.
- Any pedagogy that gates the user's task.
- Employer-facing skill surveillance.

## 9. Open source

| Project | License | Last push | Role | Verdict |
|---|---|---|---|---|
| open-spaced-repetition/ts-fsrs | MIT | 2026-11-10 | Tune-up scheduler. v6 defaults to FSRS-7 and needs Node ≥ 24. | Adopt |
| open-spaced-repetition/fsrs-rs | BSD-3-Clause | 2026-11-10 | Optimizer / native reference | Assess |
| open-spaced-repetition/py-fsrs | MIT | 2026-08-09 | Offline analysis | Assess |
| open-spaced-repetition/srs-benchmark | **None** (all rights reserved) | 2026-10-24 | Methodology only; do not copy code | Assess |
| philihp/openskill.js | MIT | 2026-11-07 | Weng-Lin μ/σ alternative to hand-rolled Elo | Trial |
| CAHLR/pyBKT | MIT | 2026-11-02 | Offline baseline | Assess |
| pykt-team/pykt-toolkit | MIT | 2026-10-18 | Offline deep-KT benchmark | Assess |
| CAHLR/OATutor | MIT | 2026-11-10 | Open adaptive-tutor reference design | Assess |
| nd-ball/py-irt | MIT | 2026-11-01 | Offline item calibration | Assess |
| airbnb/visx | MIT | 2026-06-22 | Skill Map SVG primitives | Trial |
| duolingo/halflife-regression | MIT | 2026-11-09 | Superseded by FSRS in the benchmark | Avoid |
| ankitects/anki | NOASSERTION via API (repo states AGPL-3.0; unverified) | 2026-11-10 | Copyleft: no code reuse | Avoid |
| VowpalWabbit/vowpal_wabbit | NOASSERTION via API | 2026-10-15 | Overkill; a 50-line Thompson sampler suffices | Avoid |

## 10. Metrics and build order

- **North star:** unassisted quality per tool, as a 4-week trend.
- **Model validity:** log loss and calibration on the next independent outcome.
- **Coaching:** apply rate, dismissal rate, Δθ after a card. Guardrail: median task time must not rise.
- **Durability:** the share of Proficient skills still Proficient after 30 days.

Build order for 1–3 engineers:

1. **Weeks 1–2:** evidence tables, raw-input coverage extraction, and the Elo-σ update (pure TS, property-tested).
2. **Weeks 3–4:** annotated before/after with fading, the autonomy dial, and the coach policy with budgets.
3. **Weeks 5–6:** Skill Map views and three skill packs.
4. **Weeks 7–8:** Coach-me, Reps, Tune-ups, predict-then-check, and the offline evaluation harness.

Research note: the shared web-search budget ran out early. Claims were verified by fetching primary pages, Crossref records and GitHub directly. Unverified figures (Kestin effect sizes, Bastani percentages, Sailer & Homner) are not quoted.

## Sources

- https://api.crossref.org/works/10.1073/pnas.2422633122 (Bastani et al., PNAS 2025)
- https://www.pnas.org/doi/10.1073/pnas.2422633122
- https://www.anthropic.com/research/AI-assistance-coding-skills
- https://api.crossref.org/works/10.1038/s41598-025-97652-6 (Kestin et al., Sci. Rep. 2025)
- https://www.nature.com/articles/s41598-025-97652-6
- https://blogs.worldbank.org/en/education/From-chalkboards-to-chatbots-Transforming-learning-in-Nigeria
- https://arxiv.org/abs/2412.16429 (LearnLM)
- https://arxiv.org/abs/2410.03017 (Tutor CoPilot)
- https://www.microsoft.com/en-us/research/publication/the-impact-of-generative-ai-on-critical-thinking-self-reported-reductions-in-cognitive-effort-and-confidence-effects-from-a-survey-of-knowledge-workers/
- https://arxiv.org/abs/2506.08872 (Kosmyna et al., preprint)
- https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/
- https://api.crossref.org/works/10.1177/1529100612453266 (Dunlosky et al. 2013)
- https://api.crossref.org/works/10.1037/a0037559 (Rowland 2014)
- https://github.com/open-spaced-repetition/srs-benchmark
- https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
- https://github.com/open-spaced-repetition/ts-fsrs
- https://docs.ankiweb.net/deck-options.html
- https://api.crossref.org/works/10.1207/S15326985EP3801_3 (Renkl & Atkinson 2003)
- https://api.crossref.org/works/10.1007/s10648-007-9054-3 (Kalyuga 2007)
- https://api.crossref.org/works/10.1177/0956797614535810 (Macnamara et al. 2014)
- https://api.crossref.org/works/10.1038/s41467-019-12552-4 (Wilson et al. 2019)
- https://arxiv.org/abs/1310.3174 (Clement et al. 2015)
- https://api.crossref.org/works/10.1016/j.compedu.2016.03.017 (Pelánek 2016)
- https://arxiv.org/abs/1604.02416 (Khajah et al. 2016)
- https://arxiv.org/abs/2206.11460 (pyKT)
- https://www.aleks.com/about_aleks/knowledge_space_theory
- https://api.crossref.org/works/10.1007/s10648-019-09498-w (Sailer & Homner)
- https://api.crossref.org/works/10.1093/jcr/ucac029 (Silverman & Barasch)
- https://blog.duolingo.com/how-duolingo-streak-builds-habit/
- https://api.crossref.org/works/10.1037/0033-2909.119.2.254 (Kluger & DeNisi 1996)
- https://github.com/philihp/openskill.js
- https://github.com/CAHLR/pyBKT
- https://github.com/pykt-team/pykt-toolkit
- https://github.com/CAHLR/OATutor
- https://github.com/nd-ball/py-irt
- https://github.com/airbnb/visx
- https://github.com/duolingo/halflife-regression
- https://github.com/ankitects/anki
- https://astryx.atmeta.com/llms.txt
