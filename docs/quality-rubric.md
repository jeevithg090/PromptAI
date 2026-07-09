# Prompt Quality Rubric — v1.0

> **Spec reference:** §10.1 of `prompt-assistant-technical-architecture.md`.
> **Consumers:** the Critic Agent (scoring + refinement triggers), the Alternatives Agent (ranking), and the user-facing Prompt Strength Score. All three MUST use this exact document — same dimensions, same scale, same weights — so "excellent" is one consistent, auditable standard.
> **Versioning:** any change bumps the version and is reviewed like code. The Critic Agent logs the rubric version used for every score.

## Scoring scale (per dimension)

Every dimension is scored **1–3**:

- **1 — Failing.** The dimension is clearly violated; the prompt should not ship without refinement.
- **2 — Acceptable.** No clear violation, but a knowledgeable prompter would still improve it.
- **3 — Excellent.** A knowledgeable prompter would not meaningfully improve this dimension.

A score of **1 on any dimension triggers a refinement pass** (max 2 passes — hard cap, §10.4).

## The eight dimensions

### 1. Specificity — weight 20

**Definition:** Every node carries a concrete, filled value — no vague placeholders, no "nice/good/interesting" adjectives doing the work a description should do.

| Score | Looks like |
|---|---|
| 1 | "make a nice image of a horse" |
| 2 | "a horse running across a field, realistic style" |
| 3 | "a chestnut horse mid-gallop, dust trailing from its hooves, open prairie at golden hour, photorealistic, cinematic wide shot" |

**Check:** scan each node — does the value name a concrete entity/quality, or a stand-in? Empty optional nodes are fine; *vague filled* nodes are not.

### 2. Unambiguity — weight 15

**Definition:** No instruction can reasonably be read two different ways.

| Score | Looks like |
|---|---|
| 1 | "draw a bat by the window" (animal or sports equipment?) |
| 2 | "a bat flying by the window" (resolved by context, but 'by' still under-specifies position) |
| 3 | "a fruit bat in flight, silhouetted against a moonlit window seen from inside the room" |

**Check:** for each noun/instruction, ask "could two reasonable readers picture different things?" If yes for anything load-bearing → 1.

### 3. Non-conflict — weight 15

**Definition:** No two nodes or instructions contradict each other.

| Score | Looks like |
|---|---|
| 1 | Style: "ultra-minimalist" + Setting: "a cluttered workshop overflowing with hundreds of tools and trinkets" |
| 2 | Style: "watercolor" + Technical: "8K hyper-detailed" (tension, not outright contradiction) |
| 3 | All nodes reinforce one coherent target output |

**Check:** pairwise pass over nodes; flag semantic contradictions and medium-tension pairs.

### 4. Platform-fit — weight 15

**Definition:** Phrasing/syntax matches what the target platform is documented (via the PKB) to respond well to — not generic prompting habits.

| Score | Looks like |
|---|---|
| 1 | Negative-prompt syntax (`--no watermark`) sent to a platform that ignores negative prompts |
| 2 | Correct syntax but misses a documented platform strength (e.g. no aspect-ratio parameter where the platform supports one and the task implies one) |
| 3 | Uses the platform's documented parameter syntax, respects its quirks list, exploits its documented strengths |

**Check:** every syntax feature used must exist in the platform's registry/PKB entry; every relevant registry quirk must be respected.

### 5. Constraint completeness — weight 15

**Definition:** Every constraint the user actually stated appears in some node. Nothing the user said is silently dropped.

| Score | Looks like |
|---|---|
| 1 | User said "under 100 words, no jargon" — draft contains neither constraint |
| 2 | Constraints present but buried in prose rather than a dedicated Constraints node |
| 3 | All user-stated constraints represented as explicit nodes, phrased enforceably |

**Check:** diff the user's stated requirements (idea + clarification answers) against the node set; any missing item → 1.

### 6. Output-format determinacy — weight 8

**Definition:** Where the task type needs it (reasoning, extraction, code, long-form), the expected response shape is explicit.

| Score | Looks like |
|---|---|
| 1 | Extraction task with no output schema at all |
| 2 | "return as a list" (shape named but under-specified) |
| 3 | "Return a JSON object with keys `name` (string), `sentiment` (`positive`\|`negative`\|`neutral`), `evidence` (array of quoted strings)" |

**Check:** applies per task type (visual-generation tasks may legitimately score 3 with no Output Format node); when the strategy profile requires format, absence → 1.

### 7. Context-window efficiency — weight 6

**Definition:** As concise as possible *without losing needed specificity*. Verbosity is a defect; so is trimming that deletes information.

| Score | Looks like |
|---|---|
| 1 | Repetition, filler ("please kindly make sure that…"), restating the same style three ways; or exceeds the platform's practical length norm |
| 2 | Reasonably tight; some removable redundancy |
| 3 | Every token earns its place; within platform length norms (registry `max_prompt_tokens`) |

**Check:** deterministic length check via the Token Governor + redundancy scan.

### 8. Appropriate technique application — weight 6

**Definition:** For the classified task type, the prompt uses the elicitation technique the MPKB says this model family actually benefits from (few-shot for extraction, step decomposition for reasoning/code, dense descriptors for diffusion models, positive over negative instructions, etc.).

| Score | Looks like |
|---|---|
| 1 | Classification task with zero examples where the MPKB says examples measurably help; or "don't include X" phrasing on a model documented to handle negation poorly |
| 2 | Broadly right technique, imperfect execution (e.g. one weak example) |
| 3 | Technique matches the MPKB entry for this model family and task type, executed well |

**Check:** compare against the active strategy profile (§10.3) and cited MPKB entries.

## Overall Prompt Strength Score (0–100)

```
strength = Σ over dimensions ( (score_d − 1) / 2 × weight_d )
weights: specificity 20, unambiguity 15, non-conflict 15, platform-fit 15,
         constraint-completeness 15, format-determinacy 8, efficiency 6, technique 6
         (total 100)
```

- All 1s → 0. All 3s → 100. All 2s → 50.
- **Bands (user-facing):** 0–39 "Needs work" · 40–69 "Solid" · 70–89 "Strong" · 90–100 "Excellent".
- Sub-scores are always shown alongside the overall number (§10.5) — the score is evidence, not a vibe.

## Worked example

**Draft A:** "make a nice image of a dog"
- Specificity 1 · Unambiguity 2 · Non-conflict 3 · Platform-fit 1 (no platform syntax at all) · Constraints 3 (none stated) · Format 3 (visual task) · Efficiency 3 · Technique 1 (no descriptor density for a diffusion target)
- Strength = 0+7.5+15+0+15+8+6+0 = **51.5 → 52 "Solid"** — but two dimension-1 scores trigger refinement regardless of the total. *(Refinement triggers on any 1, not on the aggregate.)*

**Draft B (post-refinement):** "golden retriever puppy mid-leap catching a red frisbee, backyard lawn, late-afternoon sun, shallow depth of field, photorealistic, 16:9 --style raw"
- All dimensions 3 except Unambiguity 3, Technique 3 → **100 "Excellent"** (assuming the syntax matches the target platform's registry entry).

## Rules for scorer implementations

1. Score dimensions independently; never let one leak into another.
2. Any dimension = 1 → `needs_refinement: true` with a specific, actionable issue string naming the node(s) at fault.
3. Refinement fixes **exactly the flagged issues** — it never rewrites passing nodes (locked-node discipline, §10.6).
4. Log `{rubric_version, per-dimension scores, issues, refinement_count}` per draft — this feeds the continuous-improvement loop (§10.7).
