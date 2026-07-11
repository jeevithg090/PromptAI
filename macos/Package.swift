// swift-tools-version:6.0
import PackageDescription

let package = Package(
  name: "PromptForge",
  platforms: [
    .macOS(.v15)
  ],
  targets: [
    .executableTarget(
      name: "PromptForge",
      path: "Sources/PromptForge"
    )
  ]
)
