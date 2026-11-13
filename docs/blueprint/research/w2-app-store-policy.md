# Distribution policies per platform (wave 2)

Lens: store rules that constrain the architecture. Written 2026-11-10 from primary pages fetched today plus one probe on this M5 (macOS 26.6). It extends `platform-stack.md` (4.2, 4.4.1, no MAS in v1, no Android accessibility) and `everywhere-integrations.md` §8 without repeating them. New here: 2026 enforcement, a measured sandbox result, payments and BYOK, Windows signing, extension consent rules, and the decisions these force.

## TL;DR

- **The Mac App Store is closed to auto-insert in 2026.** It is closed by App Review, not by the sandbox. From February to September 2026 Apple rejected dictation and clipboard apps under 2.4.5 for using Accessibility or `CGEvent.post` to insert text. My probe shows the sandbox blocks AX reads of other apps (`-25204`) but lets posted events through (15/15). A **MAS "Lite" edition** (Carbon hotkey, then copy, then the user presses ⌘V) is viable. A full edition is not.
- **Remote data yes, remote logic no, on every store.** Chrome's MV3 rules also ban "an interpreter to run complex commands fetched … as data". Apple's new 2.5.19 bans dormant features. So capability differences must be fixed **at build time per channel**, never by remote flags.
- **Payments must be storefront-aware.** In the US, iOS apps may link out with no entitlement, and Google Play allows alternative billing (fees started 2026-10-01). Elsewhere, digital subscriptions need IAP or Play Billing. **BYOK is risky on iOS** (a 3.1.1 precedent). On the Microsoft Store it needs a **company account**: 10.8.3 counts "API secret keys" as financial information.
- **"Report this output" is now mandatory on most stores.** Apple 1.2 (2026-10-16) names "AI content creation apps". Play's AI-Generated Content policy and Microsoft 11.16 also require in-app reporting.
- **Decision:** Option C, **channel profiles**. One codebase compiles a different set of capabilities and paywall rules per store: direct-first desktop, store-first mobile and extensions, and a MAS Lite edition only if demand data justifies it.

## 1. What changed since wave 1's sources

| Date | Change | Effect on PromptAI |
|---|---|---|
| Feb–Sep 2026 | Apple rejects apps that use Accessibility for text insertion under 2.4.5. Whisper Notes left the MAS in March. WhisperPad was rejected in April and split into a store edition and a full edition. A clipboard manager was rejected twice over `CGEvent.post`, and DTS declined to rule ([Whisper Notes](https://whispernotes.app/blog/why-whisper-notes-left-mac-app-store), [Tsai](https://mjtsai.com/blog/2026/06/03/whisperpad-rejected-from-the-mac-app-store/), [forum 820594](https://developer.apple.com/forums/thread/820594)) | A store build cannot auto-paste. Spokenly's MAS edition already works this way: the user presses ⌘V ([Spokenly](https://spokenly.app/docs/mac-app-store)) |
| 2026-06-08 | DPLA adds §3.3.11 (AI/ML, Foundation Models) and developer-identity duties (§3.1, §14.8) ([Apple](https://developer.apple.com/news/?id=a233fmpw)) | Organization enrollment, export-compliance answers |
| 2026-10-16 | Guideline 1.2 now covers "AI content creation apps". 2.5.19 is new: no "hidden, dormant, or undocumented features". 3.1.1(a): link-out destinations must be "permitted" ([Apple](https://developer.apple.com/news/?id=92th7e5i)) | Filtering, reporting and contact info are needed on every surface. No remotely unlocked capabilities |
| Dec 2025 → 2026 | Epic v. Apple: the Ninth Circuit allows a "reasonable" commission on US link-outs, now on remand. Apple reportedly was not charging one as of May 2026, and the Supreme Court took the contempt question on 2026-06-30 (secondary: [iClarified](https://www.iclarified.com/99335/appeals-court-reverses-zero-commission-ban-on-apple-says-27-fee-is-too-high), [MacRumors](https://www.macrumors.com/2026/06/11/apple-fights-back-against-epic/)) | US web checkout is allowed today, but the fee could change |
| 2026-10-01 | EU single business terms: 5% CTC off-store, reportedly 26% for IAP and 15% for link-out (secondary: [iClarified](https://www.iclarified.com/101814/apple-revises-eu-app-store-terms-replaces-core-technology-fee-with-5-commission)) | One more storefront rule |
| 2026-07-15 | Play: the User Data policy "also applies to third-party AI integrations". Developer verification registration is now required ([Play](https://support.google.com/googleplay/android-developer/answer/17134731)) | The Data safety form must name the LLM and ASR vendors |
| 2026-09-30 | Android developer verification is enforced in Brazil, Indonesia, Singapore and Thailand, and goes global in 2027 ([Android](https://developer.android.com/developer-verification)) | Sideloaded APKs also need a verified identity |
| 2026-10-01 | Play US external links and alternative billing: fees and reporting begin (external links get until 2027-02-01) ([Play](https://support.google.com/googleplay/android-developer/answer/15582165)) | US Android users can pay on the web |
| 2026 | Android 17 Advanced Protection revokes accessibility access from apps that are not accessibility tools ([THN](https://thehackernews.com/2026/03/android-17-blocks-non-accessibility.html)) | Confirms "never AccessibilityService" |
| 2025-11-03 | AMO: new extensions must declare `data_collection_permissions`. Mozilla's policies are updated again on 2026-12-01 ([AMO policies](https://extensionworkshop.com/documentation/publish/add-on-policies/), [consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)) | Declare what the extension collects in the manifest |
| 2025-09 | Microsoft Store registration is free for individuals. Non-game apps may use their own commerce and keep 100% ([Windows blog](https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/)) | Cheap extra listing |

## 2. Hands-on evidence: a macOS sandbox probe

Code and raw output: `blueprint-work/spikes/macos-sandbox-probe/` (`run.sh`, `results-2026-11-10.txt`). The probe builds one Swift binary twice: once plain (as with Developer ID) and once ad-hoc signed with `com.apple.security.app-sandbox` inside an app bundle. Each run was repeated three times and the results were identical every time.

| Building block | Unsandboxed | Sandboxed |
|---|---|---|
| Carbon `RegisterEventHotKey` (ctrl+opt+cmd+F19), Pressed+Released handler | OK | **OK** (no TCC prompt is needed) |
| `CGPreflightPostEventAccess` / `ListenEventAccess` | true / true | true / true |
| `AXIsProcessTrusted` | true | true |
| AX read of the system-wide focused element | `0` (success) | **`-25204` (cannot complete)** |
| Listen-only `CGEventTap` | created | created |
| 5 `mouseMoved` events posted with a marker; seen by a session tap | 5/5 ×3 | **5/5 ×3** |
| Write to a private named pasteboard | OK | OK |

**Reading the result.** The sandbox blocks the Accessibility privilege, which is rung 1 of the blueprint's insertion ladder, "set value". It does not block posting events (rung 2, "paste"). This matches DTS: the Accessibility privilege is "not compatible with the App Sandbox", while PostEvent and ListenEvent "are". The MAS barrier on paste is therefore App Review policy. The guideline text behind it is 2.5.1, "Apps should use APIs and frameworks for their intended purposes", even though reviewers cite 2.4.5.

The blueprint's line "CGEvent paste conflicts with the sandbox" reaches the right conclusion for the wrong reason. Hold-to-talk is sandbox-safe: Tauri's `global-hotkey` crate (Apache-2.0, pushed 2026-11-09) uses `RegisterEventHotKey` with `kEventHotKeyReleased`. It uses an event tap only for media keys, and an Fn-key trigger would need Input Monitoring.

**Caveats.** TCC grants were inherited from the host process; the build was ad-hoc signed, not App Store-installed; I posted mouse events, not key events, to avoid typing into the user's apps. Four empty, OS-protected `~/Library/Containers/com.example.promptai.*` folders remain.

Related: the 26.5 SDK header says the general pasteboard defaults to "ask upon programmatic access" (`NSPasteboard.accessBehavior`, macOS 15.4+), but reports say the alert is still opt-in on macOS 26 (*unverified*; [Tsai](https://mjtsai.com/blog/2025/05/12/pasteboard-privacy-preview-in-macos-15-4)). Once enforced, clipboard restore raises alerts.

## 3. Policy matrix

### 3a. Apps

| Surface | Insert / hotkey | Mic / ASR | Data and AI disclosure | Payments / BYOK | Updates / remote code | Verdict |
|---|---|---|---|---|---|---|
| **macOS direct** (Developer ID + notarized) | Full ladder: AX, then paste, then copy. User grants Accessibility | Purpose string, visible indicator (2.5.14 practice) | Own privacy policy; per-vendor AI consent recommended | Own web billing; BYOK fine | Own updater (Tauri) | **MVP primary** |
| **Mac App Store** | Carbon hotkey OK. AX blocked by the sandbox. Paste rejected under 2.4.5/2.5.1. **Copy, then the user presses ⌘V** | Sandbox `audio-input` entitlement | 5.1.2(i): "explicit permission" before sharing personal data with third-party AI | IAP outside the US. 2.4.5(vi): no license keys. BYOK carries the 3.1.1 risk | 2.4.5(vii): MAS updates only. 2.5.19 applies | **Lite edition, optional v1.x** |
| **Windows direct** (signed EXE/MSI + winget) | SendInput paste; UIA. 10.2.8's ban on "accessibility APIs" covers changing Windows settings, not insertion | Standard | Privacy policy | Own billing; BYOK fine | Own updater. winget wants an HTTPS URL on the publisher's own domain, a silent installer, and a Defender-clean build ([winget](https://learn.microsoft.com/en-us/windows/package-manager/package/repository)) | **MVP** |
| **Microsoft Store** (EXE/MSI listing) | Same binary | Standard | 10.5.1 privacy policy. **11.16: disclose live generative AI and offer a report mechanism** | Non-game apps may use their own commerce. **10.8.3: "API secret keys" are financial information, so BYOK needs a company account** | 10.2.9: signed installer from a versioned URL; own updater allowed. 10.2.2: no dynamic code that changes functionality | **v1, cheap listing** |
| **iOS App Store** (app + share extension + App Intents) | Share sheet return; App Intents | Main app records during a session the user starts | 5.1.2(i) consent; privacy labels; 5.1.1(v) in-app account deletion; 1.2 report/filter/contact | US: link-out with no entitlement. Elsewhere: IAP. 3.1.3(b) multiplatform access only if the same items are also sold as IAP | DPLA 3.3.1(B): interpreted code may not change the app's "primary purpose". 2.5.2 | **v1** |
| **iOS keyboard extension** | `insertText`. 4.4.1: must work "without full network access" and must not "Launch other apps besides Settings" | None in the extension (Apple guide); hand off to the app (gray zone; Wispr ships it) | **DPLA 3.3.7(E): keystroke data "may be used only for … the keyboard functionality"**, disclosed before it leaves the device | **No IAP inside the keyboard** (DPLA Att. 2) | Same as the app | **Last** |
| **Google Play** (app, PROCESS_TEXT, share, QS tile; IME later) | IME `commitText`; PROCESS_TEXT. AccessibilityService excluded (assistants and automation "not" accessibility tools; autonomy "strictly prohibited") | Microphone foreground service cannot be *created* from the background; the current IME is exempt from the background-start limit ([Android](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)) | Data safety: audio and user content declared even when processed ephemerally; prominent disclosure for unexpected use; account deletion in-app and on the web; AI-generated content flagging | US: alternative billing or links possible. Elsewhere: Play Billing | Executable code only from Play; the JavaScript-in-WebView interpreter is exempt ([Play](https://support.google.com/googleplay/android-developer/answer/9888379)) | **v1** |
| **Android sideload** | Same | Same | Same | Own billing | Developer verification goes global in 2027 | Not worth it before 2027 |

### 3b. Browser extensions

| Store | Remote code | Data | Mic | Verdict |
|---|---|---|---|---|
| **Chrome Web Store** | Logic must be in the package. Remote config for feature flags is OK. Banned: "an interpreter to run complex commands fetched from a remote source, even if … fetched as data" ([MV3 rules](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)) | Single purpose. Browsing activity only for a prominently disclosed user-facing feature. Limited Use statement. No human reading without consent ([policies](https://developer.chrome.com/docs/webstore/program-policies/policies)) | Offscreen `USER_MEDIA`; the offscreen document cannot show the permission prompt, so grant once from an extension page (forum evidence) | **MVP** |
| **Edge Add-ons** | MV3; no remotely hosted code ([Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/developer-guide/manifest-v3)) | Privacy policy | Same as Chrome | **MVP**, same zip |
| **Firefox AMO** | 4.2: self-contained; source and build steps for bundled code (3.1) | **6.2.2.2 implicit consent covers only "the content element the user acted upon"**; anything else needs explicit opt-in. Declare `data_collection_permissions` | Background page; *unverified* | **MVP** |
| **Safari** | 4.4.2 | — | — | Later: notarized Developer ID Safari extensions work since Safari 18.4 ([Apple](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)), but the extension needs an Xcode-built app extension and this machine has no Xcode |

## 4. Options

**A. Store-first everywhere** (MAS, Microsoft Store, App Store, Play, CWS, AMO). Discovery and trust; free Store re-signing for MSIX, which Tauri does not emit ([Tauri](https://v2.tauri.app/distribute/microsoft-store/)). On the Mac it kills the wedge (no auto-insert); updates wait for review; IAP takes 15–30% (*not re-verified today*).

**B. Direct-first desktop; stores for mobile and extensions** (current blueprint). Full insertion, own updater. Costs: weeks of SmartScreen warnings even with EV ([Microsoft](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)), location-dependent signing, no Mac store discovery.

**C. Channel profiles (non-obvious).** B plus a build-time `channel` manifest (`direct-mac`, `mas-lite`, `direct-win`, `msstore`, `appstore`, `play`, `cws`, `amo`) that compiles in only the capabilities, paywall rules, consent copy and disclosures each store allows. MAS Lite and the Microsoft Store become extra builds, not forks.

**D. No native store apps** (web, PWA, extensions, MCP Apps in AI clients). Least review exposure, but it loses dictation anywhere, and the ChatGPT directory bans selling digital goods (`everywhere-integrations.md`).

| | Reach | Wedge kept | Review risk | Ops (1–3 engineers) | Revenue share kept |
|---|---|---|---|---|---|
| A | High | **No** (Mac) | High | Medium | Low |
| B | Medium | Yes | Medium | Medium | High |
| **C** | **High** | **Yes** | **Low per build** | Medium+ (one manifest, CI matrix) | High |
| D | Low | No | Lowest | Low | High |

**Recommendation: C.** It keeps B's capability and adds A's reach cheaply, because `PlatformPort.caps` already models capabilities; the manifest just fixes them at build time. MVP: direct macOS and Windows plus the three extension stores. v1: App Store, Play, and a Microsoft Store listing of the same signed installer. MAS Lite only if store-referral demand appears; the iOS keyboard last.

## 5. Architecture decisions this forces

1. **`channel` is a build input, not a runtime flag.** `PlatformPort.caps` comes from `channels/<id>.yaml` at compile time, and CI fails if a binary contains code paths its channel forbids (for example, no AX or `CGEvent` symbols in `mas-lite`). Reasons: Apple 2.5.19 (dormant features), 2.5.2, DPLA 3.3.1(B) and Microsoft 10.2.2.
2. **The insertion ladder differs per channel.**
   - `direct-mac`: AX set-value, then paste with clipboard restore, then copy. Skip the restore when `accessBehavior` is `.ask` or `.alwaysDeny`.
   - `mas-lite`: copy, a toast, and the user presses ⌘V.
   - Windows: SendInput, then copy.
   - iOS: share-sheet return or keyboard `insertText`.
   - Android: IME `commitText` or the PROCESS_TEXT result.
   - Extension: a content script, only on a user action. Never auto-submit (unchanged).
3. **Send remote data, never remote logic.** The adapter feed is declarative: selectors plus a *closed enum* of insertion strategies implemented in the package. Tool Cards are prompt data, and policy bundles are numbers. No DSL, no rule engine, no `eval`. The CWS "interpreter" clause is the strictest of these rules, and it binds the whole family. Mobile live updates may ship fixes, never features.
4. **One consent ledger, one origin tag.** Every event carries `origin` (`desktop|ext|ios_app|ios_keyboard|android_ime|…`) and its granted purposes. The purposes and the rules behind them:
   - `send_acted_element`: implicit; AMO 6.2.2.2.
   - `read_page_context`: explicit opt-in; AMO and CWS Limited Use.
   - `cloud_asr` and each third-party LLM vendor: explicit, once per vendor; Apple 5.1.2(i), Play July 2026.
   - `learning_from_use`.
   - Keyboard-origin text is purpose-limited by DPLA 3.3.7(E), so it is excluded from cohort priors and the population lexicon by default.

   This reuses the blueprint's data classes and `data-map.yaml`. The Data safety form, App Privacy labels, CWS disclosures and the AMO manifest are all generated from that file.
5. **Entitlements live server-side; each storefront gets its own paywall.** Web checkout through a merchant of record is the source of truth; RevenueCat (`purchases-capacitor`, MIT, active) maps IAP and Play Billing onto it.
   - iOS US: link out. Other iOS storefronts: IAP. The EU follows its own terms.
   - Play US: alternative billing. Elsewhere: Play Billing.
   - Microsoft Store and extensions: web billing.
   - Never sell inside the keyboard extension (DPLA Att. 2).
6. **BYOK only on desktop and web.** Keys stay in the OS keychain. On iOS and Android, ship no BYOK until IAP sells every feature a key would unlock (the 3.1.1 precedent, [forum 763884](https://developer.apple.com/forums/thread/763884)). On the Microsoft Store, BYOK needs a company account (10.8.3).
7. **"Report this output" plus published contact info on every generated artifact.** This covers Apple 1.2, Play's AI-Generated Content policy and Microsoft 11.16. Reports feed the existing Tier 0/1 safety review.
8. **Microphone rules.**
   - The user always starts recording explicitly, with a visible indicator (Apple 2.5.14).
   - Android starts the microphone foreground service only from visible UI or the IME.
   - The extension grants the mic once on an extension page, then records in the offscreen document.
   - Before the first cloud ASR stream, show the vendor consent from decision 4.
9. **Identity first.** Enroll as an organization with Apple and Google; organization accounts reportedly skip Play's 12-testers-for-14-days gate for new personal accounts ([Play](https://support.google.com/googleplay/android-developer/answer/14151465)). Use a Microsoft company account (decision 6). Plan for public EU DSA trader contact details ([9to5Mac](https://9to5mac.com/2025/02/18/apple-trader-information-app-store/)). Register the Android package name and signing key now.
10. **Windows signing depends on where the company is registered.** Azure Artifact Signing is open to organizations in the US, Canada, EU and UK, and to individuals only in the US and Canada. If the entity is in India (an assumption), use an OV certificate with a cloud HSM (about $150–300 a year), or SignPath Foundation if PromptAI is open source. Expect weeks of SmartScreen reputation warm-up either way.
11. **Account deletion in the app and on the web** (Apple 5.1.1(v); Play User Data).
12. **Keep age gating separate from learning.** An `AgeGate` port reads Declared Age Range on iOS and Play Age Signals on Android. Play forbids using Age Signals data for "personalization", so it never enters the learning store. Rated 18+ at launch (blueprint row 22).
13. **Policy freshness is a job.** The weekly triage also polls Apple developer news, Play policy announcements, the AMO blog and the Microsoft Store policy page (v7.20, 2026-09-14), and names the channel manifests a change affects.

## Risks

- App Review is inconsistent (THOHT approved; Type for Mac frozen, unable to update). A rejected update can strand a MAS edition, so the direct build ships first.
- The iOS keyboard's hand-off to the app breaks the letter of 4.4.1; it is tolerated only in practice.
- The US link-out commission may return after remand or the Supreme Court. EU rates are secondary-sourced.
- Android verification's global scope and ADB exemption are unsettled; Texas SB 2420 is contested (*unverified*).
- Pasteboard-privacy enforcement would add alerts to clipboard restore.
- The probe caveats in §2 apply; the offscreen-mic workaround rests on forum reports; Mozilla's 2026-12-01 revision is unpublished.

## Sources

- Apple App Review Guidelines (2.4.5, 2.5.1, 2.5.2, 2.5.14, 2.5.19, 1.2, 3.1.1(a), 3.1.3, 4.4.1, 5.1.1, 5.1.2): https://developer.apple.com/app-store/review/guidelines/
- Apple guideline changes: https://developer.apple.com/news/?id=92th7e5i · https://developer.apple.com/news/?id=a233fmpw
- Apple DPLA (3.3.1(B), 3.3.7(E), Attachment 2, 3.3.11): https://developer.apple.com/support/terms/apple-developer-program-license-agreement/
- Apple Custom Keyboard guide: https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/CustomKeyboard.html
- DTS on sandbox and TCC: https://developer.apple.com/forums/thread/820594 · BYOK: https://developer.apple.com/forums/thread/763884
- MAS rejections: https://whispernotes.app/blog/why-whisper-notes-left-mac-app-store · https://mjtsai.com/blog/2026/06/03/whisperpad-rejected-from-the-mac-app-store/ · https://spokenly.app/docs/mac-app-store
- Wispr keyboard: https://docs.wisprflow.ai/articles/7453988911-Set-up-the-Flow-keyboard-on-iPhone
- Epic v. Apple: https://www.iclarified.com/99335/appeals-court-reverses-zero-commission-ban-on-apple-says-27-fee-is-too-high · https://www.macrumors.com/2026/06/11/apple-fights-back-against-epic/
- EU terms: https://www.iclarified.com/101814/apple-revises-eu-app-store-terms-replaces-core-technology-fee-with-5-commission
- Safari extensions: https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension
- Pasteboard privacy: https://mjtsai.com/blog/2025/05/12/pasteboard-privacy-preview-in-macos-15-4
- Play Accessibility API: https://support.google.com/googleplay/android-developer/answer/10964491
- Play sensitive permissions (AppFunctions 2027-04-14, Age Signals): https://support.google.com/googleplay/android-developer/answer/16585319
- Play AI-Generated Content: https://support.google.com/googleplay/android-developer/answer/13985936
- Play Data safety: https://support.google.com/googleplay/android-developer/answer/10787469 · User Data: https://support.google.com/googleplay/android-developer/answer/10144311
- Play Device and Network Abuse: https://support.google.com/googleplay/android-developer/answer/9888379
- Play US programs: https://support.google.com/googleplay/android-developer/answer/15582165
- Play 2026-07-15 announcement: https://support.google.com/googleplay/android-developer/answer/17134731
- Play testing requirement: https://support.google.com/googleplay/android-developer/answer/14151465
- Android developer verification: https://developer.android.com/developer-verification
- Android FGS background start: https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start
- Android 17 AAPM: https://thehackernews.com/2026/03/android-17-blocks-non-accessibility.html
- Microsoft Store Policies 7.20: https://learn.microsoft.com/en-us/windows/apps/publish/store-policies
- Windows code signing: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
- winget submission: https://learn.microsoft.com/en-us/windows/package-manager/package/repository
- Microsoft Store free registration: https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/
- Tauri Microsoft Store: https://v2.tauri.app/distribute/microsoft-store/ · MAS: https://v2.tauri.app/distribute/app-store/
- Chrome MV3 rules: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements · policies: https://developer.chrome.com/docs/webstore/program-policies/policies · offscreen: https://developer.chrome.com/docs/extensions/reference/api/offscreen
- Offscreen mic prompt: https://groups.google.com/a/chromium.org/g/chromium-extensions/c/V09VMCLzvWM
- Edge MV3: https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/developer-guide/manifest-v3
- Mozilla Add-on Policies: https://extensionworkshop.com/documentation/publish/add-on-policies/ · built-in consent: https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- EU DSA trader status: https://9to5mac.com/2025/02/18/apple-trader-information-app-store/
- GitHub (`gh api`, 2026-11-10): tauri-apps/global-hotkey Apache-2.0, 267★, pushed 2026-11-09; florisboard/florisboard Apache-2.0, 8.8k★; wxt-dev/wxt MIT, 10.7k★; cjpais/Handy MIT, 38.3k★; RevenueCat/purchases-capacitor MIT, 233★; Cap-go/capacitor-updater MPL-2.0, 886★; KeyboardKit NOASSERTION; microsoft/winget-create MIT.
