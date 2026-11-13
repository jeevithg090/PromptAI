#!/bin/sh
# Builds bin/pf-native with swiftc from the Command Line Tools (no Xcode needed). A no-op off macOS.
set -eu
cd "$(dirname "$0")"
if [ "$(uname -s)" != Darwin ]; then
  echo "pf-native: macOS only, skipping build"
  exit 0
fi
# xcrun can pick a newer SDK than the compiler supports (here MacOSX27.0, built by Swift 6.4, next to a
# 6.3 compiler). The Command Line Tools' MacOSX.sdk link points at the SDK that matches their compiler.
SDK=${SDKROOT:-"$(xcode-select -p)/SDKs/MacOSX.sdk"}
[ -d "$SDK" ] || SDK=$(xcrun --show-sdk-path)
mkdir -p bin
swiftc -O -sdk "$SDK" -target "$(uname -m)-apple-macos26.0" src/main.swift -o bin/pf-native
