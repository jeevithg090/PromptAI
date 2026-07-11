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
        Text("Hotkey configuration will appear here.")
          .foregroundStyle(.secondary)
      }
      .padding()
      .tabItem { Label("Hotkeys", systemImage: "keyboard") }
    }
    .frame(width: 400, height: 250)
  }
}
