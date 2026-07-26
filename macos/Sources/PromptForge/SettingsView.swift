import SwiftUI

struct SettingsView: View {
  @State private var apiKey: String = ""

  var body: some View {
    TabView {
      Form {
        SecureField("API Key", text: $apiKey)
          .textFieldStyle(.roundedBorder)

        Text("Your API key is stored securely in the Keychain.")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .padding()
      .tabItem { Label("API Key", systemImage: "key") }

      Form {
        LabeledContent("Open New Draft", value: HotkeyManager.shared.displayString)
        Text("Press this shortcut from any app to open a new draft. Works system-wide without Accessibility permission.")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .padding()
      .tabItem { Label("Hotkeys", systemImage: "keyboard") }
    }
    .frame(width: 400, height: 250)
  }
}
