# Cross-platform delivery stack

Research lens: how one product ships on web, macOS, Windows, Linux, iOS and Android with Astryx-quality UI. Checked 2026-11-10 against live sources and the GitHub API.

## 1. Bottom line

Build **one React 19 + Astryx web UI** and **one pure-TypeScript core**. Host them in three thin shells. Write native code only for the system surfaces a webview cannot reach.

| Surface | Shell | Why |
|---|---|---|
| Web | Static SPA + PWA (Cloudflare Pages, as today) | Zero install. It is the reference build of the UI. |
| macOS / Windows / Linux | **Tauri 2** (2.12.x stable) | A small, always-on tray app with a Rust core for hotkeys, audio, local speech recognition and text insertion. Handy (MIT) already proves this exact feature set in production. |
| iOS / Android main app | **Capacitor 8** (8.6.0) | It is the most mature webview-to-native bridge on mobile: official push notifications, RevenueCat in-app purchases, live updates, and Xcode/Gradle projects you own, so adding extension targets is the normal workflow. |
| iOS keyboard, share extension, widgets, App Intents | Native Swift targets inside the Capacitor Xcode project | No stack can render these from a webview. |
| Android IME, PROCESS_TEXT, share target, widgets, Quick Settings tile | Native Kotlin inside the Capacitor Android project | Same reason. The IME is also the policy-safe replacement for an accessibility service. |
| Chrome / Edge / Firefox | One **WXT** project (replaces two hand-forked folders) | One codebase that builds for every browser. |

Drop the Electron app and the separate SwiftUI macOS app. Do not adopt React Native, Expo, Flutter, Compose Multiplatform or Lynx today. Astryx is DOM-only, so each of those would either push Astryx into webviews anyway or force a rewrite of the design system.

Runner-up: **Tauri everywhere** (desktop and mobile). Switch to it only if three things become true: Tauri mobile gets an official push plugin, it gets a supported in-app-purchase plugin, and regenerating the iOS project is shown to keep custom extension targets intact. Section 10 covers when to revisit.

## 2. What the Astryx constraint really means

- `@astryxdesign/core` 0.7.12 peers on `react-dom >=19` and `@stylexjs/stylex ^0.19`. It ships prebuilt, cascade-layered CSS (`reset.css`, `astryx.css`), so no build plugin is needed (npm registry; Astryx getting-started docs).
- `@astryxdesign/native` is published only under the `canary` tag (`0.7.13-canary.9993f4c`; `latest` is a `0.0.0-bootstrap` placeholder). Its README says "Nothing here is supported for production apps." It contains a Swift package that draws only Text, Heading, Button, TextInput, Card and Banner in SwiftUI. It also has a TS "logic core" that sends JSON node trees to a native host running JavaScriptCore or Hermes. "React Native and Android bindings are not built yet."
- Astryx's own experiment matrix compares five arms: pure native; React Native; shared TS logic core driving native views; web on a native renderer through Expo's experimental fork; and web inside an Electron shell. No winner is chosen. **Even Meta has not decided how Astryx goes native.** We should not bet the product on any one arm.
- **Browser tiers matter for webview shells.** Tier 1 (full fidelity, including CSS anchor positioning for menus, popovers and tooltips) needs Chrome/Edge 125+, Safari 26+ or Firefox 147+. Tier 2 (Chrome 114+, Safari 17+) works, but layered surfaces are not anchored to their trigger.
  - Electron, WebView2 (Windows) and Android System WebView are evergreen Chromium: Tier 1.
  - WKWebView (Tauri and Capacitor on Apple platforms) follows the OS WebKit: iOS 26+ is Tier 1, iOS 17–18 Tier 2.
  - WebKitGTK (Linux) is uncertain: a June 2026 WebKit bug shows anchor-function failures on 2.52.4, fixed in 2.53.3.
  - Fix, as Astryx documents: feature-detect anchor positioning and load `oddbird/css-anchor-positioning` (BSD-3) only where it is missing.

**How to get Astryx-quality UI on iOS and Android today:** render the same Astryx bundle in WKWebView or Android WebView through Capacitor. Gate on iOS 17+, and use the polyfill below iOS 26. The only native-drawn UI is the system surfaces (keyboard, widgets, Live Activity), built in SwiftUI or Compose with Astryx's theme tokens exported as Swift/Kotlin constants. Track `@astryxdesign/native`: once its SwiftUI `Astryx` product is stable, the keyboard and widget UIs are the first candidates to move onto it.

## 3. Capabilities we need, and who can deliver them

| Capability | Where it must live | Tauri 2 | Electron | Capacitor 8 | Expo/RN | PWA |
|---|---|---|---|---|---|---|
| Global hotkey | Desktop main process | `global-shortcut` plugin. Linux is X11 only; Wayland needs a desktop-environment shortcut that calls our CLI or a signal (Handy's workaround) | `globalShortcut`, Wayland via the portal (fixed in 40.6.1; GNOME in 43.2.0) | n/a. iOS uses the Action button or Shortcuts through App Intents; Android uses a QS tile | n/a | No |
| Microphone, push-to-talk | Desktop native, or the mobile main app | Rust `cpal` capture avoids WebKitGTK's `getUserMedia` permission traps | Chromium `getUserMedia` | Native plugin (Swift/Kotlin) | Native module | `getUserMedia` while the tab is open |
| Background audio (iOS) | Main app, `audio` background mode, only during a user-started session | Custom Swift plugin | Custom Swift plugin | Custom Swift plugin | Native module | No |
| System-wide text insertion | macOS AX / CGEvent paste; Windows SendInput; Linux xdotool, wtype or ydotool | `enigo` + clipboard (Handy) | Native addon or sidecar | iOS: keyboard only. Android: IME `commitText` | Same as Capacitor | No |
| iOS custom keyboard | Native Swift target | Add the target under `src-tauri/gen/apple` (whether it survives regeneration is **unverified**) | n/a | Plain Xcode target | `@bacons/apple-targets` `keyboard` type | No |
| Share extension / share target | Native target; Android `ACTION_SEND` | Community `tauri-plugin-mobile-sharetarget` | n/a | Xcode target + intent filter | `apple-targets` `share` | Android only. iOS Safari has no Web Share Target |
| Widgets / Live Activity | WidgetKit (Swift), Glance (Kotlin) | Community `tauri-plugin-widgets` | n/a | Native targets | `apple-targets` `widget` | No |
| App Intents / Shortcuts | Swift in the app target; Android App Shortcuts, AppFunctions (experimental, Android 16+) | Custom | n/a | Custom Swift | Custom | No |
| Android IME | Kotlin `InputMethodService` in the app module | Custom | n/a | Custom | Custom | No |
| Android AccessibilityService | **Avoid** (see section 6) | — | — | — | — | — |
| Push notifications | APNs / FCM | No official plugin (the official `notification` plugin is local only) | Desktop only | Official `@capacitor/push-notifications` | `expo-notifications` | iOS 16.4+, only for home-screen installs |
| Offline store | SQLite natively, OPFS/IndexedDB on the web | `tauri-plugin-sql` | Node SQLite | `@capacitor-community/sqlite` | `expo-sqlite` | IndexedDB |
| In-app purchase | StoreKit / Play Billing | No supported plugin found | n/a | RevenueCat `purchases-capacitor` (MIT) | RevenueCat RN | No |

**Two cheap, sandbox-safe native surfaces** the repo lacks:
- **Android `ACTION_PROCESS_TEXT`** ("Process a piece of text") adds "Improve with PromptAI" to every app's text-selection menu and can return replacement text, with no IME or accessibility service.
- **macOS Services menu (`NSServices`)** adds it to every app's right-click menu with no Accessibility permission (Tauri needs a small Objective-C/Swift shim).

## 4. Options compared

| Option | Astryx fit | Shared code | Native reach | Maturity (checked 2026-11) | Verdict |
|---|---|---|---|---|---|
| **Tauri 2** (desktop) | Full in WebView2. WKWebView depends on the OS version. WebKitGTK quirks on Linux | UI and core ~100% shared with web; Rust only for native | Excellent on desktop (Handy shows hotkey → record → local ASR → paste on three OSes) | 2.12.5 stable; 3.0 alphas; a CEF (bundled Chromium) runtime is in progress on the `feat/cef` branch | **Adopt for desktop** |
| **Tauri 2** (mobile) | Same webviews as Capacitor | Same | Swift/Kotlin plugins; a smaller official set (no push, no IAP) | A May 2026 team evaluation reportedly found mobile "closer to alpha" (search snippet only; the page is behind a login, so unverified) | Runner-up |
| **Electron** | Best: pinned Chromium, so Tier 1 everywhere | ~100% | Mature desktop APIs, Wayland hotkeys via the portal | 45.2.3 | Fallback only |
| **Capacitor 8** (mobile) | WKWebView / Android WebView | ~100% UI shared | Every capability through Swift/Kotlin; projects you own | 8.6.0 (2026-10-28); SPM is the default for new iOS projects | **Adopt for mobile** |
| **Expo / RN + DOM components** | Astryx only inside `'use dom'` components: each its own webview, async JSON bridge, no `children`, no shared state. Expo says "we recommend using truly native views whenever possible" | Low, unless everything is DOM, which defeats the purpose | Best native ecosystem (EAS, `apple-targets`, Expo UI) | Expo 58 / RN 0.88 | Revisit if Astryx ships RN bindings |
| **react-native-web** | Wrong direction: renders RN primitives to the DOM, not Astryx | — | — | — | No |
| **Flutter** | None (Dart; canvas-rendered web) | Requires re-implementing the design system | Good | Mature | Avoid |
| **Compose Multiplatform** | None (Kotlin) | Same problem | Good; iOS stable since 1.8.0 (May 2025) | Mature | Avoid |
| **Lynx** (non-obvious) | None: its own dual-thread renderer, not the DOM. 4.0 added `<webview>`, which would just be a webview again | Rewrite | Growing | 4.2.0 (2026-10-27) | Avoid |
| **Native SwiftUI + Compose shells around a shared TS core** (non-obvious; Astryx "arm C") | Astryx-native SwiftUI covers 6 components on canary only | The core is shared, but every screen is built 2–3 times | Best | Experimental | Use only for system surfaces now; revisit in 2027 |
| **PWA only** | Full | 100% | No hotkeys, no keyboard, no share target on iOS, iOS push only after a home-screen install | — | Ship as the web tier, not as the mobile strategy |
| **Electrobun** (non-obvious desktop) | System webview, or bundle CEF via a flag | 100%, and the main process is TypeScript | bsdiff "kilobyte-scale updates"; no mobile | v2 beta | Watch; it is the escape hatch if Rust becomes a burden |

## 5. Recommended architecture

```
packages/
  core/       Pure TS: domain model, intent/agent client, state machines, API client.
              No DOM, no platform imports, so it runs in a browser, a webview,
              and later in Hermes/JSC (Astryx arm C).
  platform/   The Platform port + capability flags + adapters: web | tauri | capacitor | extension
  ui/         React 19 + Astryx screens and templates. Built once by Vite into ui/dist.
apps/
  web/        ui/dist + service worker (vite-plugin-pwa) on Cloudflare Pages
  desktop/    Tauri 2. src-tauri/ in Rust: hotkey, audio, VAD, ASR, insertion,
              tray, non-activating panel, updater, deep links, single instance
  mobile/     Capacitor 8.
              ios/: App, KeyboardExt, ShareExt, Widgets, Intents, sharing PromptAIKit through an App Group
              android/: app, IME service, PROCESS_TEXT activity, Glance widget, QS tile
  extension/  WXT: Chrome/Edge/Firefox (Safari later), overlay built from core + a small part of ui
native/
  PromptAIKit (Swift)    API client generated from OpenAPI (swift-openapi-generator) and an App Group store
  promptai-kit (Kotlin)  The same for the IME and widgets
```

**The Platform port is the key design decision.** The UI calls one typed interface (`platform.dictation.start()`, `platform.insert(text)`, `platform.hotkeys?.register()`, `platform.notify()`, `platform.secrets`, `platform.update?.check()`) and reads `platform.caps`, a set of capability flags. Screens render according to the flags, not by checking which platform they are on: iOS never shows a hotkey setting, and the web hides "insert into any app." This keeps the product adaptable rather than hard-coded. It also limits what a shell change can break: swapping Tauri for Electron, or Capacitor for Tauri mobile, means one new adapter and no screen changes.

Generate the Rust ↔ TS command types with `tauri-specta` (MIT, still a release candidate) so the desktop adapter cannot drift from its Rust commands. This replaces the repo's existing IPC-surface snapshot test.

**How much is shared (estimates, not measured).** `core`, `ui` and the adapters make up roughly 85–90% of the code, used unchanged by web, desktop and both mobile apps; the extension reuses `core` and part of `ui`. The native code is likely 2–4k lines per area: the desktop Rust core (much of it can follow Handy's design, MIT, with attribution), the iOS extensions in Swift, and the Android IME and widgets in Kotlin.

## 6. Dictation and insertion, per platform

| Platform | Capture | Recognition | Insertion |
|---|---|---|---|
| **Desktop** | Rust `cpal` on hotkey, Silero VAD | Local streaming ASR via `transcribe.cpp` (MIT, ggml, 16+ model families, Metal), with cloud fallback | Clipboard + simulated paste via `enigo`, then restore the clipboard (see the race note below) |
| **Web** | `getUserMedia` + AudioWorklet over a WebSocket to the backend | Server-side ASR. Do not rely on the Web Speech API: support varies by browser, and Chrome's implementation sends audio to Google | Copy / send |
| **iOS** | The main app records with an `AVAudioSession` during an explicit, time-boxed session the user starts | On-device `SpeechAnalyzer`/`SpeechTranscriber` (iOS 26+; `DictationTranscriber` covers other languages), cloud otherwise | The keyboard reads the result through the App Group and calls `insertText` |
| **Android** | The IME records directly (the app holds `RECORD_AUDIO`) | Cloud, with on-device as an option (`sherpa-onnx`, Apache-2.0) | `InputConnection.commitText`, or a PROCESS_TEXT result |

- **Desktop.** The overlay must never steal focus from the target app; on macOS use `tauri-nspanel` (Apache-2.0, git dependency) for a non-activating panel, as Handy does. Handy documents a real race where the target app reads the clipboard after it has been restored, so old text gets pasted; copy its "Reliable Paste" fix. On Linux, X11 uses `xdotool` and Wayland uses `wtype`, `dotool` or `ydotool`. Ubuntu 26.04 defaults to Wayland, where `wtype` fails and `ydotool` needs systemd setup, so Linux is tier 2.
- **iOS.** Apple's guide says custom keyboards "have no access to the device microphone, so dictation input is not possible," so the keyboard hands off to the containing app to record. Wispr Flow ships this pattern on the App Store with Full Access plus microphone permission. Its docs warn that from iOS 26.4 returning to the previous app may need a manual swipe, and third-party keyboards can no longer detect the host app. **Do not design per-app context on iOS.**
- **Android.** The IME path needs no accessibility service.

## 7. App store and distribution risks

1. **iOS 4.2, minimum functionality** ("elevate it beyond a repackaged website"). A bare Capacitor wrapper is at risk; the keyboard, share extension, widgets, App Intents and native dictation make it pass. Ship at least the share extension and App Intents in iOS v1.
2. **iOS 4.4.1, keyboards.** A keyboard must "Provide keyboard input functionality," must "Remain functional without full network access and without requiring full access," and must not "Launch other apps besides Settings." So we need a real typing layout that works offline. The jump to our own app to record is a gray zone (Wispr ships it); run a TestFlight review spike before investing. KeyboardKit is closed-source and commercial: build a minimal layout ourselves or buy a license deliberately.
3. **iOS 2.5.4, background audio.** Only during a user-started session with a visible indicator (a Live Activity), then release it.
4. **Over-the-air (OTA) web updates.** 2.5.2 bans downloaded code that changes features; the Developer Program License exempts interpreted code that "does not change the primary purpose." Live-update fixes and content, never new native capability.
5. **No Mac App Store in v1.** Accessibility-gated APIs are incompatible with the App Sandbox, a clipboard manager was reportedly rejected under 2.4.5 for `CGEvent.post`, and 2.4.5 requires store-only updates. Ship Developer ID signed and notarized (the repo's runbook already covers this). A Services-menu-only store edition can come later.
6. **Android accessibility.** Only apps serving people with disabilities may claim `isAccessibilityTool`; everyone else needs prominent disclosure and consent. Android 17's Advanced Protection Mode revokes access from non-tools (Beta 2 reporting, March 2026). Use the IME, PROCESS_TEXT and the share target instead.
7. **Windows.** Unsigned builds trigger SmartScreen (the repo README says so). Budget for a signing certificate before launch.
8. **Browser extensions.** MV3 forbids remotely hosted code, so the overlay ships in the package. Inject Astryx CSS and theme variables at the Shadow DOM `:host`, not `:root`. Whether Astryx popovers work inside Shadow DOM is **unverified**: spike it.

## 8. Bundle size, startup and memory

- The only concrete app-level comparison found (Hopp, July 2025, macOS, N=1, the author says "take with a grain of salt"):

  | Metric | Tauri | Electron |
  |---|---|---|
  | Bundle | 8.6 MiB | 244 MiB |
  | Memory, 6 windows | ~172 MB | ~409 MB |
  | Startup | "negligible" difference | — |
  | First build | 1 min 21 s | 16 s |

  Larger ratios in other 2026 blogs lack reproducible benchmarks (unverified). For an always-on tray utility, memory and download size are what users notice, which is the main reason to choose Tauri.
- Local ASR models (often hundreds of MB) matter more than the shell. Download them on demand; never bundle them.
- Mobile: no trustworthy Capacitor or Expo numbers were found for this workload (unverified). Expo notes webview JS "parses and starts more slowly than optimized Hermes bytecode," which applies to any webview shell. Phase 0 targets (not measurements): initial JS under ~300 KB gzipped, secondary routes lazy-loaded, cold start under ~1.5 s on a mid-range Android phone.

## 9. Updates

| Surface | Mechanism |
|---|---|
| Desktop | `tauri-plugin-updater` (2.14.1): mandatory signatures, full signed binaries (no delta documented; secondary source), acceptable at ~10–30 MB per installer (estimate). Electron's differential blockmap downloads are its one clear advantage here. Keep the GitHub Releases pipeline. |
| Mobile, native code | Store releases only. |
| Mobile, web bundle | Live updates via Capgo's `capacitor-updater` (MPL-2.0, self-hostable; weak file-level copyleft, fine commercially if changes to MPL files are published) or Capawesome Cloud. **Not Ionic Appflow**: closed to new customers since Feb 2025, end of life Dec 31, 2027. |
| Web | Static deploy plus a service worker with a "new version, reload" prompt. |
| Extension | Store updates. |

## 10. What to keep, change or drop in the current repo

**Keep**
- The Electron app's security rules: an enumerated IPC surface with a snapshot test, clipboard reads only on explicit click, and the token in OS-encrypted storage. Re-express them as Tauri v2 capabilities, `tauri-specta` types and keychain storage.
- The tray, floating widget and hotkey UX (skins, sizes, saved position).
- `extension/src/content/insertText.ts` and `detector.ts`, with their tests.
- The PWA manifest and the Cloudflare Pages static deploy.
- `macos-sdk/PromptForgeKit` (61 lines), renamed PromptAIKit: the Swift client for the iOS extensions, which cannot use the webview. Generate it from the backend's OpenAPI spec so it cannot drift.

**Change**
- `desktop/` (Electron 33, ~1.3k lines): rewrite on Tauri 2. Small enough to port in days, not weeks (estimate).
- `extension/` + `firefox-extension/`: Firefox is a hand-ported fork missing most content code. Merge both into one WXT project, and generate `host_permissions` from `config/platform-registry.json` instead of hard-coding 11 hosts.
- `web/` (Next.js 16 static export): for an app shell embedded in Tauri, Capacitor and the extension, a Vite SPA with a client router is simpler. It avoids `generateStaticParams` friction on dynamic routes and gives one build output for every shell. Keep Next or Astro only for SEO and marketing pages, if needed. Medium confidence; coordinate with the web/UX lens.
- `useDictation.ts`: replace with `platform.dictation`, and stop defaulting to Web Speech.

**Drop**
- `macos/`: the separate SwiftUI menu-bar app (306 lines; its Accessibility detector is a stub returning nil). Tauri covers macOS; carry its Carbon-hotkey knowledge over.
- Any plan for parallel Electron and Tauri desktops, or a separate native macOS app.

## 11. What NOT to build

- No React Native/Expo app, no Flutter, KMP or Lynx UI, no second design system.
- No Android AccessibilityService; no Mac App Store build in v1.
- No full custom keyboard (autocorrect, swipe, emoji): only the minimal layout 4.4.1 requires, plus dictation and "improve" actions.
- No ASR inside the iOS keyboard extension; no bundled models.
- No custom update servers; no Flatpak or Snap at first (the sandbox breaks insertion).
- No Astryx native or Tauri CEF until they leave canary/alpha, but keep `core` DOM-free so either can be adopted later.

## 12. Incremental plan for 1–3 engineers

**Phase 0 spikes (about 2 weeks), each with a pass/fail exit criterion:**
1. Three Astryx templates in WKWebView (iOS 18/26, macOS 15/26), WebView2, Android WebView and WebKitGTK, with and without the anchor polyfill.
2. Tauri hotkey → record → local ASR → paste into Slack, VS Code and a browser on macOS and Windows, measuring median release-to-text latency.
3. Capacitor loading `ui/dist`, applying a live update, registering for push.
4. iOS keyboard ↔ app recording handoff through one TestFlight external review.
5. Astryx inside an extension's Shadow DOM.

**Phase 1.** Web + Tauri desktop + WXT extension (macOS and Windows tier 1, Linux tier 2).
**Phase 2.** Capacitor iOS and Android apps with share extension/target, App Intents, widgets and PROCESS_TEXT.
**Phase 3.** Android IME, then the iOS keyboard (highest review risk last).

**Re-evaluate in mid-2027:** Tauri mobile (if its plugins have caught up), `@astryxdesign/native` (if stable), and Tauri's CEF runtime (if stable; it would fix Linux rendering).

## Sources

- https://astryx.atmeta.com/docs/getting-started
- https://astryx.atmeta.com/docs/browser-support
- https://github.com/meta/astryx/tree/main/packages/native (README, experiment matrix)
- https://www.npmjs.com/package/@astryxdesign/native (dist-tags checked via npm view)
- https://docs.expo.dev/guides/dom-components/
- https://github.com/EvanBacon/expo-apple-targets
- https://v2.tauri.app/blog/tauri-20/
- https://github.com/tauri-apps/tauri (releases; `feat/cef` branch, `crates/tauri-runtime-cef`)
- https://github.com/tauri-apps/plugins-workspace
- https://v2.tauri.app/plugin/updater/
- https://v2.tauri.app/develop/debug/linux-graphics/
- https://range-day-docs.pages.dev/decisions/Tauri-vs-Capacitor (May 2026 evaluation; behind a login, seen only as a search snippet, so unverified)
- https://github.com/tauri-apps/tauri/discussions/10017
- https://docs.rs/crate/tauri-plugin-mobile-sharetarget/latest
- https://docs.rs/crate/tauri-plugin-widgets/0.4.3/source/docs/guide/setup/ios.md
- https://github.com/cjpais/Handy
- https://github.com/handy-computer/transcribe.cpp
- https://github.com/ahkohd/tauri-nspanel
- https://github.com/specta-rs/tauri-specta
- https://github.com/block/buzz/pull/3557 (WebKitGTK getUserMedia permission)
- https://bugs.webkit.org/show_bug.cgi?id=315704
- https://dev.to/gethopp/tauri-vs-electron-performance-bundle-size-and-the-real-trade-offs-1el4
- https://www.electronjs.org/docs/latest/api/global-shortcut
- https://releases.electronjs.org/release/v40.6.1
- https://releases.electronjs.org/release/v43.2.0
- https://www.electron.build/auto-update
- https://ionic.io/blog/announcing-capacitor-8
- https://capacitorjs.com/docs/apis
- https://capawesome.io/blog/whats-new-in-capacitor-8-4-0/
- https://ionic.zendesk.com/hc/en-us/articles/29907381079831 (Appflow end of life)
- https://capawesome.io/docs/blog/electron-vs-tauri-for-capacitor-apps/
- https://github.com/Cap-go/capacitor-updater
- https://github.com/RevenueCat/purchases-capacitor
- https://blog.jetbrains.com/kotlin/2025/05/compose-multiplatform-1-8-0-released-compose-multiplatform-for-ios-is-stable-and-production-ready/
- https://lynxjs.org/blog/
- https://github.com/blackboardsh/electrobun
- https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/CustomKeyboard.html
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/videos/play/wwdc2025/277/
- https://developer.apple.com/forums/thread/820594 (CGEvent.post rejection under 2.4.5)
- https://docs.wisprflow.ai/articles/7453988911-set-up-the-flow-keyboard-on-iphone
- https://docs.wisprflow.ai/articles/6269634092-adapting-to-ios-26-4
- https://techcrunch.com/2025/06/03/wispr-flow-releases-ios-app-in-a-bid-to-make-dictation-feel-effortless/
- https://expo.dev/articles/updates-and-rollouts/over-the-air-updates
- https://support.google.com/googleplay/android-developer/answer/10964491
- https://www.androidauthority.com/android-17-beta-2-advanced-protection-mode-accessibility-apps-3648860
- https://thehackernews.com/2026/03/android-17-blocks-non-accessibility.html
- https://developer.android.com/reference/android/content/Intent#ACTION_PROCESS_TEXT
- https://developer.android.com/ai/appfunctions
- https://firt.dev/notes/pwa-ios/
- https://github.com/k2-fsa/sherpa-onnx
- https://github.com/wxt-dev/wxt
- https://github.com/oddbird/css-anchor-positioning
- https://github.com/KeyboardKit/KeyboardKit (closed-source licence)
