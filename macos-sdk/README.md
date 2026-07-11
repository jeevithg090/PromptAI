# PromptForgeKit — macOS / iOS SDK (Phase 8.3)

A Swift SDK for integrating PromptForge drafting capabilities into macOS
and iOS applications.

## Usage

```swift
import PromptForgeKit

let client = PromptForgeClientLive(
  baseURL: "https://api.promptforge.example.com",
  apiKey: "..."
)

let result = try await client.draft(idea: "a photorealistic dragon", platform: "midjourney")
print(result.assembled)
```

## Protocol

- `PromptForgeClient` — the public contract (mockable).
- `PromptForgeClientLive` — default URLSession-based implementation.
- `DraftResult` — contains `assembled`, `strengthScore`, and `nodes`.
- `PromptNode` — typed node with alternatives.

## Build

Open `Package.swift` in Xcode 16+ and add the `PromptForgeKit` library to your target.

See the full SDK docs at [docs/promptforgekit.md](../../docs/promptforgekit.md).
