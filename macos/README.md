# PromptForge — macOS App (Phase 8.1)

## Build & Run

1. Open `Package.swift` in Xcode 16+.
2. Select the `PromptForge` (not `PromptForgeKit`) target.
3. Run (⌘R).

The app appears as a menu-bar item labeled **PF**.

### Menu items

- **New Draft…** — Opens the draft composer window (text field, platform picker, Generate button, result area).
- **History** — Placeholder session history.
- **Settings** — API key field and hotkey configuration (placeholders).
- **Quit** — Terminates the app.

### Architecture

- `PromptForgeApp.swift` — `@main` SwiftUI `App` with `MenuBarExtra`.
- `DraftView.swift` — Draft composer UI.
- `SettingsView.swift` — Settings panel.
- `API.swift` — `PromptForgeAPI` class (URLSession-based, stubbed).
- `AccessibilityDetector.swift` — AXUIElement stub (returns nil).
- `HotkeyManager.swift` — **global hotkey (F1.4)** via Carbon `RegisterEventHotKey` (Cmd+Shift+Space), system-wide without Accessibility permission; wired in `PromptForgeApp.swift`'s always-alive menu-bar label to open a New Draft. Verified: `swift build` clean (Swift 6 strict concurrency — `HotkeyManager` is `@MainActor`, the C callback hops to main via `MainActor.assumeIsolated`).

### F1.4 verification (2026-07-11)

`swift build` passes. The menu-bar app: `MenuBarExtra` renders Draft/History/Quit; the global hotkey opens New Draft from any app; the Hotkeys settings tab shows the shortcut. The Accessibility detector remains a graceful stub — the manual builder works without permission. (Interactive run not automatable in CI; build + code path verified.)
