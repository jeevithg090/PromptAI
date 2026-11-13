# PromptAI wave-2 evidence

This document combines the 17 wave-2 prototypes, the 10 wave-2 research reports and the two checker passes, and maps the results onto `blueprint-work/BLUEPRINT.md` (final, 2026-11-10). Prepared 2026-11-11.

**How to read it.**
- Parts A and B give each item's key result, how strong its evidence is after the checkers, and what it does to the blueprint: **Confirms**, **Changes** or **Adds**, with § numbers.
- Part C collects the concrete edits, section by section.
- Every spike ran on one M5 shared with about 30 agents (load average 2-320). Treat every timing as an upper bound unless a checker re-ran it on a quiet machine.
- The checkers did not re-check the research reports.

**Strength.**
- **A**: a checker reproduced it, or it was measured on real data at a size that decides the question.
- **B**: reproduced or internally consistent, but synthetic, small or measured under load. Trust the direction, not the exact numbers.
- **C**: one author wrote both the test and the method, the setup is circular, or a checker weakened the headline. Treat it as a hypothesis.

## Part A. Prototypes

### Dictation

**asr-testset** · scorer A, clips B · Confirms §14 G2.
- **What it is:** 133 clips (19.2 min). 105 are macOS-TTS clips in 9 categories at clean, 10 dB and 0 dB; 28 are CC-BY human clips.
- **What `score.py` scores:** verbatim and "intended" references, two normalizers, Hindi lattices, key-term recall and words inserted on silence.
- **Normalizer bug:** the stock Whisper normalizer deletes Devanagari vowel signs.
- **Checker:** the self-test and baselines reproduced exactly, and the TTS audio is shown to be intelligible. Two truncated clips (syn-plain-05 and -08) inflate the "plain" category for every engine.
- **Means:** use it as a CI smoke set, not a leaderboard. Keep the TTS WAVs out of public repos (Apple voice licence).

**asr-whisper** · accuracy A, latency B · Confirms §7 (Whisper is not the core engine); Adds guards.
- **Best Whisper runtime:** whisper.cpp turbo q5_0 on Metal: English WER 7.5%, 0.9 GB, deterministic.
- **Latency floor:** Whisper pads input to 30 s, so a 5 s clip takes at least 0.40-0.59 s. Shrinking the window breaks accuracy (43.9% WER).
- **Hallucination:** turbo produced text on 3 of 3 silent clips. A Silero VAD gate fixed all three and lost no speech.
- **Vocabulary:** a global vocabulary prompt helped English but doubled Hindi WER and made MLX loop. A space-insensitive lexicon match after ASR adds about 10 points of key-term recall for free.
- **Checker:** 133/133 transcripts reproduced. While the owner was using the desktop, whisper.cpp took 1.25-1.67 s, which fails the ≤600 ms target.

**asr-nextgen** · English A, speed B, Hindi C · Confirms §7 phase 2d; Changes the runtime choice.
- **Parakeet TDT v3 on MLX:**
  - Ties Whisper on English (7.9% vs 7.5%) and inserts nothing on silence.
  - Runs 2-6x faster: 0.13 s warm, stable under GPU load.
  - Boosts vocabulary safely: key-term recall 52→77%. A stable per-user lexicon did as well as a per-clip oracle list.
  - MLX must cap its cache: footprint 12.3 GB uncapped, 3.1 GB capped.
- **Nemotron 3.5:** 8.7% WER on Hindi and 20.2% on Hinglish, against about 28% for Whisper.
- **Checker:** the English results reproduced, but:
  - The blueprint ships Parakeet through transcribe.cpp, which nobody measured.
  - The int8 sherpa build of the same weights collapsed at 0 dB (64.8% vs 25.5%).
  - The verdict did not weigh the 2.39 GB download or the 3.1 GB footprint.
  - Nemotron-en, proposed for live partials, carries the NVIDIA licence that §7 excludes.
  - The Hindi result rests on 22 clips.

**asr-apple** · B · Adds a §7 engine.
- **SpeechAnalyzer:** runs from an unbundled binary with no permission prompt, 35-60x faster than real time, in a small system service, with a ~0.1 s tail from key release to final text.
- **SpeechTranscriber:** has no Hindi and ignores `contextualStrings`.
- **DictationTranscriber:** Apple's only Hindi path (Devanagari output only) and its only vocabulary biasing (key-term recall 39→60%).
- **Checker:** reproduced. There is no general English gap against Whisper (human English 3.3% vs 4.0%); the deficit is jargon and 0 dB noise.
- **Means:** a free, zero-download offline engine for macOS 26 and iOS, available before 2d. It should not be the default for jargon.

**dictation-cleanup** · latency B, accuracy C · Changes §7 guards and lineage row 10-11.
- **S1-mini 8-bit** (a 0.6B fine-tune built for cleanup): 70% exact on the main set and 80% on the held-out set, at 0.83 GB.
- **General models:** prompted models of 2B or less did worse than rules, and translated or invented content. Qwen3-4B needed a gate, a guard and 3.6x the memory.
- **Guards:** the wave-1 ">40% changed" guard fires on correct self-corrections and never catches a kept stale value ("Send it to John"). A number-consistency check had 0 false rejects out of 207.
- **Checker:** **refuted the blueprint's "1.7-3.2 s p50".** On a quiet M5, S1-mini runs at 171 ms p50 and 254 ms p95, inside the 250 ms budget. The accuracy differences are not significant (McNemar p=0.33), and the author's hand count of meaning errors disagrees with the automated count.

### Understanding, learning, prediction

**on-device-intent** · C (the JSON-constraint result is A) · Confirms the §4 tool regex; Changes §6 slot sourcing.
- **Target tool:** a regex picks it correctly (0.993 main, 1.000 hard); small LLMs invent tools.
- **Task family:** Qwen3-Embedding with logistic regression (0.876/0.95, about 50 ms).
- **Clarification:**
  - A small model's yes/no "needs clarification" judgment is unreliable.
  - What reached 0.85 on both sets: the model extracts slot values, and a slot counts as "said" only when its words appear in the request.
  - Choosing which slot to ask about is right only 30-50% of the time.
  - Filler words make complete requests look vague.
- **JSON constraints:** 0 invalid outputs out of 1,590.
- **Checker:**
  - A plain word-count rule beats grounding on the main set.
  - The hard set was built so that lexical checks win.
  - Paraphrased slots are untested.

**bandit-sim** · B · Confirms §8; Changes the rationale; Adds safeguards.
- **Biggest lever:** the empirical-Bayes population prior. Regret fell 35.9→14.4, with about 5x fewer bad early suggestions.
- **Model choice:** per-arm Beta over 108 configurations does no better than a fixed default; a factored Bayesian linear model does much better.
- **Failure modes:**
  - Decay toward the prior is the best safeguard against drifting preferences.
  - Greedy choice strands 37-74% of users on a wrong option.
  - Refitting priors from raw pooled counts, or by naive empirical Bayes, kills personalization and hides new tools.
- **Signals:** a graded reward beats binary "copied" by 2.7x. Doubly robust offline evaluation was within 0.5-2.4% of the truth.
- **Checker:** reproduced and robust. Thompson sampling's offline-evaluation advantage appears only when the reward model is wrong.

**prediction-sim** · synthetic C, UNIX B · Confirms §9.
- **Synthetic data:** CtxMix, LightGBM and SASRec tie at about 0.755 hit@1, and all lose 19 points without the foreground-app signal.
- **Real UNIX commands:** every model scores 0.32-0.37.
- **Checker:**
  - A frozen lookup table reaches 0.740, so the synthetic tie is the generator's ceiling, not a finding about models.
  - On UNIX data, dual-rate CtxMix beats Markov-2 by only 0.008.
  - LightGBM's drift failure is partly an artefact of never retraining it.
- **Means:** frecency plus Markov-2 stands. Measuring the host-app signal's real value needs logging.

**question-selection-sim** · repo loop A, policy ranking B · Confirms §6 chips and the §18 fix; Changes the 2c gate.
- **Drafting with editable chips and no questions:** 94.0% final accuracy.
- **The repo today:** the fixed list of 4 questions scored 5.6 utility points lower. The web client loses answers in 53% of sessions and loops.
- **Review-aware gate:**
  - It asks 0.06-0.6 questions per session.
  - It rises to 1-1.7 when users rubber-stamp chips, on voice, or for costly targets.
  - Its closed form is within ±0.2 of the exact calculation.
- **Termination:** the slot state machine provably terminates.
- **Learning:** learning from silent assumptions self-confirms.
- **Checker:**
  - The loop is real: `page.tsx:136-142` and `routes.ts:1048-1073`.
  - When users catch only 0.35-0.6x of wrong chips but the gate assumes the default catch rates, it barely asks.
  - In that case chips-only can lose up to 7.1 points, while asking about 1.7 questions loses at most 2.2.

### Knowledge, representation, integration

**tool-ingest** · mechanics B, extraction C · Confirms the §10 Librarian; Changes extraction.
- **One generic pipeline:** TypeScript with fetch, robots.txt, Readability and Turndown, and no headless browser. It built cited profiles for five very different tools from a small config each.
- **Discovery:** llms.txt, then Zendesk help-center APIs, then sitemaps, then a link crawl.
- **What blocked crawling:** bot walls, not JavaScript.
- **Freshness:** conditional GETs cut recheck bytes by 98-99.5%.
- **Risks found:**
  - Docs contain text addressed to AI agents.
  - The repo registry is stale: Midjourney's default is V8.2, and 8 of 13 docs URLs have moved.
  - Lexical claim checks caught 0 of 2 contradictions.
- **Checker:**
  - 214/214 quotes verified, but the "LLM" that extracted them was the spike agent itself.
  - Parameter precision fell from 84.8% to 60% (Claude Code) and 33% (Figma) on a fresh sample.

**prompt-representation** · B · Confirms §6 data-only cards; Changes composition.
- **What was built:**
  - A Brief IR in Zod: a closed core, open `facets`, `params` and `tool_params`, and provenance.
  - One YAML card per tool.
  - A 331-line LiquidJS renderer that compiled 10 fixtures to 8 targets.
- **Extensibility:** four targets were added after a code freeze with 0 changed lines.
- **LLM boundary:** 30 of 32 pairs need no LLM. The renderer lists what does: positive rewrites of negatives, rules turned into visual descriptions, and missing lyrics.
- **Speed and robustness:** about 0.5 ms per render; 0 errors in 16,000 fuzz renders.
- **Repo comparison:** the repo's schema gives only 16% of brief content its own slot.
- **Checker:** the tests reproduce, but free text is not checked for tool syntax. `--ar 1:9 --sref 99999` in a subject reached the Midjourney prompt without a flag.

**mcp-server** · B; anti-loop claim refuted · Confirms §11 phase 2b; Changes state handling.
- **What was built:** about 400 lines on `@modelcontextprotocol/server` 2.4.0, serving stdio and HTTP to both protocol eras (82/82 Inspector checks).
- **What works in every client:** questions returned as data, `next_action`, output schemas and readable errors.
- **Limits:**
  - Elicitation is optional.
  - The Messages API sees tools only.
  - Remote auth needs an authorization server that supports CIMD and DCR.
- **Checker:** **refuted the anti-loop claim.** An agent that forwarded only the latest answers cycled on 4 of 4 ideas, because the server is stateless and the two-call cap is only prose. No real host or OAuth flow was tested.

**local-first-sync** · loss mechanism A, CRDT comparison B · Confirms §12 (no sync engine); Changes the error policy.
- **PowerSync:** worked locally and converged 20/20.
- **The data-loss bug:**
  - The upload handler recorded failing operations and returned 2xx.
  - When two devices reconnected at once, Postgres deadlocks became 212 silently dropped writes.
  - Returning 5xx on transient SQLSTATEs gave 0 drops.
- **CRDTs:**
  - They keep concurrent text edits and counters.
  - But they decide conflicts by Lamport order or peer id, not time.
  - They drop edits inside deleted objects, and they resurrect memories the user asked to forget.
- **Checker:** reproduced on plain Postgres. **The loss comes from the error policy, so it also hits the blueprint's REST design,** which acknowledges invalid events with 2xx.

### UI and shells

**astryx-vite** · bytes A, Lighthouse B · Confirms §15; Adds §14 budgets.
- **Build effort:** the three core screens took about 1,100 lines with 36 Astryx components.
- **Quality:** accessibility 100, axe clean, desktop performance 99-100.
- **Mobile performance:** 87-90, with LCP 3.6-4.1 s.
  - First-load JS is 252-307 KiB gzip per route.
  - Astryx's own floor is 155 KiB of JS plus 45 KiB of render-blocking CSS.
- **Friction:**
  - `LayoutContent` breaks sticky positioning.
  - Warm neutral colours need `neutralProfile: custom`.
  - Some templates need the StyleX compiler.
- **Checker:** the byte counts reproduced, and LCP is bound by bytes.

**astryx-next-tailwind** · B · Confirms the §15 layer recipe.
- **Works:** Astryx runs on Next 16 + Tailwind 4 with static export. It costs at least +81 KiB gzip JS per route, and +155 KiB on a form screen.
- **Six setup mistakes fail silently:**
  - Layer order.
  - Import order.
  - A duplicate `theme.css`.
  - A Google Fonts import.
  - Dark mode before hydration.
  - Barrel imports in server components (2.7x the JS).
- **Dev speed:** importing `astryx.css` from JS makes hot reload 3-9x faster.
- **Repo collision:** the repo's `--color-accent` collides with Astryx.
- **Means:** Astryx is no reason to leave Next. The move to a Vite SPA rests on the desktop and mobile shells.

**astryx-mobile-web** · B · Confirms §5: PWA now, Capacitor in 2c.
- **Handled by Astryx:** the keyboard, safe areas, Dynamic Type and 16 px inputs.
- **PWA:** installs and runs offline in both browser engines, after an `ignoreVary` fix.
- **Gaps:**
  - Controls are desktop-sized: 54 of 54 are under 44 px. One coarse-pointer theme rule fixes all but 25.
  - Template roots set to `100dvh` clip inside the app shell.
- **Rejected wrappers:**
  - Expo DOM bundled 4.9x larger and rendered 1.2-4.3x slower.
  - Tauri mobile lacks push, in-app purchase and audio plugins.
- **iOS keyboard:** an iOS keyboard extension gets no microphone (2026 forum report).
- **Checker:** the "106 KB initial JS" figure is refuted; the real shell is 254 KiB gzip.

**electron-shell** · size A, runtime B · Changes "Why Tauri" in §5.
- **Size:** Electron 45 is 259 MiB installed and a 112 MiB download. A WKWebView shell is about 1 MiB; published Tauri builds are 5-9 MiB.
- **Runtime gap is small:**
  - +25-27 MiB memory (1.3x), counting all processes including WebKit's.
  - The same idle CPU.
  - No detectable difference in first paint.
- **Capabilities:** Electron covered the tray, hotkey, non-activating panel and clipboard with no native code, but its hotkey reports key-down only.
- **Hotkey options:**
  - uiohook-napi needs Accessibility permission and wraps LGPL code.
  - Carbon `RegisterEventHotKey` registered press and release handlers with no prompt (sandbox probe; no physical key was pressed).
- **Checker:** the sizes reproduced; the runtime numbers were not re-run.

## Part B. Research reports (not re-checked)

**Distribution** · B · Changes §5.
- App Review closes the Mac App Store to auto-insert, not the sandbox. Apple rejected apps under guideline 2.4.5 in 2026, while posted events passed the sandbox 15/15.
- Use build-time channel profiles.
- Ship remote data, never remote logic (Apple 2.5.2, Chrome MV3).
- One consent ledger generates every store's disclosures.
- Put "Report this output" everywhere (Apple 1.2, revised 2026-10-16).
- No BYOK in store builds.

**Accessibility** · C (no real screen reader) · Changes §15.
- **Streaming announcements:** 249 for a hand-rolled live region; 1 or 0 for Astryx `ChatMessageList`, whose `role=log` cannot be overridden; 2 for status-only announcements under every behaviour.
- **axe gaps:** axe passed a screen that clips content at 390 px and at 200% text.
- **WKWebView:** lacks `ariaNotify`.
- **Today's code:** `MicButton.tsx:53` makes 26 announcements for 28 dictated words.

**Multilingual** · C (tiny probes) · Changes §6.
- The risk is script handling, not UI translation.
- Mixed-script capture raised translation chrF++ from 24 to 69.
- A script-normalized check traced 5 of 5 specific details; naive matching traced 0 of 5.
- Small Qwen models translate when asked to romanize.
- Indic text costs 1.6-2x the tokens on o200k and 4-8x on Qwen3.
- Lingui adds 3.6 KB; Astryx has no Indic catalog.

**Economics** · prices B, usage C · Changes §6, §11 and B13.
- A device-first hybrid reaches 79% margin, against 60% for cloud-first.
- Model-tier routing is the largest lever. A draft costs $0.0007 on Haiku 5.5, $0.0139 on Sonnet 5.5 and $0.0278 on Opus 5.5, so the $0.02 cap blocks any frontier draft.
- STT vendor price is a 4x lever; session billing adds 17-35%.
- Pro at $12/month or $96/year, with credits for the costly tiers.

**Community** · C (synthetic) · Adds to §12, §13 and §18.
- No public hub in the MVP.
- Ranking by likes let 20 fake accounts hold spam at the top. Ranking by trusted outcomes let none through even at 200 fake accounts.
- Low-traffic niches cannot be ranked safely.
- The deterministic share gate missed every evasive secret.
- The existing share links (migration 018) may already carry EU Digital Services Act duties.

**Multimodal capture** · C (8 screens) · Adds to §4 and §13.
- OCR text kept 93-96% of the needed facts at 8-33x fewer tokens than images.
- Apple Vision cannot read Indic scripts.
- OCR noise defeats regex redaction, and no regex caught names.
- A low-contrast filter caught a hidden injected instruction with 0 false flags out of 172 lines.
- On-device vision models took 5-26 s and 3 GB.

**Agentic execution** · B · Confirms §1 and §11.
- No in-house GUI agent. Top agents still fail about 1 task in 7, and a 20-step GUI task costs $0.45-1.29, against $0.0125 for a typed call.
- Later, act only through typed channels up to the target app's native draft, and hand GUI work to the user's own agent as an Agent Brief.
- Phase 1 adds the hooks only.

**Training** · C (80 items) · Confirms §8.
- Train nothing in the MVP.
- A Qwen3-1.7B LoRA student (13 min, $0) tied the S1-mini pipeline but made 3x the rules' meaning errors. The validation loss hid them.
- Anthropic's Commercial Terms D.4 bar training models on Claude outputs.
- Handle deletion by retraining without the data.

**OS AI APIs** · B · Adds to §6 and §11.
- Integrate outward first: one action catalog generated from the MCP tools feeds App Intents, Windows MCP registration and Android AppFunctions.
- Apple Foundation Models was unavailable on the test Mac (Apple Intelligence off). It has a 4,096-token context on macOS 26.6 and no Hindi.
- Microsoft removes Phi Silica in January 2027.

**Plugin security** · B · Changes §16.
- Extensions are declarative items with a closed set of effects.
- Sign the bundle with TUF-lite: offline root keys, an expiring CI key, and rollback and freeze guards. Verification takes 1.6-1.8 ms.
- Harden CI against attacks like the TanStack compromise.
- Sandbox limits failed on their own: QuickJS's deadline overran about 100x, and Extism-JS ignored `maxPages`.

## Comparison tables

### Dictation engines (shared 133-clip set and scorer)

| Engine (runtime) | English WER | Human English | Hindi read / mix | 0 dB | Silence | Key-term recall¹ | Warm, 5 s clip | Memory / download | Licence | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| whisper.cpp turbo q5_0 | 7.5 | 4.0 | 28.2 / 27.3 | 23.2 | hallucinates | 54→81, prompt harms Hindi | 0.59 s; 1.25-1.67 s in use | 0.9 GB / 574 MB | MIT | Fallback only |
| mlx-whisper turbo 4-bit | 7.6 | — | 49.7 / 40.3 | 24.5 | hallucinates | 51→72, loops | 0.40 s; 0.79-1.11 s in use | 1.5-3.4 GB / 464 MB | MIT | Avoid |
| faster-whisper turbo int8, CPU | 7.9 | — | 29.5 / 30.9 | 24.5 | hallucinates | 54→77 | 6.0 s | 2.3 / 1.6 GB | MIT | Avoid |
| **Parakeet TDT v3, parakeet-mlx** | 7.9 | 3.8 | unusable | 25.5 | 0 | 52→77 boost | **0.13 s, stable** | 3.1 GB capped / 2.39 GB | CC-BY-4.0; Apache-2.0 | 2d final pass, runtime TBD |
| Parakeet v3 int8, sherpa-onnx | 14.6 | — | unusable | **64.8** | 0 | 43→61 | 0.29 s | 2.9 GB / 642 MB | Apache-2.0 | Re-test fp16 |
| Nemotron 3.5 streaming 0.6B | — | 5.4 | **8.7 / 20.2**² | — | 0 | — | word p50 0.44 s | — / 653 MB | openmdw-1.1 | Assess, licence read |
| Nemotron-en streaming 160 ms | 11.0 | 4.4 | unusable | 43.0 | 0 | 48→65 | word p50 0.27 s | 1.2 cores / 634 MB | NVIDIA OML | Excluded |
| Moonshine v2 medium | 19.5 | 5.8 | unusable | 69.8 | 0 | 44→57 | 0.47 s | — / 263 MB | MIT | Tiny as low-end fallback |
| Kyutai STT 1B | 17.1 | 6.7 | unusable | — | 0 | — | 5.05 s | 3.65 / 2.25 GB | CC-BY-4.0 | Avoid |
| **Apple SpeechTranscriber** | 11.5 | 3.3 | none | 44.8 | 0 | 34, no biasing | tail ~0.1 s; partials ~1 s | 112 MB / preinstalled | system | Free offline English |
| **Apple DictationTranscriber** | 17.4 | 9.1-9.6 | 28.9 / 36.7, Devanagari | 53.6 | 0 | 39→60 | tail ~0.1 s | 219 MB / 0.3-0.9 GB | system | Offline Hindi, Apple vocab |
| Cloud vendors (Soniox, AssemblyAI, ElevenLabs, Sarvam) | not measured | | | | | | | | DPA | S3 |

¹ The bases differ: the jargon subset for Whisper and Parakeet, all 95 key-term occurrences for Apple. ² 6 + 16 clips. Human-English gaps under about 1 point are statistical ties (paired bootstrap).

### On-device models

| Task | Model | Quality | Latency | Memory / size | Licence | Verdict |
|---|---|---|---|---|---|---|
| Cleanup | Regex rules | 63% / 50% exact; meaning errors 3 / 5³ | 0.26 ms | — | own | Default; light clean as fallback |
| Cleanup | **S1-mini 8-bit, MLX** | 70% / 80%; 10 / 2 | **171 ms p50, 254 ms p95** quiet | 0.9 GB / 0.63 GB | custom, naming clause | TRIAL desktop |
| Cleanup | Qwen3-4B-2507 4-bit, few-shot | 78% / 75% (83/85 guarded); 12 / 4 | 1.3 s loaded | 3.0 GB | Apache-2.0 | Cloud or high-end only |
| Cleanup | Own Qwen3-1.7B LoRA student | 63% (70% guarded) | 2.4 s loaded | 1.1 GB | Apache-2.0 | Fails gate |
| Cleanup | Prompted ≤2B models | 28-53%; translate, invent | — | — | — | Avoid |
| Tool | Regex alias table | 0.993 / 1.000 | µs | — | own | Adopt |
| Task family | Qwen3-Embedding-0.6B + logreg | 0.876 / 0.95 (0.83 zero-shot) | 47 ms | 1.2 GB | Apache-2.0 | Local router |
| Task family | potion-base-8M + logreg | 0.658 / 0.850 | <0.1 ms | 30 MB | MIT | Extension only |
| Clarify | Qwen3-4B JSON + grounding | 0.85 / 0.85 | 1.4-1.9 s loaded | 3 GB | Apache-2.0 | Grounding in core regardless |
| All text | Apple Foundation Models | not measured | — | 0 | system | Opt-in after S5 |
| Retrieval | Qwen3-Embedding / potion-multilingual | romanized-Hindi recall@1 0.93 / 0.50 | — | — | Apache / MIT | Qwen3 if embeddings |
| OCR | Apple Vision / PP-OCRv6 / Tesseract | 26 / 27 / 22 of 28 facts; no Indic / digits / clean only | 429 ms Vision | system / 31 MB / 1 MB | system / Apache | Vision Apple; PP-OCRv6 web |
| Vision LM | Qwen3.5-2B 4-bit | 28/28 facts | 12 s | 3.0 GB | Apache-2.0 | Not before 2027 |

³ Main set (60 items) / held-out set (20), from the automated counter. S1-mini vs Qwen3-4B is not significant.

## Part C. Proposed edits by BLUEPRINT section

**Lineage table.**
- **Row 2:** the reason becomes "CRDTs only move conflict choices into Lamport counters; REST must still retry transient errors".
- **Row 10-11:** replace "at 1.7-3.2 s p50" with "S1-mini 8-bit 171 ms p50 on a quiet M5; accuracy vs Qwen3-4B not significant". S1-mini moves to TRIAL.
- **Row 18:** add "the gate under-asks when its catch rates are wrong; measure them".

**§1.** Replace "an executor (no FIRE, no computer use)" with "never runs its own GUI or browser agent; later acts only through typed channels up to the target app's native draft".

**§2.**
- Row 2 adds mixed-script capture. It also notes that OS models give the India segment little: there is no Hindi in Apple Foundation Models, SpeechTranscriber or Chrome's Prompt API.
- Row 3: local audio on macOS 26 is possible before 2d through Apple speech.

**§3.**
- **MVP adds:**
  - "Report this output", with published contact details, on every generated artifact.
  - An Agent Brief dialect for agent targets: prefilled, never submitted.
- **2c adds:** App Intents generated from the MCP catalog.
- **2d becomes:** "on-device English final pass, runtime chosen by measurement; Apple SpeechTranscriber fallback; S1-mini cleanup TRIAL".

**§4.**
- **Forge step 1:** the `ContextEnvelope` gains the language context and, later, `captures[]`. Captures carry OCR text, pixels only with `includeImage`, and are always marked untrusted.
- **Step 3:** core strips disfluencies before `understand`, and sets a slot's source to `said` only when the value is grounded in the user's words.
- **Step 4:** `compose` becomes a deterministic Brief IR render through the card, plus at most one LLM pass over the renderer's issues.
- **Do not build:** add an in-house GUI agent, on-device vision models, third-party executable plugins and Expo DOM screens.
- **New files:** add `channels/<id>.yaml` and an a11y module (announce, StreamRegion, Command Registry).

**§5.**
- **"Why Tauri" becomes:** "~110 MiB smaller download; the runtime gap is +25-27 MiB (1.3x), with the same idle CPU and first paint. Decide on S2's capabilities (key-up, panel focus, paste into 10 apps) and on Rust ownership." S2 measures phys_footprint over all processes, WebKit's XPC services included (`electron-shell/bench/procstat.py`), not RSS.
- **Hold-to-talk:** Carbon `RegisterEventHotKey` accepted press and release handlers without Accessibility permission (probe; no physical key was pressed). Hold-to-talk on a standard key combo may therefore need no grant. Accessibility would then cover only modifier-only keys and paste. S2 confirms with physical keys.
- **Electron fallback:**
  - A ~100-line Carbon N-API addon (estimate) instead of uiohook-napi.
  - Bundled packages kept out of the asar (-60 MiB).
  - A sandboxed renderer.
  - Blockmap differential updates.
  - An 8-week Chromium update cadence.
- **Distribution:**
  - The reason for skipping the Mac App Store is App Review guideline 2.4.5, not the sandbox.
  - A Mac App Store "Lite" (hotkey, copy, user presses ⌘V) is possible from a channel profile.
  - Channel profiles fix `caps`, the paywall and consent at build time, and CI rejects symbols a channel forbids.
- **Clipboard:** skip clipboard restore when `NSPasteboard.accessBehavior` is ask or deny.
- **iOS keyboard:** it gets no microphone even with Full Access (forum report). If one is built, a containing app records.
- **Mobile wrapper:** Capacitor is confirmed; Expo DOM and Tauri mobile are rejected.
- **Extension:** it receives selectors and a closed list of strategies only; Liquid rendering stays on the server (Chrome MV3).
- **`caps`:** gains `localStt {engines, locales}`, `capture`, `ocr` and accessibility facts.

**§6.**
- **IntentFrame:**
  - `outputLanguage` becomes `language {uiLocale, spoken[], script, register, replyLanguage, targetLanguage, numberingSystem}`.
  - The slot source enum adds `captured`.
  - Core sets `said`; the model never does.
- **Composition:**
  - Adopt the Brief IR as compose's contract.
  - Adopt the spike's card render section: parameter rules, negation strategy, `requires`, `ignores`, Liquid fields or JSON bodies, and an optional vendor schema.
  - The card lint bans range loops and include tags, and parameters are read only through `p.*`.
  - The lint escapes or flags tool-syntax tokens (`--flags`, `[Section]`) in free text, before rendering and after the LLM pass.
  - IR v0.2 adds `constraints[].scope`.
- **Unsourced specifics:**
  - Compare in a script-normalized space: NFC, digit folding, romanization, and locale number and day words.
  - Ambiguous time words such as "kal" become pick chips.
  - Add the number-consistency rule.
- **2c question:** the gate uses measured per-slot catch rates. Until those exist, it uses its draft mode (1-1.7 questions on voice).
- **Routing:**
  - Per-tier budgets of about $0.005 / $0.02 / $0.04.
  - Cache order: schema → system prompt → card → user memory → ask.
  - Trim the 2,571-token Brief schema.
  - A `user_plan` route class for BYOK and Sign in with ChatGPT. A 429 there is a soft stop, never a silent switch to our keys.
- **Device row:**
  - Replace the "2.4 s, F1 0.35" sentence with the on-device table above.
  - Add a task-level `DeviceAI` port: `capabilities(task, lang)`, one device attempt and then the cloud, and "Ran on" records the model version.
  - No Phi Silica.

**§7.**
- **S3:**
  - Add Sarvam Saaras v4 and 100 pure-Indic clips.
  - Rank vendors on effective $ per hour, including session and minimum billing.
  - Open streams on key-down and close them on release.
- **Guards:** a VAD before every engine, plus a known-phrase and repeated-n-gram filter that fails closed.
- **2d runtime:**
  - Before choosing, measure transcribe.cpp, parakeet-mlx and FluidAudio on 0 dB WER, warm latency with a foreground app using the GPU, footprint and download size (with quantized weights).
  - MLX engines set `mx.set_cache_limit`.
  - Add Apple SpeechTranscriber as the fallback, and DictationTranscriber for offline Hindi (`contextualStrings` ≤100, ≤5 reserved locales), through a Swift helper over stdio.
- **Language:** choose it before the engine; no English engine ever receives Hindi audio.
- **Vocabulary:**
  - Parakeet `boost.words` with a stable per-user lexicon.
  - Whisper prompts only per utterance, English only, ≤224 tokens.
  - A space-insensitive lexicon match after every engine.
  - Key-term recall gated per locale.
- **Licences:** the licence rule now bites. Nemotron-en is excluded; Nemotron 3.5 waits for a licence read.
- **Post-processing:**
  - Replace ">40% of tokens" with "no content word or name absent from the transcript and vocabulary", plus the number check.
  - On failure, fall back to a light clean (fillers, casing, end punctuation).
  - S1-mini is a TRIAL on desktop: one attempt, `max_tokens = 2×input + 64`.
- **Evaluation:**
  - Report both normalizers and `--ref-field intended`.
  - Use Indic-safe normalization, and voi-oiwer for any published Hindi number.
  - Report paired bootstrap CIs on the human slices.
  - Regenerate the two truncated clips.

**§8.**
- **Rationale:** Thompson sampling is chosen because offline evaluation stays reliable when the reward model is wrong. LinUCB had about 10% lower regret under drift. Correct `learning-flywheel.md` §8.2 to match.
- **Learners:**
  - Posteriors decay toward the prior, with a half-life of 50-100 interactions (tune on logs).
  - Configuration choices use a factored Bayesian linear model (~4.5 KB per user), never per-arm Beta over combinations.
- **Priors:**
  - L4 refits use proper empirical Bayes with posterior covariance, a variance floor, and prior strength capped near 20 interactions. Never raw pooled counts.
  - New tools get a wide prior and their own exploration budget.
- **Exploration:**
  - Greedy primary suggestions are allowed only if secondary-slot outcomes update the same posterior.
  - A 3% exploration floor; no diversity slot.
- **L1 counts:** chips the user kept without opening weigh 0, not ≤0.2, until the catch rate is measured.
- **Offline evaluation:**
  - Log the raw Monte Carlo counts and the exact floor mixture.
  - Use DR plus SNIPS with effective-sample-size diagnostics, never IPS alone.
  - Changes to decay or prior refits go to online tests.
- **Consent:** add a `train_models` purpose. Events from a keyboard extension never enter population learning.

**§9.** Confirmed as written. Add:
- Events record stage × tool, host app, local time and session boundaries.
- Isotonic calibration before the show gate relies on p.
- Population priors (k ≥ 20) for first-time needs.
- Never LightGBM with a user-id feature.

**§10.**
- **Tool Atlas:**
  - Discovery ladder: llms.txt → help-center API → sitemap → link crawl.
  - A bot wall stops the crawl; fall back to an official API or user-supplied docs.
  - Strip text in docs that is addressed to AI agents.
  - Recheck on a schedule set by measured churn: Claude Code, Figma and Midjourney daily (one request each), Suno weekly, Excel monthly.
- **Extraction:**
  - Deterministic parameter tables only for tools whose docs are catalogs (CLI flags, function lists).
  - Check claim support with an LLM or NLI model, not lexical overlap.
  - Keep contradicting claims with their dates.
  - Two tiers: a small card, plus a parameter table and a hashed section index.
- **Teach-a-tool:** "214/214 quotes over 5 tools, extracted by the spike agent; production grounding unmeasured".
- **Forget:** tombstones are delete-wins; no upsert can resurrect a forgotten memory.
- **Embeddings:** if they arrive, use Qwen3-Embedding with an `embedding_model` column and a romanized shadow index.

**§11.**
- **Budget:** per tier. Today's $0.02 cap blocks a $0.028 frontier draft.
- **MCP:**
  - A signed `requestState` is required. It carries the ids of slots already asked and the round count, and the server enforces the cap.
  - Regression test: an agent sends only the latest answers and leaves one P1 question blank.
  - Nothing essential lives only in resources or prompts.
  - Cap the Node heap, and keep the stdio entry lean (2026-era clients spawn it twice).
  - A host that brings its own model gets a deterministic scaffold.
- **Auth:** verify that the Supabase OAuth server supports CIMD, DCR, S256 PKCE, refresh rotation, and the Claude and Cursor callback URLs. Otherwise, use an external authorization server.
- **Hand-off:**
  - Add the `Action` type, a Tool Card `handoff` block and `decideExecution()`. In Phase 1 it returns `handoff`, and every call is logged.
  - ADR: no in-house GUI agent.
- **Outward surface:** the MCP catalog generates App Intents (2c), Windows App Actions and, later, AppFunctions. Each is read-only or confirms before acting.

**§12.**
- **Acknowledgement rule:** replace "acknowledged 2xx even when invalid" with:
  - 2xx plus a rejected-op log only for permanent validation errors.
  - 5xx on transient SQLSTATEs (40P01, 40001, 55P03), so clients retry.
  - Optionally, `pg_advisory_xact_lock(hashtext(user_id))` per write transaction.
- **Tables:**
  - `artifacts` adds `visibility` (default private), `license`, `indexable`, origin ids, `published_version_id`, `share_slug` (absorbing `share_links`), `skeleton_hash` and `moderation_state`.
  - `profiles` adds `handle` and `trust_level`.
- **Events and consent:**
  - `events` add an origin tag and the language dimensions.
  - A consent ledger covers cloud ASR, each LLM vendor, reading page context, learning and training. It generates the store disclosures from `data-map.yaml`.
- **Billing:** entitlements live on the server, behind a paywall that adapts to each storefront. Nothing is sold inside a keyboard extension.

**§13.** Add:
- "Report this output".
- TUF-lite signing.
- A card-text lint: Unicode tag characters, bidi controls, zero-width characters, base64 and imperative patterns.
- Stripping of agent-directed text from docs.
- OCR redaction with NFKC, confusable folding and whole `KEY=` lines, with names shown as keep/remove chips.
- A hidden-text filter on captures.
- pnpm `minimumReleaseAge` of 1440 minutes, and provenance on direct dependencies.
- BYOK only in the OS keychain, never in store builds.

**§14.**
- **G0/G1:**
  - First-load JS ≤320 KiB gzip per route.
  - Lighthouse mobile ≥85 and accessibility 100.
  - No new touch target under 44 px for coarse pointers.
  - A CSS layer-order check.
  - Virtual screen-reader tests (≤3 announcements per brief).
  - axe plus content-loss, forced-colours and keyboard checks at 320, 390 and 1280 px, in both themes.
  - Pseudo-locale screenshots.
  - An offline lazy-route test.
  - The MCP Inspector matrix.
- **G2:** the dictation table, per locale, with latency measured while a foreground app uses the GPU.
- **Nightly:** real VoiceOver and NVDA runs through Guidepup.
- **Regression sims:**
  - Users the gate has miscalibrated.
  - An MCP agent that forwards only the latest answers.
  - Two devices reconnecting with 1,000 operations each.
- **Eval hygiene:** a second rater on the intent and cleanup sets, and a 5-gram leak check.

**§15.**
- **Templates:**
  - `table-filter` (Library) and `dashboard-scorecard` (Skill Map) call `stylex.create` in 0.7.12 (from a grep of the CLI's template sources). They need the StyleX compiler or a rewrite.
  - `editor`, `settings-sidebar` and `ai-chat` set their root to `100dvh`, which must become `100%` inside the shell.
- **Coach Q&A:** do not build it on `ChatMessageList` until its live region can be overridden.
- **Streams:** status-only announcements through one `announce()` adapter (`ariaNotify`, else `useAnnounce`), with a setting "Speak while drafting: Off / Sentences / Everything".
- **Command Registry:** one spoken name per action, shared by its label, shortcut, palette entry and voice command.
- **Toasts:** undo toasts must not auto-hide (Astryx defaults to 5 s).
- **Astryx policies:**
  - `LayoutContent isScrollable={false}`.
  - `neutralProfile: custom`.
  - One icon set.
  - Per-component imports.
  - `astryx.css` imported outside the Tailwind entry, with no duplicate `theme.css`.
  - Self-hosted fonts.
  - A colour-mode script that runs before hydration.
  - Overrides for fixed-size parts.
  - A chip row that wraps.
  - Multi-line list rows.
  - Prerender the capture shell if mobile LCP must fall below 2.5 s.
- **i18n:**
  - Text direction comes from a script table.
  - `dir=auto` on user text.
  - Write our own Indic catalogs for Astryx's 641 string keys.

**§16.**
- **Signing:** "one key" becomes TUF-lite:
  - Two offline root keys.
  - A delegated CI key valid for ≤12 months.
  - A `meta.json` with a monotonic version, ≤30-day expiry, channel, minimum client version and hash.
  - Fallback to the last good bundle.
  - Separate keys for the content bundle, the updater and code signing.
- **Effects:** items declare their effects from a closed set.
- **Python:** a `training/` uv project is allowed only once a student model is attempted.

**§17.**
- **ADOPT:** liquidjs, ajv standalone, `@modelcontextprotocol/server` 2.4 with Inspector, linkedom, diff.
- **TRIAL:** parakeet-mlx, Apple SpeechAnalyzer, S1-mini (its card lists a custom `s1-mini-license`, not plain Apache-2.0).
- **ASSESS:** Nemotron 3.5, Sarvam, whisper.cpp, Loro, PP-OCRv6, winapp CLI.
- **AVOID:**
  - uiohook-napi (moved from ASSESS).
  - Nemotron-en.
  - mlx-whisper 4-bit and faster-whisper on CPU.
  - Kyutai and parakeet-mlx streaming mode.
  - Automerge.
  - Expo DOM and Tauri mobile.
  - Extism-JS and Node `--permission` as sandboxes.
  - Phi Silica.
  - LoRAX and torchtune.

**§18.**
- **Fix now adds:**
  - Harden the existing share links: report button, takedown reason codes, `noindex`, revocable slug.
  - Fix `MicButton.tsx`: its live region, its label switching and its ~2.5:1 interim-text contrast.
  - Correct `code-map.md`'s "never loops", and note the extension's `ClarifyStep` remount too.
  - Refresh the registry data (Midjourney V8.2, moved URLs).
- **Keep:** split `platform-registry.json` into a tool profile, a surface-adapter record and a policy record.
- **Retire:** the crawl-pkb crawler.
- **If `web/` is migrated in place:** rename `--color-accent` first.

**§19.**
- **Phase 0:**
  - S2 adds the Carbon key-up test and phys_footprint.
  - S3 adds Sarvam and the Indic clips.
  - S5 adds paraphrased slots and a second rater.
  - S6 adds the concurrent-reconnect test.
  - S1 adds touch-target and template checks.
- **Phase 1 adds:** Report output, the Agent Brief dialect, the language context, the consent ledger, channel profiles and TUF-lite.
- **2d:** picks the on-device runtime by measurement.
- **Phase 3 adds:** typed draft tools behind CaMeL-lite, an MCP client that pins tool descriptions by hash, and the first trained student.

**§20.** Add these risks:
- GPU contention.
- Licence traps (NVIDIA OML, S1-mini, openmdw).
- The unmeasured ASR runtime.
- App Review inconsistency.
- macOS pasteboard privacy alerts.
- Astryx's weight on phones.
- Single-author eval sets.
- Unknown Apple Intelligence enablement rates.
- The signing pipeline as a target.

**Appendix B.**
- **B1:** decide on capabilities and Rust ownership, not footprint.
- **B5:** add Sarvam; vendor price is a 4x margin lever.
- **B13:** Pro at $12/month or $96/year with frontier credits; no Lite tier; free tier with on-device dictation.
- **New B20:** use Apple speech for free macOS dictation in Phase 1 (its Swift helper exceeds the 300-line budget), or wait for 2d.
- **New B21:** accept S1-mini's licence.
- **New B22:** organization identities, and a Windows signing route for an India-based entity.

## Top 10 decisions the evidence settles

1. **Whisper is not the core on-device engine.** It misses 600 ms under real desktop use and is weak on Hindi. Parakeet ties it on English at 2-6x the speed (A for accuracy, B for speed).
2. **Every engine gets a VAD gate and a loop filter that fails closed,** and no engine gets a global vocabulary prompt (A).
3. **Language is chosen before the engine,** and Hinglish stays in the cloud for the MVP (B).
4. **Draft first with chips, and the server owns slot state.** The repo's web flow and a stateless MCP server both loop when an agent sends only the latest answers (A).
5. **Personalization uses an empirical-Bayes prior, a factored Bayesian model and decay.** Never per-arm Beta over combinations, and never priors refit from raw pooled counts (B).
6. **Prediction starts with counts.** Richer models showed no gain on real data worth their cost (B).
7. **One generic pipeline learns tools from public docs, and data cards over a Brief IR render them,** with no code per tool (B).
8. **No CRDT or sync engine for entity data, and transient database errors are retried, never acknowledged** (A).
9. **Astryx works for one SPA on Vite and on phones,** with CI weight budgets: PWA now, Capacitor in 2c (A for bytes).
10. **Shell footprint does not decide Tauri vs Electron;** download size and S2's capability results do (A for size). The evidence also supports: train nothing in the MVP, no in-house GUI agent, no third-party code.

## Still unproven (and how to prove it)

| Claim | Gap | How to prove | When |
|---|---|---|---|
| A cloud STT vendor meets privacy, en-IN/Hinglish WER and ≤700 ms | None scored | Soniox, AssemblyAI, ElevenLabs and Sarvam through `score.py` plus consented Hinglish and Indic clips | S3 |
| Parakeet's results survive the shipping runtime | Only parakeet-mlx measured | Same harness on transcribe.cpp, FluidAudio and quantized weights, with a foreground app running | Before 2d |
| Engine rankings hold on real speech | 105 of 133 clips are TTS | 1-2 h consented en-IN and Hinglish set; full Monsoon splits | Beta |
| Users catch wrong chips | Every ask-or-assume result assumed it | Log assumed slots later edited in their span, per slot and surface | Beta |
| Grounding works on paraphrases | Hard set lexical by design | Second-rater set with paraphrased and short-missing items | S5 |
| S1-mini quality and phone latency | Not significant; desktop only | 300-500 donated items; iPhone and Android runs | 2d |
| Apple Foundation Models quality | Apple Intelligence off | Owner enables it; run the existing `afm/` CLIs | Before a device tier |
| Host-app signal value | Built into the generator | Log host app and stage; rerun the harness on opt-in events | 2a |
| Priors from real, policy-generated logs | Sim cohorts were randomized | EB priors from beta logs vs a new-user holdout | Phase 3 |
| Production grounding for tool ingestion | The spike agent was the LLM | Fresh agent and production model write cards for 10 unseen tools | 2a |
| MCP in real hosts with real OAuth | Stub auth, no host | Claude Code `.mcp.json`, `.mcpb`, staging OAuth with CIMD | 2b |
| Tauri key-up, panel focus and paste | No Rust here | S2 with physical keys on the 10 launch apps | S2 |
| Mobile feel and screen readers | Emulation only | iOS and Android device pass with VoiceOver, TalkBack, NVDA | Before 2c |
| Licences | Nemotron 3.5, S1-mini, Apple voices unread | Counsel review | Phase 0 |
| Economics | Usage and paid share assumed | Refit the workbook on beta logs | After beta |