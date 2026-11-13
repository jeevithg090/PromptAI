# Integrations and surfaces everywhere

Research lens: meet users where they already work. Date: 2026-11-10.

**Method note.** The shared web-search budget for this run was used up before this lens started. Everything below comes from direct fetches of official docs, `gh api` checks on every GitHub project named, `npm view`, and a read of the current repo. Claims I could not confirm are marked *unverified*. This lens agrees with the sibling `platform-stack.md` and `astryx-ui.md` reports: Tauri 2 for desktop, Capacitor 8 for mobile, and one Astryx SPA running in every shell.

---

## 1. Bottom line

The highest-leverage surface is not an app. It is **one stateless "Intent API" that is also a remote MCP server with an MCP App card.** Since 2026, one MCP endpoint reaches these hosts:

- Claude, ChatGPT and Microsoft 365 Copilot, with inline UI (MCP Apps, stable spec 2026-01-26).
- VS Code, Cursor and JetBrains AI Assistant.
- Goose.
- Slackbot, which can now call third-party MCP servers.

That one endpoint replaces four separate projects we would otherwise build: an IDE extension, a Slack bot, a Teams bot and a "ChatGPT plugin".

Only two things need real client engineering. One is the **browser extension**, which reaches every web AI tool. The other is a **system-wide text layer on desktop**: a hotkey palette with push-to-talk dictation that inserts at the cursor. Mobile comes third. It starts as the share sheet, App Intents and Android share target and Quick Settings tile. A keyboard or IME comes only after usage data says it is worth the cost and the policy risk.

Every surface stays thin. A surface does three things: capture context with consent, call the core, and insert the result. It never holds prompt logic and never calls an LLM provider directly. The only local work allowed is speech-to-text and OCR.

---

## 2. What the repo has today: keep, change, drop

| Area | What exists (evidence) | Verdict |
|---|---|---|
| Chrome extension | `extension/` (React 19 + Vite, MV3). Its manifest hardcodes 11 AI sites plus `https://qsfu5lcqt2.execute-api.us-east-1.amazonaws.com/*` and `localhost`. `content/insertText.ts` never auto-submits, falls back to the clipboard, and has a ToS gate. Commands are `Alt+P` and `Alt+Shift+P`. | **Keep** `insertText.ts`, the never-auto-submit rule and the commands. **Change** to WXT, a stable API domain, and `optional_host_permissions` so it works on any site the user opts into. |
| Firefox extension | `firefox-extension/` is a forked copy with its own manifest. The gecko id is the placeholder `promptforge@example.com`. Its host list has already drifted: it includes `groq.com` and lacks Grok and DeepSeek. | **Drop.** WXT builds Firefox from the same source. |
| Site detection | `content/detector.ts` hardcodes `PLATFORM_PATTERNS` selectors. But `config/platform-registry.json` says selectors are "served to clients at runtime … never hardcoded into client bundles", and every entry has `tos_reviewed: false`, so the insert gate blocks all of them. | **Change.** Ship selectors as a signed JSON adapter feed. That is data, not code, so it stays inside MV3 rules. Finish the ToS review, or insertion stays dead. |
| Electron desktop | `desktop/` (~535 lines in `main/`). The security posture is good: sandbox, contextIsolation, an IPC allowlist with a snapshot test, clipboard read only on user click. It has a `DeepAction` union (`new-draft`, `enhance-clipboard`, `dictate`) and a floating "Pulse" widget with 3 skins × 3 sizes. | **Keep** the security rules and the `DeepAction` vocabulary, carried into Tauri capabilities. **Drop** Electron and the widget skins. |
| SwiftUI macOS app | `macos/` (~245 lines). `HotkeyManager` uses Carbon `RegisterEventHotKey`, which needs no Accessibility permission (a good insight). `AccessibilityDetector.detectFrontmostApp()` returns `nil` (a stub). | **Drop** the app and keep the insight. A third desktop codebase is not affordable. |
| Swift SDK | `macos-sdk/`: `PromptForgeClientLive.draft` throws `notImplemented`. | **Drop.** Generate a Swift client from OpenAPI when the iOS satellites need one. |
| Backend surface | `backend/src/handlers/routes.ts` is 2,623 lines with about 90 routes. There is a stateful `/draft` → `/draft/:sessionId/clarify` flow. Responses don't stream, because API Gateway buffers them. `/transcribe` and `/enhance` exist. | **Change.** Put a small Intent API in front, defined once in Zod (section 4). |
| Web | Next.js 16 static export. It already has `public/manifest.json`. | **Keep** it as an installable PWA. It is the day-one way to "install everywhere". |

---

## 3. Strategies compared

**A. Native app per surface** (our own macOS, Windows, Linux, iOS and Android apps, plus IDE plugins and bots). Most control, but about ten codebases, which 1–3 engineers cannot carry, and it duplicates what hosts now give for free. Use native code only for "satellites" no webview can render: share extension, App Intents, keyboard or IME, widgets.

**B. Host-native: be a tool inside other people's hosts** *(the non-obvious option)*. A remote MCP server with MCP Apps for UI, plus App Intents, AppFunctions (later) and Raycast commands. The host supplies the window, chat, auth UI and distribution.
- MCP Apps render a sandboxed iframe inline and can be built with React, so our Astryx "prompt card" renders inside Claude, ChatGPT, M365 Copilot and VS Code. ([overview](https://modelcontextprotocol.io/extensions/apps/overview), [ext-apps](https://github.com/modelcontextprotocol/ext-apps))
- M365 Copilot declarative agents wrap a remote MCP server and render its widgets. ([Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/build-mcp-plugins))
- The Slackbot MCP Client lets Slack users connect our server over Streamable HTTP with OAuth. ([Slack docs](https://docs.slack.dev/ai/slackbot-mcp-client))
- Weakness: we don't own the UX, and each host has review rules (section 8).

**C. System text layer.** A global hotkey opens a palette, or push-to-talk dictates, and the result is inserted at the cursor in any app (the Wispr Flow, Raycast and Handy pattern). It is the only approach that works in Notion, Figma, Slack desktop, Xcode and terminals alike. Handy (MIT, Tauri 2 + Rust, 38k stars, v0.10.0 on 2026-11-02) already ships push-to-talk, VAD, local STT and paste insertion on all three desktop OSes. ([Handy](https://github.com/cjpais/Handy)) Weakness: permission friction, and Wayland is weak.

**D. Browser-first (the Grammarly pattern).** An inline chip on any text field plus a side panel. Most AI tools are web apps, and Chrome's `sidePanel` API (Chrome 114+, `open()` from 116) gives a persistent workspace beside them. ([Chrome docs](https://developer.chrome.com/docs/extensions/reference/api/sidePanel))

**Commit: B + D first, C second, A only as satellites.** B is cheapest per user reached and makes PromptAI infrastructure that other agents call. D is where AI-tool use already happens. C is the daily-habit surface and the home for spot-on dictation. All are thin clients over one core.

---

## 4. The shared core every surface calls

### 4.1 One contract, three projections

Define about 7 operations once, as Zod schemas, in a `packages/contract` module:

| Operation | Purpose |
|---|---|
| `understand` | Context envelope + utterance → intent, target tool, and missing information |
| `improve` | Rewrite or forge for a target tool, returning prompt parts and a rationale |
| `answer` | Supply clarifications (see 4.2) |
| `run` | Optionally fire the prompt at a model |
| `recall` / `save` | Library and memory |
| `transcribe` | Server STT fallback |
| `signal` | Accepted, edited, inserted, undone or rejected, with the diff. This is the learning signal. |

From that one source, project:
1. **REST + OpenAPI** through `@hono/zod-openapi`, on the existing Hono backend.
2. **MCP tools** through `@hono/mcp` (MIT, v0.3.5, pre-1.0) or the official TS SDK (`@modelcontextprotocol/server` v2.4.0).
3. **Typed clients:** `hey-api/openapi-ts` (MIT) for TypeScript, `apple/swift-openapi-generator` (Apache-2.0, 1.14.4) for the iOS satellites, and `openapi-generator` (Apache-2.0) for Kotlin.

One schema change then updates every surface, the MCP tools and the public SDK together. That is what keeps "adapts easily, not hardcoded" true at the integration layer.

### 4.2 Clarifying questions as `input_required` (stateless)

MCP spec **2026-07-28** removed sessions and the `initialize` handshake. It added *Multi Round-Trip Requests*: a server returns `resultType: "input_required"` with `inputRequests`, and the client retries the same call with `inputResponses`. ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog))

This is exactly PromptAI's clarify loop. Use the **same shape in REST**:
- The browser chip, the desktop palette, the iOS share sheet and Claude-via-MCP all render the same question list in their own UI.
- No server session is needed, which fits Lambda behind API Gateway with no streaming.
- It replaces `/draft/:sessionId/clarify`.
- Carry any state needed between rounds in an opaque, signed `requestState`.

### 4.3 Context Envelope and consent ledger

Every call carries a typed envelope:
- `surface`, `app` (bundle id, URL host or window title), and `targetTool` (resolved against the platform registry).
- `selection`, `fieldText` and `pageText` (the extension uses Mozilla Readability, Apache-2.0).
- `clipboard` and `ocrText`, only when the user explicitly chose them.
- `locale` and `consentScopes[]`.

Every context field is **opt-in per scope and per app** (defaults in section 6). **Redaction runs on the device before send** (secrets, card numbers, emails) from a shared regex pack. A user-visible **consent ledger** records what was sent and when. This answers Apple 5.1.2(i), Play's prominent-disclosure rule and ChatGPT's data-minimisation rules (section 8).

### 4.4 Surface kit and the two native interfaces

- **`@promptai/surface-kit` (TS):** auth (PKCE / device code), generated client, envelope builder, redaction, offline queue, signal batching, signed adapter feed. Used by the web app, extension, Tauri and Capacitor webviews, and Raycast.
- **Two native interfaces** (Rust, Swift or Kotlin per platform): `ContextProvider` (`selection()`, `focusedApp()`, `fieldText()`) and `Inserter`, with a strategy ladder: (1) accessibility set-value (macOS `AXSelectedText`, Windows UIA ValuePattern); (2) synthetic paste with clipboard save and restore (enigo + arboard); (3) copy plus a toast. Insert only; **never auto-submit** (kept from `insertText.ts`).
- **Signed adapter feed:** per-site selectors, per-tool quirks and the target-tool list, served from `platform-registry` as signed, versioned JSON. Fixes ship without store review and with no remote code.

### 4.5 Auth

- **MCP:** OAuth 2.1 with Client ID Metadata Documents. The 2026-07-28 spec deprecates Dynamic Client Registration but keeps it for compatibility. M365 and Slack still offer DCR or static client options.
- **Desktop and extension:** PKCE plus OS keychain or `safeStorage`-equivalent storage.
- **Public API:** scoped API keys.

---

## 5. Surface findings

**Desktop (Tauri 2.12.x stable; 3.0 is in alpha).** A tray or menu-bar app with the global-shortcut plugin, a non-activating macOS panel (`tauri-nspanel`, Apache-2.0) so the palette doesn't steal focus, a push-to-talk recorder modelled on Handy, and selection capture via AX (macOS), `uiautomation-rs` (Apache-2.0, Windows) and PRIMARY (Linux). Wayland is best-effort: shortcuts must be bound in the desktop environment and insertion needs `wtype`/`dotool`/`ydotool`, as Handy documents. If the team rejects Rust, the Electron fallback is `selection-hook` (MIT, 117 stars) plus `uiohook-napi` (MIT).

**Launchers.** Raycast extensions are TS/React, and those without native code run on macOS and Windows ([raycast.com/windows](https://www.raycast.com/windows)): cheap, and a discovery channel. PowerToys Command Palette (Win+Alt+Space, extension gallery, bindable to the Copilot key) needs C#, so later ([Microsoft Learn](https://learn.microsoft.com/en-us/windows/powertoys/command-palette/overview)). Vicinae (Linux) is GPL-3.0; don't embed it. Don't build our own launcher.

**Browser.** WXT (MIT, v0.21.5, 2026-10-26) builds Chrome, Edge and Firefox from one source and produces the sources zip AMO requires for bundled code ([WXT](https://wxt.dev/guide/essentials/publishing.html), [AMO](https://extensionworkshop.com/documentation/publish/source-code-submission/)). Safari needs a native wrapper (`xcrun safari-web-extension-packager`); put it inside the Capacitor iOS app, which also brings PromptAI to **iPhone Safari**. Avoid Plasmo: its last release was v0.90.5 on 2025-05-17.

**iOS** (native Swift targets inside the Capacitor project):
1. **Share/Action extension.** "Improve with PromptAI" from any app's share sheet. Lowest policy risk.
2. **App Intents.** One intent set appears in Shortcuts (including Apple's "Use Model" action), Siri and Spotlight. From what I know rather than verified docs, the same set also covers the Action button (iOS 17+, Pro models), Control Center controls (iOS 18+), and interactive widgets (iOS 17+); those version details are *unverified*. ([Apple Intelligence developer page](https://developer.apple.com/apple-intelligence/))
3. **Keyboard extension: a later bet.** Apple's guide says custom keyboards have no microphone access and need "Full Access" for network ([Apple guide](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/CustomKeyboard.html)). Guideline 4.4.1 says the keyboard must "remain functional without full network access" and must not "launch other apps besides Settings". Wispr Flow still ships in-keyboard dictation with Full Access and can open its app to record ([Wispr docs](https://docs.wisprflow.ai/articles/6409258247-flow-for-ios)); the mechanism and Apple's enforcement are *unverified*. Live Activities wait until long-running "run" jobs exist.

**Android** (native Kotlin inside the Capacitor project):
1. Share target and `PROCESS_TEXT` (the selection menu).
2. Quick Settings tile. `requestAddTileService` on Android 13+ prompts the user to add it. ([Android docs](https://developer.android.com/develop/ui/views/quicksettings-tiles))
3. **IME with a dictation key.** Fork FlorisBoard (Apache-2.0). Do not use HeliBoard (GPL-3.0) or the FUTO keyboard (non-OSI "Source First" licence). Being the current input method is an explicit exemption from background foreground-service limits. ([Android docs](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start))
4. **Do not use AccessibilityService** (section 8).
5. **AppFunctions** (Android 16+): the OS-level equivalent of an MCP tool. It is experimental, and Gemini integration is a private preview as of May 2026. Watch it; don't build on it yet. ([Android docs](https://developer.android.com/ai/appfunctions))

**IDEs.** VS Code installs remote MCP servers natively (`mcp.json`, `vscode:mcp/install` links), handles OAuth and renders MCP Apps inline ([VS Code docs](https://code.visualstudio.com/api/extension-guides/ai/mcp)). JetBrains AI Assistant supports Streamable HTTP servers ([JetBrains docs](https://www.jetbrains.com/help/ai-assistant/mcp.html)). So **no IDE extension in year one**; at most a tiny VS Code extension calling `registerMcpServerDefinitionProvider`.

**Chat platforms.** Slack is covered by the Slackbot MCP client (Streamable HTTP only, 60-second tool timeout, per-call approval). Teams is covered by an M365 Copilot declarative agent wrapping the same server. If we later need a true bot (channel-wide `/forge`, Discord), `vercel/chat` (MIT) gives one handler set across Slack, Teams, Google Chat, Discord, Telegram, WhatsApp, GitHub and Linear.

**Public API/SDK.** Free from 4.1: publish the OpenAPI spec and a generated TS SDK, and list the server in the official MCP Registry.

---

## 6. Context capture, with consent

| Signal | Mechanism | Permission cost | Default |
|---|---|---|---|
| Active app or site | macOS `NSWorkspace` frontmost app; Windows foreground HWND; extension `tabs` | None or low | On |
| Selected text | AX / UIA / PRIMARY, with copy-simulation fallback; extension `getSelection` | macOS Accessibility | On, when the hotkey fires |
| Focused field text | AX value; extension DOM | Accessibility | Per-app opt-in |
| Clipboard | Read only inside a user action (keep the current rule) | None | Explicit only |
| Screen OCR | User-drawn region → Apple Vision / `Windows.Media.Ocr` / Tesseract (Apache-2.0) locally; send text only | macOS Screen Recording (the exact re-prompt cadence on recent macOS is *unverified*) | Off; later |
| Continuous screen memory | screenpipe-style | Very high, and screenpipe now ships under a commercial licence | **Never** |

The current Carbon-hotkey insight still applies. The palette can open with **no** permissions. Ask for Accessibility only when the user first chooses "insert at cursor" or "use selection" (progressive permissions).

---

## 7. Prioritised surface list (impact vs effort, 1–3 engineers)

| # | Surface | Impact | Effort | Window | Note |
|---|---|---|---|---|---|
| 0 | Intent API contract + surface-kit | enabler | M | wk 0–4 | Everything below depends on it |
| 1 | PWA (existing web) | 4 | S | wk 0–4 | "Install" on every OS on day one |
| 2 | Remote MCP server + one MCP App "prompt card" (Astryx) | 5 | S–M | wk 2–6 | Claude, ChatGPT, M365, VS Code, Cursor, JetBrains, Goose, Slackbot |
| 3 | WXT extension: inline chip, side panel, any-site opt-in, Firefox/Edge | 5 | M | wk 4–10 | Port existing code |
| 4 | Desktop text layer (Tauri): hotkey palette, push-to-talk, insert at cursor, tray | 5 | L | wk 8–16 | Daily-habit surface; home of dictation |
| 5 | Raycast extension | 3 | S | wk 10–12 | Discovery, Mac + Windows |
| 6 | Public API + TS SDK + keys | 3 | S | after #0 | Mostly generated |
| 7 | Capacitor app + iOS share ext + App Intents + Safari ext; Android share/`PROCESS_TEXT`/QS tile | 4 | M–L | Q2 | Mobile without keyboards |
| 8 | Android IME with dictation (FlorisBoard fork) | 4 (Android) | L | Q2–Q3 | Policy-safe "insert anywhere" |
| 9 | iOS keyboard with dictation | 4 | L + risk | Q3+ | Only if share-sheet data shows demand |
| 10 | PowerToys Command Palette | 2 | M | later | C# |
| 11 | Custom Slack/Teams/Discord bots (`vercel/chat`) | 2 | M | only if needed | MCP route first |
| 12 | Android AppFunctions | 3 (future) | S–M | watch | Experimental |

---

## 8. Platform policy risks

1. **Google Play AccessibilityService.** Only disability tools qualify. Assistants and automation tools are named as *not* qualifying, and autonomous AI actions are "strictly prohibited" for non-accessibility apps. Non-accessibility use needs prominent in-app disclosure, a declaration and a video. Use the IME instead. ([Play policy](https://support.google.com/googleplay/android-developer/answer/10964491))
2. **Apple keyboards (4.4.1).**
   - The keyboard must work without Full Access.
   - It must not launch other apps.
   - It may collect activity only to improve the keyboard.

   Guideline 2.5.14 also requires a visible indicator while recording. ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/))
3. **Apple 5.1.2(i).** Apps must disclose sharing with "third-party AI" and get explicit permission. That affects every iOS surface that sends text to Groq, Gemini or Cerebras. Build it into the consent ledger.
4. **Chrome Web Store.** Single purpose; permissions must match that purpose; MV3 allows no remote code. Keep the extension's single purpose as "improve what you're about to send to an AI tool", and request hosts at runtime. ([CWS FAQ](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq))
5. **AMO.** The build must be reproducible from the sources zip, with the lockfile and a README.
6. **ChatGPT Directory** (now called "plugins"). No trial plugins; no selling digital goods or subscriptions, and no upsells; never request full chat history; minimal responses with no trace ids; explicit `readOnlyHint`/`destructiveHint`/`openWorldHint`; a demo account for review; no "MCP" in the name. ([guidelines](https://developers.openai.com/apps-sdk/app-submission-guidelines))
7. **Slackbot MCP.** 60-second tool timeout, so slow forging must return `input_required` or a fast draft. Users approve every third-party call.
8. **Target-site ToS.** Insert only, never submit. All 13 registry entries are still `tos_reviewed: false`.
9. **Spec and framework churn.** MCP 2026-07-28 broke the handshake model. Tauri 3 is in alpha. Pin versions and add conformance tests with MCP Inspector.
10. **Desktop OS friction.**
    - macOS asks separately for Accessibility, Microphone and Screen Recording.
    - Wayland blocks synthetic input.
    - Unsigned Windows builds trigger SmartScreen (already noted in `desktop/README.md`).
    - Windows UIPI blocks injecting into elevated apps (*unverified* here).

---

## 9. What NOT to build

- Our own launcher, an always-on screen recorder, or "screen memory".
- Android AccessibilityService-based insertion or automation.
- A third desktop codebase. Drop Electron, `macos/` and `macos-sdk/`; keep one Tauri app.
- A separate Firefox codebase.
- Native VS Code or JetBrains extensions, or custom Slack/Teams/Discord bots, before the MCP route is measured.
- Our own MCP App host (`mcp-ui` exists if we ever need one).
- Multiple widget skins, multiple home-screen widgets, Live Activities, watchOS or visionOS.
- Any surface that calls LLM providers directly or embeds prompt logic. Local STT and OCR are the only exceptions.

---

## 10. Open questions

- Will the ChatGPT Directory accept a "prompt improver"? Its rule that plugins must offer what ChatGPT "doesn't natively provide" could be read against us. Personal memory plus a tool-specific playbook is our argument.
- Does the iOS in-keyboard dictation pattern pass review consistently?
- Do we need Linux in year one? Astryx on WebKitGTK is below its Tier 2 per `astryx-ui.md`.
- Which identity provider issues MCP OAuth tokens (Supabase is the current auth), and does it support Client ID Metadata Documents?

---

## Sources

- https://modelcontextprotocol.io/specification/latest
- https://modelcontextprotocol.io/specification/2026-07-28/changelog
- https://modelcontextprotocol.io/extensions/apps/overview
- https://modelcontextprotocol.io/extensions/client-matrix
- https://github.com/modelcontextprotocol/ext-apps
- https://developers.openai.com/apps-sdk
- https://developers.openai.com/apps-sdk/app-submission-guidelines
- https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/build-mcp-plugins
- https://docs.slack.dev/ai/
- https://docs.slack.dev/ai/slackbot-mcp-client
- https://code.visualstudio.com/api/extension-guides/ai/mcp
- https://www.jetbrains.com/help/ai-assistant/mcp.html
- https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq
- https://extensionworkshop.com/documentation/publish/source-code-submission/
- https://wxt.dev/guide/essentials/target-different-browsers.html
- https://wxt.dev/guide/essentials/publishing.html
- https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/CustomKeyboard.html
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/apple-intelligence/
- https://docs.wisprflow.ai/articles/6409258247-flow-for-ios
- https://support.google.com/googleplay/android-developer/answer/10964491
- https://developer.android.com/ai/appfunctions
- https://developer.android.com/develop/ui/views/quicksettings-tiles
- https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start
- https://v2.tauri.app/plugin/global-shortcut/
- https://www.raycast.com/windows
- https://developers.raycast.com/
- https://learn.microsoft.com/en-us/windows/powertoys/command-palette/overview
- https://github.com/cjpais/Handy
- https://github.com/0xfullex/selection-hook
- https://github.com/vercel/chat
- https://github.com/wxt-dev/wxt
- https://github.com/PlasmoHQ/plasmo
- https://github.com/tauri-apps/tauri
- https://github.com/ahkohd/tauri-nspanel
- https://github.com/enigo-rs/enigo
- https://github.com/1Password/arboard
- https://github.com/leexgone/uiautomation-rs
- https://github.com/honojs/middleware (packages/mcp)
- https://github.com/modelcontextprotocol/typescript-sdk
- https://github.com/hey-api/openapi-ts
- https://github.com/apple/swift-openapi-generator
- https://github.com/florisboard/florisboard
- https://github.com/Helium314/HeliBoard
- https://github.com/futo-org/android-keyboard
- https://github.com/KeyboardKit/KeyboardKit
- https://github.com/mediar-ai/screenpipe
- https://github.com/ionic-team/capacitor
- https://github.com/MCP-UI-Org/mcp-ui
- https://github.com/mozilla/readability
