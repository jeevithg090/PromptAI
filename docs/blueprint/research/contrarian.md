# Contrarian lens: product framing

*Research lens for the PromptAI blueprint. Written 2026-11-10.*

> **Research note.** This run's shared web-search budget was used up before this lens started. Every external claim below therefore comes from a primary-source page fetched directly, or from `gh api`. A claim I could not fetch is marked **(unverified)**. I quote no benchmark numbers except the ones printed on the cited pages.

## 1. Bottom line

**PromptAI should stop being a prompt generator.** In the first half of 2026 the prompt went from being the product to being an intermediate format. Hosts now own memory, model routing and execution. Agents increasingly read *skills*, not prompts. The reverse-prompting pipeline (13 agents, 11 nodes, an 8-dimension self-graded score) optimises an artifact whose value is falling every quarter.

**Recommended framing: a personal intent-to-skill layer.** You say, type or select what you want, in any app. PromptAI works out what you mean and fills in what you forgot. It turns that into a **Skill**: a reusable, personalised "how to do this well in tool X" package in the open Agent Skills format. It delivers the skill to whatever tool or agent you use, and learns from what happened next.

- The prompt becomes one rendering of a skill.
- Coaching is what the outcome data teaches.
- The community network is many users' skills, ranked by outcomes.

**Build:** capture, understanding, a portable user profile, skill authoring and outcome learning.
**Do not build:** a chat app, an executor agent, a model arena, a memory engine, or two desktop apps.

## 2. Why the default framing is decaying

Five pieces of evidence, all from 2025-2026:

1. **Model vendors now tell you to prompt less.** Anthropic's current guide covers about 16 live Claude models, each with its own guidance. It tells builders to *remove* aggressive language and over-prompting because newer models over-trigger on it ([Claude prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)). Anthropic reframed the discipline as *context engineering* back in September 2025 ([Anthropic engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)). A static platform-quirk knowledge base rots at that release cadence.
2. **Prompt optimisers are being folded away.** OpenAI's dataset-backed prompt optimiser is being deprecated with its Evals platform: read-only from 2026-10-31, shut down 2026-11-30 ([OpenAI docs](https://developers.openai.com/api/docs/guides/prompt-optimizer)). Anthropic's old "prompt improver" doc URL now redirects to a general best-practices page. These are signals, not proof, but neither vendor treats standalone prompt polishing as a destination.
3. **Memory is native and portable in the hosts.** Claude memory (2025-09-11 for Team and Enterprise, 2025-10-23 for Pro and Max) is per project and supports import and export ([Claude blog](https://claude.com/blog/memory)). Gemini's personal context is on by default ([Google](https://blog.google/products/gemini/temporary-chats-privacy-controls/)). Anthropic's 2026-11-06 memory research finds that fixed memory rules *hurt* stronger models ([Anthropic research](https://www.anthropic.com/research/components-of-agent-memory)). A `MemoryExtractionAgent` run once per session cannot compete inside the host.
4. **Execution moved into the hosts.** Claude in Chrome is generally available on paid plans and clicks, types and fills forms across tabs with per-action approvals ([claude.com/chrome](https://claude.com/chrome)). Gemini 2.5 Computer Use (2025-10-07) is browser-tuned and "not yet optimized for desktop OS-level control" ([Google](https://blog.google/technology/google-deepmind/gemini-computer-use-model/)). ChatGPT Atlas has an agent mode, but its page returned 403 to my fetcher **(unverified)**. Once the agent does the task, "here is a better prompt to paste" is an extra step.
5. **Skills and in-host apps are the new distribution layer.**
   - Agent Skills were announced 2025-10-16 and published as an open standard on 2025-12-18 ([Claude blog](https://claude.com/blog/skills), [agentskills.io](https://agentskills.io)).
   - The standard was donated to the Linux Foundation's Agentic AI Foundation on 2026-10-22. By then more than 70 agent platforms had adopted it, including ChatGPT, Cursor, GitHub Copilot and VS Code ([Anthropic](https://www.anthropic.com/news/donating-agent-skills-to-the-agentic-ai-foundation)).
   - OpenAI's developer platform now ships "Plugins" that bundle skills, MCP servers and optional UI into a ChatGPT Directory ([OpenAI](https://developers.openai.com/apps-sdk)).
   - MCP Apps render interactive UI inside Claude, VS Code Copilot, Microsoft 365 Copilot and Goose ([MCP](https://modelcontextprotocol.io/extensions/apps/overview)).
   - Today (2026-11-10) Anthropic launched Interactive Connectors on MCP Apps. Third-party tools open inside Claude and Claude edits in them ([Claude](https://claude.com/resources/articles/interactive-connectors-full-tool)).

**The repo's own evidence agrees.** `config/model-routing.json` records that the multi-call pipeline took **60-120 s per draft** on Gemini's free tier and timed out the web client. The fix was to move every heavy step to Groq Llama 3.3 70B to get it down to 3-7 s. The architecture is latency-bound by its number of calls, not by model quality.

## 3. Five framings compared

Each framing is scored 1 (poor) to 5 (strong). These are my judgement, not measurements.

| Framing | User value | Defensibility | Small-team feasibility | Dictation fit | Personalisation fit | Cross-platform fit |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| **A. Prompt studio** (status quo plus revival.md: forge, fire, evolve, battle) | 2 | 1 | 4 | 2 | 2 | 3 |
| **B. Personal intent layer** (voice-first, every app, gap-filling) | 4 | 3 | 3 | 5 | 5 | 4 |
| **C. Do-it-for-me executor** (computer-use agent) | 5 | 1 | 1 | 4 | 3 | 2 |
| **D. Tool-mastery coach** (AI-native digital adoption for individuals) | 4 | 3 | 3 | 3 | 4 | 4 |
| **E. Skill network** (community-learned skills shipped into every host) *(non-obvious)* | 4 | 4 | 4 | 2 | 4 | 5 |

**A. Prompt studio.** Cheap to continue, but every revival.md pillar except EVERYWHERE competes with something hosts give away (FIRE and Arena with chat apps and LMArena, EVOLVE with vendor optimisers), and Genome and Dojo rest on an unvalidated rubric. No moat, and its audience is the one hosts are training out of the prompting habit.

**B. Personal intent layer.** A hotkey, a mobile keyboard or share sheet, and an extension side panel. You speak or select. The layer knows the active app, your profile and the tool's best practice, and returns a ready-to-use result with its assumptions shown.
- **Strength:** it is the only framing where spot-on dictation, deep personalisation and "covers what you forgot" sit at the centre rather than being bolted on.
- **Weakness:** it is crowded at the voice edge. Wispr Flow runs on Mac, Windows, iPhone and Android with a personal dictionary, per-app styles and snippets. It advertises an $81M raise to build "the Voice OS" ([wisprflow.ai](https://wisprflow.ai)). Apple ships on-device long-form transcription in SpeechAnalyzer ([WWDC25](https://developer.apple.com/videos/play/wwdc2025/277/)).
- **Constraint:** PromptAI cannot win on transcription. It can only win on *what happens after* the words.

**C. Executor.** Highest user value, worst position. Every frontier lab ships one, and 1-3 engineers cannot match their reliability, safety review or reach (computer use is still browser-first). **Route to executors; do not become one.**

**D. Tool-mastery coach.** The most literal answer to "help people adopt any tool and get excellent at it". Enterprise digital-adoption incumbents are moving here: WalkMe markets an "agentic" experience that "overlays every application" ([walkme.com](https://www.walkme.com/); its SAP ownership is **unverified**). As a standalone product, though, coaching without a task is homework: people return for results, not lessons. The coach should be what the outcome data teaches, not the front door.

**E. Skill network (the non-obvious one).** PromptAI ships no destination app at first. Its product is skills: personal and community packages that teach any agent how a user, team or field does X with tool Y. They are delivered as Agent Skills and MCP tools and apps into Claude, ChatGPT, Cursor, Copilot and VS Code. They are ranked by measured outcomes, not stars.
- **Strengths:** the most defensible framing (network effects plus outcome data), the cheapest cross-platform story (it rides hosts that already run on every OS), and aligned with an open, foundation-governed standard.
- **Weakness:** it reaches only people who already live in AI hosts. personas-jtbd.md cites Pew 2025 showing only 10% of US adults aged 65 and over have used ChatGPT. On its own, E fails the "people across all fields" goal.

## 4. Recommended framing: the intent-to-skill layer (B + E, with D as the loop)

**Promise to the user:** *Say what you want, wherever you are. PromptAI knows how you work and how that tool works best, gets you an excellent result, and makes you better at the tool every time.*

**One core object: the Skill.**
- It is a folder in the agentskills.io format: `SKILL.md` plus optional `scripts/` and `references/` ([spec](https://agentskills.io)).
- It has three layers:
  - **Tool layer:** how tool Y works best. This comes from vendor skills, `llms.txt` and curated cards.
  - **Personal layer:** your vocabulary, preferences, assets and past corrections.
  - **Task layer:** the goal, inputs, constraints and acceptance checks.
- A prompt is just `render(skill, intent, target)`. A coaching tip is a diff between your personal layer and the community's best one. A community entry is a skill with outcome statistics attached.

**The loop. Every step is small, bounded and replaceable:**

1. **Capture.** Voice, text, a selection or a share. Context comes from the active app, URL and selected text. Speech recognition runs on the device by default (dictation.md covers which engines). The personal dictionary comes from the profile, which is why dictation becomes spot-on: names and jargon are known before you speak.
2. **Understand.** One structured model call returns the intent, the target tool, the matching skill, and an explicit assumptions list. This replaces intent, retrieval, clarification and drafting. Ask a question only when the expected value of the answer is high. Otherwise act, and show "Assumed: audience = team leads (change)". The repo's `defaulted` flag already does this; promote it to the main interaction.
3. **Equip.** Apply the skill and render for the target: an MCP tool result, a SKILL.md export, an inserted text block, or a hand-off brief for a host agent.
4. **Deliver.** Into the host, through MCP or MCP Apps, a WebExtension side panel, a desktop hotkey overlay, or the mobile share sheet and keyboard. Never through brittle DOM injection as the primary path.
5. **Learn.** Use outcome signals, not rubric scores: accepted as-is, edit distance, re-ask within 10 minutes, an explicit thumbs up or down, and acceptance-check results. These update the personal layer, which the user can see and edit, and feed a per-user bandit for small decisions such as "ask or assume" and "which skill". The product's own skills are optimised offline (GEPA reports beating GRPO by about 6% on average with up to 35x fewer rollouts, per its [abstract](https://arxiv.org/abs/2507.19457)).
6. **Coach.** At most one tip per session, taken from the user's own outcomes. For example: "your Midjourney results improved when you specified the lens; saved to your skill."

**Why it wins:** personalisation is portable and user-owned (each lab's memory is a walled garden; no single layer knows someone across Claude, ChatGPT, Midjourney and Excel). Defensibility compounds through skills plus outcome data and habit at the input layer. Open standards do the distribution. A single budgeted call with listed assumptions cannot loop, and "excellent" becomes "worked for you N times" instead of a self-assigned 91/100.

**What it is not:** a chat destination, a model playground, an agent runtime, or a memory database.

## 5. What the AI trends make obsolete in 12-24 months

| Planned or current feature | Trend that obsoletes it | Verdict |
|---|---|---|
| Prompt wording polish for frontier *chat* models (critic refine, alternatives per node) | Models follow plain intent; vendors say to dial prompting back | **Drop as the core.** Keep for image and video, where syntax still matters, but watch for in-tool prompt expansion **(unverified)** |
| Insert into 13 sites via `dom_fingerprint_selectors` | Agents, side panels and MCP Apps; hosts change their DOM constantly | **Drop as the primary path.** Keep clipboard and insert as a fallback |
| `MemoryExtractionAgent` as the memory system | Native memory in Claude and Gemini, with import and export | **Change.** Become the cross-host, user-owned profile that *exports into* host memory |
| Server-only Groq Whisper dictation | On-device STT (Apple SpeechAnalyzer; Chrome Prompt API with audio input, stable in Chrome 148, desktop only, needs about 22 GB free and a GPU for audio, per [Chrome](https://developer.chrome.com/docs/ai/prompt-api)) | **Change.** Device first, cloud as fallback |
| `ModelRecommenderAgent`, `OpenRouterModelFetcher` (345 models), `ModelRefreshAgent` | Hosts auto-route and expose effort settings; most users don't pick models | **Drop for consumers.** Keep a small static table for BYOK |
| pgvector Platform Knowledge Base, crawled | Vendors publish `llms.txt`, docs over MCP, and their own Agent Skills | **Shrink.** Fetch just in time; curate only the deltas |
| Model Arena, ELO, Prompt Battles, Prompt Golf | LMArena-style rankings exist; evaluation is commodity | **Avoid** |
| A separate per-user "Genome" of rubric scores | Rubric not validated against outcomes (below) | **Drop.** Replace with outcome-based progress |
| Building a computer-use executor | Claude in Chrome GA, Gemini Computer Use, Atlas agent | **Never build.** Hand off to the host |

## 6. Repo assumptions: keep, change, drop

**The 11-node schema.**
- **Problem:** four of the eleven slots are image-only (`style_aesthetic`, `composition_camera`, `lighting_mood`, `negative_prompt`). None captures *success criteria, audience, inputs or assets, or the next step*. That is the wrong shape for "any tool in any field": a spreadsheet model, a grant application, a Jira workflow.
- **Change:** use an open **Brief** (goal, context and audience, inputs, constraints, acceptance checks, assumptions, output contract) with tool-specific facets supplied by the skill.
- **Keep:** the `locked` and `defaulted` provenance fields. They are the best ideas in the repo.

**The 8-dimension rubric.**
- **Problem:** the same model family drafts and then grades its own output. `docs/quality-rubric.md` has no validation section. `outcome_signals` and `ContinuousImprovement.ts` exist, but I found no evidence in the repo that rubric scores have been shown to predict "worked".
- **Change:** demote the rubric to an optional lint. Retire "score 91" as the hero metric. Lead with outcome metrics and acceptance checks compiled from the brief.

**The 13-agent Supervisor.**
- **Problem:** it is a fixed sequential `STEP_SEQUENCE` (the orchestration review confirms this). Measured above, its call count is what drove the latency.
- **Change:** collapse it to one "understand" call, one optional clarification turn, and render. Memory and curation move to background jobs.
- **Keep:** the bounded-cycle guard and the trace from `PipelineGraph.ts`.
- **Drop:** `PlatformProfileAgent`, `ModelRefreshAgent`, `OpenRouterModelFetcher`, and four alternatives for every node, which is choice overload.

**Static-export web.** Not the problem. The problems are treating the web app as the centre of gravity and an API that buffers responses (revival.md appendix). Make the web app the *home* (profile, skills, history), let work happen in hosts and overlays, and add streaming.

**Electron plus a separate SwiftUI app.**
- **Problem:** two desktop apps for a team of 1-3. The SwiftUI app is 260 lines with a stubbed API and accessibility detector, and `macos-sdk` is 80 lines.
- **Drop:** both as products.
- **Change:** one React and Astryx UI in thin shells, with native code only as plugins (hotkey, accessibility context, on-device STT). Tauri 2 is the only single shell that covers all five operating systems, with Swift and Kotlin plugins ([Tauri 2.0](https://v2.tauri.app/blog/tauri-20/)). The shell choice belongs to the platform lens. My point is only that there should be one codebase.
- **Astryx:** it is React and web-only today. Its native package is a canary SwiftUI binding, which strengthens the case for webview shells.

**Extensions and `platform-registry.json`.** Build Chrome and Firefox from one WebExtension source and move from DOM injection to a side panel plus context capture. The 13-tool registry of hand-maintained selectors becomes a skill index that covers non-AI tools too, sourced from vendors and the community.

**Keep:** safety gates (collapsed into one policy check); memory that waits for user confirmation, with client-side encryption (privacy is part of the moat); config-driven model routing with fallbacks; BYOK; share links; `PromptTestService`, which becomes skill evals.

## 7. Where I disagree with the emerging consensus

The other lenses mostly converge on: an MCP server first, Tool Cards as SKILL.md, three agents, one UI in thin shells, and on-device dictation. I agree with most of it. Four objections:

1. **MCP first is a segment choice, not a neutral one.** It reaches people already inside Claude, ChatGPT and Copilot, who need PromptAI least. Ship it first because it is cheap, but judge the "every field" goal on the non-host surfaces (mobile share sheet, desktop hotkey).
2. **"Speak-it-right" (personas W1) meets Wispr Flow at its strongest point.** Market what dictation *becomes* (a skill applied, a brief handed off), not cleaner text. Parity on text cleaning is fine; parity on intent handling means PromptAI has nothing to offer.
3. **A curated Tool Atlas can turn PromptAI into a content company.** "Any tool" is unbounded. Default to vendor and community skills; hand-author only the top 20 tools by observed demand.
4. **The Optimizer (EVOLVE) should stay invisible.** Evolution trees are builder theatre. Users should see "this recipe got better".

## 8. Bets to avoid

1. **A general computer-use executor.** Hand off to the labs' agents.
2. **A chat app or model playground as the destination.** At most a minimal "try it" for tools with no UI.
3. **Arena, ELO, Battles, Golf, Wrapped, Roast** before single-player retention is proven. Virality with no compounding value.
4. **Your own memory engine or knowledge graph.** Start with human-readable profile notes in Postgres, like the injected-context layer in Anthropic's memory research.
5. **Training RL policies.** Contextual bandits for a few decisions, plus offline GEPA- or DSPy-style optimisation of your own skills.
6. **Growing the DOM-selector registry** from 13 to 30 platforms.
7. **A React Native rewrite or standalone SwiftUI product** while Astryx has no React Native binding.
8. **Showing a self-assigned quality score as truth.**
9. **A community hub before a solo user gets value.** Seed it with the team's and vendors' skills.
10. **Promising "insane prediction".** Ship next-action suggestions only where top-3 acceptance beats a per-user recency-and-frequency baseline.

## 9. Kill criteria: how to tell if this framing is wrong

After eight weeks of an MCP plus overlay beta:
- **Skill reuse:** under 20% of active users reuse any saved skill in a second week.
- **Outcome lift:** results with assumptions shown do not beat raw dictation on sent-as-is rate or re-ask rate in an A/B test.
- **Host capture:** a host ships cross-tool personal skills natively.

If **any one** of these happens, fall back to framing D, the coach, as the front door, built on the same Skill object.

## Open-source projects checked (gh api, 2026-11-10)

| Project | Licence | Stars / last push | Verdict |
|---|---|---|---|
| [agentskills/agentskills](https://github.com/agentskills/agentskills) | Apache-2.0 | 27.1k / 2026-11-04 | **Adopt** as the core object's format |
| [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) | MIT, moving to Apache-2.0 (API reports NOASSERTION) | 13.7k / 2026-11-10 | **Adopt** |
| [modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps) | MIT, moving to Apache-2.0 (NOASSERTION) | 3.1k / 2026-11-10 | **Adopt** for in-host UI |
| [meta/astryx](https://github.com/meta/astryx) | MIT | 22.3k / 2026-11-10 | **Adopt** for web, shells and MCP App views |
| [gepa-ai/gepa](https://github.com/gepa-ai/gepa) | MIT | 7.4k / 2026-11-09 | **Trial**, offline skill optimisation |
| [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo) | MIT | 27.0k / 2026-11-09 | **Trial**, skill regression evals |
| [stanfordnlp/dspy](https://github.com/stanfordnlp/dspy) | MIT | 39.0k / 2026-11-10 | **Assess**, heavier Python alternative to standalone GEPA |
| [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp) | MIT | 55.1k / 2026-11-10 | **Assess**, desktop STT fallback |
| [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | Apache-2.0 | 15.9k / 2026-11-10 | **Assess**, Android, Windows and Linux STT |
| [tauri-apps/tauri](https://github.com/tauri-apps/tauri) | Apache-2.0 (MIT dual) | 112.7k / 2026-11-10 | **Assess**, one shell for five operating systems |
| [huggingface/transformers.js](https://github.com/huggingface/transformers.js) | Apache-2.0 | 16.4k / 2026-11-10 | **Assess**, on-device intent and embeddings |
| [mem0ai/mem0](https://github.com/mem0ai/mem0) | Apache-2.0 | 68.8k / 2026-11-06 | **Assess**, only if plain profile notes fail |
| [getzep/graphiti](https://github.com/getzep/graphiti) | Apache-2.0 | 32.7k / 2026-11-09 | **Avoid** for now: a temporal graph is overkill |
| [letta-ai/letta](https://github.com/letta-ai/letta) | Apache-2.0 | 25.4k / 2026-10-18 | **Avoid**: a full agent runtime duplicates the hosts |
| [browser-use/browser-use](https://github.com/browser-use/browser-use) | MIT | 120.6k / 2026-11-10 | **Avoid** as core: it is the executor framing |
| [anthropics/skills](https://github.com/anthropics/skills) | **No root licence** | 192.1k / 2026-11-06 | **Avoid copying.** Reference only; licensing is unclear for commercial reuse |

## Sources

- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://developers.openai.com/api/docs/guides/prompt-optimizer
- https://claude.com/blog/memory
- https://blog.google/products/gemini/temporary-chats-privacy-controls/
- https://www.anthropic.com/research/components-of-agent-memory
- https://claude.com/chrome
- https://blog.google/technology/google-deepmind/gemini-computer-use-model/
- https://openai.com/index/introducing-chatgpt-atlas/ (returned 403; unverified)
- https://claude.com/blog/skills
- https://agentskills.io
- https://www.anthropic.com/news/donating-agent-skills-to-the-agentic-ai-foundation
- https://www.anthropic.com/news
- https://developers.openai.com/apps-sdk
- https://modelcontextprotocol.io/extensions/apps/overview
- https://claude.com/resources/articles/interactive-connectors-full-tool
- https://wisprflow.ai
- https://developer.apple.com/videos/play/wwdc2025/277/
- https://developer.apple.com/documentation/foundationmodels (page body not retrievable; on-device claim unverified)
- https://developer.chrome.com/docs/ai/built-in-apis
- https://developer.chrome.com/docs/ai/prompt-api
- https://www.walkme.com/
- https://arxiv.org/abs/2507.19457
- https://v2.tauri.app/blog/tauri-20/
- https://astryx.atmeta.com/llms.txt
- GitHub API for each repository in the table above
