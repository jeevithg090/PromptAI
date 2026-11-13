# Users, jobs-to-be-done and competition

Research lens: who PromptAI serves, what they are trying to get done, who else serves them, and where to start.
Date: 2026-11-10. Framework: competitive-analysis (market context, metrics, competitor mapping, comparison, moats, synthesis), written as a report, not a deck.

> Research note: the shared web-search budget ran out before this lens started. Facts below come from direct fetches of first-party pages and surveys, plus the repo itself. Anything I could not confirm is marked "unverified".

## 1. Bottom line

People do not lack AI tools. They lack three things: words for what they want, knowledge of how each tool wants to be asked, and time to learn either. The evidence:

- Only one-third of employees say they were properly trained, and regular use is much higher after 5+ hours of training (BCG 2025).
- 66% of developers say AI output is "almost right, but not quite" (Stack Overflow 2025).
- Only 10% of US adults aged 65+ have used ChatGPT (Pew 2025).

Today's product is a prompt optimizer whose output is a 0-100 score. It answers a question most people never ask. My recommendation is to rebuild PromptAI as a **voice-first intent layer plus a personal tool coach**. You speak a rough ask in any app. PromptAI fills in what you forgot, shapes the ask for the tool you are in, and teaches you that tool as you go. The three launch use cases are **Speak-it-right**, **First win in 10 minutes** and **Recipes that remember** (section 8).

## 2. Category metrics (framework step 0)

Do not use the prompt score as the north star. Track these six instead:

1. **Sent-as-is rate**: the share of inserted text not edited within 60 seconds.
2. **Follow-up turns saved**: how often the user has to re-ask the AI tool.
3. **Dictation corrections per 100 words**: accuracy as users perceive it.
4. **Time-to-first-win** on a new tool: under 10 minutes.
5. **Weekly active speakers** and words dictated per week.
6. **W4/W8 retention** by segment.

## 3. Market context (verified figures)

| Signal | Figure | Source |
|---|---|---|
| ChatGPT reach | ~10% of world adults by July 2025. Non-work share rose from 53% to >70%. Practical guidance, information seeking and writing are ~80% of use. | NBER w34255 |
| US adults who have used ChatGPT | 34% overall: 58% under 30, 25% at 50-64, 10% at 65+ | Pew 2025 |
| Adults 50+ | Gen-AI use rose from 9% to 18%. Top tech barriers: privacy (one-third), ease of use (20%), setup (19%). | AARP |
| Frontline workers | Regular use stalled at 51%. More than half would use unapproved tools. | BCG 2025 |
| Developers | 84% use or plan to use AI. 46% distrust its accuracy. | Stack Overflow 2025 |
| Physicians | 66% use health AI (38% in 2023). Top uses: notes (21%), care plans (20%), translation (14%). | AMA 2025 |
| K-12 teachers | 32% use AI weekly and save 5.9 h/week. Top uses: lesson prep (37%), worksheets (33%), adapting materials (28%). | Gallup/Walton 2025 |

What this means: demand is mainstream and mostly outside work. The gap is skill and trust, not access.

## 4. Jobs-to-be-done (14 segments)

| Segment | Core job ("When…, I want…, so I can…") | Daily problems removed | Tools to master | Excellent looks like |
|---|---|---|---|---|
| Students | When stuck on an assignment, understand it so I learn and pass | Vague questions get vague answers. Unsure of integrity lines. | ChatGPT/Claude study modes, NotebookLM, Perplexity | A Socratic coach that uses the syllabus and flags integrity lines |
| Teachers | When prepping, get differentiated material in minutes | Rewriting for reading levels and English learners. Rubrics. Parent emails. | Gemini/ChatGPT for education, Khanmigo, Canva, Classroom | "Grade 7 photosynthesis, 3 levels" spoken turns into a lesson, worksheet and rubric in the teacher's format |
| Software engineers | When delegating to a coding agent, get it right the first time | Missing acceptance criteria. "Almost right" output. RSI. | Cursor, Claude Code, Copilot, AGENTS.md | A dictated task becomes a spec with scope, files, tests and constraints |
| Designers | When exploring, make generators match vision and brand | Tool syntax. Keeping style and characters consistent. | Figma AI, Midjourney, Flux, v0 | Style memory plus side-by-side outputs |
| Writers and creators | When drafting, sound like me, not a bot | Generic voice. Repurposing across channels. | ChatGPT/Claude, Descript, Substack | A voice profile learned from past work |
| Marketers | When launching, get on-brand copy for every channel | Re-explaining brand, audience and CTA in every chat | ChatGPT, Canva, HubSpot, ad tools | A brand kit in memory, a missing-CTA/audience check, channel recipes |
| Researchers | When reviewing literature or data, get scoped, sourced answers | Hallucinated citations. Writing in a second language. | Perplexity, Elicit, NotebookLM | A scoping checklist plus a verify-before-trust step |
| Founders and PMs | Turn a thought into a PRD or update the team can execute | Rambling voice notes. Specs that miss edge cases. | Claude/ChatGPT projects, Notion, Linear | A walk-and-talk note becomes a PRD with gaps flagged |
| Lawyers | Draft precisely without risking privilege | Missing jurisdiction, parties and dates. Confidentiality. | Harvey/CoCounsel, Copilot in Word | Matter-scoped context, on-device mode, fact-gap checks |
| Healthcare workers | Finish documentation and patient instructions on time | Documentation load. Translating for patients. | Ambient scribes, EHR copilots | A non-PHI start: plain-language instructions and translation |
| Small-business owners | Handle customers, listings and quotes from my phone | No time to learn tools. Typing on the go. | ChatGPT, Canva, Shopify/Square, Google Business | A business profile in memory, mobile voice, reply/post/quote recipes |
| Non-native English speakers | Think in my language, send fluent English | Translating in their head. Tone mistakes. | DeepL, Grammarly, ChatGPT | Speak in your own language, get native-register English with the changes explained |
| People with disabilities or RSI | Write and control the computer by voice | Jargon misheard. No command grammar. Fatigue. | Talon, OS Voice Control, Dragon | Accurate jargon, voice edit commands, low latency |
| Older adults new to AI | Get help (letter, form, scam check) without feeling stupid | Not knowing what to ask. Privacy fear. Setup. | Phone assistant, ChatGPT/Gemini apps | A patient voice guide that asks one question at a time and keeps data private |

## 5. Segment-by-feature matrix

Features:
- **F1**: dictation in any app
- **F2**: intent-gap check ("what you forgot")
- **F3**: destination-aware formatting
- **F4**: personal context (voice, glossary, role)
- **F5**: tool coach
- **F6**: recipes (repeatable jobs)
- **F7**: run and compare outputs
- **F8**: private/on-device mode
- **F9**: hands-free commands
- **F10**: speak your own language, write in another

Ratings: 3 = core to the job, 2 = valuable, 1 = nice-to-have.

| Segment | F1 | F2 | F3 | F4 | F5 | F6 | F7 | F8 | F9 | F10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Students | 2 | 2 | 2 | 1 | 3 | 2 | 1 | 1 | 1 | 2 |
| Teachers | 2 | 3 | 2 | 3 | 3 | 3 | 2 | 2 | 1 | 2 |
| Software engineers | 3 | 3 | 3 | 2 | 2 | 2 | 2 | 2 | 2 | 1 |
| Designers | 1 | 2 | 3 | 2 | 3 | 2 | 3 | 1 | 1 | 1 |
| Writers/creators | 3 | 2 | 2 | 3 | 2 | 2 | 2 | 1 | 1 | 1 |
| Marketers | 2 | 3 | 3 | 3 | 2 | 3 | 2 | 1 | 1 | 2 |
| Researchers | 2 | 3 | 2 | 2 | 2 | 2 | 3 | 2 | 1 | 2 |
| Founders/PMs | 3 | 3 | 2 | 2 | 2 | 3 | 2 | 1 | 1 | 1 |
| Lawyers | 3 | 3 | 2 | 2 | 2 | 3 | 2 | 3 | 1 | 1 |
| Healthcare | 3 | 2 | 1 | 2 | 2 | 3 | 1 | 3 | 2 | 3 |
| Small business | 3 | 3 | 2 | 3 | 3 | 3 | 1 | 1 | 1 | 2 |
| Non-native English | 3 | 2 | 2 | 2 | 2 | 2 | 1 | 1 | 1 | 3 |
| Disability/RSI | 3 | 2 | 2 | 2 | 1 | 2 | 1 | 2 | 3 | 1 |
| Older adults | 3 | 3 | 1 | 2 | 3 | 2 | 1 | 3 | 2 | 1 |
| **Sum (max 42)** | **36** | **36** | 29 | 31 | 32 | **34** | 24 | 24 | 19 | 23 |

How to read it:
- **F1 + F2 are the engine.** They are core (3) for 9 and 8 of the 14 segments.
- **Recipes (F6) and coaching (F5) come next.**
- **Run-and-compare (F7) ranks near the bottom.** It is the backbone of revival.md's FIRE/Arena pillar, but only designers and researchers rate it core.

## 6. Competitive landscape

### 6.1 Mapping by posture

- **Direct, dictation layer:** Wispr Flow, Superwhisper, Willow Voice; open-source Handy, OpenWhispr, VoiceInk.
- **Adjacent, assistants with memory:** ChatGPT, Claude, Gemini, Perplexity/Comet.
- **Adjacent, workspace AI:** Raycast AI, Notion AI, Grammarly/Superhuman.
- **Prompt tooling:** PromptPerfect, AIPRM, PromptLayer, vendor-console improvers, DSPy/GEPA.
- **Non-obvious:** digital adoption platforms (DAPs) such as Whatfix, workflow capture (Scribe), and hands-free control (Talon). DAPs already do "help people adopt any tool", but only for employers.

### 6.2 Comparison

Ratings: 3 = strong, 2 = partial, 1 = minimal, 0 = absent.

| Product | Voice in any app | Fills intent gaps | Shapes the ask for the destination tool | Personal memory | Teaches the skill | Platforms | Price (verified) |
|---|---|---|---|---|---|---|---|
| Wispr Flow | 3 (100+ languages, whisper mode) | 0 | 1 (per-app styles; English and desktop only) | 1 (auto-learning dictionary, snippets) | 0 | Mac/Win/iOS/Android | Free; Pro $15/mo ($12 annual) |
| Superwhisper | 3 (offline local models) | 1 (custom-mode prompts) | 2 (modes, "Super Mode" screen context) | 1 (vocabulary) | 0 | Mac/Win/iOS/Android/Linux | Pro price unverified |
| Willow Voice | 3 | 1 ("Scribe": rough speech into polished writing) | 1 | 1 (style matching) | 0 | Mac/Win/iPhone | unverified |
| ChatGPT/Claude/Gemini | 2 (in their own app) | 2 (clarify mid-conversation) | n/a (they are the destination) | 3, but locked to each vendor. Claude: per-project memory, experimental import/export. | 1 (study modes) | all | free/paid |
| Perplexity/Comet | 1 | 0 | 0 | 2 (Memory; "Brain" on Max) | 0 | Mac/Win/iOS/Android | unverified |
| Raycast AI | unverified | 0 | 1 (AI Commands) | 1 (Memory, Profile) | 0 | macOS/Win/iOS | Pro $10/mo, 500 credits |
| Notion AI | 0 | 0 | 0 | 2 (workspace and connectors) | 0 | all | Business tier |
| Grammarly/Superhuman | 0 | 1 (tone, fluency) | 0 | 0 | 1 (AI Grader) | everywhere | Pro £10/mo |
| AIPRM | 0 | 1 (templates) | 2 (per-tool templates) | 0 | 0 | Chrome/Edge | 2M+ users claimed |
| PromptLayer | 0 | 0 | 1 | 0 | 0 | web, developers | $49 Pro, $500 Team |
| PromptPerfect | 0 | 1 | 1 | 0 | 0 | web | status unverified |
| Vendor optimizers | 0 | 1 | 3 (one vendor only) | 0 | 0 | developers | OpenAI's dataset-backed optimizer is retiring with Evals (read-only Oct 31, shutdown Nov 30, 2026) |
| DSPy/GEPA | 0 | n/a | 3 (any model, code only) | 0 | 0 | Python | MIT |
| Whatfix (DAP) | 0 | 0 | 3 (enterprise apps) | 0 | 3 (flows, Mirror simulations, AI role-play) | enterprise web | sales-led |
| Talon | 3 (commands, eye tracking) | 0 | 0 | 0 | 0 | Mac/Win/Linux | Patreon; proprietary EULA |

### 6.3 Moats and vulnerabilities

- **Wispr Flow:** strong habit lock-in (a hotkey in every app, a learned dictionary), no network effects.
  - Vulnerable: it cleans up words but does not complete the ask.
  - Willow's "Scribe" shows this tier moving toward polishing rough speech. Expect them to compete on intent within about two quarters (my estimate).
- **Assistant vendors:** strong models and distribution, and switching costs that grow through memory.
  - Structural weakness: each vendor's memory stays locked inside its own product. A teacher who uses Gemini at school and ChatGPT at home has two partial profiles.
  - Claude's experimental memory import/export shows people want their context to be portable.
- **Prompt tools:** weak moats.
  - Better models and the vendors' own improvers are making them a commodity, and some vendor improvers are being retired.
  - The Anthropic prompt-improver doc URL now redirects to a general best-practices page. Whether the tool itself was removed is unverified.
- **DAPs:** strong switching costs for enterprises, but someone has to author every flow, and they are sold only to employers.

### 6.4 Gaps PromptAI can own

1. **Intent completion at the moment of asking**, by voice, in any app. Nobody checks what is missing (audience, format, constraints, success criteria) before the first turn is wasted.
2. **A portable personal context that the user owns** and that follows them into every tool.
3. **Coaching for individuals on any AI tool:** a consumer DAP, generated from a tool registry rather than written by hand.
4. **An uncaptured learning signal:** what users edit after insertion, and when they re-ask. This is the fuel for personalization and prediction.
5. **Underserved segments:** older adults, non-native speakers and people with RSI.

## 7. Options compared, then a commitment

| Option | Frequency | Differentiation | Defensibility | 1-3 engineers? | Breadth |
|---|---|---|---|---|---|
| A. Better prompt optimizer (today's product) | Low | Low (commoditizing) | Weak | Yes | Narrow |
| B. Voice-first intent layer (F1+F2+F3) | **Daily** | High (unclaimed) | Moderate (habit + personal data) | Yes, with open-source speech-to-text | **Very broad** |
| C. Personal tool coach (consumer DAP; non-obvious) | Weekly | High | Moderate (registry + outcome data) | Yes, if playbooks are generated | Broad |
| D. Vertical copilot (legal or health) | Daily | Medium | Strong | No (compliance load, incumbents) | Narrow |
| E. Developer prompt-ops | Daily | Low | Weak | Yes | Developers only |

**Commitment: B is the engine and C is the retention layer, built as one codebase.**
- Dictation brings daily use.
- The gap check is something no competitor does.
- Coaching turns the habit into skill, which keeps users once Wispr or the OS vendors catch up on raw transcription.

A, D and E are rejected for launch. DSPy/GEPA-style optimization stays internal: we use it to tune our own recipes and gap checkers offline.

## 8. Three wedge use cases

**W1. Speak-it-right (F1+F2+F3).** The user holds a hotkey (or uses the mobile keyboard) in ChatGPT, Claude, Cursor, Gmail or Slack and rambles. PromptAI returns clean text.
- When the destination is an AI tool, PromptAI adds a gap checklist with smart defaults the user accepts in one tap ("Audience: *team leads*. Format: *bullets*").
- It asks at most one blocking question.
- Segments: engineers, founders/PMs, lawyers, non-native speakers, RSI.
- Success: a higher sent-as-is rate and fewer follow-up turns than a polish-only baseline, in an A/B test.

**W2. First win in 10 minutes (F5+F2).** The user names a tool ("my school gave us Gemini"), or PromptAI detects it.
- The tool registry generates a three-step guided task built from the user's *real* job.
- Tips appear in the flow when they help: "Claude Projects can hold your syllabus."
- A light skill profile tracks what the user can now do.
- Segments: teachers, older adults, small-business owners, students. This targets the BCG training gap.
- Success: first win in under 10 minutes, and the user still using the tool in week 2.

**W3. Recipes that remember (F6+F4).** PromptAI notices jobs the user repeats (weekly parent email, client update, product listing, PR description) and offers to save them.
- Variables are pre-filled from memory and context.
- Recipes run by voice ("weekly update for Acme") and can be shared with a team.
- They are tuned offline from what users edit afterwards.
- Segments: teachers, marketers, small business, PMs, lawyers.
- Success: recipe reuse rate and W8 retention.

Kept out of the launch scope:
- Meeting notetaking (crowded: Wispr Notetaker, Superwhisper, Notion AI Meeting Notes)
- Clinical documentation that handles patient health data (PHI)
- The model arena

## 9. Repo: keep, change, drop

**Keep**
- **`config/platform-registry.json`:** grow it into a *tool* registry that also covers Excel, Docs, Canva, Notion and Gmail, storing how each tool wants to be asked plus coaching tips.
- **`config/clarification-questions.json`:** keep it as config, but change the behaviour from "up to 4 MCQs" to "show gaps with defaults, ask at most one question".
- **The node and `defaulted` honesty flags:** keep them internally.
- **The rubric:** keep it as an internal judge.
- **The desktop hotkey and dictation path.**
- **Before/After:** keep it as a coaching device.

**Change**
- **Target users:** the architecture doc targets prosumers, creators, developers/PMs and teams, which skews toward people who already use AI tools. Re-centre on the 14 segments above.
- **Content mix:** 7 of 24 library seeds are visual, and the first demo is "horse-sunset". The six strategy profiles and clarification task types have no slot for emails, forms, lessons, study, translation or everyday tasks, which make up most real use.
- **Node types:** up to 6 of the 11 node types are image- or video-oriented (style, composition, lighting, negative, technical parameters, setting). Make node types per-domain data.
- **Score display:** hide the 0-100 score from novices and lead with the outcome.

**Drop or defer**
- From revival.md: Prompt Golf, Battles, Wrapped, Roast, the public ELO Arena and bounties. They serve prompt hobbyists, and F7 scores 24/42 in the matrix.
- Building a second native macOS client alongside Electron before demand is proven. Mobile capture (keyboard or share sheet) matters more.

## 10. Risks

- **OS-level competition:** Apple, Microsoft or Google could ship system-level dictation plus rewrite and absorb W1's polish half. Our defence is intent completion and portable context.
- **Dictation rivals:** Wispr or Willow are likely to add gap-checking, so speed and the coaching layer matter.
- **Privacy:** it is the top barrier for older adults. Lawyers and clinicians need confidentiality. All of them need an on-device or zero-retention mode.
- **iOS keyboard limits:** restrictions on microphone access and "full access" may force an app-switch flow. Unverified; needs a spike.
- **Consent for the learning signal:** capturing edit-after-insert needs accessibility permissions, so consent has to be designed in.
- **Stale coaching:** tool knowledge goes stale quickly, so registry refresh must be automated and dated.

## Sources

- https://www.nber.org/papers/w34255
- https://www.pewresearch.org/short-reads/2025/06/25/34-of-us-adults-have-used-chatgpt-about-double-the-share-in-2023/
- https://www.aarp.org/pri/topics/technology/internet-media-devices/2025-technology-trends-older-adults/
- https://www.bcg.com/publications/2025/ai-at-work-momentum-builds-but-gaps-remain
- https://survey.stackoverflow.co/2025/ai
- https://www.ama-assn.org/practice-management/digital-health/2-3-physicians-are-using-health-ai-78-2023
- https://news.gallup.com/poll/691967/three-teachers-weekly-saving-six-weeks-year.aspx
- https://wisprflow.ai/pricing
- https://wisprflow.ai/features
- https://superwhisper.com
- https://www.willowvoice.com/
- https://www.raycast.com/pricing
- https://support.claude.com/en/articles/11817273-using-claude-s-chat-search-and-memory-to-build-on-previous-context
- https://www.perplexity.ai/help-center/en/articles/10968016-memory
- https://www.perplexity.ai/comet
- https://www.notion.com/product/ai
- https://www.grammarly.com/plans
- https://www.aiprm.com/pricing/
- https://www.promptlayer.com/pricing
- https://promptperfect.jina.ai
- https://developers.openai.com/api/docs/guides/prompt-optimizer
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompt-improver
- https://dspy.ai
- https://www.whatfix.com/
- https://scribe.com/
- https://talonvoice.com
- https://github.com/stanfordnlp/dspy
- https://github.com/gepa-ai/gepa
- https://github.com/cjpais/Handy
- https://github.com/OpenWhispr/openwhispr
- https://github.com/Beingpax/VoiceInk
- https://github.com/ggml-org/whisper.cpp
- https://github.com/promptfoo/promptfoo
- https://github.com/PostHog/posthog
- https://github.com/mem0ai/mem0
- https://github.com/talonhub/community
