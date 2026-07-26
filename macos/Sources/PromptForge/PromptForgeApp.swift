import SwiftUI
import AppKit

@main
struct PromptForgeApp: App {
  var body: some Scene {
    MenuBarExtra {
      MenuContent()
    } label: {
      // The label view is always alive → a reliable place to install the
      // global hotkey once, capturing SwiftUI's openWindow (F1.4).
      MenuBarLabel()
    }

    Window("New Draft", id: "draft") {
      DraftView()
    }
    .handlesExternalEvents(matching: [])
    .defaultSize(width: 480, height: 520)

    Window("History", id: "history") {
      Text("Session history will appear here.")
        .padding()
    }
    .handlesExternalEvents(matching: [])

    Settings {
      SettingsView()
    }
  }
}

/// Menu-bar dropdown items.
private struct MenuContent: View {
  @Environment(\.openWindow) private var openWindow

  var body: some View {
    Button("New Draft\u{2026}  \(HotkeyManager.shared.displayString)") {
      NSApp.activate(ignoringOtherApps: true)
      openWindow(id: "draft")
    }
    Button("History") { openWindow(id: "history") }
    Divider()
    Button("Quit") { NSApplication.shared.terminate(nil) }
  }
}

/// The always-present menu-bar label. Installs the global hotkey once, wiring
/// it to open the New Draft window (F1.4).
private struct MenuBarLabel: View {
  @Environment(\.openWindow) private var openWindow

  var body: some View {
    Text("PF")
      .onAppear {
        HotkeyManager.shared.onTrigger = {
          NSApp.activate(ignoringOtherApps: true)
          openWindow(id: "draft")
        }
        HotkeyManager.shared.register()
      }
  }
}
