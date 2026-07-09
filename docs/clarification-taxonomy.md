# Clarification Question Taxonomy — v1.0

> **Spec reference:** §11, §31.1 Step 3. **Consumers:** the Clarifying Question Agent (question generation + stopping) and the frontend clarification flows (web + extension). A frontend developer should be able to build the MCQ/free-text UI from this document alone.

## Core rules (apply to every flow)

1. **Enumerable + platform-relevant → MCQ.** If the PKB/registry lists a bounded value set (styles, aspect ratios, tones, output formats, shot types), present chips.
2. **Open-ended/descriptive → free text.** Subject details, brand voice, factual content.
3. **Hybrid:** every MCQ includes an **"Other (describe)"** escape hatch opening a free-text field.
4. **One or two questions at a time**, conversational — never a long upfront form. The live preview updates between questions.
5. **Cap:** 3–5 questions total (configurable, default 4). Stop earlier when marginal information gain is low (all load-bearing nodes filled).
6. **"Just generate now"** is always visible and always honored immediately.
7. Questions already answered by the user's initial idea are **never asked** (e.g. idea says "photorealistic" → skip style).
8. Memory/Project pinned context pre-fills answers, shown as pre-selected and changeable — not re-asked.

## Priority model

Each task type lists questions in priority order. Ask in order, skipping pre-answered ones, until the cap or until remaining questions are all `low` priority.

- **P1** — load-bearing: the draft is likely wrong without it.
- **P2** — high-value: materially improves specificity/platform-fit.
- **P3** — polish: ask only if budget remains.

---

## text_to_image (Gemini, Midjourney, Stable Diffusion)

| # | Pri | Question | Type | Options / notes |
|---|---|---|---|---|
| 1 | P1 | What's the main subject? | free text | Skip if idea contains a subject |
| 2 | P1 | Visual style? | MCQ | photorealistic · illustration · 3D render · anime · watercolor · oil painting · pixel art · Other |
| 3 | P2 | Setting or environment? | free text + optional MCQ | indoor · outdoor/nature · urban · fantasy · sci-fi · plain background · Other |
| 4 | P2 | Composition / framing? | MCQ | close-up · medium shot · wide shot · overhead · low angle · Other |
| 5 | P2 | Lighting / mood? | MCQ | golden hour · soft studio · dramatic/high-contrast · neon · overcast · night · Other |
| 6 | P3 | Aspect ratio? | MCQ | square 1:1 · landscape 16:9 · portrait 9:16 · classic 4:3 · Other — *only where platform supports it (registry check)* |
| 7 | P3 | Anything to explicitly avoid? | free text | Routes to Negative Prompt node on platforms with negative support; rephrased positively elsewhere (per quirks) |

## text_to_video

| # | Pri | Question | Type | Options / notes |
|---|---|---|---|---|
| 1 | P1 | What's the main subject and what happens? | free text | subject + action |
| 2 | P1 | Visual style? | MCQ | cinematic/live-action · 3D animation · 2D animation · stop-motion · documentary · Other |
| 3 | P2 | Camera movement? | MCQ | static · slow pan · tracking/follow · drone/aerial · zoom in · Other |
| 4 | P2 | Duration/pacing intent? | MCQ | single continuous shot · quick cuts · slow and atmospheric · Other |
| 5 | P3 | Lighting / mood? | MCQ | (same set as image) |

## chat_persona (persona/agent setup on chat platforms)

| # | Pri | Question | Type | Options / notes |
|---|---|---|---|---|
| 1 | P1 | Who/what should the AI act as? | free text | role, e.g. "patient language tutor" |
| 2 | P1 | Tone/register? | MCQ | professional · friendly/casual · encouraging · concise/direct · playful · academic · Other |
| 3 | P2 | Who is the audience? | free text + MCQ | general public · beginners · experts · children · internal team · Other |
| 4 | P2 | What should it NEVER do? | free text | boundaries → Constraints node (phrased positively where model handles negation poorly) |
| 5 | P3 | Should it ask questions back or just answer? | MCQ | ask clarifying questions · answer directly · one question max then answer |

## reasoning_code

| # | Pri | Question | Type | Options / notes |
|---|---|---|---|---|
| 1 | P1 | What should the code/solution do? | free text | Skip if idea is specific |
| 2 | P1 | Language / framework / version constraints? | free text + MCQ | populated from idea context where possible |
| 3 | P2 | Output format? | MCQ | code only · code + explanation · step-by-step walkthrough · diff/patch · Other |
| 4 | P2 | Constraints (performance, style, dependencies)? | free text | → Constraints node |
| 5 | P3 | Should it verify/test its answer? | MCQ | yes, self-check + tests · self-check only · no |

## extraction_classification

| # | Pri | Question | Type | Options / notes |
|---|---|---|---|---|
| 1 | P1 | What are you extracting/classifying, from what input? | free text | |
| 2 | P1 | Output schema? | MCQ + free text | JSON object · CSV rows · bulleted list · table · Other — schema detail in free text |
| 3 | P2 | Can you give 1–2 example inputs with correct outputs? | free text | Feeds few-shot examples — MPKB says examples measurably help here |
| 4 | P3 | How to handle ambiguous/missing values? | MCQ | leave null · best guess flagged · skip item · Other |

## long_form_writing

| # | Pri | Question | Type | Options / notes |
|---|---|---|---|---|
| 1 | P1 | What is the piece and its purpose? | free text | e.g. "blog post to convince X of Y" |
| 2 | P1 | Audience? | free text + MCQ | (same set as persona audience) |
| 3 | P2 | Tone / voice anchors? | MCQ | (same tone set) + free-text "write like…" anchor |
| 4 | P2 | Structure? | MCQ | sections with headings · narrative flow · listicle · executive summary + detail · Other |
| 5 | P3 | Length target? | MCQ | short (<300 words) · medium (300–800) · long (800–2000) · very long (2000+) |

---

## Stopping criteria (agent-side)

Stop asking when **any** of:
- All P1 and P2 questions are answered or pre-answered → stop.
- Question cap reached (default 4, config `CLARIFY_MAX_QUESTIONS`).
- Estimated information gain of the best remaining question is below threshold (all remaining are P3 and the draft already scores ≥2 on specificity per a cheap pre-check).
- User clicks **"just generate now"** → stop immediately, draft with sensible defaults, and mark defaulted nodes visually so the user knows what was assumed.

## Frontend contract

The agent returns:

```json
{
  "questions": [
    {
      "id": "style",
      "text": "Visual style?",
      "type": "mcq",
      "options": ["photorealistic", "illustration", "3d_render", "anime", "watercolor", "oil_painting", "pixel_art"],
      "allow_other": true,
      "maps_to_node": "style",
      "priority": 1
    }
  ],
  "can_generate_now": true,
  "questions_remaining_estimate": 2
}
```

Accessibility requirements (§29.5): MCQ chips are real buttons in a labeled radio/checkbox group, fully keyboard-navigable; free-text fields have visible labels; "just generate now" is a first-class button, not a link.
