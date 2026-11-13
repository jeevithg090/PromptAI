# UX and interaction design: one loop on every surface

Research lens: UX and interaction design. Date: 2026-11-10. Skill applied: Hallmark. Its Floor and app-screen rules are folded into the screen rules in §7.

## Bottom line

PromptAI should be neither a chat box nor a wizard, but one loop: **capture, draft, hand off, learn**, in a single "Draft sheet" that every surface opens. The draft streams in under a second. Every guess shows inside the prompt as an **assumption chip** the user can flip, so clarifying becomes a glance, not an interview; a question blocks only when a wrong guess would ruin the result. Every suggestion has a "Why?" with Forget, every AI change can be undone, and nothing is ever submitted to a target tool for the user. Ambient help inside other tools is opt-in for each site and learns when to stay silent.

## 1. What the current repo does, and what to keep

I read the client code in `web/src`, `extension/src/content`, `desktop/src/main` and `macos/Sources`, plus `docs/clarification-taxonomy.md`.

- **The flow is a blocking state machine.** A platform must be picked before anything happens (`canSubmit` requires `selectedPlatform`, build/page.tsx:231), then every question renders at once as a form (build/page.tsx:436). That breaks the repo's own taxonomy rule 4: "one or two questions at a time … never a long upfront form."
- **There is no streaming.** Progress comes from polling every 650 ms (build/page.tsx:115-127); the backend has no SSE route.
- **Navigation sprawls.** 10 top-nav links when signed in (LayoutClient.tsx:85-100), and try, build, enhance and reverse are four routes for one job.
- **Dictation is not spot-on.** Web Speech with `continuous = false` stops at the first pause (useDictation.ts:104). The fallback, and the extension's only path, is a 60 s batch Whisper upload with no live partials.
- **Hotkeys are fragmented.** Cmd/Ctrl+Shift+P in the Electron tray, a separate widget key, Cmd+Shift+Space on macOS. A failed registration is silently ignored: the `if (!ok) {}` block is empty (widget.ts:104).
- **Privacy leak.** The landing input puts the user's idea in the URL (`/try?idea=…`, HeroForge.tsx:17), and from there into history, logs and referrers.
- **Hallmark Floor violations:** an emoji as an icon (`⚡`, floatingButton.ts:56), a hand-drawn browser window with an invented "94" score (page.tsx:6-24), tracked-caps eyebrows (page.tsx:98, ModeSuggestion.tsx:50), and middle-dot separators.

| Verdict | Item |
|---|---|
| Keep | Taxonomy P1/P2/P3 priorities; never re-ask what the idea answered; MCQ plus "Other"; "Just generate" always honored |
| Keep | Memory that waits for confirmation, with scopes and E2E encryption |
| Keep | `insertText` never auto-submits and falls back to the clipboard |
| Keep | The macOS Carbon hotkey (no Accessibility permission needed); the widget's calm rules; the floating button off by default for each site |
| Keep | Citations and "defaulted node" markers, which become "Why?" and the assumption chips |
| Change | Phase machine → a streamed draft that comes first; question form → at most one blocking question plus inline chips |
| Change | Platform picker → a detected **target chip**, with ModeSuggestion folded into its popover |
| Change | ⌘K palette → actions as well as navigation, shortcuts shown (Astryx `CommandPalette`); 11 node cards → plain text with a "Structure" toggle for experts |
| Drop | One route per mode (detect it from the input; `looksLikeFinishedPrompt` already hints at this); the hand-rolled tour |
| Drop | The headline 0-100 score (show "two things that would make this better"); `?idea=` URLs; emoji icons; the fake window |
| Drop | From revival.md: XP, streaks, badges, Wrapped, Roast, Battles |

## 2. The problem to design for

Jakob Nielsen calls the core problem the **articulation barrier**: many people cannot write their intent well enough for prompt-driven AI (his population estimates are unmeasured, so treat them as unverified).

His "prompt augmentation" patterns are the toolkit: style galleries, prompt rewrite, targeted rewrite, related prompts, builders, and sliders (only when users understand each dimension). Speech probably lowers the barrier, which makes dictation central.

NN/g also finds that chat output looks authoritative and discourages error checking. That argues against a self-awarded score, and for showing which parts were assumed.

## 3. Options compared

| Option | What it is | For | Against |
|---|---|---|---|
| A. Polished wizard (current) | Platform → idea → questions → scored prompt | Predictable | Gate before value; interrogation; exposes the node model |
| B. Chat-first assistant | A thread that builds prompts | Familiar | The generic chat box the owner rejects; hard to hand off |
| C. Ambient copilot in place | Suggestions inside the target tool's input | No context switch | iOS limits; intrusive if wrong; no room to clarify |
| **D. Draft-first sheet with assumption chips** (non-obvious) | A draft streams at once; guesses are flippable chips; questions block only when stakes are high | Value in about a second; teaches by showing; same on every surface | Users may anchor on guesses; needs good provenance UI |
| E. Inside the host via MCP Apps (non-obvious) | PromptAI renders as UI inside Claude, ChatGPT or VS Code | Meets people in their tool | Host-dependent; small canvas; hard to discover |

**Commitment: D is the core.** C is an opt-in layer that reuses D's sheet. E is a later surface: MCP Apps became an official MCP extension in January 2026, and Claude, ChatGPT and VS Code list support. B survives only as "Refine" inside the sheet, never as the home screen. A is retired.

Precedents for D: Granola keeps the user's words black and AI additions grey, and an edited grey line turns black. ChatGPT deep research confirms goals before long work, which shows asking pays only when a wrong start is expensive. Claude's AskUserQuestion asks one question at a time with a "Something else" field, capped at about four; NN/g calls that cap a needed guardrail.

## 4. The signature and the screen inventory

Hallmark asks every app screen for a signature, the one object the tool is known by. Here it is **the Draft sheet**: streamed prompt text with the user's words in full ink, inferred text in muted ink with a dotted underline (never colour alone), and inline chips such as `[for: beginners ▾]` `[tone: warm ▾]`.

The product is four places; everything else is a command:

1. **Capture**: one voice-or-text composer, with context chips (target tool, selection, file, an optional screenshot).
2. **Draft sheet**: the signature, with one primary action, *Send to {tool}*.
3. **Library**: one searchable list of history, saved prompts, versions and playbooks.
4. **You**: what PromptAI knows, with Forget, Pause learning and Incognito.

## 5. Core flows

**F1. First run with no blank page**
1. The first screen is Capture, focused. No sign-up, no tour.
2. Three starter rows come from real context (referring tool, extension target, OS language), one line each, never "Ask me anything."
3. A mic button with its hint, "Hold ⌥ to talk"; the key is set at onboarding after a conflict check.
4. The first draft is the tutorial: a one-time note on a chip says "I guessed this. Click to change."
5. An account is asked for only to save or sync, after value is delivered.

**F2. Desktop capture from anywhere (keyboard-first)**
1. Hold the hotkey to talk, tap it to type, double-tap for hands-free (the same modes as Handy and Wispr Flow).
2. A small panel opens near the caret with a target chip ("→ Claude, detected") and any selected text as a context chip.
3. The live transcript shows as ghost text and finalizes on release.
4. Enter drafts; Cmd/Ctrl+Enter drafts and inserts into the field you came from; Esc closes and keeps the draft in Library.
5. If the hotkey fails to register, say so and offer alternatives.

**F3. Mobile capture (thumb-first)**
1. *iOS:* an App Intents control for the Action button, Control Center and Lock Screen opens Capture with the mic live; a Share extension adds "Improve with PromptAI" to any app; a keyboard extension is optional, but iOS sends the user to the main app to turn the mic on, as Wispr documents.
2. *Android:* a "Process text" selection action, a share target, a Quick Settings tile, and an opt-in floating bubble that needs "display over other apps" (as Wispr's Android launch shows).
3. Capture is a bottom sheet with two snap heights, the primary action in the bottom thumb zone, and a swipe down to save and close.
4. Copy or "Open {tool}" is the main handoff, since cross-app insertion is not possible on mobile.

**F4. Clarifying that feels like help**
1. Draft immediately with the best guesses; each guess becomes a chip with 3-6 options plus "Something else," and a flip redrafts only that part.
2. Block before drafting only when the slot is P1, confidence is low, and a wrong guess makes the output unusable (wrong subject, audience or deliverable).
3. If it blocks: at most 2 questions, one at a time, answered by number key, tap or voice, with "Just draft it" always present.
4. One blocking round per draft, then everything is a chip, so question loops are structurally impossible.
5. Recurring answers are offered as defaults later, never applied silently.

**F5. Editing the generated prompt**
1. Edit the text directly in a Lexical-based editor (Astryx RichText).
2. Select a span for a targeted-rewrite menu (shorter, more specific, add an example, or say it by voice), as in Nielsen's targeted rewrite and Wispr's command mode.
3. `{{variables}}` render as chips; a prompt can be saved as a reusable command with `{selection}` and `{clipboard}` placeholders, as in Raycast.
4. Every AI edit creates a version, viewable as a diff (lab `DiffViewer`).

**F6. Handoff to the target tool** (in order of preference)
1. Insert into the field the user came from (extension or desktop). Never press send.
2. Copy and open the tool, with "Copied. Paste with ⌘V."
3. URL prefill only where tested; Claude's `?q=` reportedly broke in October 2025.
4. Later: the MCP App inside the host.

Afterwards the sheet collapses to a receipt with "Did it work?" (two icon buttons) and one predicted next step.

**F7. Coaching moments**
- Tied to the user's own action, at most once per session, and switchable off. Example, after a third portrait in 16:9: "For portraits, 2:3 usually frames better. Use it?"
- An "Explain" toggle tints each part of the prompt by its job (a light version of revival's X-Ray).
- Playbooks for each tool live in Library: short task lists that teach a tool through real work, not a gamified academy.

**F8. Trust and "why did you suggest this?"**
1. Every suggestion, chip default and prediction has a "Why?" naming one to three signals (a memory item, a recent pattern, a cited tool doc), each with Forget or Edit.
2. New memories go into a weekly "Learned this week" list on the You page instead of interrupting; one quiet inline note is allowed the first time a memory is used.
3. Global controls: Pause learning, Incognito (never stored, never learned), Reset, Export. This follows PAIR: let users erase preferences and reset to the non-personalized default.

**F9. Undo, errors and empty states**
- Undo, not confirm dialogs: Cmd+Z covers AI edits, and a toast offers Undo for any change to the whole sheet.
- Every data region has four states: loading (a skeleton shaped like what is coming), empty (what belongs here and the one action that fills it), error (what broke, what to do) and full.
- Offline: capture and dictation work locally where possible; drafting is queued with "Will draft when online."
- Model failure: keep the user's text, name the failed step, offer Retry and "Use a faster model."

## 6. Interaction principles

Each maps to Microsoft's HAX guidelines (G1-G18).

1. **Draft first, ask second.** When in doubt, scope down and show assumptions (G10, G1).
2. **Assumptions are visible and flippable.** Correction is one tap (G9, G11).
3. **Explain on demand:** a line, then a popover, then the full trace in a collapsible "How I built this" (lab `ChatReasoning`) (G11).
4. **Every AI action is undoable,** and its consequences are shown before anything leaves the app (G16).
5. **Learn quietly, adapt cautiously, show changes** (G13, G14, G18). One implicit signal means little; read patterns over time.
6. **Time interventions to context.** Ambient help is opt-in for each site; three dismissals in a row silence it there for a week, with the reason shown (G3, G8). Cursor trained its Tab model with online RL that gives no reward for staying silent, and reports 21% fewer suggestions with a 28% higher accept rate (Sept 2025). Knowing when not to speak is part of the design.
7. **Invocation is cheap everywhere.** Hotkey, palette, share sheet and Action button all open the same sheet (G7, G12).
8. **The palette teaches shortcuts** by showing each one beside its action, as Superhuman does.
9. **The user is always the sender.** Never auto-submit.
10. **Calm by default.** No push notifications in v1, no streaks, no badges. A proactive digest, if ever built, is user-scheduled and finite, like ChatGPT Pulse's daily cards.
11. **Novelty has a cost.** Arc's makers stopped developing it because it was "too different" with too much to learn. Use standard patterns (sheet, palette, chips, toast) before invented ones.

## 7. Speed budget and screen rules

**Speed.** NN/g's limits apply: 0.1 s feels like direct manipulation, 1 s keeps flow, 10 s loses attention.

| Event | Budget |
|---|---|
| Keystroke and chip-flip echo | ≤ 100 ms, optimistic and local |
| First draft token | ≤ 1 s |
| Full draft | Streamed into reserved space so nothing jumps |
| Over 10 s (agents, evolve runs) | Percent-done and Cancel |

Linear's precedent is local data, optimistic writes and background sync. These are design budgets, not measurements.

**Screen rules** (Hallmark Floor and app scope, on Astryx): colours and fonts only through Astryx theme tokens; an instant `:focus-visible` on every control; a `prefers-reduced-motion` fallback, with motion only to show state; no eyebrows, tracked-caps labels, middle-dot strings, emoji icons or invented figures; controls 32-40 px with 44 px touch targets; modals only after inline editing and disclosure fail; filters and tabs in the URL, prompt text never.

## 8. Astryx mapping

| Need | Astryx piece |
|---|---|
| Capture composer with chips, `/` and `@` menus, paste-as-chip | core `ChatComposer`, `ChatComposerInput`, `useTriggerMenu`, `ChatPastedTextToken`, `Token` |
| Mic with level bands and ghost interim text | core `ChatDictationButton`. Its `useChatDictation` is tied to Web Speech, so feed it from our own streaming STT through an adapter (needs a spike) |
| Draft editor, variables and assumption chips | `@astryxdesign/richtext` (Lexical) with custom decorator nodes |
| Why, citations, trace | `Popover`, `HoverCard`, `Citation`, lab `ChatReasoning` |
| Versions | lab `DiffViewer` |
| Palette, shortcuts, toasts, states | `CommandPalette`, `Kbd`, `Toast`, `Skeleton`, `EmptyState`, `Banner` |
| Mobile | `BottomSheet`, `Drawer`, lab `TabBar` |

Pin lab component versions. `@astryxdesign/native` is canary-only, draws a handful of SwiftUI views, and has no React Native or Android bindings. So build the sheet once as web UI in every shell, with native code only for OS entry points (hotkey, share extension, Action button control, keyboard, bubble, Live Activity).

## 9. Dictation UX (interaction only; the engine belongs to another lens)

- **Streaming partials** as ghost text, finalized on release.
- **Cleanup on by default** (fillers, punctuation), with an "Exactly as I said" toggle and the raw transcript on hover.
- **Corrections teach spelling.** After the second fix of the same word, offer once: "Always spell it 'Gangadhara'?" (a personal dictionary, as in Wispr).
- **Spoken edits:** "scratch that," "new line," and selection plus a voice instruction (command mode).
- **Language:** auto-detect, with code-switching (for example Hindi-English) as a test case.
- **Privacy:** the mic is live only while a key is held or a visible session runs; audio is never stored, as the repo already requires.
- **Reference:** Handy (MIT, Tauri, push-to-talk, local Whisper and Parakeet) for the desktop interaction.

## 10. What not to build

- A chat thread as home, or one route per mode.
- An onboarding questionnaire, a spotlight tour, a 0-100 score ring.
- XP, streaks, badges, leaderboards, "Wrapped," Roast or Battles (deceptive.design's addictive design and nagging).
- An always-on widget by default, push notifications, interrupting "Memory updated" toasts.
- Confirmshaming, upgrade nagging, fake urgency, preselected opt-ins for learning.
- A custom palette, a React Native port of Astryx, or a separate native UI per platform.
- Dependence on URL prefill, or any auto-submit.

## 11. What to instrument

There are no baselines yet, so targets are hypotheses. Measure: time to first draft token and to handoff; drafts accepted without edits, and edit distance; chip flip rate; answer versus skip rate on blocking questions; ambient accept and dismiss rate per site; undo rate; "Why?" opens and Forget uses; dictated words corrected per 100. Never put prompt text into analytics.

## 12. OSS checked (gh api, 2026-11-10)

| Project | License | Last push | Role | Verdict |
|---|---|---|---|---|
| meta/astryx | MIT | 2026-11-10 | UI system | adopt |
| facebook/lexical | MIT | 2026-11-10 | Draft editor (through Astryx richtext) | adopt |
| facebook/stylex | MIT | 2026-11-10 | Astryx styling (prebuilt CSS) | adopt |
| vercel/ai | Apache-2.0 (API says NOASSERTION; the LICENSE file is Apache) | 2026-11-10 | Streaming partial objects into the sheet | trial |
| immerjs/immer | MIT | 2026-11-10 | Patches for undo and versions | adopt |
| kpdecker/jsdiff | BSD-3-Clause | 2026-11-10 | Diffing prompt versions | trial |
| jamiebuilds/tinykeys | MIT | 2026-09-25 | Shortcuts outside Astryx | assess |
| tauri-apps/tauri and plugins-workspace | Apache-2.0 | 2026-11-10 | Desktop shell, global shortcut | assess (platform lens decides) |
| cjpais/Handy | MIT | 2026-11-07 | Push-to-talk reference | assess (reference) |
| pacocoursey/cmdk | MIT | 2025-10-29 | Palette | avoid (Astryx has one) |

None of these are copyleft. One caveat: some legacy non-English Moonshine models use a non-commercial licence, if the dictation lens picks Moonshine.

## Sources

- https://www.microsoft.com/en-us/haxtoolkit/library/
- https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/
- https://pair.withgoogle.com/chapter/feedback-controls/
- https://pair.withgoogle.com/guidebook/chapters
- https://jakobnielsenphd.substack.com/p/prompt-driven-ai-ux-hurts-usability
- https://jakobnielsenphd.substack.com/p/prompt-augmentation
- https://www.nngroup.com/articles/genui-buttons-and-checkboxes/
- https://www.nngroup.com/articles/ai-chatbots-discourage-error-checking/
- https://www.nngroup.com/articles/response-times-3-important-limits/
- https://docs.granola.ai/help-center/taking-notes/ai-enhanced-notes
- https://granola.ai/blog/announcement
- https://help.openai.com/sr-rs/articles/10500283-deep-research-in-chatgpt
- https://openai.com/blog/introducing-chatgpt-pulse
- https://the-decoder.com/openais-new-pulse-feature-lets-chatgpt-start-the-conversation/
- https://cursor.com/blog/topic/research/page/2 (Improving Cursor Tab with online RL)
- https://analyticsindiamag.com/ai-news-updates/cursor-is-using-real-time-reinforcement-learning-to-improve-suggestions-for-developers
- https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/
- https://performance.dev/what-makes-linear-feel-instant
- https://manual.raycast.com/ai/ai-commands
- https://alternativeto.net/news/2025/4/raycast-for-ios-is-here-with-core-mac-features-ai-chat-notes-cloud-sync-and-more
- https://alternativeto.net/news/2025/11/raycast-for-windows-launches-public-beta-with-native-search-and-extension-support/
- https://docs.wisprflow.ai/articles/7453988911-set-up-the-flow-keyboard-on-iphone
- https://9to5mac.com/2025/06/30/wispr-flow-is-an-ai-that-transcribes-what-you-say-right-from-the-iphone-keyboard/
- https://roadmap.wisprflow.ai/changelog/wispr-flow-is-now-live-on-android-robotrocket
- https://docs.wisprflow.ai/articles/8858845757-setup-wispr-flow-on-android-android-settings
- https://sidsaladi.substack.com/p/wispr-flow-101-the-complete-guide
- https://www.anthropic.com/news/memory
- https://support.anthropic.com/en/articles/11817273-how-does-claude-s-memory-work
- https://browsercompany.substack.com/p/letter-to-arc-members-2025
- https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/
- https://holdenhewett.github.io/starlight-llm-actions/getting-started/concepts/
- https://developer.apple.com/documentation/widgetkit/creating-controls-to-perform-actions-across-the-system
- https://www.deceptive.design/types
- https://github.com/meta/astryx
- https://astryx.atmeta.com/llms.txt
- https://github.com/cjpais/Handy
- https://github.com/facebook/lexical
- https://github.com/vercel/ai
