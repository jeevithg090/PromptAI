# Dictation and speech pipeline

Research lens for the PromptAI redesign, written 2026-11-10. Accuracy figures come from the Hugging Face Open ASR Leaderboard snapshot **v1.15.1, dated 10 November 2026**, read directly from the Space. Anything I could not check is marked *unverified*.

## TL;DR

1. **Run speech recognition on the device by default, with cloud as the fallback.**
   - Apple platforms: **FluidAudio** (Apache-2.0) runs NVIDIA **Parakeet TDT v3** on the Neural Engine.
   - Android, Windows and Linux: **sherpa-onnx** (Apache-2.0) runs the same model family.
   - Web and the browser extension stream to one cloud vendor. Groq Whisper stays as the cheap batch fallback.
2. **Use two passes.** A small streaming model shows live partials in a floating overlay (HUD). On release, a stronger model transcribes the whole clip, and only that final text is inserted.
3. **LLM cleanup is part of the product.** It turns "what I said" into "what I meant". It runs with guardrails: it never adds content, it keeps the verbatim transcript, and it falls back to a light clean when it changes too much.
4. **Personalize with a per-user word list and learning from edits.** Do not fine-tune the speech model per user.
5. **Track each user's corrected word error rate from day one.**
6. **On iOS, do not lead with a dictation keyboard.** Start with dictation inside the app.

## 1. What dictation is for in PromptAI

PromptAI turns rough intent into excellent prompts, and voice is the cheapest way to capture intent. Spoken hedges ("maybe", "not sure if", "oh and also") are signal for the clarifying-question agent. So the pipeline outputs a structured **Utterance**, not a bare string:

`{verbatim, clean, languages[], low-confidence spans, lexicon hits, app/tool context, timings}`

The intent model reads `verbatim`. The text field gets `clean`.

Dictating into other apps is the second job, and that space is crowded (Wispr Flow, Apple's iOS 27 system dictation, dozens of open-source Parakeet apps). **Our edge is intent-aware rewriting, not raw speech recognition.**

## 2. The state of speech recognition, November 2026

Values are word error rate (WER, %; lower is better). English = default short-form average; Noisy = URGENT24; en-IN = Voice Arena Monsoon (conversational Indian English); Hindi = multilingual tab. RTFx is GPU batch throughput, not device latency.

| Model | License | English | Noisy | en-IN | Hindi | RTFx |
|---|---|---|---|---|---|---|
| zoom/scribe_v2.1_pro | API | 4.87 | 6.63 | 2.78 | – | – |
| elevenlabs/scribe_v2 | API | 5.93 | 9.20 | 3.32 | 8.45 | – |
| Qwen3-ASR-1.7B | Apache-2.0 | 6.15 | 9.93 | 3.50 | 12.74 | 836 |
| assemblyai/universal-3-5-pro | API | 6.21 | 9.08 | 3.49 | 12.45 | – |
| openai/gpt-transcribe | API | 6.80 | 12.86 | 3.63 | 8.59 | – |
| parakeet-tdt-0.6b-v2 (English only) | CC-BY-4.0 | 6.93 | 11.42 | 3.89 | n/a | 6,148 |
| parakeet-tdt-0.6b-v3 (25 European languages) | CC-BY-4.0 | 7.04 | 11.52 | 4.14 | n/a | 6,322 |
| nemotron-speech-streaming-en-0.6b | NVIDIA OML | 7.47 | 12.54 | 4.44 | – | 1,116 |
| distil-large-v3.5 | MIT | 7.57 | 12.42 | 3.60 | – | 898 |
| **whisper-large-v3-turbo (in the repo today)** | MIT | **8.75** | 13.69 | 4.77 | **41.55** | 809 |
| Voxtral-Mini-4B-Realtime-2602 | Apache-2.0 | 9.72 | 17.94 | 8.86 | 25.38 | 103 |
| nemotron-3.5-asr-streaming-0.6b (40 locales) | NVIDIA OML | 11.09 | 20.14 | 7.30 | 14.18 | 1,353 |
| soniox stt-async-v5 | API | – | – | – | 8.96 | – |
| ai4bharat indic-conformer-600m | MIT (gated) | – | – | – | 8.78 | – |

What this shows:
- The repo's current model is about 1.8 WER points behind Parakeet in English and fails on Hindi.
- Open on-device models sit roughly 1 point behind the best English APIs. That gap is small enough to make on-device the default.
- Cloud is markedly better in noise, which makes noise a legitimate reason to fall back to cloud.
- Streaming models lose accuracy, so partials and the final text should come from different models.

Not on the board: Moonshine v2 (MIT, Feb 2026) and Kyutai STT (vendor figures, *unverified*), and Apple SpeechAnalyzer (one third-party July 2026 test: 2.12 / 4.56 WER on LibriSpeech clean/other, *single source*).

## 3. Options compared

**A. Cloud streaming everywhere.** This is the status quo, extended to every surface. Published prices, November 2026:
- AssemblyAI Universal-3.6 Pro Realtime: $0.45/hr. Includes up to 100 key terms, updatable mid-stream.
- Soniox stt-rt-v6: $0.12/hr, with free-text context.
- ElevenLabs Scribe v2 Realtime: about 150 ms latency, 90+ languages, handles language switches. No key terms on the realtime model.
- Deepgram Nova-3: about $0.0077/min (*third-party, unverified*).
- OpenAI gpt-live-transcribe: $0.017/min (*third-party, unverified*).

Strengths: best accuracy in noise and Hindi, one code path. Weaknesses: a heavy user (15 h/month) costs $1.80–6.75/month in speech recognition alone; no offline use; every word leaves the device; and a network round trip on every dictation (Wispr Flow budgets 200 ms of its 700 ms target for network).

**B. Built-in OS recognizers only.**
- **Apple SpeechAnalyzer (iOS/macOS 26).** Custom phrases (`contextualStrings`, up to 100) are documented only for **DictationTranscriber**, not for the newer SpeechTranscriber.
- **Android ML Kit GenAI speech.** Still alpha. Its Gemini-powered "Advanced" mode runs mainly on Pixel 10.
- **Chrome on-device Web Speech.** chromestatus lists it shipping on desktop at version 139, with phrase biasing at 142. No Android.

Free and private, but behaviour differs on every OS and cannot be measured consistently.

**C. Open models on the device, through two native runtimes, with cloud fallback. This is the recommendation.**
- **FluidAudio** includes:
  - Parakeet TDT v3 for the final pass.
  - Parakeet EOU 120M and Nemotron for streaming.
  - Silero voice activity detection (VAD).
  - Number formatting ("two hundred" becomes "200").
  - **Custom-vocabulary boosting.**

  Apps that already ship on it include VoiceInk, Spokenly and NanoVoice.
- **sherpa-onnx v2.0.1** (26 October 2026):
  - Platforms: Android, iOS, Windows, macOS, Linux and WebAssembly.
  - Language bindings: Kotlin, Swift, Rust, Node and React Native.
  - Models: Parakeet v3, Nemotron 3.5 streaming (including Qualcomm NPU), Moonshine v2 and Qwen3-ASR.
  - Hotword boosting on transducer models, including streaming NeMo models.

Near-API accuracy at zero cost per minute, offline and private. Costs: a model download (Argmax quotes 0.4 GB compressed for Parakeet v2), two runtimes, and no on-device Hindi in the Parakeet family.

**D. Less obvious alternatives.**
- **Self-host Qwen3-ASR-1.7B on our own GPUs** (Apache-2.0, Hindi included, streaming through vLLM). Only pays off at large volume. *Defer.*
- **One speech-LLM that both transcribes and structures** (Voxtral Realtime, Gemini). Accuracy is weak (Voxtral: 9.72 English, 25.38 Hindi), and we lose a trustworthy verbatim transcript. *Reject.*
- **Kyutai's streaming model.** Its pause detection is clever, but it only covers English and French, and development has been quiet since January 2026. *Reference only.*

**Decision: C**, plus one cloud streaming vendor and the existing Groq batch fallback. Apple's DictationTranscriber fills in Apple languages that Parakeet lacks.

## 4. The pipeline

```
key-down ─► capture (OS voice-processing: gain + noise suppression, 16 kHz mono)
  ─► Silero VAD (gate compute, trim silence, stop hallucination-on-silence)
  ─► STREAMING PASS  Parakeet-EOU-120M / Nemotron streaming (80–160 ms chunks) ─► HUD partials
  ─► end of speech (push-to-talk = key release; hands-free = VAD + Smart Turn v3)
  ─► FINAL PASS  Parakeet TDT v3 on the full clip + word boosting   | or cloud, per routing
  ─► number formatting + deterministic rules ("new line", the user's replacement rules)
  ─► CLEANUP LLM (mode: Verbatim | Clean | Prompt), guarded
  ─► insert final text at the cursor + emit the Utterance
```

**Choose the engine before recording, never after inserting.** The choice depends on the user's languages, the device, the network, the privacy setting and the user's error rate.
- English or one of the 25 European languages on a capable device: on-device.
- Hindi or Hinglish: cloud. When offline, Nemotron 3.5 on-device.
- Web: cloud.
- High-error users: offer "cloud boost".

Never swap text the user already received. That breaks trust and undo history.

**Cleanup guardrails** keep the LLM from looping or harming the text:
- It may only delete words, reorder, punctuate, and resolve self-corrections ("no wait", "scratch that").
- Fall back to the light clean if more than about 40% of tokens change, or if a name appears that is in neither the transcript nor the user's word list.
- One attempt, never a retry loop.
- "Show original" is always one tap away.
- Skip the LLM for short utterances that are already clean.

Where cleanup runs: Apple's on-device Foundation Models where available, otherwise the fastest small model in `model-routing.json`. Add a `dictation_cleanup` routing step so models stay a config change.

## 5. Custom vocabulary and personalization

PromptAI users constantly say tool names: Midjourney, ComfyUI, LoRA, Claude, Cursor. Generic speech recognition gets exactly these wrong.

**One per-user word list (lexicon), adapted to each engine:**

| Engine | Mechanism | Limit |
|---|---|---|
| FluidAudio | vocabulary boosting | – |
| sherpa-onnx | hotwords file | – |
| Apple DictationTranscriber | `contextualStrings` | 100 phrases |
| AssemblyAI streaming | key terms | 100 |
| Groq Whisper | `prompt` | 224 tokens |

The list is fed by:
- Packs generated from `config/platform-registry.json`.
- The user's own dictionary.
- Suggestions from edits: a word the user replaces twice or more becomes a proposed entry.
- Names already in the current prompt.

Engines cap the list, so pick the top terms per session by recency, frequency, and how well each term matches the current app.

**How it learns.** Fine-tuning the speech model per user is expensive, fragile and bad for privacy. Instead:
1. Word boosting, as above.
2. Showing the cleanup LLM the user's own past edits (verbatim → final pairs).
3. Replacement rules the user can review and delete.
4. A small **contextual bandit** (Thompson sampling) that learns how aggressive cleanup should be in each kind of app. Reward: text kept without an undo or edit for 30 s. Penalty: undo, or "show original".

This matches the plan in Wispr Flow's engineering post: capture edits on the device, learn a local policy, never repeat a mistake.

## 6. Multilingual speech and Hinglish

- No open on-device model handles mid-sentence switching between Hindi and English. The Nemotron 3.5 card lists hi-IN but says nothing about switching, and Wispr Flow calls code-switching an open problem.
- Cloud candidates:
  - Sarvam Saaras v3 has a `codemix` mode that keeps English words in Latin script (₹1.5/min).
  - Soniox claims code-switching without selecting a language (*vendor claim*).
  - ElevenLabs Scribe v2 has the best Hindi WER among APIs on the board (8.45).
- **Choose with a bake-off on our own Hinglish recordings.** Contenders: Soniox, ElevenLabs Realtime, AssemblyAI and Sarvam.
- Script is a user setting: romanized, Devanagari, or mixed.
- Product angle: *speak Hinglish, get an English prompt.*
- Later: IndicConformer-600M (MIT) could become an on-device Indian-language engine. Whether it exports to Android is *unverified*.

## 7. Noise

1. Turn on built-in voice processing (Apple voice-processing input; Android `VOICE_RECOGNITION` + NoiseSuppressor; browser `noiseSuppression`/`autoGainControl`).
2. Gate everything with VAD. sherpa-onnx has repeatedly fixed models (Moonshine v2, Qwen3-ASR, Cohere) that invent text on silent audio.
3. Send users who are often in noise to cloud. Test separate denoising models on our own test set before enabling them.

## 8. Latency, battery, privacy, offline

**Latency targets.** These are our targets, not measurements. Wispr Flow's stated goal is 700 ms in total.

| Stage | p50 | p95 |
|---|---|---|
| Key-down → mic live (models pre-loaded) | ≤100 ms | 200 ms |
| Speech starts → first partial | ≤300 ms | 500 ms |
| Key release → final text, on-device, clip ≤30 s | ≤250 ms | 500 ms |
| Cleanup LLM (skipped when not needed) | ≤250 ms | 600 ms |
| Insertion | ≤50 ms | 100 ms |
| **Key release → text in the field** | **≤600 ms** | **≤1.1 s** |

**Battery.** Push-to-talk only (no always-on listening, no wake word). Neural Engine and NPU paths should beat the CPU, but I found no published battery figures, so measure them. Unload models under memory pressure.

**Privacy.** On-device by default; the UI shows when cloud is used. Audio is never stored (the repo's §19.1 rule) and transcripts are never logged. App context is the app's ID and field type only, never screenshots. Enterprises can force on-device only.

**Offline.** English and European languages work fully, and Hindi works at lower quality through Nemotron. Cleanup falls back to rules when no LLM is reachable.

## 9. Platform specifics

**macOS.** Extend the existing SwiftUI app, which has no speech code today.
- Global hotkey through a CGEventTap (Fn or a chord). Needs the Input Monitoring permission.
- Insert by pasting: set the pasteboard, send ⌘V, restore the pasteboard. Use the Accessibility API where a field supports it.
- Ship outside the Mac App Store. One developer was rejected under Guideline 2.4.5 for posting key events.

**Windows and Linux.**
- **Handy** (MIT, 38k stars; Tauri and Rust, push-to-talk, Silero, Parakeet v3, clipboard paste) is the reference, or a fork base.
- Windows insertion: `SendInput`, or clipboard plus Ctrl+V.
- Linux on Wayland restricts global hotkeys and typing into other apps. Fall back to copying to the clipboard there.
- If the desktop app stays on Electron, run sherpa-onnx in a utility process, not the renderer.

**iOS.**
- Keyboard extensions **cannot use the microphone**. Wispr Flow works around this by holding the mic session open in its main app ("Flow Sessions").
- Guideline 4.4.1 forbids keyboards from launching other apps. iOS 26.4 added activation friction. iOS 27 ships Apple's own system-wide AI dictation.
- The keyboard memory limit is often cited as about 50 MB (*unverified*), so speech models cannot run inside a keyboard.

So, in order:
1. Dictation inside the PromptAI app.
2. A share extension, App Intents and a Control Center control.
3. Only if needed, a keyboard that mainly inserts *finished prompts*.

**Android.**
- A custom keyboard (IME) can hold the `RECORD_AUDIO` permission. WhisperType, an open-source keyboard, does exactly this.
- Use sherpa-onnx's Kotlin API. Word boosting requires `modified_beam_search` decoding.
- Ship Moonshine v2 for low-end phones, and ship the keyboard early: Android is far easier than iOS.

**Web and extension.**
- The backend mints short-lived vendor tokens; the client streams straight to the vendor (the serverless Hono backend should not hold long audio connections).
- Silero VAD runs in the browser through `@ricky0123/vad`.
- Web Speech becomes the last resort, because Chrome sends the audio to Google.
- In the extension, record in an offscreen document so the mic permission belongs to the extension, not to whichever site is open.
- Later: Moonshine or sherpa-onnx in WebAssembly as a privacy mode.

**One shared TypeScript client** for web, extension and Electron replaces today's three copies of the MediaRecorder code.

## 10. Evaluation plan

**Offline harness**, run in CI on every engine or prompt change.

Tooling: jiwer plus the leaderboard's text normalizer, both Apache-2.0.

Test data:
- Public: AMI, URGENT24, Voice Arena Monsoon en-IN, FLEURS-hi, and a Hindi–English code-switching set such as MUCS 2021 (*license to verify*).
- **Internal: 300–500 consented PromptAI dictations.** They cover prompts, jargon, Indian English, Hinglish, noise, quiet speech and self-corrections. Each has two references: the verbatim words and the intended text.

Metrics: WER and formatted WER; **key-term recall** (does boosting work?); mixed-script error rate for Hinglish; hallucination on 50 silence/noise clips; self-correction accuracy; cleanup meaning preservation (LLM judge plus human spot checks); time to first partial, key release → text (p50/p95), memory, battery per dictated minute.

Test devices: an old and a new iPhone, a mid-range and a low-end Android, an M1 MacBook Air, and a Windows laptop with no GPU.

**Online, per user.**
- **User-corrected WER (uWER):** the word-level edit distance between the inserted text and that same span after the user's edits (60 s window), divided by the number of inserted words.
- An edited word missing from the verbatim transcript counts as a recognition error; rephrasing counts as style.
- Also track re-dictation, undo, "show original" and abandonment, sliced by user, language, engine, app and device.
- Users above the 75th percentile of uWER get a prompt to add words or turn on cloud boost.
- Only metrics leave the device. Audio joins the test set only through an explicit opt-in.
- **Shadow mode:** for consenting beta users, a challenger engine runs on the same audio and reports metrics only. Vendor swaps then rest on evidence.

## 11. The current repo: keep, change, drop

**Keep**
- `GroqSTTAdapter`, with the model ID configured in `config/model-routing.json`.
- The privacy rules: no stored audio, no logged transcripts.
- The `/features` flag, usage metering, and `/transcribe` as the batch fallback.

**Change**
- Send `language` and a word-list `prompt` to Groq. Neither is sent today.
- Replace the **in-memory** `transcribeUserDailyCaps` Map with a quota stored in Postgres and counted in **audio seconds**. Serverless instances don't share memory, so today's cap is not really enforced.
- Add a `/stt/token` endpoint and the `dictation_cleanup` routing step.
- Web: demote Web Speech in `useDictation` to a fallback.
- Desktop: replace upload-everything-to-the-backend with an on-device engine, a global hotkey and insert-at-cursor.
- Extension: record in an offscreen document.

**Drop**
- The 60 s / 5 MB cap as a limit users see. Keep it for the batch fallback only.
- revival.md's "Talk-to-Forge" voice-reply feature (TTS).
- The three duplicated copies of the MediaRecorder code.

## 12. What NOT to build

- Our own speech model or VAD, or per-user fine-tuning.
- Speaker diarization, wake words, always-on listening, text-to-speech.
- One JavaScript speech engine for every platform.
- An iOS dictation keyboard in v1.
- Self-hosted GPU speech recognition before cloud spend justifies it.
- More than one streaming vendor plus one batch vendor.
- Live partials typed into other apps.
- TEN VAD: its license adds non-compete conditions.
- Code copied from VoiceInk (GPL-3.0), Epicenter/Whispering (AGPL-3.0) or FUTO Keyboard (non-commercial). Ideas only.

## 13. Build order for 1–3 engineers

1. **Weeks 1–2:** evaluation harness and internal test set; Groq fixes; Postgres quota; Utterance contract; guarded cleanup.
2. **Weeks 3–5:** macOS with FluidAudio two-pass, push-to-talk, paste, word list v1, uWER telemetry.
3. **Weeks 6–8:** cloud vendor bake-off including Hinglish; token endpoint; shared TypeScript client.
4. **Weeks 9–12:** Windows and Linux on sherpa-onnx using Handy's patterns; Android keyboard; iOS in-app dictation.
5. **Later:** cleanup bandit, iOS share extension and App Intents, an Indian-language on-device engine, a self-hosted tier.

## Sources

- https://huggingface.co/spaces/hf-audio/open_asr_leaderboard (v1.15.1, 10 Nov 2026)
- https://github.com/huggingface/open_asr_leaderboard
- https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
- https://huggingface.co/nvidia/nemotron-speech-streaming-en-0.6b
- https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b
- https://huggingface.co/nvidia/parakeet_realtime_eou_120m-v1
- https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-open-model-license/
- https://github.com/FluidInference/FluidAudio
- https://github.com/k2-fsa/sherpa-onnx
- https://github.com/k2-fsa/sherpa-onnx/releases
- https://k2-fsa.github.io/sherpa/onnx/hotwords/index.html
- https://www.argmaxinc.com/blog/nvidia-frontier-speech-models-on-argmax-sdk
- https://github.com/argmaxinc/argmax-oss-swift
- https://github.com/ggml-org/whisper.cpp
- https://github.com/SYSTRAN/faster-whisper
- https://huggingface.co/distil-whisper/distil-large-v3.5
- https://github.com/moonshine-ai/moonshine
- https://arxiv.org/abs/2602.12241
- https://kyutai.org/stt
- https://github.com/kyutai-labs/delayed-streams-modeling
- https://huggingface.co/mistralai/Voxtral-Mini-4B-Realtime-2602
- https://mistral.ai/news/voxtral-transcribe-2
- https://arxiv.org/abs/2602.11298
- https://github.com/QwenLM/Qwen3-ASR
- https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual
- https://github.com/snakers4/silero-vad
- https://github.com/TEN-framework/ten-vad
- https://github.com/pipecat-ai/smart-turn
- https://github.com/ricky0123/vad
- https://github.com/huggingface/transformers.js
- https://github.com/jitsi/jiwer
- https://developer.apple.com/documentation/speech/speechanalyzer
- https://developer.apple.com/documentation/speech/analysiscontext/contextualstrings
- https://developer.apple.com/documentation/speech/dictationtranscriber
- https://developer.apple.com/documentation/speech/speechtranscriber
- https://www.gigazine.net/gsc_news/en/20260714-apple-speech-analyzer-benchmark/
- https://developer.apple.com/forums/thread/843118
- https://developer.apple.com/forums/thread/789896
- https://developer.apple.com/forums/thread/820594
- https://techcrunch.com/2026/06/08/apple-introduces-systemwide-dictation
- https://docs.wisprflow.ai/articles/7453988911-set-up-the-flow-keyboard-on-iphone
- https://9to5mac.com/2025/06/30/wispr-flow-is-an-ai-that-transcribes-what-you-say-right-from-the-iphone-keyboard/
- https://wisprflow.ai/post/technical-challenges
- https://wisprflow.ai/whats-new
- https://developers.google.com/ml-kit/genai/speech-recognition/android
- https://f-droid.org/packages/me.trion.whispertype/
- https://chromestatus.com/feature/6090916291674112
- https://chromestatus.com/feature/5225615177023488
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/phrases
- https://console.groq.com/docs/speech-to-text
- https://www.assemblyai.com/pricing.md
- https://elevenlabs.io/realtime-speech-to-text-api
- https://soniox.com/pricing
- https://docs.sarvam.ai/api-reference-docs/api-guides-tutorials/speech-to-text/streaming-api.md
- https://www.sarvam.ai/speech-to-text
- https://diyai.io/ai-tools/speech-to-text/deepgram-pricing-2026/ (third-party pricing)
- https://dev.to/mr_manushukla/gpt-transcribe-vs-gpt-live-transcribe-cost-accuracy-and-when-to-use-each-2026-3b14 (third-party pricing)
- https://github.com/cjpais/Handy
- https://github.com/OpenWhispr/openwhispr
- https://github.com/Beingpax/VoiceInk
- https://github.com/EpicenterHQ/epicenter
- https://github.com/futo-org/android-keyboard
