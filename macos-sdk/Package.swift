// swift-tools-version:6.0
import PackageDescription

let package = Package(
  name: "PromptForgeKit",
  platforms: [
    .macOS(.v14),
    .iOS(.v17),
  ],
  products: [
    .library(name: "PromptForgeKit", targets: ["PromptForgeKit"]),
  ],
  targets: [
    .target(
      name: "PromptForgeKit",
      path: "Sources/PromptForgeKit"
    ),
  ]
)
