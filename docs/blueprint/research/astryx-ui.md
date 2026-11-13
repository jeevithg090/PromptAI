# Astryx design system adoption

Research lens for the PromptAI rebuild. Checked 2026-11-10 against npm, GitHub, the live MCP endpoint and a scratch install of `@astryxdesign/cli@0.7.12`. Unchecked claims are marked unverified.

## Bottom line

Build one React 19 single-page app on Astryx and run that same bundle in every shell: the browser, Tauri 2 on desktop, Capacitor 8 on iOS and Android. Use the prebuilt CSS path with Tailwind v4, and don't run a StyleX compiler. Make one brand theme ("forge") that extends `theme-neutral`, tuned for touch through theme `adaptations`. About 70% of what PromptAI needs exists as Astryx templates and components. We build four things ourselves: a dictation engine adapter, a live waveform, a word-level prompt diff, and the composer's typed-part nodes. Keep native code to OS-integration slivers only. `@astryxdesign/native` is canary-only and not usable yet.

## 1. What Astryx is today (verified inventory)

| Fact | Value | How checked |
|---|---|---|
| Latest stable | `@astryxdesign/core`, `cli`, `richtext`, `build`, `theme-*` all at **0.7.12** (2026-11-10) | `npm view` |
| Release cadence | 48 stable releases since 2026-06-24, 20 of them between Sep 1 and Nov 10 | `npm view … time` |
| Peers | `react`/`react-dom` >=19, `@stylexjs/stylex` ^0.19.0 (latest 0.19.1). CLI needs Node >=22.13 | package.json, `astryx doctor` |
| Components | **178** exports, including a full Chat family (`ChatComposer`, `ChatComposerInput`, `ChatDictationButton`, `ChatMessageList`, `ChatToolCalls`, `ChatTokenizedText`), `CommandPalette`, `BottomSheet`, `MobileNav`, `RichTextEditor`, `Stepper`, `Tokenizer`, `Citation`, `Timer`, `CodeBlock` | `component --list` |
| Templates | 61 page templates (ai-chat, ai-chat-landing, editor, ide, settings ×3, wizards ×5, tables ×8, dashboards ×7, login ×4) plus hundreds of block templates | `template --list` |
| Hooks | ~60, including `useAnnounce`, `useHotkeys`, `useLongPress`, `useStreamingText`, `useAppShellMobile`, `useDragToSnapPoints`, `usePressFeedback` | `hook` |
| Themes | 7 (neutral, stone, butter, chocolate, gothic, matcha, y2k). **Only neutral is marked maintained** | `theme list` |
| CSS weight | `astryx.css` is 281 KB raw, 44 KB gzipped, loaded whole | measured |
| Licence and activity | `meta/astryx`: MIT, 22.2k stars, pushed 2026-11-10, not archived | `gh api` |
| Agent tooling | `https://astryx.atmeta.com/mcp` answers MCP `initialize` (serverInfo `astryx` 2.0.0); `init` writes AGENTS.md/CLAUDE.md; `docs is-my-code-good` is a review loop | curl, CLI |
| Placeholders | `@astryxdesign/charts` and `@astryxdesign/vega` are name-claim placeholders ("Do not install") | `npm search` |
| Native | `@astryxdesign/native@0.7.13-canary.9993f4c`: contracts for 12 components, SwiftUI views for 6 (Text, Heading, Button, TextInput, Card, Banner), no React Native or Android binding | repo README |

**Browser floor.** This sets the floor for every shell. Tier 1 is Chrome/Edge 125+, Safari 26+ and Firefox 147+, with full fidelity. Tier 2 is Chrome 114+, Safari 17+ and Firefox 125+. In Tier 2 every component works, but menus, tooltips and popovers can't use CSS anchor positioning, so they may not sit next to their trigger. Below Tier 2, `light-dark()` is missing and theme colours can fall back to defaults (`docs browser-support`). Caniuse lists Safari and iOS 26.0–26.6 as "partial" for anchor positioning and 27.0 as full.

## 2. Options compared

| | A. One Astryx SPA in every shell | B. Expo universal app with Astryx in DOM components | C. Native per platform | D. PWA first, native slivers later |
|---|---|---|---|---|
| How | Vite SPA → browser, Tauri 2 (desktop), Capacitor 8 (mobile) | RN shell + Expo UI (SwiftUI/Compose, stable since SDK 56); Astryx only inside `'use dom'` islands | Astryx web + SwiftUI/Compose apps, maybe `@astryxdesign/native` | Installable web app; add Capacitor and native extensions only when a feature needs them |
| Astryx coverage | 100% of screens | Only islands; RN shell needs a second design system | Web only; native would be hand-themed | 100% |
| Fit with Astryx | High: it is what Astryx targets | Poor. Islands take only serialisable props, no `children`, async bridge, slower JS start (Expo docs). Each island is its own WebView, so Astryx menus and popovers are clipped to the island (my inference, not documented) | Native package is canary and "nothing here is supported for production" | High |
| Team cost (1–3 people) | One UI codebase | Two UI systems | Three UI codebases | Lowest at first |
| OS reach | Mic, hotkeys, share, keyboard through shell plugins | Best native feel | Best | No iOS keyboard or share extension, weaker background audio |

**Decision: A, sequenced the way D suggests.** Ship the SPA as a PWA first. Wrap it in Capacitor once the native-only features justify app-store builds: an iOS share extension, a keyboard or dictation extension, and native speech. Wrap it in Tauri for desktop hotkey capture. B makes sense only if a later product decision wants native-first navigation. C stays off the table until `@astryxdesign/native` ships a stable release.

**Desktop shell, seen from Astryx.** Electron bundles Chromium (current 45.2.3), so it always gets Tier 1. Tauri uses WebView2 on Windows, which is evergreen Chromium, so that is fine. On macOS it uses the OS WKWebView: macOS 26 is partial, 27 is full. On Linux it uses the distro's WebKitGTK. Tauri's own table lists Ubuntu 22.04 at WebKitGTK 2.36, roughly Safari 16, which is **below Astryx's Tier 2**, so theme colours can break. Recommendation: use Tauri 2 (CLI 2.12.4) with a startup gate that checks `light-dark()`, the Popover API and `anchor-name`, and offers the browser build if any are missing. If Linux becomes a priority, build that target with Electron rather than polyfilling WebKitGTK.

## 3. Screen map

Scaffold a template with `npx @astryxdesign/cli template <id> --type page <path>`. Scaffolding copies the code into our repo, and from then on it is ours to maintain, so scaffold only what we use. The `table-filter` and `dashboard-scorecard` templates call `stylex.create`. Rewrite those few layout styles as Tailwind classes rather than adding a compiler.

| PromptAI screen | Start from | Core components | We build |
|---|---|---|---|
| Home / capture | `ai-chat-landing` inside `shell-side-nav` | `ChatComposer` + `ChatComposerInput` (triggers, inline tokens, dictation insertion, file intake), `Token` for detected tool and context, `ToggleButtonGroup` suggestions, `CommandPalette` (⌘K), `MobileNav` | Intent chips fed by the predictor |
| Live dictation | block `ChatDictationDictationInComposer`; full-screen mode in `BottomSheet height="tall"` | `ChatDictationButton` (visual only), `Timer`, `useLongPress` (push-to-talk), `useAnnounce`, `Banner` for mic errors | **Dictation adapter** and **LiveWaveform** (section 4) |
| Intent clarification | `form-wizard-inline`: the active step expands and finished steps collapse to one line | `RadioList`, `CheckboxList`, `SelectableCard`, `TextArea`, `Stepper`; on mobile, one `BottomSheet` per question with replace handoff | Nothing; questions arrive as data |
| Prompt composer (editable parts) | `editor` (palette / canvas / inspector) | `RichTextEditor` from `@astryxdesign/richtext` (Lexical; `nodes` and `plugins` props), `CollapsibleGroup`, `InfoTip` ("why this part exists"), `ProgressBar` rubric rows, `CodeBlock` export, `useClipboard`, `Toolbar` | **Typed-part Lexical nodes** (role, context, constraints, format…), **PromptDiff** |
| Agent progress ("pipeline theatre") | nested self-running stepper from `form-wizard-inline` | `Stepper`, `Spinner`, `ChatToolCalls`, `useStreamingText` | Nothing |
| Tool coach | `ai-chat` (transcript + resizable artifact panel) | `ChatMessageList`, `Markdown`, `Citation` (retrieved docs), `CodeBlock`, `Collapsible` checklists, `HoverCard` | Lesson content |
| Library | `table-filter` for my prompts; `library` card grid for curated packs | `PowerSearch`, `Tokenizer` filters, `TabList`, `EmptyState`, `Pagination`, `Thumbnail` | Saved-view persistence |
| History | `shell-side-nav` rail + `table-grouped` (grouped by day) | `List`/`Item`, `Timestamp`, `MoreMenu`, `TableSelectionToolbar` | Semantic search wiring |
| Insights / skill profile | `dashboard-scorecard` (scorecard + prose rail) | `ProgressBar`, `MetadataList`, data tokens; charts in **recharts 3.10.1**, as the Astryx templates do | Only real, measured figures (section 8) |
| Settings and memory | `settings-sidebar` on desktop, `settings` (single scroll) on phones, `settings-dialog` for quick preferences | `Switch` per learning signal, `Table` of memories with bulk "forget", `AlertDialog` (block `AlertDialogDeleteConfirmation`), `useToast` with undo, `SegmentedControl` for light/dark/system | Memory export |
| Onboarding | `form-wizard-dialog` (2–4 steps) | `SelectableCard` (role), `MultiSelector`/`Typeahead` (tools used), `Stepper`, `useSnapPaging` on touch | Mic permission explainer copy |
| Auth / admin | `login-card`, `login-sso`; admin on `table-filter`, `dashboard-alert-rail` | as the templates use | — |

## 4. What Astryx lacks, and how to build it small

1. **Dictation engine adapter.** `ChatDictationButton` takes a `dictation` object (`isSupported, isListening, isSpeaking, volume, bands[], interimTranscript, start/stop/abort/toggle`). Astryx's own `useSpeechRecognition` fills it from the Web Speech API. That API is not reliable inside our shells. WebKit bug 239816 reports `webkitSpeechRecognition` exposed but non-functional in WKWebView, so feature detection lies. Android WebView hides or breaks it, and those sources are old, so current status is unverified. Write `useForgeDictation()` returning the same shape, backed by our own STT path: the existing MediaRecorder → Whisper flow in `web/src/lib/useDictation.ts`, or a native plugin under Capacitor. Compute `volume` and `bands` from an `AnalyserNode` on the same `MediaStream`. We keep Astryx's button and its interim ghost text and own the accuracy.
2. **LiveWaveform.** A canvas of about 100 lines driven by the same analyser. It is `aria-hidden`, reads colours from tokens through `getComputedStyle`, and falls back to a static level bar under `prefers-reduced-motion`. Add wavesurfer.js 8.0.5 (BSD-3) only if we ever add playback and scrubbing of saved audio.
3. **PromptDiff.** Use jsdiff (`diff@9.0.0`, BSD-3) `diffWordsWithSpace` and render `<ins>`/`<del>` with `--color-syntax-added` and `--color-syntax-removed`. Add visually hidden "added"/"removed" labels for screen readers, and an inline/side-by-side `SegmentedControl`. For line-level diffs, `CodeBlock isDiff` already renders unified patches from `createTwoFilesPatch`. Don't use `diff-match-patch`: it is archived.
4. **Typed-part composer nodes.** Lexical `ElementNode`s registered through `RichTextEditor nodes={…}`, and the same list passed to `RichTextView`. Pin Lexical to **0.52.0**: richtext 0.7.12 declares peers `^0.52.0` while npm latest is 0.53.0.
5. **Anchor-positioning fallback** for Tier 2 WebViews (iOS 17–18, older macOS): `if (!CSS.supports('anchor-name','--x')) await import('@oddbird/css-anchor-positioning')` (0.10.2, BSD-3). Its README warns it may not cover every fallback feature, so QA menus on iOS 18.

## 5. Brand theme and dark mode

Keep the FORGE intent (ember on warm paper, no purple) but move it into Astryx tokens.

```bash
# seeds = today's ember-600 and stone-500
echo '{"families":[{"id":"ember","seed":"#d9480f"},{"id":"paper","seed":"#7c7568"}]}' > palette.config.json
npx @astryxdesign/cli theme palette generate palette.config.json \
  --out src/themes/forge/tokens/forge.palette.ts --preview preview.html
# write src/themes/forge/forgeTheme.ts + forgeTheme.doc.mjs (type:'theme', name:'forge')
npx @astryxdesign/cli theme build src/themes/forge/forgeTheme.ts
npx @astryxdesign/cli theme add forge
```

I ran the generate step: it produces 21 OKLCH stops for light and dark (`astryx-oklch-v1`). In `forgeTheme.ts`, call `defineTheme({name:'forge', extends: neutralTheme, tokens:{…palette refs as [light, dark] tuples…}, adaptations:{rules:[{when:{pointer:'coarse'}, value:{tokens:{'--size-element-sm':'36px','--size-element-md':'44px','--size-element-lg':'48px'}}}]}})`. Default control heights are 28/32/36 px, and only some components raise themselves to 44 px under `pointer: coarse`. Without the adaptation, touch targets fall short of Apple's 44 pt guideline.

**Fix contrast while porting.** My computed WCAG ratios: white on today's primary `#d9480f` is **4.30:1**, ember text on paper is 3.98:1, and `stone-500` on paper is 4.23:1. All three fail AA for body-size text. `#b23809` (ember-700) gives 6.06:1. Set the accent as a `[light, dark]` tuple: the docs warn that overriding `--color-accent` alone leaves `--color-on-accent` baked from the seed.

**Dark mode.** `<Theme theme={themes[defaultThemeSlug]} mode="system">`, with a light/dark/system preference stored in settings. Tuples compile to `light-dark()`. Use the **built** theme (`theme add`) and not a runtime theme, because runtime themes flash overrides on hydration. Set `color-scheme` on `<html>` before React mounts so the static SPA doesn't flash.

## 6. CSS setup per host

**Vite (recommended app host).** Mirrors `apps/example-vite-tailwind`:

```bash
npm i -E @astryxdesign/core@0.7.12 @astryxdesign/theme-neutral@0.7.12 @astryxdesign/richtext@0.7.12 \
  @stylexjs/stylex@0.19.1 react@19.3.1 react-dom@19.3.1 @heroicons/react@2.2.0 lexical@0.52.0 @lexical/react@0.52.0
npm i -D -E @astryxdesign/cli@0.7.12 vite@8.3.7 @vitejs/plugin-react@6.3.0 tailwindcss@4.3.5 @tailwindcss/vite@4.3.5
npx @astryxdesign/cli init --all
```

```css
/* src/index.css, imported FIRST in main.tsx */
@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/preflight.css" layer(base);
@import "@astryxdesign/core/reset.css";
@import "@astryxdesign/core/astryx.css";
@import "@astryxdesign/richtext/richtext.css";
@import "@astryxdesign/core/tailwind-theme.css";   /* text-primary, bg-surface → tokens */
@import "tailwindcss/utilities.css" layer(utilities);
```

The `@layer` line must load before any theme module import, or Astryx's reset silently outranks every utility class. The generated `astryx-themes` module imports the theme CSS.

**Next.js 16 (only if marketing or SEO pages stay on it).** For the existing app, use the smaller recipe: put the `@layer` line *above* `@import "tailwindcss"`, add the Astryx sheets below it, and leave out `tailwind-theme.css`. The bridge remaps `rounded-lg` and `shadow-md` and would repaint today's classes. Rename the one colliding token, `--color-accent`, which is defined in both. Why move the app off Next: it is a fully client-rendered static export, which forced query-param routes (`/prompts/view`, `/share/view`), and Turbopack places swizzled copies above `astryx-theme`, out of reach of theme overrides.

**Tauri 2 / Capacitor 8.** They take the same `dist/` with no special Astryx setup. Capacitor needs `viewport-fit=cover` and `interactive-widget=resizes-content` in the viewport meta, because Astryx documents that the app owns the viewport tag. Set the iOS deployment target to 17 or later so the floor is Astryx Tier 2. Android needs a current System WebView; Chrome 125+ equivalent should be safe on Android 10+, but that is unverified.

**StyleX policy.** Don't add a StyleX compiler. Use `xstyle` only with styles that come from Astryx tokens, and do our own layout with Tailwind classes or Astryx `VStack`/`HStack`/`Grid`.

## 7. Swizzle and upgrade policy

The customisation ladder, in order:
1. Props and variants.
2. `className` (Tailwind) or `xstyle`.
3. Theme `components` overrides (semantic keys).
4. Data-attribute selectors.
5. Composition (wrapping).
6. `npx @astryxdesign/cli gap-report <Component>` upstream.
7. Swizzle, but only with a short ADR, into `src/components/astryx/` (owned marker folder). It must compile through `@astryxdesign/build`'s Vite integration so the copy stays in `astryx-base` below the theme. Cap it at three swizzled components.

Upgrades:
- Pin every `@astryxdesign/*` to the same exact version.
- Upgrade on a schedule, every two weeks, with `npm i -E …@latest` then `npx @astryxdesign/cli upgrade --from <old> --apply`.
- Gate the upgrade on Playwright screenshots of the ten screens in light and dark, at 375 px and 1280 px.
- Under pnpm, exempt the scope from release-age holds (`minimumReleaseAgeExclude: ['@astryxdesign/*']`), as the docs advise.

## 8. Accessibility and design floor

What Astryx gives us, from reading its compiled CSS:
- 31+ `prefers-reduced-motion` rules and a fixed 200 ms reduced-motion cap.
- 39 `forced-colors` rules and a `prefers-contrast: more` path.
- A shared focus-ring token family, `useAnnounce`, `VisuallyHidden`, keyboard-first hooks, an RTL-aware `InternationalizationProvider`, and a screen-reader escape hint in the editor.

Astryx states no WCAG conformance level, so treat its accessibility as **unverified** and add `@axe-core/playwright` 4.14.0 to CI. axe-core is MPL-2.0, which is fine as a dev-only dependency.

I applied the Hallmark design skill's app-screen floor as acceptance criteria for every screen:
- Tokens only, no literal colours.
- Never `transition: all`, and never animate `width`/`height`.
- Instant `:focus-visible` everywhere.
- A reduced-motion fallback for every animation.
- No tracked-caps labels.
- No emoji as icons.
- Loading, empty, error and full states for every data region.
- Filters and tabs kept in the URL.
- Modals as the last resort, after inline editing and disclosure.
- The accent only for the primary action, selection and state.
- **No invented figures**: Insights shows only the user's measured data.

The current repo breaks several of these:
- `transition: all` in `web/src/app/globals.css:212` and `extension/src/content/overlay.css:245`.
- `transition-all` in `web/src/app/page.tsx:133,140`.
- An animated `width` in `TokenMeter.tsx:45` (use `transform: scaleX`).
- Literal `red-400`/`gray-300` in `MicButton.tsx`.
- An emoji glyph in `desktop/renderer/src/widget/skins.tsx`.

The composer is the product's signature object, so give it the most space and polish.

## 9. Keep, change, drop (this lens)

**Keep**
- The FORGE brand intent.
- `strings.ts` and the locales, moved onto `InternationalizationProvider`.
- `useDictation`'s state model (idle, listening, processing, denied, unsupported) and its insert-at-cursor contract.
- The ⌘K concept, rebuilt on Astryx `CommandPalette`.
- The widget skins' reduced-motion discipline and CLAUDE.md's scoped-CLI rule.

**Change**
- Replace `globals.css`'s Tailwind palette remaps (emerald → ember, gray/neutral → stone) and the `pf-btn`/`pf-card`/`pf-input`/`pf-chip`/`pf-badge` layer with Astryx components and the forge theme.
- Prefer our STT over Web Speech everywhere except desktop Chrome.
- Upgrade the desktop renderer from React 18 to React 19 (an Astryx peer requirement), or better, delete it and load the SPA.
- Rewrite CLAUDE.md's "don't migrate existing screens" line as a migration plan.

**Drop**
- The separate desktop renderer and widget UI: they become SPA routes.
- The SwiftUI app's views. Keep the Swift accessibility and hotkey logic headless if Tauri can't match it.
- The 423-line hand-built extension overlay CSS. Instead, use a small Shadow-DOM island for the in-page badge, and Astryx in the popup and side panel. Theme CSS scopes on `[data-astryx-theme]`, so it should work inside a shadow root with adopted stylesheets, but that is unverified and needs a spike.

## 10. What NOT to build

- Our own component library, command palette, toast, bottom sheet, markdown renderer, code highlighter or rich-text editor.
- A StyleX build pipeline, or swizzles, in year one.
- Per-platform themes. One theme with `adaptations` is enough.
- Charts on `@astryxdesign/charts` (a placeholder) or a home-grown chart kit.
- Anything on `@astryxdesign/native` or Expo DOM islands for core screens.
- Runtime themes in production.
- Astryx's `useChatDictation` inside WebView shells.
- A Linux WebKitGTK polyfill stack.

## 11. Incremental plan (each step shippable)

1. Vite SPA skeleton with `shell-side-nav`, the forge theme, light/dark, and the ⌘K palette. Verify: axe clean, screenshots at both widths.
2. Capture → clarify → compose loop on `ai-chat-landing`, `form-wizard-inline` and `RichTextEditor`. Verify: end-to-end Playwright run.
3. `useForgeDictation` + LiveWaveform + PromptDiff. Verify: dictation works in Safari, Chrome and Firefox; diff passes screen-reader labels.
4. PWA install, then Capacitor 8.6 wrap with safe areas, keyboard and coarse-pointer sizes. Verify on iOS 18 (polyfill path) and iOS 26+.
5. Tauri 2 desktop with global hotkey capture and the capability gate. Retire Electron and the SwiftUI views once parity is reached.

## Sources

- https://astryx.atmeta.com/llms.txt
- https://astryx.atmeta.com/mcp (probed 2026-11-10)
- https://github.com/meta/astryx
- https://github.com/meta/astryx/tree/main/packages/native
- https://github.com/meta/astryx/tree/main/apps/example-vite-tailwind
- https://www.npmjs.com/package/@astryxdesign/core
- https://www.npmjs.com/package/@astryxdesign/richtext
- https://infoq.com/news/2026/09/meta-astryx-design-system
- https://www.opensourceforu.com/2026/06/meta-open-sources-astryx/
- https://caniuse.com/css-anchor-positioning
- https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- https://webkit.org/blog/17541/webkit-features-for-safari-26-1/
- https://v2.tauri.app/reference/webview-versions/
- https://ionic.io/blog/announcing-capacitor-8
- https://capawesome.io/blog/capacitor-edge-to-edge-and-safe-areas-guide/
- https://docs.expo.dev/guides/dom-components/
- https://expo.dev/changelog/sdk-56
- https://expo.dev/sdk
- https://bugs.webkit.org/show_bug.cgi?id=239816
- https://issues.chromium.org/41172064
- https://github.com/Cap-go/capacitor-speech-recognition
- https://github.com/oddbird/css-anchor-positioning
- https://github.com/kpdecker/jsdiff
- https://github.com/katspaugh/wavesurfer.js
- https://github.com/facebook/lexical
- https://github.com/recharts/recharts
- https://github.com/google/diff-match-patch (archived)
- https://github.com/Dwlad90/stylex-swc-plugin
- https://unpkg.com/@stylexswc/nextjs-plugin@0.17.1/README.md
- https://github.com/dequelabs/axe-core
- https://github.com/tauri-apps/tauri
- https://github.com/ionic-team/capacitor
- https://github.com/electron/electron
- https://github.com/expo/expo
- https://github.com/facebook/stylex
- https://github.com/tailwindlabs/tailwindcss
- https://webkitgtk.org/2025/09/17/webkitgtk2.50.0-released.html
- Local evidence: `npx @astryxdesign/cli@0.7.12` outputs of `component --list`, `template --list`, `hook`, `theme list`, `docs getting-started|styling-overview|styling-libraries/tailwind|use-a-theme|author-a-theme|browser-support|principles|cli/commands/swizzle`, `doctor`, and `theme palette generate`, run 2026-11-10.
