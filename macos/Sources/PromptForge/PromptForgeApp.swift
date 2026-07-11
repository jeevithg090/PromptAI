import SwiftUI

@main
struct PromptForgeApp: App {
  @State private var showingDraft = false
  @State private var showingHistory = false
  @State private var showingSettings = false

  var body: some Scene {
    MenuBarExtra {
      Button("New Draft\u{2026}") { showingDraft = true }
      Button("History") { showingHistory = true }
      Button("Settings") { showingSettings = true }
      Divider()
      Button("Quit") { NSApplication.shared.terminate(nil) }
    } label: {
      Text("PF")
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
