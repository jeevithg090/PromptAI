import AppKit
import Carbon.HIToolbox

/// Fired by the Carbon C callback (which cannot capture Swift context). Hops to
/// the main actor and invokes the shared manager's trigger.
private func pfHotkeyFired() {
  DispatchQueue.main.async {
    MainActor.assumeIsolated {
      HotkeyManager.shared.onTrigger?()
    }
  }
}

/// Global hotkey (F1.4) via Carbon RegisterEventHotKey — works system-wide
/// WITHOUT Accessibility permission (unlike NSEvent global monitors), which is
/// the right trade-off for a menu-bar app whose AX permission is optional.
/// Default: Cmd+Shift+Space. `onTrigger` is invoked on the main thread.
@MainActor
final class HotkeyManager {
  static let shared = HotkeyManager()

  var onTrigger: (() -> Void)?

  private var hotKeyRef: EventHotKeyRef?
  private var eventHandler: EventHandlerRef?

  private init() {}

  func register(keyCode: UInt32 = UInt32(kVK_Space),
                modifiers: UInt32 = UInt32(cmdKey | shiftKey)) {
    unregister()

    var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard),
                                  eventKind: OSType(kEventHotKeyPressed))
    InstallEventHandler(GetApplicationEventTarget(), { _, _, _ -> OSStatus in
      pfHotkeyFired()
      return noErr
    }, 1, &eventType, nil, &eventHandler)

    let hotKeyID = EventHotKeyID(signature: OSType(0x50464B59) /* 'PFKY' */, id: 1)
    RegisterEventHotKey(keyCode, modifiers, hotKeyID, GetApplicationEventTarget(), 0, &hotKeyRef)
  }

  func unregister() {
    if let ref = hotKeyRef { UnregisterEventHotKey(ref); hotKeyRef = nil }
    if let handler = eventHandler { RemoveEventHandler(handler); eventHandler = nil }
  }

  /// Human-readable label for the current shortcut (fixed for v1).
  var displayString: String { "⌘⇧Space" }
}
