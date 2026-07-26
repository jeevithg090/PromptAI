# PromptForge Desktop (F1.2)

Cross-platform desktop app (macOS + Windows) hosting the full builder, enhance
mode, dictation, the tray/menu-bar quick-open (F1.4), and the floating widget
(F1.5). Electron + Vite + React, TypeScript strict.

## Why Electron (not Tauri)

Tauri was considered — it produces much smaller binaries. Electron wins here on:
- **Team stack**: the whole product is TS/React end-to-end; no Rust toolchain to add.
- **Mature desktop APIs we need**: `Tray`, `globalShortcut`, `electron-updater` auto-update, and `safeStorage` are first-class and well documented.
- **`MediaRecorder`** works out of the box in the Chromium renderer — required for dictation (F1.3) on the always-backend path.

The native Swift `macos/` app remains the long-term macOS play (§20.3); Electron is the pragmatic ship-now vehicle for both platforms.

## Layout

```
desktop/
├── src/main/        # main process: window.ts (hardened BrowserWindow + CSP), index.ts (lifecycle/IPC),
│                    #   settings.ts (JSON store + safeStorage token), tray.ts (F1.4), widget.ts (F1.5)
├── src/preload/     # the ONE contextBridge — exposes exactly PfBridge on window.pf
├── src/shared/      # ipc.ts — the enumerated IPC contract + DesktopSettings (snapshot-tested)
├── renderer/        # Vite + React app (builder, enhance, dictation, deep-action handling)
├── build/           # electron-builder resources (mac entitlements)
├── electron-builder.yml
└── tests/           # security posture + settings round-trip
```

## Security posture (non-negotiable)

- Every window: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webviewTag: false`.
- The renderer is 100% local (`file://`); it only `fetch()`es the API + Supabase. No remote page is ever loaded in a BrowserWindow.
- Strict CSP set via `onHeadersReceived` — `connect-src` limited to `PF_API_URL` + Supabase.
- `will-navigate` + `setWindowOpenHandler` deny external navigation; http(s) links open in the OS browser.
- The Supabase session token is stored **only** via `safeStorage` (encrypted); if encryption is unavailable it is kept in memory (re-login), never written plaintext.
- Clipboard is read **only** inside explicit user-click handlers (never on a timer).
- `tests/security.test.ts` snapshots the IPC surface + security flags so they can't regress.

## Develop

```bash
cd desktop && npm install
cd renderer && npm install && cd ..
npm run typecheck        # main + renderer
npm test                 # security + settings
npm run build            # dist/main + dist/renderer
npm run dev              # build main + launch electron (loads dist/renderer)
```

Environment (Vite `define` + main process env):
- `PF_API_URL` (default: staging API Gateway)
- `PF_SUPABASE_URL`, `PF_SUPABASE_ANON_KEY` (anon key is public-by-design)

## Package

```bash
npm run dist:dry     # build both, electron-builder --publish never (current OS)
npm run dist:mac     # dmg + zip (arm64 + x64)
npm run dist:win     # nsis installer + portable exe (x64)
```

### Signing / notarization runbook (macOS)

Unsigned builds run for development. For distribution:
1. Add an Apple Developer ID Application certificate to the login keychain.
2. Set env: `CSC_LINK` (cert .p12 path/base64), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
3. `electron-builder` (with `hardenedRuntime: true` + `build/entitlements.mac.plist`, already configured) signs + notarizes automatically.
4. First-run without notarization: users right-click the app → **Open** to bypass Gatekeeper.

### Windows caveat

Builds are **unsigned by default** → SmartScreen shows "Windows protected your PC". Users click **More info → Run anyway**. To remove the warning, add an EV/OV code-signing cert (`CSC_LINK`/`CSC_KEY_PASSWORD`) and re-run `dist:win`.

## Auto-update

`electron-updater` checks GitHub Releases on launch and every 6h (silent-fail offline). CI (`.github/workflows/desktop.yml`) builds installers on a `desktop-v*` tag and attaches them to a draft Release; a plain push runs a packaging dry-run only.

## Manual smoke checklist

- [ ] macOS: install dmg → launch → sign in → draft → clarify → result → Copy.
- [ ] macOS: menu bar icon present (F1.4), light + dark.
- [ ] Windows: install nsis → SmartScreen "Run anyway" → sign in → draft.
- [ ] Windows: system-tray icon; close-to-tray keeps it running; Quit really quits.
- [ ] Widget (F1.5): drag to each edge, restart, position restored; hotkey toggles from another app.
- [ ] Dictation: tap 🎤, speak, text appears (macOS mic-permission prompt shown once).
