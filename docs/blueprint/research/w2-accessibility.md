# Accessibility as a core feature (wave 2, evidence)

Lens: disabled people as a core PromptAI segment. Wave 1 adopted axe-core for CI (`BLUEPRINT-draft.md`) and checked theme contrast (`astryx-ui.md` §8). This report covers what that misses. The spike is in `blueprint-work/spikes/a11y-core/`, with raw results under `results/`.

## Recommendation (committed)

**Build "AT-native, measured" accessibility (Option B), plus a bounded part of Option C: one Command Registry with spoken names, a Listen mode and plain-language controls. Never use an overlay widget (Option D).**

Three findings drive this:

1. **The default Astryx chat pattern is unsafe for the Draft sheet.** In the spike, a 249-token brief streamed into `ChatMessageList isStreaming` (`role="log"`, `aria-live="polite"`, `aria-busy`) gives a different result under each published screen-reader behaviour:
   - With `aria-busy` ignored: 249 announcements.
   - With `aria-busy` honoured: 1.
   - Under the older NVDA behaviour (drops updates while busy): 0, so completion is silent.

   A status-only design (the one ChatGPT and Claude ship) gives exactly 2 announcements under all three behaviours.
2. **axe reported 0 violations on an Astryx-built Draft sheet, yet the screen loses content.** At 390 px and 320 px, and at 200% text, the screen clips assumption chips. In forced colours, buttons lose their boundaries. 13 of 15 targets are smaller than 44 px on a phone. An automated pass is not enough evidence.
3. **The Tauri macOS engine lacks the modern announce API.** On this Mac (macOS 26.6), system WKWebView has no `ariaNotify` and no `SpeechRecognition`; Chromium 158 has `ariaNotify`. Announcements therefore need an adapter with a live-region fallback.

**Target:** WCAG 2.2 AA everywhere, plus all nine of Apple's Accessibility Nutrition Label features for every "common task", tracked against the WCAG 3 "Foundational Access" direction.

## 1. Why now: the standards floor (verified 2026-11-10)

- **WCAG 2.2** is the current W3C Recommendation. Its new AA criteria directly affect PromptAI: 2.4.11 Focus Not Obscured, 2.5.7 Dragging, 2.5.8 Target Size (24 px), 3.2.6 Consistent Help, 3.3.7 Redundant Entry and 3.3.8 Accessible Authentication.
- **WCAG 3** is still a Working Draft (updated September 2026).
  - Conformance means meeting every *core requirement*. Each requirement carries a tag: Physical harm, Risk, Barrier or Friction.
  - Bronze, Silver and Gold tiers add *assertions*, such as documented usability testing with disabled people.
  - The W3C says completion is "a few more years" away. Third-party estimates put a Candidate Recommendation around Q4 2027 (*unverified*).
  - WCAG 3 will not publish until it covers WCAG 2.2, so building to 2.2 AA is forward-compatible.
- **Europe:** the European Accessibility Act has been enforceable since 28 June 2025. EN 301 549 v4.1.1 (September 2026) moves to WCAG 2.2; its Official Journal reference is *unconfirmed*.
- **United States:** the ADA Title II deadline for large public entities moved to 26 April 2027 (still WCAG 2.1 AA). This matters if schools or governments adopt PromptAI.
- **Apple Accessibility Nutrition Labels** cover nine features: VoiceOver, Voice Control, Larger Text, Dark Interface, Differentiate Without Color Alone, Sufficient Contrast, Reduced Motion, Captions and Audio Descriptions.
  - A feature may be claimed only if *all common tasks* work with it: the primary function, first launch, login, purchase and settings.
  - Labels are voluntary now and will become mandatory. This is our cleanest per-platform acceptance test.

## 2. What I measured

Setup: Astryx 0.7.12 with theme-neutral, React 19.3.1, Vite 8.3.7, Playwright 1.65.0 (Chromium 158.0.8127.18), @axe-core/playwright 4.14.0 and @guidepup/virtual-screen-reader 0.33.0, on a shared M5 running about 30 other agents. Counts were identical across all 3 runs of each case. Durations are medians and varied by 3 ms or less.

**No real screen reader was driven:** automating VoiceOver needs a system setting I won't change on a shared machine. Results come from Guidepup's Virtual Screen Reader (VSR), which is spec-literal and leaves `aria-busy` as `TODO`, and from my own model of three published behaviours (sources under the table).

### 2a. Streamed brief

The brief is 948 characters, sent as 249 tokens at 30 ms each, about 7.5 s in total. The "done" signal comes in a separate tick, as an SSE `[DONE]` would.

| Strategy | VSR announcements (chars) | Ignores busy | Honours busy | Drops busy | Explicit "done"? |
|---|---|---|---|---|---|
| Hand-rolled `aria-live="polite"` (the repo's pattern) | 249 (120,651) | 249, peak 34/s | 249 | 249 | No |
| Astryx `ChatMessageList isStreaming` | 249 (120,669) | 249 | **1** (whole log, 1,001 chars) | **0, silent** | Only if busy is honoured |
| Same, with `useStreamingText` (normal or reduced motion) | 250 / 249 | 249 | 1 | 0 | Same |
| Sentence buffer through Astryx `useAnnounce` | 14 (1,081) | 14, peak 3/s | 14 | 14 | Yes |
| **Status only:** "Drafting…" then "Brief ready, 157 words. Press Alt R to hear it" | **2 (101)** | 2 | 2 | 2 | **Yes, ~1 ms after done** |

Where the behaviours come from:
- **Ignores busy:** NVDA with Firefox in the OpenClaw issue reported by azukiazusa (2026).
- **Honours busy:** VoiceOver with Chrome, tested on macOS 26.5 by azukiazusa (August 2026).
- **Drops busy:** NVDA in Mozilla bug 1682063 (2020–21; *may be outdated*).

Character counts are an upper bound: each token rewrites one text node, which VSR (like the NVDA reports) re-reads whole, about 127 times the brief's length. The robust signals are the announcement count and the gap between behaviours: with Astryx's default, the outcome depends on which reader the user runs. A March 2026 NVDA audit of claude.ai likewise found finished responses unannounced.

**Dictation** (28 words of interim results, one word every 330 ms):
- Interim text in an `aria-live` span, as in today's `web/src/components/MicButton.tsx:53`, gave 26 announcements (2,333 chars). The final text was never announced, because the span unmounts.
- Announcing the final segment once gave 1 announcement (179 chars).
- The same `MicButton` changes its `aria-label` while setting `aria-pressed` (against APG guidance), and its interim text is `text-gray-400` on white, about 2.5:1 by my calculation.

### 2b. Astryx-built Draft sheet audit

The test screen uses SegmentedControl, TextArea, IconButton, ToggleButtonGroup, Token, ChatMessageList, Switch, Button, Dialog and Toast.

| Check | Result |
|---|---|
| axe (WCAG 2.0, 2.1 and 2.2 A/AA plus best practice) | **0 violations** in light mode at 1280 and 390 px, including with the dialog and toast open. Dark mode had 4 contrast failures (#c6c6c6 on #ffffff, 1.7:1), but these were *my* harness's fault: `Theme mode="dark"` does not paint the page, so the app must. |
| axe experimental rules (includes label-content-name-mismatch) | 0 violations |
| Keyboard walk | 14 stops in a logical order. Every stop changed pixels on focus (screenshot diff), in normal **and** forced-colours mode. None was obscured and there was no trap. SegmentedControl uses a roving tabindex with an arrow-key hint. |
| Virtual screen reader walk | Good semantics: "radio, Prompt, checked, position 3, set size 3", "button, Audience: engineers, pressed", "switch, Learn from my edits, checked", "article, Message from assistant". Every Button contains an empty `role="status"` loading announcer (9 on this screen). Button children are presentational, so whether that announcer is reliable is *unverified*. |
| Reflow and resize (**axe missed all of these**) | ToggleButtonGroup does not wrap. Chips are clipped at 390 px ("Audience: engi") and at 320 px, and at 200% root text even at 1280 px. Token height does not grow with text, so its text is clipped at 200%. The page never scrolls sideways, so overflow checks "pass" while content is lost. |
| Forced colours | Unpressed ToggleButton, secondary and ghost Buttons and Token lose every boundary and look like plain text. |
| Target size at 390 px | 13 of 15 targets are under 44 px: Buttons are 32 px, segments 24 px, and Token's remove button is 16×16. The 16×16 button passes 2.5.8 only through the spacing exception. axe's `target-size` passed. |
| Reduced motion | Animations after opening the dialog and toast dropped from 2 (longest 400 ms) to 1 (1 ms). |
| WCAG 1.4.12 text spacing | No new clipping |

### 2c. Engine probe

A Swift probe (`scripts/wkwebview-probe.swift`) loaded a page in the system WKWebView, the engine Tauri uses on macOS:

| API | System WKWebView (macOS 26.6) |
|---|---|
| `document.ariaNotify` | `undefined` |
| `SpeechRecognition` | `undefined`, so Astryx's `ChatDictationButton` hides itself |
| `speechSynthesis` | Present |
| `font: -apple-system-body` | Supported |

MDN's compatibility data lists `ariaNotify` in Chrome 141, Firefox 150 and Safari 27. It also notes that VoiceOver can drop an announcement when another accessibility event fires at the same moment.

## 3. Astryx: what it gives and where it falls short

From the CLI (`npx @astryxdesign/cli search|component|hook|docs`) and from reading the source.

**What it gives:** central reduced-motion handling (200 ms cap, cross-fade on touch); `useAnnounce`, which keeps its live regions mounted and routes messages into open modals; `useFocusTrap`; roving tabindex with keyboard hints; `useIndicatorFocusRing`; `aria-disabled` with `disabledMessage`, so disabled controls stay discoverable; `VisuallyHidden`; a Dialog that focuses its title on open; and contrast rules in about six component docs.

**Where it falls short (each confirmed in the CLI or source):**
1. **No accessibility documentation, conformance claim or support matrix.**
   - `docs accessibility` returns "Unknown topic".
   - Only 6 of 78 component docs have an Accessibility section.
   - There are no APG-style keyboard tables and no list of which screen readers were tested.
2. **`ChatMessageList` hard-codes `role="log"` and `aria-live="polite"` after `{...rest}`,** so they cannot be overridden. Its only protection during streaming is `aria-busy`, and the spike showed that `aria-busy` behaves differently across readers.
3. **Layout and sizing:** ToggleButtonGroup does not wrap; Token has a fixed height; forced-colours boundaries are missing; default control sizes are below 44 px on touch.
4. **Toast hides itself after 5 s by default.** That is fine for "Copied", but wrong for an actionable receipt ("Did it work?", Undo) under WCAG 2.2.1.
5. **The CLI docs show `useAnnounce` and `useStreamingText` returning objects, but the source returns a function and a string.** That mismatch cost me one failed run.
6. **`@astryxdesign/native` is a canary SwiftUI binding only.** On Android, accessibility rests entirely on Chromium WebView with TalkBack.

**Action:** report items 2–4 with `npx @astryxdesign/cli gap-report`. Until they are fixed, wrap or `swizzle` the affected components.

## 4. Options compared

| | A. Compliance floor | B. AT-native, measured | C. Accessibility as PromptAI's own modality | D. Overlay widget |
|---|---|---|---|---|
| What | Astryx defaults, axe in CI, a yearly audit | Design every common task for the OS's own assistive tech (VoiceOver, TalkBack, NVDA/Narrator, Voice Control, Voice Access, Switch Control, keyboard), with spoken-output tests | PromptAI's own voice-command layer, read-aloud, and plain-language rewriting through the same `understand`/IntentFrame engine | A third-party script that "fixes" accessibility at run time |
| Catches streaming chatter | No (axe can't see it) | Yes (VSR gates plus a manual matrix) | Partly | No |
| Serves RSI and motor users | Keyboard only | Through OS voice control, via label-in-name and a command registry | Best: "flip audience", "read part 2", "insert" | No |
| Cost for 1–3 engineers | Lowest | Moderate: one a11y layer, CI gates, a quarterly manual pass | High, and an LLM-driven UI risks loops and wrong actions | Low price, high risk |
| Evidence | Spike: axe at 0 while content was lost | Spike numbers above | Only aligned with the product's voice-first wedge | FTC fined accessiBe $1M in 2025 for claiming WCAG compliance it could not support |
| Verdict | Not enough | **Adopt** | **Adopt a bounded part** (deterministic command grammar; LLM only to disambiguate, never to auto-run) | **Avoid** |

**The non-obvious move is C's Command Registry.** Every action gets one stable spoken name, and that name is reused as:
- the visible label (so Voice Control's "Click …" works);
- the keyboard shortcut and command-palette entry;
- the Talon or Voice Access phrase;
- PromptAI's own voice command.

One registry makes the product voice-operable without a free-form agent driving the UI. That keeps the blueprint's rule of "no agents at request time".

## 5. Requirements (testable)

**Screen readers and streamed output**
- **R1 Status-only by default.** The streaming body is never in a live region and carries `aria-busy` while streaming.
  - One `announce()` adapter (`ariaNotify` when present, else Astryx `useAnnounce`) says "Drafting…" at the start and "Brief ready, N parts" at the end. Errors and stalls are announced too; silence is never the outcome.
  - Setting: "Speak while drafting: Off / Sentences / Everything" (Sentences gave 14 announcements).
  - Gate: at most 3 live announcements per brief (VSR test).
- **R2 Structure.** One heading per brief part; each turn an `article` with a heading. "Read brief" (Alt+R) and "Read part N" commands. Stop is one keystroke away, and focus stays where the user left it.
- **R3 Dictation.** Interim text is shown but not live. Each final segment is announced once, with its text, so recognition errors can be caught. Earcons are optional.

**Voice and motor**
- **R4 Label in Name (2.5.3) everywhere.** Primary actions are never icon-only. Each name is unique on the screen and comes from the Command Registry.
- **R5 No hold-only interactions.** Hold-to-talk gets a toggle mode, a sticky mode and a dwell option. Nothing uses dragging (2.5.7) or timed gestures.
- **R6 Bring your own input.** Text from OS dictation, Voice Control, Voice Access, Dragon, Talon or switch scanning works as well as PromptAI's own speech recognition, which is optional.
  - Document how to pause Voice Control ("Go to sleep") before PromptAI capture, so both don't transcribe the same speech. Whether they collide is *unverified*; test it.
- **R7 Targets.** At least 24 px everywhere (2.5.8) and at least 44 pt / 48 dp on touch, using Astryx `size="lg"` or a touch density.

**Keyboard and focus**
- **R8 Full keyboard operation.** Focus is visible and never obscured (2.4.11), and returns to its origin after Insert, a dialog or a toast. The Tauri non-activating panel (`tauri-nspanel`) must be reachable with VoiceOver and the keyboard (Phase 0 test, *unverified*).

**Low vision**
- **R9 Zoom and reflow.** No loss at 320 px, 400% zoom, 200% text-only scaling or 1.4.12 spacing. Chips wrap. Typography uses rem tokens only (px headings in my harness did not scale; lint for it).
- **R10 Platform text scaling.** iOS Dynamic Type: `font: -apple-system-body` at the root plus `em`/`rem` (supported in WKWebView), with @capacitor/text-zoom 8.0.1 as the fallback. Android font scale: verify on a device (*unverified*; no Android SDK here).
- **R11 Contrast and colour.** 4.5:1 for text and 3:1 for UI parts in light, dark and `prefers-contrast: more`. Forced-colours boundaries on every control.
  - "Provenance ink" must not rely on colour alone (1.4.1): add an icon or text and a screen-reader phrase such as "assumed, from memory".

**Cognitive, dyslexia and motion**
- **R12 Predictable and plain.** UI copy at about CEFR B1. The Ask Gate never times out; every action can be undone; nothing auto-advances; layout stays put (3.2.x); help sits in the same place (3.2.6); nothing already given is asked again (3.3.7); sign-in is a passkey or magic link with no cognitive test or CAPTCHA (3.3.8).
- **R13 Reading controls.** Adjustable font size, line height and letter and word spacing, a line length of at most 70 characters, and read-aloud with word highlighting (`speechSynthesis` exists in WKWebView).
  - Do **not** default to a "dyslexia font": controlled studies found no benefit from OpenDyslexic or Dyslexie (Wery & Diliberto 2016; the Dyslexie study, 2018).
  - Extra letter spacing has support: Zorzi et al. 2012 in PNAS, with 74 children.
- **R14 Motion.** Follow the OS reduced-motion setting (Astryx does), add an in-app override, and keep the dictation level bars static under reduce.
- **R15 Time limits.** No actionable toast hides itself: `isAutoHide={false}`, or move it into the receipt panel.

**Privacy**
- **R16 User-declared accessibility settings.** Accessibility settings are preferences the user declares. They are stored on the device and synced only as settings.
  - Never infer disability from behaviour, and never send it to analytics. Such data can count as health data under GDPR Article 9.

## 6. Features that would make PromptAI excellent for disabled users

1. **Listen mode.** A one-line completion summary, then part-by-part read-aloud at the user's rate, with "repeat", "next part" and "change assumption 2" by voice or key.
2. **Command Registry.** One spoken name per action, shared by labels, shortcuts, the palette, OS voice control and PromptAI voice. Publish a Talon command file (talonhub/community: MIT, 882★, active).
3. **Accessible-by-default deliverables.** The gap check adds the *audience's* accessibility needs to briefs: alt text, captions, slide contrast, plain language, heading structure. I found no competitor doing this (*not exhaustively checked*); it costs only Tool Card data.
4. **Plain-language dial.** Rewrite UI and output at a chosen reading level; "Explain this" on every assumption chip.
5. **Coach for assistive tech.** Tool Card sections such as "Cursor with VoiceOver", sourced and cited.
6. **Never-stuck guarantee.** A stalled draft says "Still working; press Escape to stop or R to retry". Silence is a bug.
7. **Accessibility profile.** Verbosity, announce mode, speech rate, spacing, reading level and motion travel with the account and apply on every shell at first launch.

## 7. Test tooling and gates

| Layer | Tool (license) | Gate |
|---|---|---|
| Editor and lint | eslint-plugin-jsx-a11y 6.10.2 (MIT) | PR |
| Spoken-output unit tests | @guidepup/virtual-screen-reader 0.33.0 (MIT, 159★, pushed 2026-11-05). It does not implement `aria-busy`, which is useful as a worst-case check. | PR: brief stream ≤ 3 announcements; chip says "toggle … pressed"; dictation interim says nothing |
| Rule scan | Playwright 1.65 + @axe-core/playwright 4.14 (MPL-2.0, dev-only), every screen and state, light/dark/high-contrast, at 320/390/1280 | PR |
| Structure | Playwright `toMatchAriaSnapshot` on key screens | PR |
| What axe misses | The spike's scripts: keyboard walk with pixel focus diff, forced colours, content-loss check at 320/390 px and 200% text, target sizes, reduced motion (`scripts/audit.mjs`) | PR |
| Real screen readers | Guidepup (MIT, 596★) + `@guidepup/setup` (the GitHub Action was archived in September 2026) on macOS VoiceOver and Windows NVDA CI runners | Nightly; not per PR, because flaky |
| Native | Xcode Accessibility Inspector and XCUITest `performAccessibilityAudit` on a CI Mac with Xcode (not on this machine); Android Accessibility Scanner; TalkBack | Release |
| Manual matrix | VoiceOver with Safari or Tauri; VoiceOver on iOS; TalkBack; NVDA with Chrome or Tauri WebView2; Voice Control (macOS/iOS); Voice Access; Windows Voice Access; keyboard only; 400% zoom; Windows High Contrast | Every release, on Apple's "common tasks" |
| People | Paid sessions with disabled users each quarter. This is also a WCAG 3 *assertion*. | Quarterly |

Skip Lighthouse's accessibility score and pa11y (LGPL-3.0): both repeat axe.

## 8. Risks and unknowns

- No real screen reader was driven; confirm the streaming counts with a nightly Guidepup run.
- `aria-busy` behaviour differs by reader and version (a11ysupport.io: partial support).
- `ariaNotify` is missing from macOS 26 WKWebView, and VoiceOver may drop it when events collide (MDN).
- Voice Control may collide with PromptAI's microphone capture.
- Android WebView and TalkBack are untested (no SDK here).
- A 1–3 person team will cut the manual matrix unless it is a release gate.
- An LLM-driven voice UI beyond the registry would bring back loops and wrong actions.

## Sources

- W3C, What's new in WCAG 2.2: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- W3C, WCAG 3 Introduction (updated September 2026): https://www.w3.org/WAI/WCAG3
- W3C, WCAG 3 Explainer, September 2026: https://www.w3.org/TR/2026/DNOTE-wcag-3.0-explainer-20260910/
- W3C, WCAG 3 Working Draft, March 2026 news: https://www.w3.org/WAI/news/2026-03-03/wcag3
- EN 301 549 v4.1.1 (Deque): https://www.deque.com/blog/en-301-549-v4-1-1-is-final-what-changed-what-it-means-and-what-you-should-do/
- EN 301 549 (NDA Ireland): https://nda.ie/news/en301549-published
- EAA and ICT standards (DWT, September 2026): https://www.dwt.com/insights/2026/09/european-accessibility-act-ict-standards-update
- ADA Title II extension: https://www.jdsupra.com/legalnews/doj-extends-title-ii-ada-web-2176958/ and https://accessibility.arizona.edu/news/doj-issues-interim-final-rule-title-ii-digital-accessibility-compliance-dates
- Apple, Accessibility Nutrition Labels: https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels and https://support.apple.com/123073
- azukiazusa, accessible streaming chat UI (August 2026): https://azukiazusa.dev/en/blog/accessible-streaming-chat-ui
- claude.ai NVDA audit (March 2026): https://dev.to/wiscer/screen-reader-experience-analysis-on-claudeai-433a
- Tian Pan, streaming tokens and screen readers (2026): https://tianpan.co/blog/2026-06-29-streaming-tokens-meet-the-screen-reader
- Mozilla bug 1682063 (NVDA and aria-busy): https://bugzilla.mozilla.org/show_bug.cgi?id=1682063
- a11ysupport.io, aria-busy: https://a11ysupport.io/tech/aria/aria-busy_attribute
- MDN browser-compat-data, `Document.ariaNotify`: https://github.com/mdn/browser-compat-data/blob/main/api/Document.json
- Chromium Intent to Ship, ARIA Notify: https://groups.google.com/a/chromium.org/g/blink-dev/c/QCtWzIPgcCY
- Guidepup Virtual Screen Reader: https://github.com/guidepup/virtual-screen-reader ; Guidepup: https://github.com/guidepup/guidepup ; setup: https://github.com/guidepup/setup
- axe-core: https://github.com/dequelabs/axe-core ; Playwright ARIA snapshots: https://playwright.dev/docs/aria-snapshots
- Astryx docs: https://astryx.atmeta.com (read via `npx @astryxdesign/cli` 0.7.12)
- FTC final order, accessiBe (April 2025): https://www.ftc.gov/news-events/news/press-releases/2025/04/ftc-approves-final-order-requiring-accessibe-pay-1-million
- Wery & Diliberto, OpenDyslexic study (2016): https://link.springer.com/article/10.1007/s11881-016-0127-1
- Font and spacing review: https://pmc.ncbi.nlm.nih.gov/articles/PMC7188700
- Zorzi et al. 2012, PNAS: https://pubmed.ncbi.nlm.nih.gov/22665803/
- Dyslexia fonts commentary (December 2025): https://daringfireball.net/linked/2025/12/12/dyslexia-fonts-pseudoscience
- Dynamic Type in web views: https://useyourloaf.com/blog/using-dynamic-type-with-web-views/ ; https://vispero.com/resources/text-resizing-web-pages-ios-using-dynamic-type/
- Capacitor Text Zoom: https://capacitorjs.com/docs/apis/text-zoom
- WebKit bug 249976 (VoiceOver focus in WKWebView): https://bugs.webkit.org/show_bug.cgi?id=249976
- Talon hands-free input: https://blakewatson.com/journal/speaking-in-code-hands-free-input-with-talon/ ; talonhub/community: https://github.com/talonhub/community ; Cursorless: https://github.com/cursorless-dev/cursorless
- Android Voice Access with Gemini (December 2025, *secondary*): https://jetstream.blog/?p=207753
- W3C COGA, Making Content Usable: https://www.w3.org/TR/coga-usable/
