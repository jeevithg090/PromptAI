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
