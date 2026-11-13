# Operating-system AI APIs: what PromptAI should take from each platform

*Wave 2 · lens: OS AI APIs · 2026-11-10 · probes in `spikes/w2-os-ai-apis/`*

## Verdict

**Integrate outward first, inward only where it is cheap.** The most valuable OS AI work for PromptAI is to make PromptAI something the OS assistants can call: App Intents on Apple, AppFunctions on Android once it opens, MCP registration on Windows, and WebMCP later. Calling the OS's own models (Apple Foundation Models, Gemini Nano, Phi Silica, Chrome's Prompt API) is worth doing only for a few small tasks. It has to sit behind one task-level port that checks what the device can do, with the cloud as the default path. No core flow may depend on an OS model.

The reasons, briefly:

- Every OS model is opt-in, hardware-gated, and limited by language or region.
- On this machine, an M5 Mac that can run Apple Intelligence, Foundation Models reports `unavailable(appleIntelligenceNotEnabled)`, because Apple Intelligence was never switched on.
- Apple Intelligence does not support Hindi. Chrome's Prompt API accepts only en, ja, es, de and fr.
- Microsoft is removing Phi Silica in January 2027.

The OS assistants are now distribution surfaces. Siri, Spotlight, Shortcuts, Visual Intelligence, Gemini and Windows agents all take third-party actions.

## What wave 1 already covers, and what this adds

- **`model-gateway.md`** proposes "device first": a `LocalModel` interface over Apple FM, ML Kit GenAI and Chrome built-in AI.
- **`BLUEPRINT.md`** keeps everything except redaction, regex, rules and STT in the cloud "until a local provider exists" (§ device or cloud). It puts Apple FM in Phase 3.
- **`dictation.md`** left SpeechAnalyzer "not on the board".
- **`w2-business-economics.md`** assumes Apple FM or Chrome AI handles the understand step "where present".

This report adds four things:

1. Each platform's status as of November 2026, checked against primary docs.
2. Measurements from this Mac.
3. A comparison of options, with a recommendation.
4. An abstraction that covers both directions: PromptAI calling the OS, and the OS calling PromptAI.

## Evidence from this machine

The setup was an M5, macOS 26.6 (25G72), Command Line Tools only, and region India (`en_US@rg=inzzzz`). The 1-minute load average ran between 85 and 130 on 10 cores during the runs, because about 30 agents were running at once. Each config ran once over 32 clips, and the medians are across clips. **Treat every latency below as an upper bound.**

### Foundation Models (`fm_probe.swift`, results in `fm_probe.results.txt`)

- `SystemLanguageModel.default.availability` is `unavailable(appleIntelligenceNotEnabled)`. The `.contentTagging` use case reports the same.
- `respond()` fails in **8 ms** with `assetsUnavailable` ("Apple Intelligence is not enabled"). Failing over to the cloud costs almost nothing.
- The macOS 26.4 APIs work even with the model off:
  - `contextSize` returns **4096**. In Apple's WWDC26 session the same call prints 8192, presumably on the rebuilt 27-series model. Either way, the window size depends on the OS version.
  - `tokenCount(for:)` returned 19 for a 9-word prompt.
- An earlier spike (`spikes/w2-multilingual/afm`) listed 23 supported locales, with no Hindi or any other Indic language.

### SpeechAnalyzer, streaming (`speech_stream_probe.swift`, `run_speech.sh`, `score.py`)

The test set was 32 TTS clips: 8 dictation-style prompts full of jargon (Supabase, pgvector, Astryx, Tauri and so on), each read by 4 voices (en-US, en-GB, en-IN, en-AU). Audio was fed in 100 ms chunks at real-time pace into a warmed analyzer (`prepareToAnalyze`), using on-device en-US assets that were already installed (nothing was downloaded). "Tail" is the time from the last chunk, which stands in for key release, until the final text arrived.

| Config | WER | Key-term recall | First partial p50 | Tail p50 | Tail p90 |
|---|---|---|---|---|---|
| SpeechTranscriber | 13.1% | 17/40 | 1,072 ms | 1,552 ms | 2,322 ms |
| SpeechTranscriber + `contextualStrings` (10 terms) | 13.1% | 17/40 | 1,089 ms | 2,361 ms | 3,925 ms |
| DictationTranscriber | 15.3% | 14/40 | 844 ms | 1,749 ms | 4,686 ms |
| **DictationTranscriber + `contextualStrings`** | **11.7%** | **21/40** | 771 ms | 1,754 ms | 6,160 ms |

What the numbers say:

- **Accuracy.** TTS audio is clean, so these WERs flatter real speech, yet the jargon still breaks. SpeechTranscriber produced "superbase", "a strix", "Torai" and "Victor" (for pgvector).
- **Custom vocabulary.** SpeechTranscriber **ignores** `contextualStrings`: its 32 transcripts with and without them are byte-identical. DictationTranscriber uses them. Key-term recall rose from 14/40 to 21/40 and WER fell from 15.3% to 11.7%. Per term, out of four voices: StyleX went from 0 to 4 correct, PromptForge 0 to 3, Astryx 0 to 2, Hono 1 to 2, Tauri 0 to 1. "pgvector" and "Supabase" stayed at 0/4, so post-ASR replacement (blueprint §dictation) is still needed.
- **Latency.** On a loaded machine every tail p50 (1.5–2.4 s) misses the blueprint's 600 ms on-device target. The p90 grew as the load rose through the run. Under SpeechTranscriber the first partial lands at 1.05–1.28 s on every clip, which looks like a fixed reporting cadence rather than load. DictationTranscriber's first partial came sooner (p50 771–844 ms).
- **Next step.** Re-measure on an idle machine before deciding anything. S3 should add SpeechAnalyzer to its STT bake-off.

### Toolchain findings

1. The Command Line Tools have no `appintentsmetadataprocessor` (`xcrun --find` fails). App Intents need full Xcode, because the metadata Siri and Spotlight read is extracted at build time.
2. `xcrun --show-sdk-path` resolves to `MacOSX27.0.sdk`, which was built with Swift 6.4. The installed compiler is 6.3.3 and refuses to build against it. Pinning `-sdk MacOSX26.5.sdk` fixed the build, so CI must pin the SDK (`results/toolchain.txt`).
3. Chrome is not installed, so Chrome's built-in AI was **not measured** here. Its figures below come from Google's docs only.

## Platform status (checked 2026-11-10)

### Apple (iOS, iPadOS, macOS 26 and 27)

| API | Status | Gates | Fit for PromptAI |
|---|---|---|---|
| **App Intents / App Shortcuts** | GA. iOS 26 adds Visual Intelligence and interactive snippets; iOS 27 adds entity and intent schemas for Siri and Spotlight's semantic index, View Annotations, and `AppIntentsTesting` | Xcode build; schema features need an Apple Intelligence device | High: "Draft with PromptAI", "Improve this prompt" and "Open recipe" reachable from Siri, Spotlight, Shortcuts and the Action button |
| **Foundation Models (on-device)** | GA since 26.0. 26.4 adds `contextSize` and `tokenCount`; 27 adds image input, Vision tools, Dynamic Profiles, an Evaluations framework, and a `LanguageModel` protocol (Anthropic and Google publish conforming Swift packages) | Apple Intelligence on and enabled; supported device; 16 languages, no Hindi; not mainland China; 4,096-token context measured on 26.6 (8,192 printed in the WWDC26 session) | Medium: small tagging, cleanup and classification on Apple devices only |
| **PCC (`PrivateCloudComputeLanguageModel`)** | iOS/macOS 27: 32K context, reasoning levels, no API keys | Managed entitlement; Small Business Program and <2M first-time downloads for no cloud cost; per-user daily quota (higher with iCloud+); `quotaLimitReached` | Interesting: free 32K tier for Apple users, but a second model family to evaluate |
| **SpeechAnalyzer** | GA since 26.0. `DictationTranscriber` uses `contextualStrings`; SpeechTranscriber ignores them (measured) | On-device assets per locale; SpeechTranscriber covers 30 locales on this Mac (en-IN only among Indic/RTL); DictationTranscriber covers 54 (includes hi-IN) | High for iOS on-device STT; desktop pending S3 |
| **Writing Tools** | System-provided; apps tune it with `writingToolsBehavior` and coordinators | Apple Intelligence | No provider API. Set `.none` on structured prompt editors; leave other fields at the default |
| **Visual Intelligence** | iOS 26: `IntentValueQuery` receives a `SemanticContentDescriptor` (labels plus pixels) | iPhone with Visual Intelligence | Assess: "what is this tool?" from a screenshot, answered by a PromptAI Tool Card |
| **Siri "Extensions" (third-party models)** | Reported for iOS 27 (Bloomberg, via MacRumors and iClarified); code is in the betas but undocumented. The macOS 27 RC shows only ChatGPT | Entitlements reportedly negotiated with OpenAI, Anthropic and Google | Avoid; not open to PromptAI |

Apple Intelligence runs on iPhone 15 Pro and later, M1 and later, and the A17 Pro iPad mini. It needs up to 8–14 GB of storage, and the device and Siri languages must be supported. It does not work in mainland China. In the EU, Siri AI on iOS has "no timeline", although macOS is included ([Apple](https://support.apple.com/en-us/121115); EU detail from secondary reports).

### Android

| API | Status | Gates | Fit |
|---|---|---|---|
| **ML Kit GenAI Prompt API** (Gemini Nano via AICore) | **Beta**; text plus image, typed structured output, `AgentRunner` tool loops | Nano 2/3/4 device lists (Pixel 9–11, Galaxy S25/S26, some Honor, OPPO, vivo and Xiaomi); **foreground only**; `BUSY` and `PER_APP_BATTERY_USE_QUOTA_EXCEEDED`; output differs by Nano version | Low reach in the India mid-range segment |
| **Feature APIs** (summarize, proofread, rewrite, image description) | Shipped on a separate device list | Same limits | Low; PromptAI's cloud compile does more |
| **GenAI Speech Recognition** | **Alpha** (`1.0-alpha2`); Basic mode on API 31+, Advanced mode on flagships; hi-IN only in beta | No biasing documented | Assess against sherpa-onnx |
| **AppFunctions** | **Experimental**; Android 16+; callers need `EXECUTE_APP_FUNCTIONS`; Gemini integration a "private preview with trusted testers" (May 2026); Early Access Program by form | Only "a limited number of apps and system agents" run end to end | Prepare, don't ship: a direct path into Gemini once it opens |

### Windows

| API | Status | Gates | Fit |
|---|---|---|---|
| **Phi Silica** (Windows AI APIs) | Limited Access Feature (unlock token). **Being replaced by Aion Instruct: Insider builds November 2026, retail January 2027, "Phi Silica is removed"** | Copilot+ NPU, or a GPU path that needs Developer Mode and an Insider build; **package identity**; not in China | Avoid now; re-check Aion in Q1 2027 |
| **Windows ML** | GA since September 2025; ONNX Runtime with vendor execution providers delivered through Windows Update | Windows 11 24H2+ for NPU and GPU execution providers | Assess later, only if the desktop ships ONNX models (for example the sherpa-onnx fallback) |
| **MCP on Windows (On-device Agent Registry, `odr.exe`)** | Prerelease; agents isolated in a contained environment; consumers include GitHub Copilot in VS and VS Code and Microsoft Agent Framework | Registering a remote server is manual (docs). Per one third-party analysis, a local server must be MSIX-packaged to run contained | Trial: register PromptAI's MCP server (blueprint 2b) |
| **App Actions on Windows** | Shipping; actions declared in JSON and activated by URI or COM | **Package identity** | Assess: "Improve this text" in Click to Do |

Tauri builds MSI and NSIS installers with no package identity. Microsoft's **winapp CLI (MIT)** has an official Tauri guide that adds identity, either as a loose layout for debugging or as signed MSIX, which unblocks all three identity-gated APIs above.

### Chrome and Edge (desktop only)

| API | Status (Chrome 157 is stable, 2026-11-09) | Fit |
|---|---|---|
| **Prompt API** | Extensions since 138, web since 148. Text, image and audio in; JSON Schema `responseConstraint`. Languages en, ja, es, de, fr. Needs **22 GB free disk** and **>4 GB VRAM or 16 GB RAM with 4 cores**. **Not on Android or iOS**, and not in Web Workers | Trial in the WXT extension for a local understand pre-pass and ghost text |
| **Summarizer, Translator, Language Detector** | Stable since 138; Translator and Detector desktop only | Adopt Detector and Translator only if i18n needs them |
| **Writer, Rewriter, Proofreader** | The origin trials ended at 148 and 145; no intent to ship found. Google's extension filing calls them "not production-ready... outside of English" | Avoid |
| **WebMCP** (`registerTool`) | DevTrial behind a flag since Chrome 146 Canary; no stable date | Assess for the web app in 2027 |
| **Web Speech `processLocally`** | Chrome 139+, experimental | Assess as a mic fallback for the extension |

Gecko's position on the Prompt API is **negative** and WebKit has given no signal. Edge has the same APIs, backed by Phi-4-mini, and previews Aion-1.0-Instruct. Tauri's WKWebView does not expose these APIs. WebView2 support is *unverified*, so the desktop app should not plan on them.

## Options compared

Scores run from 1 to 5, where 5 is best.

| | A. OS models as the device tier | B. Cloud only, ignore OS AI | **C. Outward first, opportunistic inward** | D. Apple's session API as the client core |
|---|---|---|---|---|
| Users reached | 2: gated by opt-in, hardware, language and region | 5 | 5 for cloud, plus OS surfaces | 2: Apple only |
| Cost saved | 3, but only where present (`w2-business-economics` assumes it) | 1 | 2 | 3 (PCC free tier) |
| Effort for 1–3 engineers | 2: four adapters, four eval tracks | 5 | 4: one action catalog, a few intents | 1: second core in Swift, against TS-first |
| Platform churn risk | 1: Phi Silica removed, Writer trials ended, Nano versions differ | 5 | 4: intents and MCP are stable contracts | 2 |
| Strategic upside | 2 | 1: OS assistants absorb the product | **5: PromptAI becomes the tool Siri, Gemini and Copilot call** | 3 |
| **Total** | 10 | 17 | **20** | 11 |

Option D is the non-obvious inward choice. iOS 27's `LanguageModel` protocol lets a Swift client run Apple's on-device model, PCC, or Claude and Gemini through one session API. It is elegant, but it duplicates the TypeScript core, puts provider tokens on the client, and helps only Apple users. Reject it.

Option C is the non-obvious outward choice, and the one to commit to. App Intents, AppFunctions, Windows ODR and App Actions, and WebMCP are all converging on the same shape: typed tools with descriptions, much like MCP tools. PromptAI already plans an MCP server in 2b. One action catalog can feed all of them. That turns the threat of OS absorption, which the blueprint lists as a top risk, into distribution.

## What to adopt, per platform

**Apple: adopt**

- App Intents in the iOS app (2c), in the share or Action extension, and on macOS once S2 confirms Tauri can embed an Xcode-built intents target (*unverified*).
- Start with 3–5 intents: `ImproveText(text)`, `DraftFor(tool, idea)`, `OpenRecipe(recipe)`, `AskCoach(question)`, plus `RecipeEntity` and `ToolCardEntity` for Spotlight.
- Add iOS 27 entity schemas so Siri can find recipes without set phrases.
- Use `DictationTranscriber` with `contextualStrings`, filled from the user's vocabulary list, as iOS on-device STT once S3 confirms it.

**Apple: trial**

- Foundation Models for the `understand` pre-pass and dictation cleanup, only when it is `.available`, the language is supported, and it passes the S5 golden set.
- Use `tokenCount` to budget context, and never assume 4K or 8K.

**Apple: assess**

- PCC, once the entitlement is granted and the Small Business Program applies.
- Visual Intelligence, via an `IntentValueQuery` that returns Tool Cards.

**Apple: avoid**

- Siri Extensions, for now.

**Android**

- Adopt PROCESS_TEXT and share, which are already planned.
- Prepare AppFunctions: the same catalog, generated as KDoc-annotated Kotlin when 2c picks Android, plus an Early Access Program sign-up.
- Assess ML Kit Speech Recognition Basic mode against sherpa-onnx.
- Use the Prompt API only behind the port, on flagships, and never for a core flow.

**Windows**

- Trial ODR registration of the MCP server through winapp CLI identity in 2a.
- Assess App Actions.
- Avoid Phi Silica.
- Revisit Aion Instruct and Windows ML in Q1 2027.

**Chrome and Edge**

- Trial the Prompt API in the extension, through `@browser-ai/core`, an Apache-2.0 provider for the Vercel AI SDK.
- Adopt Language Detector where i18n needs it.
- Avoid Writer, Rewriter and Proofreader.
- Assess WebMCP for the web app.

## Architecture: two ports, one catalog

```
            ┌──────────────── shared TS core ────────────────┐
 inward ──► │ DeviceAI port (task-level)    Router policy     │
            │  classifyIntent | cleanup | detectLang |        │
            │  transcribe | redactAssist                      │
            │  each → Zod-validated JSON, same as cloud       │
            └──────┬──────────────┬──────────────┬────────────┘
         Apple FM / SpeechAnalyzer │ ML Kit (Kotlin) │ Chrome Prompt API
         (Swift via Tauri plugin;  │ via Capacitor   │ via @browser-ai/core
          Capacitor plugin on iOS) │                 │ (extension only)

 outward ◄── Action catalog (JSON Schema, generated from MCP tool defs)
             ├─ MCP server (2b) ─► Claude, ChatGPT, Windows ODR
             ├─ App Intents (Swift, hand-written for 3–5 intents)
             ├─ AppFunctions (Kotlin, later)
             ├─ Windows App Actions JSON (needs identity)
             └─ WebMCP registerTool (later)
```

**DeviceAI rules**

1. **Task-level, not prompt-level.** Every adapter implements named tasks that return the same Zod schema as the cloud. Apple has `@Generable` and JSON-schema guides, Chrome has `responseConstraint`, and ML Kit has typed output, so this works on every platform.
2. **Capabilities are probed, never assumed.** `capabilities(task, lang)` returns `available`, `downloadable(consent needed)`, or `unavailable(reason)`, plus limits such as `contextTokens` (from `contextSize` or `contextWindow`) and `maxOutput` (Capacitor clamps Android to 256 tokens). Re-probe when an availability-change event fires.
3. **Never download silently.** Chrome needs user activation for `create()`. Windows says to "show a consent dialog" before `EnsureReadyAsync`. Android `download()` is explicit.
4. **Prompts are data.** Each device adapter has its own prompt variant in the signed content bundle, evaluated in CI on the S5 golden set. A device adapter is promoted per task only if it matches the cloud's slot F1 within a set margin. Adding a platform means adding data, not code.
5. **One shot, then cloud.** On guardrail, `BUSY`, quota, background, timeout (about 1.5× the p90 budget) or schema failure, fall back to the cloud immediately. Two device failures in a session disable the adapter for that session. The device tier can never loop.
6. **The "Ran on" label records the model version.** Use `getBaseModelName()`, the OS build, or the Chrome version, because outputs differ across Nano and AFM versions. That version is also needed to compare evals.

**The outward catalog** reuses the 2b MCP tool definitions as the single source. A small codegen step emits Windows App Actions JSON and AppFunctions stubs. The App Intents are written by hand, since there are only a few and they need Swift types.

## Risks

- **Enablement is unknown.** No source gives the share of users who turn Apple Intelligence on. Any cost savings from an OS model are *unverified* until beta telemetry, which records adapter availability as a count with no content, shows the rate.
- **Version churn.**
  - The AFM context window is 4,096 tokens on 26.6, and 8,192 appears in the WWDC26 session.
  - Phi Silica is removed in January 2027.
  - The Writer and Rewriter origin trials lapsed.
  - Android Nano versions return different outputs for the same prompt.
  - Every device adapter needs a re-run of its eval when the OS changes.
- **Toolchain.** App Intents need Xcode. The CLT's SDK and compiler mismatch breaks naive CI. Embedding App Intents in a Tauri bundle is *unverified*. Windows identity adds MSIX signing.
- **Agent safety.** Exposed actions can be invoked by injected agents. Intents must be read-only or confirm before acting, which matches the blueprint's "predictions never chain actions". On Windows, ODR containment helps.
- **Gatekeeping.** AppFunctions and Siri Extensions are closed to most apps, and Microsoft gates Phi Silica behind LAF tokens.
- **Measurement.** The probe latencies come from a heavily loaded machine, and the audio is synthetic. Treat them as directional only.

## Sources

- Apple WWDC26 "What's new in Foundation Models" (session 241): https://developer.apple.com/videos/play/wwdc2026/241
- Apple WWDC26 iOS guide: https://developer.apple.com/wwdc26/guides/ios/
- MacRumors, 2026 Platforms State of the Union: https://www.macrumors.com/2026/06/09/apple-outlines-major-ai-and-developer-tool-updates/
- Apple, PCC docs: https://developer.apple.com/documentation/foundationmodels/adding-server-side-intelligence-with-private-cloud-compute
- WWDC26 session 319 notes: https://wwdcnotes.com/documentation/wwdc26-319-build-with-the-new-apple-foundation-model-on-private-cloud-compute/
- Apple, How to get Apple Intelligence (2026-11-05): https://support.apple.com/en-us/121115
- TNW on Siri Extensions: https://thenextweb.com/news/apple-siri-extensions-third-party-ai-missing-wwdc
- iClarified on Siri Extensions: https://www.iclarified.com/101188/apple-has-built-a-framework-for-thirdparty-ai-models-in-siri-report
- Visual Intelligence `SemanticContentDescriptor`: https://developer.apple.com/documentation/visualintelligence/semanticcontentdescriptor
- Writing Tools in WebKit: https://lists.webkit.org/pipermail/webkit-changes/2024-July/303805.html
- Apple foundation-models-utilities (Apache-2.0): https://github.com/apple/foundation-models-utilities
- Apple python-apple-fm-sdk (Apache-2.0): https://github.com/apple/python-apple-fm-sdk
- Rust crate `foundation-models` (MIT/Apache-2.0): https://docs.rs/crate/foundation-models/0.9.0
- Capacitor Local LLM (experimental, MIT): https://capacitorjs.com/docs/apis/local-llm
- ML Kit GenAI overview: https://developers.google.com/ml-kit/genai
- ML Kit Prompt API (beta): https://developers.google.com/ml-kit/genai/prompt/android
- ML Kit Speech Recognition (alpha): https://developers.google.com/ml-kit/genai/speech-recognition/android
- Android AppFunctions: https://developer.android.com/ai/appfunctions
- AppFunctions sample (Apache-2.0): https://github.com/android/appfunctions
- Windows AI APIs (2026-10-08): https://learn.microsoft.com/en-us/windows/ai/apis/
- Phi Silica and the Aion transition: https://learn.microsoft.com/en-us/windows/ai/apis/phi-silica
- Windows AI APIs, get started: https://learn.microsoft.com/en-us/windows/ai/apis/get-started
- MCP on Windows: https://learn.microsoft.com/en-us/windows/ai/mcp/overview
- Origin, third-party analysis of ODR (unofficial): https://www.originhq.com/research/msft-odr-mcp
- App Actions on Windows: https://learn.microsoft.com/en-us/windows/ai/app-actions/
- Windows ML GA: https://blogs.windows.com/windowsdeveloper/2025/09/23/windows-ml-is-generally-available
- winapp CLI Tauri guide: https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/guides/tauri
- winapp CLI repo (MIT): https://github.com/microsoft/winappcli
- Edge on-device AI (2026-06-02): https://blogs.windows.com/msedgedev/2026/06/02/expanding-on-device-ai-in-microsoft-edge-new-models-and-apis-for-the-web/
- Chrome built-in AI API status: https://developer.chrome.com/docs/ai/built-in-apis
- Chrome Prompt API (2026-10-21): https://developer.chrome.com/docs/ai/prompt-api
- Chrome Writer API: https://developer.chrome.com/docs/ai/writer-api
- Chrome Proofreader API: https://developer.chrome.com/docs/ai/proofreader-api
- Chrome I/O 2026 built-in AI post: https://developer.chrome.com/blog/build-new-features-using-built-in-ai-in-chrome-io2026
- Rewriter origin trial extension: https://groups.google.com/a/chromium.org/g/blink-dev/c/eLNXoxgx8CU
- Prompt API intent to ship: https://groups.google.com/a/chromium.org/g/blink-dev/c/iR6R7-nQeHI
- Chrome release data: https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Mac&num=1
- WebMCP spec repo: https://github.com/webmachinelearning/webmcp
- WebMCP status: https://patrickbrosset.com/articles/2026-02-23-webmcp-updates-clarifications-and-next-steps/
- MDN, `SpeechRecognition.processLocally`: https://developer.mozilla.org/docs/Web/API/SpeechRecognition/processLocally
- `@browser-ai/core` (Apache-2.0): https://github.com/jakobhoeg/built-in-ai
- Chrome blog, Prompt API with the Vercel AI SDK: https://developer.chrome.com/blog/prompt-api-with-vercel-ai
