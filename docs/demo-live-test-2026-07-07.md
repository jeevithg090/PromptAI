# PromptForge — Live Pipeline Demo

**Date:** 2026-07-07
**What this shows:** three real end-to-end runs through the live backend — a plain-language idea goes in, and a scored, platform-tailored prompt comes out. Every run below hit the real pipeline (safety check → intent understanding → knowledge lookup → drafting → quality scoring) with real AI models, not canned examples.

**How to read it:** "Input" is exactly what the user typed, plus which platform they picked. "Output" is exactly what PromptForge handed back — the finished prompt, its quality score out of 100, and the specific critique that produced that score.

---

## Demo 1 — Midjourney (image generation)

**Input**
> Platform: **Midjourney**
> Idea: *"a cozy bookshop interior on a rainy evening"*

**Output — Strength Score: 72 / 100**

> cozy bookshop interior, rainy evening, indoors, warm, intimate, wooden accents, shot from a comfortable reading nook, shallow depth of field, soft, golden light, warm shadows --ar 4:5 --style photograph

**What PromptForge built it from:**

| Element | Chosen value | Alternatives offered |
|---|---|---|
| Subject | cozy bookshop interior | warm bookstore · inviting library |
| Setting | rainy evening, indoors | stormy night, bookstore |
| Style | warm, intimate, wooden accents | rustic, vintage, soft lighting · classic, plush, leather-bound books |
| Composition | shot from a comfortable reading nook, shallow depth of field | view from the bookstore entrance, warm glow · bird's eye view, cluttered bookshelves |
| Lighting | soft, golden light, warm shadows | warm lamp light, cozy ambiance · fireplace, flickering flames |
| Technical | --ar 4:5 --style photograph | — |

**Why it scored 72, not higher — the critique:**
- The subject could be more specific ("used bookstore" or "independent bookstore" rather than just "bookshop")
- Words like "warm" and "intimate" are a bit vague without something concrete backing them up
- No detail level or texture guidance given

---

## Demo 2 — Anthropic Claude (chat persona / system prompt)

**Input**
> Platform: **Claude**
> Idea: *"a system prompt for a patient Spanish tutor for beginners"*

**Output — Strength Score: 55 / 100**

> You are a patient Spanish tutor for beginners, in a beginner-friendly online learning environment, clear, encouraging, and concise explanations. follow standard Spanish grammar and vocabulary rules, avoid jargon and complex expressions. respond with a brief, structured lesson plan, including example phrases and pronunciation guides.

**What PromptForge built it from:**

| Element | Chosen value | Alternatives offered |
|---|---|---|
| Persona | You are a patient Spanish tutor for beginners | You are a native Spanish speaker helping beginners |
| Setting | in a beginner-friendly online learning environment | in a small classroom with one-on-one attention |
| Style | clear, encouraging, and concise explanations | engaging, interactive, culturally immersive · step-by-step, methodical, thorough |
| Rules | follow standard Spanish grammar and vocabulary rules, avoid jargon and complex expressions | include common idiomatic expressions and regional variations |
| Output shape | respond with a brief, structured lesson plan, including example phrases and pronunciation guides | provide a conversational dialogue with corrections and feedback |

**Why it scored lower (55) — the critique was more pointed here:**
- Doesn't say what level of beginner (someone who knows zero Spanish vs. someone with a little exposure)
- "Brief, structured lesson plan" doesn't say what "brief" actually means
- **Missed a technique specific to this platform:** Claude is known to follow XML-tagged structure especially well, and this draft didn't use it
- A couple of other elements read as vague rather than concrete

*(This is a good example of the Critic doing its job — it correctly caught that a Claude-specific best practice was left on the table.)*

---

## Demo 3 — Stable Diffusion (image generation)

**Input**
> Platform: **Stable Diffusion**
> Idea: *"a red bicycle leaning against a brick wall"*

**Output — Strength Score: 86 / 100** (the strongest of the three)

> red bicycle, stationary, leaning, brick wall, photorealistic, medium shot, slightly angled, soft, natural daylight, highly detailed, sharp focus
>
> Negative prompt: blurry, distorted, extra objects

**What PromptForge built it from:**

| Element | Chosen value | Alternatives offered |
|---|---|---|
| Subject | red bicycle | — |
| Action | stationary, leaning | parked, upright |
| Setting | brick wall | — |
| Style | photorealistic | hyperrealistic · realistic with a touch of impressionism |
| Composition | medium shot, slightly angled | close-up, emphasizing details · wide shot, environmental context |
| Lighting | soft, natural daylight | warm, golden hour · dramatic, overcast |
| Technical | highly detailed, sharp focus | — |
| What to avoid | blurry, distorted, extra objects | — |

**Why it scored highest — the critique was minor:**
- Could specify image size/aspect ratio explicitly
- "Highly detailed" and "sharp focus" slightly overlap with "photorealistic" — a touch of redundancy
- Otherwise: no ambiguity, no contradictions, correctly formatted for the platform (including the dedicated negative-prompt field, which Stable Diffusion specifically supports)

---

## What this demonstrates

- **One system, three completely different platforms** — the same pipeline correctly adapted its output style for a comma-tag image model (Midjourney), a prose-based chat model (Claude), and a negative-prompt-aware image model (Stable Diffusion) — without any platform-specific code branches, just platform knowledge it looked up.
- **The scoring is real, not decorative** — each score came with specific, actionable reasons, and those reasons visibly matched genuine gaps in the draft (e.g. correctly flagging that the Claude draft skipped XML structuring).
- **Every run happened in seconds**, start to finish — plain idea in, finished graded prompt out.
