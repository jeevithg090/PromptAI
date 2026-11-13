# W2: Multilingual and India-first language strategy

**Lens:** global and non-English users, India first. **Date:** 2026-11-10. **Evidence:** ten probes in `spikes/w2-multilingual/` on an M5 laptop shared with ~30 other agents, so latencies are noisy and given as medians. Web facts come from 2025–2026 sources, and vendor claims are labelled.

## TL;DR

The blueprint already chose English UI with en-IN formats; English, Indian-English and Hinglish dictation; Lingui; an `outputLanguage` field; and locale packs (B4, §7, §11). This report keeps that direction and adds evidence plus six changes:

1. **Make code-mixing the default, not a locale.** Language is four fields per request, not one setting. The UI can stay English while input, reasoning and output follow the user and the destination tool.
2. **Treat script as data.** All-Devanagari Hinglish breaks the blueprint's "no unsourced specifics" check: naive matching traced **0 of 5** product names, days and numbers. Script-normalized matching traced **5 of 5** with **0 of 5** false matches.
3. **Capture English words in Latin script and never let a small LLM transliterate.** Turning the same Hinglish request from all-Devanagari into mixed script raised Sarvam-Translate from 24 to 69 chrF++, and Qwen3-4B from 60 to 65. Asked to romanize, Qwen3-4B wrote मुझे as "Me too". Use the ASR's codemix mode or a dedicated transliterator.
4. **Add Sarvam Saaras to the S3 bake-off, with a pure-Indic slice.** Independent 2026 benchmarks disagree on the leader.
5. **Budget in characters or requests, not tokens.** The same sentence costs 1.6–2.0× the tokens in Hindi, Tamil and Telugu on o200k, and 4–8× on small open models.
6. **Astryx ships no Indic catalog.** Hindi UI means translating its 641 component strings too.

## 1. Evidence from probes (this machine)

| # | Probe | Result |
|---|---|---|
| P1 | `intl/` Node 26.9, ICU 78.3, CLDR 48 | en-IN gives `₹1,23,45,678.90` and `1.2Cr`. `hi-IN-u-nu-deva` gives Devanagari digits. **ur-IN defaults to Arabic-Indic digits** (`۱۲٬۳۴۵…`). **Bare `bn` maximizes to `bn-Beng-BD`**, so store regions. All 22 scheduled languages have NumberFormat data. Hindi, Tamil, Bengali and Urdu plurals are only one/other; Arabic has six forms. "क्षत्रिय नमस्ते" is 15 UTF-16 units but 7 graphemes. Precomposed nukta letters (U+0958) equal their decomposed form **only after NFC**. |
| P2 | `i18n-bench/` same two ICU messages (plural + variable) in en/hi/ar, esbuild-minified with React 19 | Every library passed 21/21 plural cases. Gzip cost over the React baseline: **Lingui +3.6 KB**, Paraglide +4.4 KB, FormatJS precompiled +7.4 KB, FormatJS runtime +14.5 KB, i18next +16.2 KB, i18next-icu +28.6 KB. |
| P3 | Astryx 0.7.12 (`npx @astryxdesign/cli docs internationalization`, package contents) | 641 English keys. It ships 29 catalogs, including RTL `ar-SA` (365/641 keys, 57%) and `he-IL`, but **no Hindi, Indic or Urdu**. Direction comes from `Intl.Locale.getTextInfo()` and **falls back to `ltr`** when that is missing; that API has been Baseline only since July 2026. Astryx does not set `<html dir>`. It runs side by side with Lingui as two providers; a single-catalog adapter is on the roadmap (meta/astryx#4029). |
| P4 | `speech/` macOS 26.6 Speech framework | `SpeechTranscriber` (new SpeechAnalyzer): 30 locales, **en-IN but no hi-IN**. `DictationTranscriber`: 54 locales, including hi-IN, ar-SA and he-IL. Legacy `SFSpeechRecognizer` lists hi-IN, **hi-IN-translit** and hi-Latn, but `supportsOnDeviceRecognition=false` for all three. |
| P5 | `afm/` Foundation Models | 23 languages, **none of hi/ta/bn/te/mr/ar/ur/he**. On-device Apple LLM features cannot serve Indic users. |
| P6 | `token-tax/` 120 parallel FLEURS sentences, median token ratio vs English | See table below. |
| P7 | `llm/` local MT, MLX 4-bit, greedy, 40 FLEURS sentences + 6 Hinglish requests | chrF++ hi→en / ta→en: Qwen3-1.7B 50.0 / 34.2; **Qwen3-4B 56.3 / 46.6** (1.4 s median). Sarvam-Translate scored 49.6 / 44.3 with 6 of 80 outputs looping; with repetition penalty 1.15 it scored 54.8 / 43.5 (3.8 s median). **Input script mattered more than model.** For the same Hinglish request (chrF++ / key terms kept of 14): Sarvam-Translate 24.1 / 6 on all-Devanagari vs **69.3 / 11 on mixed script**; Qwen3-4B 60.2 / 11 vs **65.2 / 13**. Qwen3-4B also produced "mid-journey" and turned *kal* (tomorrow) into "Wednesday". |
| P8 | `translit/` romanizing all-Devanagari Hinglish, 6 sentences, accepted-spelling lattice | Lattice WER: ITRANS 0.67, IAST 0.68, IAST+schwa 0.46, **Qwen3-1.7B 0.80**, Qwen3-4B 0.33. English words kept in English spelling: rules 0–2 of 19, LLMs 15–16 of 19. The LLMs also translated instead of transliterating, e.g. "मुझे" became "Me too" and "fix करो" became "fix it". |
| P9 | `translit/provenance_probe.py` | Specifics (Midjourney, Thursday, LinkedIn, Python, "3") traced to the transcript. Naive substring: **0/5** from Devanagari and 4/5 from mixed script. Romanize + consonant skeleton + number/day words: **5/5** on both, and **0/5** absent specifics traced. |
| P10 | `retrieval/` 40 Hindi FLEURS docs; recall@1 for the same sentence queried in English / romanized Hindi / Tamil | English-only encoders and keyword match: 0.05–0.23. potion-multilingual-128M (static, MIT): 0.93 / 0.50 / 0.85. multilingual-e5-small (MIT): 1.00 / 0.53 / 1.00. **Qwen3-Embedding-0.6B (Apache-2.0): 1.00 / 0.93 / 1.00.** Romanized Hindi is the hard case. |

**Token tax** (P6; tokens per sentence relative to English, median):

| Tokenizer | hi | hi (romanized) | mr | bn | ta | te | ur | ar |
|---|---|---|---|---|---|---|---|---|
| o200k (GPT-4o/5 family) | 1.57 | 1.82 | 1.81 | 1.67 | 1.96 | 1.94 | 1.65 | 1.34 |
| DeepSeek-V3 | 2.78 | 2.04 | 2.96 | 1.99 | 3.08 | 3.88 | 2.41 | 1.56 |
| Mistral-Small-3.1 (Sarvam-M's base) | 2.83 | 1.96 | 2.95 | 2.88 | 3.49 | 3.21 | 1.81 | 1.23 |
| Qwen3 | 4.44 | 2.04 | 4.65 | 4.98 | 6.25 | 7.13 | 3.15 | 1.62 |
| Llama-3.2 | 2.56 | 2.03 | 2.83 | 5.65 | 7.64 | 8.39 | 3.09 | 1.62 |
| Gemma 3 = Sarvam-30B/105B* | 1.31 | 1.83 | 1.42 | 1.21 | 1.42 | 1.77 | 1.53 | 1.43 |
| Sarvam-1 | 1.14 | 2.28 | 1.08 | 1.31 | 1.17 | 1.13 | 7.46 | 6.72 |

\*Sarvam-30B and 105B have a 262,144-entry vocabulary and matched Gemma 3's counts on every sentence. A shared tokenizer is likely but *unverified*. Romanized Hindi is *cheaper* than Devanagari on most open models and *dearer* on o200k, so no single script is cheapest everywhere.

## 2. What the world says (2025–2026)

**People type Hinglish in Latin script, and models handle it worse.** 84% of Hindi Facebook posts were in Roman script (Bali et al. 2014, cited by UW); the figure is old. In real maternal-health queries, romanized input scored **up to 24 points** worse than native script across leading LLMs (arXiv 2512.10780, Dec 2025). IndicKLAR (EMNLP Findings 2026) found the native-vs-English gap reaches about 0.50 on nine open models, while **code-mixed input lands within about 0.05 of English**. In a NAACL 2025 study, translating to English helped Punjabi, Odia and Assamese but did worse than the source language for Hindi and Marathi. **Translate-to-English is not a universal win; code-mixed with English terms often is.**

**Indic ASR has no clear winner.** HumynLabs BRIDGE (Apr 2026, 17 languages, conversational; read via a search summary, since the site did not resolve) gives overall WER of ElevenLabs Scribe v2 8.5%, Deepgram Nova-3 13.7% and Sarvam Saaras v3 18.9%, and notes that the code-switching leader differs from the WER leader. Voice of India (AI4Bharat + Josh Talks, Interspeech 2026) is a *closed* benchmark: 536 h, 15 languages, scored with spelling-tolerant OI-WER. It reportedly ranks Sarvam 1st or 2nd in most languages, and the press cites Urdu at 35.4% for OpenAI against 6.95% for Sarvam. A Bengali comparison (SraVaani, 2026) gives IndicConformer 22.7, Gemini 3 Flash 24.7 and Saaras v3 25.0. Sarvam's own figures for Saaras v4 (Sep 25, 2026) are 16.03% WER on IndicContextEval with keyword prompting and under 150 ms to first token. Treat them as vendor claims.

**Sarvam, the India-native vendor.** Saaras v4 is the default and v3 remains available. It covers 22 Indian languages plus English, with automatic language detection and modes `transcribe | translate | verbatim | translit | codemix`. **Streaming does not accept keyterms**, and REST takes clips of up to 30 s. Pay-as-you-go prices are speech-to-text ₹0.49/min (₹29.40/h, about $0.33/h at an assumed ₹88/$), translate and transliterate ₹20 per 10K characters, and language ID ₹3.50 per 10K. Its privacy policy says customer content is not used for training unless the customer opts in, and retention is set per workspace. A DPA and India data residency are still to confirm. Soniox *claims* code-switching across 60+ languages, including Hindi, Tamil and Telugu, with no language selection. ElevenLabs Scribe v2 Realtime covers 11 Indian languages.

**Open weights for later on-device or self-hosted use:**

| Model | Use | License | Note |
|---|---|---|---|
| IndicConformer-600M | 22-language ASR | MIT, gated on HF | Community int8 ONNX is 0.62 GB; community CoreML exists; sherpa-onnx (Apache-2.0) can run it |
| IndicTrans2 (incl. distilled 200M) | MT | MIT, gated | Repo last pushed 2025-10 |
| IndicXlit + Aksharantar | Transliteration | MIT; data CC-BY/CC0 | Repo idle since 2023 |
| Sarvam-Translate (Gemma-3-4B) | MT | **GPL-3.0** plus Gemma terms | Do not bundle |
| Sarvam-30B / 105B | Indic LLM | Apache-2.0 | 105B on API at ₹15/₹60 per M tokens in/out |

## 3. Options

**A. English pivot.** Machine-translate every input to English, run the English pipeline, translate back. *Pros:* one eval set; cheap tokens; frontier models are strongest in English. *Cons:* translation errors compound (P7: *kal* became "Wednesday"; brand names got mangled); it hurts Hindi and Marathi (NAACL 2025); users see machine-translated text and cannot verify their own words.

**B. Native-first, Indic stack.** Full UI in 10+ languages from launch; Sarvam (or AI4Bharat) for ASR, MT and LLM; native script throughout. *Pros:* best for Indic-dominant, non-English users; tokenizer-efficient Sarvam models. *Cons:* about 10× the translation and QA surface for 1–3 engineers, plus 641 Astryx strings per language. The tools users want to master (Midjourney, Excel, Cursor) are English-first, so a Tamil UI around them helps less than it seems. There is no India demand data yet.

**C. Code-mixed by design: localize the interaction, not the chrome** (non-obvious, **recommended**). The UI stays English with en-IN formats until data says otherwise, and every request carries explicit language fields. Users speak or type any mix in any script and never pick a language. A frontier model reads the mix directly, with no MT pre-pass. The brief is compiled in the language its destination tool handles best (a Tool Card field). Coaching replies come in the user's register, typically Hinglish with tool terms kept in English, which matches how Indians already learn software and the IndicKLAR result. Romanized input is first-class but riskier (Script Gap): it is shown back for confirmation and protected with key-term lists.

| | A Pivot | B Native-first | C Code-mixed |
|---|---|---|---|
| Build cost (1–3 eng) | Low | High | Low–medium |
| Quality for Hinglish users | Medium (MT errors) | Medium | High |
| Quality for monolingual Tamil/Bengali users | Medium | High | Medium; rises with UI packs |
| Fits English-first destination tools | Yes | Partly | Yes |
| Reversible toward B | Hard | — | Yes, via locale packs and catalogs |

**Commit: C**, with B's assets (Sarvam ASR modes, Indic catalogs) added language by language as beta data justifies them. A's MT is used only for long documents and low-resource languages, where translate-test measurably helps.

## 4. The strategy in practice

- **Launch languages:** UI `en` with `en-IN` formats. Input: English, Indian English, Hinglish in Latin and Devanagari script, and Hindi. Output: any language the destination accepts. **After the beta:** a Hindi UI, then the next language by share of beta users' *spoken* language (likely bn, mr, ta, te), not by population.
- **Dictation:** add **Sarvam Saaras v4 (codemix mode)** to S3 next to Soniox, AssemblyAI and ElevenLabs. Add a 100-clip pure-Indic slice (hi, ta, te, bn) to the 50 Hinglish clips. Score with orthography-tolerant lattices (as `asr-testset` already does) plus key-term recall. Allow two vendors routed by detected language only if no single vendor clears every slice. Apple's new SpeechTranscriber has no hi-IN (P4). Hindi and Indic dictation therefore stay in the cloud until two spikes are done: IndicConformer int8 on sherpa-onnx, and Apple's DictationTranscriber hi-IN.
- **Script handling:** keep the transcript exactly as captured. Show romanized or native rendering as a view, never a rewrite. Transliteration comes from the ASR's `codemix`/`translit` mode or a dedicated model (IndicXlit), never from a small general LLM (P8).
- **Translation for English-first tools:** a frontier `compose` call writes the brief directly in the target language. When target ≠ user language, a one-line **gloss** in the user's language sits under the brief ("Midjourney prompt: old fort at sunset"), so meaning is checkable without reading the English.
- **RTL:** stay ready for it without shipping it. Enforce logical CSS in our own code. Astryx enforces it only inside its components, via `@astryx/no-physical-properties`. Use `dir="auto"` on every user-text field and `<bdi>` around interpolated names. Derive `<html dir>` from a script table rather than `getTextInfo()` alone. Urdu (India and Pakistan) would be the first RTL locale; Astryx's ar-SA covers only 57% of its strings, so budget catalog work.

## 5. Architecture hooks needed from day one

These are cheap now and expensive to retrofit.

1. **`LanguageContext` on every request and event.** It replaces the lone `outputLanguage`:
   ```ts
   type LanguageContext = {
     uiLocale: string;                          // BCP 47 with region: 'en-IN', 'bn-IN' (never bare 'bn')
     spoken: { tag: string; share: number }[];  // ASR LID, e.g. [{tag:'hi',share:.6},{tag:'en',share:.4}]
     script: string;                            // ISO 15924 as captured: 'Latn' | 'Deva' | 'Taml' | ...
     register: 'native' | 'codemix' | 'romanized';
     replyLanguage: string;                     // coaching and explanations (often 'hi-Latn' Hinglish)
     targetLanguage: string;                    // the brief; default = ToolCard.languages.best
     numberingSystem?: 'latn' | 'deva' | 'arabext' | string;
   };
   ```
   Log it in events, since it is chosen or observed, not inferred demographics. Slice every gate and metric by `register × script × uiLocale`.
2. **Tool Card `languages:`** `{ best: 'en', accepts: [...], ui: [...], limitUnit: 'grapheme' | 'utf16' | 'byte' | 'token' }`. Limit checks must count the way the destination counts, because Hindi is 2.1× longer in UTF-16 than in graphemes (P1).
3. **Script-normalized provenance.** The "no unsourced specifics" check and vocabulary boosting compare in a normalized space: NFC, Unicode digits to ASCII, romanized tokens, consonant skeletons, and per-locale number and day words (P9). Ambiguous Hindi time words (*kal* = yesterday or tomorrow, *parson* = the day before yesterday or after tomorrow) resolve from tense. When tense is unclear the word becomes a pick chip, never a guessed date.
4. **Locale packs** (`catalog/locales/<bcp47>/`) gain `asr.route`, `keyterms` with per-script variants, `numbers`, `days`, `ambiguous_time_words`, `translit.scheme`, `commands` (already planned) and an `eval` slice manifest. They are data, not code.
5. **Text storage.** Keep the original string, NFC-normalized, plus `script` and `lang`. Never transliterate in place. Measure and truncate with `Intl.Segmenter` graphemes. Collate with `Intl.Collator(uiLocale)`; Astryx exposes `useCollator`.
6. **One `fmt` module** bound to `LanguageContext.uiLocale` and `numberingSystem`. Ban `toLocaleString()` without arguments via lint. Store ISO dates and IANA zones (`Asia/Kolkata`).
7. **Strings:** Lingui ICU catalogs with message descriptions. A pseudo-locale CI screenshot runs for both Lingui and Astryx. `dir` comes from a script table and is passed explicitly to `InternationalizationProvider` and `<html>`.
8. **Budgets and quotas** are in characters, minutes or requests, never raw tokens, so Tamil users are not charged 2× (o200k) to 8× (small models) for the same ask. Route token-heavy scripts away from Qwen and Llama-class local models.
9. **Multilingual embeddings for memory and search.** Embed with a model that crosses scripts (P10: Qwen3-Embedding-0.6B). Also index a romanized shadow of Devanagari text, because a Hinglish user will search "meeting postpone" for a note dictated in Devanagari. Record `embedding_model` per vector so the model can be swapped.
10. **Eval harness:** FLEURS (CC-BY-4.0), IndicVoices (CC-BY-4.0, 22 languages, 7,348 h per the paper), MUCS-2021 Hindi–English and Bengali–English code-switching (CC BY-SA 4.0, 5.18 h Hindi–English test), Lahaja (Hindi accents, 12.5 h), Vistaar's 59 benchmarks, Aksharantar for transliteration, Script-Gap-style native-vs-romanized pairs for `understand`, plus consented PromptAI dictations. Licenses for Lahaja and Svarah are *unverified*. Voice of India is closed and usable only as an external reference.

## 6. Risks

- **Synthetic, tiny probes.** P7–P10 use 6 macOS-TTS Hinglish sentences and 40 FLEURS sentences. They show failure modes, not rates. Sarvam-Translate ran 4-bit, which may understate it, and P10's romanization is diacritic-stripped IAST, not chat spelling. Real Hinglish speech from 30–50 consented speakers is the gating dataset.
- **Vendor drift.** Sarvam's own pages disagree on price: ₹1.5/min on the marketing page cited by `dictation.md`, ₹0.49/min on the docs pricing page. Benchmark leaders also flip between reports. Pin results to dated runs and invoices.
- **Romanized input silently degrades understanding** (up to 24 points in Script Gap). The confirmation view and pick chips are the mitigation, measured by the chip-flip rate sliced by `register`.
- **Licenses:** IndicConformer and IndicTrans2 are MIT but gated, and the ONNX and CoreML builds are community conversions. Sarvam-Translate is GPL-3.0. Data licenses vary by subset.
- **Astryx gaps:** no Indic catalogs; RTL detection relies on a newly Baseline API; two providers until #4029 lands.
- **Apple on-device:** there is no Hindi in SpeechTranscriber or Foundation Models. DictationTranscriber lists hi-IN, but its accuracy and Hinglish behaviour are untested here: installing its asset changes system state, so it was not attempted. Plan for Indic users on iOS and macOS needing network.
- **Privacy:** an India-hosted vendor eases DPDP data-residency concerns but needs its own DPA review (see `safety-privacy.md`).

## Sources

- Probes and code: `/Users/gangadhara/Documents/PromptAI/blueprint-work/spikes/w2-multilingual/` (intl, i18n-bench, astryx, speech, afm, token-tax, llm, translit, retrieval)
- Astryx docs via `npx @astryxdesign/cli@0.7.12 docs internationalization` · https://astryx.atmeta.com · https://github.com/meta/astryx/issues/4029
- MDN `getTextInfo` (Baseline 2026): https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/getTextInfo
- Sarvam Saaras models: https://docs.sarvam.ai/api-reference-docs/getting-started/models/saaras.md · Saaras v4: https://www.sarvam.ai/blogs/introducing-saaras-v4 · pricing: https://docs.sarvam.ai/api/getting-started/pricing · text APIs: https://docs.sarvam.ai/api/api-guides-tutorials/text-processing/overview · privacy: https://sarvam.ai/privacy-policy · retention: https://docs.sarvam.ai/api/platform/data-retention.md · changelog: https://docs.sarvam.ai/changelog.md
- Sarvam open models: https://huggingface.co/sarvamai/sarvam-30b · https://huggingface.co/sarvamai/sarvam-105b · https://huggingface.co/sarvamai/sarvam-translate · https://huggingface.co/mlx-community/sarvam-translate-mlx-4bit
- IndicConformer: https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual · https://github.com/AI4Bharat/IndicConformerASR · int8 ONNX: https://huggingface.co/yashwork-byte/indic-conformer-600m-int8-onnx · CoreML: https://huggingface.co/phequals/indic-conformer-600m-multilingual-coreml-rnnt
- IndicTrans2: https://github.com/AI4Bharat/IndicTrans2 · IndicXlit: https://github.com/AI4Bharat/IndicXlit · Aksharantar: https://huggingface.co/datasets/ai4bharat/Aksharantar
- Vistaar: https://arxiv.org/abs/2305.15386 · IndicVoices: https://arxiv.org/html/2403.01926v1 · IndicVoices-R: https://huggingface.co/datasets/ai4bharat/indicvoices_r · Lahaja: https://arxiv.org/pdf/2408.11440 · MUCS 2021: https://openslr.org/104/
- Voice of India: https://arxiv.org/abs/2604.19151 · https://analyticsindiamag.com/ai-news/ai4bharat-josh-talks-benchmark-flags-55-error-rate-for-openai-in-indian-speech · BRIDGE (search summary only): https://humynlabs-bridge-report.pages.dev/ · SraVaani: https://arxiv.org/pdf/2608.08235
- Script Gap: https://arxiv.org/abs/2512.10780 · IndicKLAR: https://arxiv.org/abs/2605.29637 · NAACL 2025 Indic QA translate-test: https://preview.aclanthology.org/moar-dois/2025.findings-naacl.141.pdf · Roman-script use: https://depts.washington.edu/sociolab/publications/documents/2-9-roman-hindi-urdu.pdf · HiACC: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12329218/
- Soniox Hindi (vendor): https://soniox.com/compare-stt/soniox-vs-openai/hindi · ElevenLabs Scribe v2 Realtime: https://elevenlabs.io/blog/scribe-v2-realtime-in-elevenlabs-agents · https://www.cxodigitalpulse.com/elevenlabs-launches-scribe-v2-realtime-for-sub-150-ms-live-transcription-across-90-languages/
- Apple Foundation Models languages: https://developer.apple.com/forums/thread/805378 · ML Kit GenAI: https://developers.google.com/ml-kit/genai
- Lingui 6: https://newreleases.io/project/github/lingui/js-lingui/release/v6.0.0 · repos checked with `gh api` on 2026-11-10: lingui/js-lingui (MIT), opral/paraglide-js (MIT), i18next/i18next (MIT), formatjs/formatjs (react-intl BSD-3-Clause per npm), k2-fsa/sherpa-onnx (Apache-2.0), indic-transliteration/indic_transliteration_py (MIT), MinishLab/model2vec (MIT)
- Blueprint context: `/Users/gangadhara/Documents/PromptAI/blueprint-work/BLUEPRINT.md` (B4, §7, §11), `research/dictation.md`, `research/astryx-ui.md`
