import SwiftUI

struct DraftView: View {
  @State private var idea: String = ""
  @State private var selectedPlatform: String = "ChatGPT"
  @State private var result: String = ""

  let platforms = ["Midjourney", "ChatGPT", "Claude", "Gemini"]

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Enter your idea")
        .font(.headline)

      TextEditor(text: $idea)
        .frame(minHeight: 80)
        .border(Color.secondary.opacity(0.3))

      HStack {
        Picker("Platform", selection: $selectedPlatform) {
          ForEach(platforms, id: \.self) { name in
            Text(name).tag(name)
          }
        }
        .frame(width: 200)

        Spacer()

        Button("Generate") {
          generate()
        }
        .keyboardShortcut(.return, modifiers: .command)
      }

      if !result.isEmpty {
        Text("Result")
          .font(.headline)
          .padding(.top, 8)
        ScrollView {
          Text(result)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(8)
        .border(Color.secondary.opacity(0.3))
      }

      Spacer()
    }
    .padding()
  }

  private func generate() {
    result = "Draft generation not yet implemented.\n\nIdea: \(idea)\nPlatform: \(selectedPlatform)\n\nTODO: wire to PromptForgeAPI"
  }
}
