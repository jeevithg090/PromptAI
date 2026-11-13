// pf-native: the macOS helper PromptAI's Electron app spawns. Protocol: packages/contract/src/native.ts.
// One JSON object per line: commands on stdin, events on stdout. Every command with an id gets exactly
// one `reply`; a line that is not a valid command also produces an `error` event.
import AVFoundation
import AppKit
import ApplicationServices
import Carbon
import Speech

let version = "0.1.0"

struct Fail: Error, CustomStringConvertible { let description: String; init(_ d: String) { description = d } }
struct Invalid: Error, CustomStringConvertible { let description: String; init(_ d: String) { description = d } }

// MARK: - Output: serialized, one line per write, written straight to fd 1 (no buffering)

let outLock = NSLock()
func emit(_ event: [String: Any]) {
    guard let json = try? JSONSerialization.data(withJSONObject: event, options: [.withoutEscapingSlashes]) else { return }
    outLock.lock(); defer { outLock.unlock() }
    try? FileHandle.standardOutput.write(contentsOf: json + Data([0x0A]))
}
func reply(_ id: String, error: String? = nil, data: [String: Any]? = nil) {
    var event: [String: Any] = ["event": "reply", "id": id, "ok": error == nil]
    event["error"] = error
    event["data"] = data
    emit(event)
}

// MARK: - Hotkey: Carbon RegisterEventHotKey reports press and release with no Accessibility grant

var hotKey: EventHotKeyRef?
var hotKeySpecs = [EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed)),
                   EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyReleased))]
_ = InstallEventHandler(GetApplicationEventTarget(), { _, event, _ in
    emit(["event": "hotkey", "state": GetEventKind(event) == UInt32(kEventHotKeyPressed) ? "down" : "up"])
    return noErr
}, 2, &hotKeySpecs, nil, nil)

let modifierMasks = ["cmd": cmdKey, "option": optionKey, "control": controlKey, "shift": shiftKey]

func registerHotKey(keyCode: UInt32, modifiers: UInt32) throws {
    if let old = hotKey { UnregisterEventHotKey(old); hotKey = nil }  // registering again replaces the combo
    let id = EventHotKeyID(signature: OSType(0x5046_4E56), id: 1)  // 'PFNV'
    let status = RegisterEventHotKey(keyCode, modifiers, id, GetApplicationEventTarget(), 0, &hotKey)
    guard status == noErr else { throw Fail("RegisterEventHotKey failed (\(status))") }
}

// MARK: - Frontmost app

func frontmost() throws -> [String: Any] {
    guard let app = NSWorkspace.shared.frontmostApplication else { throw Fail("no frontmost application") }
    var data: [String: Any] = ["pid": app.processIdentifier]
    data["bundleId"] = app.bundleIdentifier
    data["name"] = app.localizedName
    return data
}

// MARK: - Paste: clipboard + ⌘V when trusted for Accessibility, else clipboard only. Never Enter.

let transientType = NSPasteboard.PasteboardType("org.nspasteboard.TransientType")
let concealedType = NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType")

func paste(_ id: String, text raw: String, restoreClipboard: Bool) {
    var text = raw
    while text.last?.isNewline == true { text.removeLast() }
    let pb = NSPasteboard.general
    // Reading the clipboard back is silent only when the user chose "always allow" (macOS paste privacy).
    let restore = restoreClipboard && pb.accessBehavior == .alwaysAllow
    let saved: [NSPasteboardItem] = !restore ? [] : (pb.pasteboardItems ?? []).map { item in
        let copy = NSPasteboardItem()
        for type in item.types { if let d = item.data(forType: type) { copy.setData(d, forType: type) } }
        return copy
    }
    let item = NSPasteboardItem()
    item.setString(text, forType: .string)
    item.setData(Data(), forType: transientType)
    item.setData(Data(), forType: concealedType)
    pb.clearContents()
    pb.writeObjects([item])

    guard AXIsProcessTrusted() else { return reply(id, data: ["result": "copied"]) }
    let source = CGEventSource(stateID: .hidSystemState)
    for keyDown in [true, false] {
        let e = CGEvent(keyboardEventSource: source, virtualKey: CGKeyCode(kVK_ANSI_V), keyDown: keyDown)
        e?.flags = .maskCommand
        e?.post(tap: .cghidEventTap)
    }
    guard restore else { return reply(id, data: ["result": "pasted"]) }
    let ours = pb.changeCount
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
        if pb.changeCount == ours { pb.clearContents(); pb.writeObjects(saved) }  // unless the user copied since
        reply(id, data: ["result": "pasted"])
    }
}

// MARK: - Dictation: AVAudioEngine microphone -> SpeechAnalyzer, on device

protocol Transcript: SpeechModuleResult { var text: AttributedString { get } }
extension SpeechTranscriber.Result: Transcript {}
extension DictationTranscriber.Result: Transcript {}

func collapse(_ parts: [String]) -> String {
    parts.joined(separator: " ").split(whereSeparator: \.isWhitespace).joined(separator: " ")
}

/// Emits the running transcript (finalized segments + the current volatile one) after every result.
func collect<S: AsyncSequence & Sendable>(_ results: S) -> Task<String, Error> where S.Element: Transcript {
    Task {
        var done: [String] = [], pending = ""
        for try await r in results {
            if r.isFinal { done.append(String(r.text.characters)); pending = "" } else { pending = String(r.text.characters) }
            emit(["event": "transcript", "text": collapse(done + [pending]), "final": false])
        }
        return collapse(done + [pending])
    }
}

@MainActor final class Dictation {
    private var session: (engine: AVAudioEngine, feed: AsyncStream<AnalyzerInput>.Continuation,
                          analyzer: SpeechAnalyzer, results: Task<String, Error>)?
    private var queue: Task<Void, Never>?
    nonisolated init() {}

    /// Runs dictation commands one at a time, in arrival order, and replies when each finishes.
    func run(_ id: String, _ work: @escaping @MainActor () async throws -> Void) {
        let previous = queue
        queue = Task {
            await previous?.value
            do { try await work(); reply(id) } catch { reply(id, error: "\(error)") }
        }
    }

    func start(localeId: String, contextualStrings: [String]) async throws {
        guard session == nil else { throw Fail("dictation is already running") }
        // DictationTranscriber is the only Apple path for Hindi and the only one that honours contextual strings.
        let useDictation = localeId.lowercased().hasPrefix("hi") || !contextualStrings.isEmpty
        let wanted = Locale(identifier: localeId)
        let found = useDictation ? await DictationTranscriber.supportedLocale(equivalentTo: wanted)
                                 : await SpeechTranscriber.supportedLocale(equivalentTo: wanted)
        guard let locale = found else { throw Fail("unsupported locale: \(localeId)") }
        let module: any SpeechModule, results: () -> Task<String, Error>
        if useDictation {
            let t = DictationTranscriber(locale: locale, preset: .progressiveShortDictation)
            module = t; results = { collect(t.results) }
        } else {
            let t = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
            module = t; results = { collect(t.results) }
        }
        guard await AssetInventory.status(forModules: [module]) == .installed else {
            throw Fail("on-device speech assets for \(locale.identifier(.bcp47)) are not installed")
        }
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: break
        case .notDetermined: guard await AVCaptureDevice.requestAccess(for: .audio) else { throw Fail("microphone access denied") }
        default: throw Fail("microphone access denied")
        }

        let engine = AVAudioEngine()
        let mic = engine.inputNode.outputFormat(forBus: 0)
        guard mic.sampleRate > 0, mic.channelCount > 0 else { throw Fail("no microphone input") }
        guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [module], considering: mic),
              let converter = AVAudioConverter(from: mic, to: format) else { throw Fail("no audio format the transcriber accepts") }
        let analyzer = SpeechAnalyzer(modules: [module], options: .init(priority: .userInitiated, modelRetention: .processLifetime))
        if !contextualStrings.isEmpty {
            let context = AnalysisContext()
            context.contextualStrings[.general] = Array(contextualStrings.prefix(100))
            try await analyzer.setContext(context)
        }
        try await analyzer.prepareToAnalyze(in: format)

        let (input, feed) = AsyncStream<AnalyzerInput>.makeStream()
        engine.inputNode.installTap(onBus: 0, bufferSize: 4096, format: mic) { buffer, _ in
            let frames = AVAudioFrameCount(Double(buffer.frameLength) * format.sampleRate / mic.sampleRate) + 64
            guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return }
            let given = Flag()
            _ = converter.convert(to: out, error: nil) { _, status in
                if given.value { status.pointee = .noDataNow; return nil }
                given.value = true; status.pointee = .haveData; return buffer
            }
            if out.frameLength > 0 { feed.yield(AnalyzerInput(buffer: out)) }
        }
        let collector = results()
        do {
            try await analyzer.start(inputSequence: input)
            engine.prepare()
            try engine.start()
        } catch {
            engine.inputNode.removeTap(onBus: 0)
            feed.finish()
            await analyzer.cancelAndFinishNow()
            collector.cancel()
            throw error
        }
        session = (engine, feed, analyzer, collector)
    }

    /// Stops the microphone, finalizes, and returns the full transcript.
    func stop() async throws -> String {
        guard let s = session else { throw Fail("dictation is not running") }
        session = nil
        s.engine.inputNode.removeTap(onBus: 0)
        s.engine.stop()
        s.feed.finish()
        try await s.analyzer.finalizeAndFinishThroughEndOfInput()
        return try await s.results.value
    }
}
final class Flag: @unchecked Sendable { var value = false }
let dictation = Dictation()

// MARK: - Command dispatch (main thread)

func arg<T>(_ a: [String: Any], _ key: String, _ type: T.Type, default fallback: T? = nil) throws -> T {
    if a[key] == nil, let fallback { return fallback }
    guard let v = a[key] as? T else { throw Invalid("\(key) is missing or has the wrong type") }
    return v
}

@MainActor func handle(_ line: String) {
    guard let a = (try? JSONSerialization.jsonObject(with: Data(line.utf8))) as? [String: Any] else {
        return emit(["event": "error", "message": "expected one JSON object per line"])
    }
    guard let id = a["id"] as? String, let cmd = a["cmd"] as? String else {
        return emit(["event": "error", "message": "a command needs a string id and cmd"])
    }
    do {
        switch cmd {
        case "hotkey.register":
            let keyCode = try arg(a, "keyCode", Int.self)
            guard keyCode >= 0 else { throw Invalid("keyCode must be non-negative") }
            let mask = try arg(a, "modifiers", [String].self).reduce(0) { mask, name in
                guard let m = modifierMasks[name] else { throw Invalid("unknown modifier: \(name)") }
                return mask | m
            }
            try registerHotKey(keyCode: UInt32(keyCode), modifiers: UInt32(mask))
            reply(id)
        case "dictation.start":
            let locale = try arg(a, "locale", String.self)
            let strings = try arg(a, "contextualStrings", [String].self, default: [])
            dictation.run(id) { try await dictation.start(localeId: locale, contextualStrings: strings) }
        case "dictation.stop":
            dictation.run(id) {
                let text = try await dictation.stop()
                emit(["event": "transcript", "text": text, "final": true])  // before the reply
            }
        case "paste":
            paste(id, text: try arg(a, "text", String.self), restoreClipboard: try arg(a, "restoreClipboard", Bool.self, default: true))
        case "frontmost":
            reply(id, data: try frontmost())
        case "quit":
            reply(id)
            exit(0)
        default:
            throw Invalid("unknown command: \(cmd)")
        }
    } catch let e as Invalid {
        emit(["event": "error", "message": "\(cmd) \(id): \(e)"])
        reply(id, error: e.description)
    } catch {
        reply(id, error: "\(error)")
    }
}

// MARK: - Startup: an accessory NSApplication (no Dock icon) so Carbon events are dispatched

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
emit(["event": "ready", "version": version, "axTrusted": AXIsProcessTrusted()])
Thread.detachNewThread {
    while let line = readLine() {
        DispatchQueue.main.async { MainActor.assumeIsolated { handle(line) } }
    }
    DispatchQueue.main.async { exit(0) }  // stdin closed: the parent is gone
}
app.run()
