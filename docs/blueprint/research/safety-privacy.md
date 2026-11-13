# Safety, privacy and security by design: PromptAI blueprint lens

Research lens: safety, privacy and security. Date: 2026-11-10.
Method note: the shared web-search budget ran out partway through this run. After that I checked facts by fetching primary pages directly and checked every repo with `gh api`. Anything I could not confirm is marked **unverified**.

## Bottom line

The vision changes what PromptAI is. The new product would read screens, pages and docs, listen through the microphone, remember each person, run prompts, and publish to a community. That is Simon Willison's *lethal trifecta*: private data, untrusted content, and a way to send data out. **No classifier makes that safe; the architecture has to.** Recommendation:

1. **Local-first by default.** Memory, history and profile live on the device under an OS-held key. They sync only as end-to-end encrypted (E2EE) blobs, with the data key wrapped by a passkey (WebAuthn PRF).
2. **Taint-gated capabilities.** A small rule-based policy engine ("CaMeL-lite") tracks where every context item came from. It refuses consequential actions from tainted contexts unless the user approves the exact action.
3. **Risk-tiered content safety.** A rule-based floor for hard-line harms that always fails closed, plus a model tier whose failure mode depends on the gate.
4. **Client-side PII and secret detection** before anything leaves the device.
5. **One machine-readable data map** that generates the policy, subprocessor list and store labels, checked in CI.

Keep the current invariants; replace the regex classifier, blanket fail-closed and the "E2EE" claim.

## 1. Threat model

**Assets, most sensitive first:** the personal model (memory, inferred intent); raw voice, screen and pasted docs; prompt history; BYOK keys; account and billing data; public content; knowledge base and routing config.

| # | Threat | Vector in PromptAI | Impact | Primary control |
|---|---|---|---|---|
| T1 | Indirect prompt injection | Custom-platform docs (`DocFetchService` → `PlatformProfileAgent`), PKB crawl, screen/web context, library templates, MCP tool output, model output in FIRE | Poisoned drafts, poisoned memory, exfiltration, unwanted actions | Provenance taint + capability policy + quarantined structured extraction (§2) |
| T2 | Exfiltration channel | Markdown images or links in rendered output, URL fetch, share links, text inserted into third-party chat boxes, MCP write tools | Private memory leaks to attacker | Trifecta breaker: egress tools are never callable from a context holding untrusted content plus private data without confirmation |
| T3 | Memory / personalization poisoning | Injected "preferences" from tainted sessions; gradual drift | Long-lived manipulation | Memory writes stay user-confirmed (already the design); provenance stamp; a "pause learning" control |
| T4 | Harmful generation | User asks for harmful content; FIRE runs prompts; image lab | Real-world harm, store removal | Risk-tiered safety (§3) |
| T5 | Jailbreak-as-a-service | Product used to craft jailbreaks against other AI platforms | Reputational, legal, ToS | Narrow policy on *operational* jailbreaks; allow authorized red-teaming with labels |
| T6 | Sensitive data over-collection | Pasted API keys, Aadhaar/PAN, health info; continuous screen/mic | Breach blast radius, regulator exposure | On-device default, client redaction chips, never store raw audio or screens |
| T7 | Server compromise / insider | Database dump, admin misuse, subprocessor breach | Mass disclosure | Ciphertext at rest under user-held keys; admin "impossible by construction" invariants (keep) |
| T8 | SSRF / egress abuse | Server-side fetchers | Cloud credential theft | Egress proxy or pinned-IP fetch (§9) |
| T9 | Abuse, cost, supply chain | Anonymous endpoints, FIRE as a free LLM proxy, share-link phishing; npm, model weights, local MCP servers | Cost blowout, phishing, code execution | Durable quotas, proof-of-work (§8); pinning, SBOM, safetensors only, MCP consent |
| T10 | Minors | Students; DPDP treats everyone under 18 as a child | Unlawful profiling | Age assurance; teen mode without behavioural personalization (§7) |

## 2. Prompt-injection defenses

The OWASP LLM Top 10 (2025) lists prompt injection as LLM01. Excessive agency (LLM06) and improper output handling (LLM05) are the amplifiers. I compared four options.

| Option | What it is | Strength | Cost / weakness |
|---|---|---|---|
| A. Detector only | Llama Prompt Guard 2 (86M/22M) or LlamaFirewall in front of untrusted text | Cheap. Meta reports 97.5% recall at 1% FPR for the 86M model in English, and 81.2% AgentDojo attack prevention at 3% utility loss | Adaptive attacks evade it (Meta says so). Willison: "95% is a failing grade" in security. Llama 4 Community License (not OSI) |
| B. Spotlighting + instruction hierarchy | Delimit, datamark or encode untrusted text (Hines et al., 2024) | The abstract reports attack success falling from >50% to <2% on GPT-family models, at almost zero cost | A probabilistic mitigation, not a guarantee |
| C. Full CaMeL | Privileged planner writes code; a custom interpreter enforces capabilities on data flows (Debenedetti et al., 2025) | Provable security on AgentDojo: 77% of tasks solved vs 84% undefended | Needs a custom interpreter, policy authoring and research-grade code. Too heavy for 1-3 engineers |
| **D. Taint-gated capability policy (non-obvious; recommended)** | The design patterns from Beurer-Kellner et al. (2025), implemented as plain code: plan-then-execute, dual LLM, map-reduce, context minimization | Most of CaMeL's guarantee for our action set, in roughly 150 lines of TypeScript | Coarser than CaMeL. Tainted sessions ask for confirmation more often |

**Recommendation: D, with B always on and A as a tripwire.**

- **Provenance on every context item.** Trusted: what the user typed or dictated, first-party config. Untrusted: web, docs, screen, others' library templates, MCP results, and model output derived from untrusted input. Any untrusted item taints the context.
- **Tool classes:** `read`, `private-read` (memory, history), `local-effect` (insert text, save memory), `egress` (fetch, publish, share, MCP write). A rule-based policy, not an LLM, decides what runs. A tainted context gets no `egress` or `local-effect` without a confirmation sheet showing the exact arguments. Untrusted content plus private data plus egress is never automatic; that rule breaks the trifecta.
- **Quarantined extraction.** Untrusted pages go one at a time (map-reduce) to a small model with a strict JSON schema: enums, length caps, no free-text "instructions" field. Only typed fields reach the planner, so `PlatformProfileAgent` emits a typed profile, never prose that steers drafting.
- **Plan-then-execute:** the plan is fixed from the trusted request before any untrusted data is read.
- **Output handling.** No auto-loading remote images in Markdown (a classic exfiltration channel); show each link's real domain; strict CSP; never execute output; keep "fill, never auto-submit".
- **MCP.** No token passthrough, minimal scopes with step-up, exact-command consent before launching local servers (MCP best practices). Also pin our tool descriptions (my addition).
- **Regression suite:** AgentDojo-style scenarios plus promptfoo or garak in CI; every bypass becomes a test.

## 3. Content safety and fail-closed vs fail-open

**Current state.** `backend/src/config/safety-patterns.ts` is a regex classifier with nine categories that map 1:1 to `docs/acceptable-use-policy.md`. Every gate fails closed (`classifyOrFailClosed`). Regex misses paraphrases and non-English text, which matters for an India-first audience. It also over-blocks things the roadmap needs:

- the `jailbreak` patterns block "ignore previous instructions", which is exactly what the Red-Team and Agent Builder features in `revival.md` must discuss;
- `phishing email` blocks security-awareness training content.

| Option | License / cost | Fit |
|---|---|---|
| OpenAI `omni-moderation-latest` | Free hosted API; text + image; no jailbreak category | Quick start for FIRE/image output; adds a subprocessor |
| Llama Guard 4 (12B, multimodal, S1-S14) | Llama 4 Community (not OSI) | Meta's card: English recall 69%, FPR 11%, F1 61%. Too weak to be the sole gate |
| Qwen3Guard (0.6B/4B/8B; 119 languages; safe/controversial/unsafe; streaming) | Weights Apache-2.0 | Best cheap multilingual hot path; three tiers map to block / care / allow |
| gpt-oss-safeguard (20B/120B, bring-your-own-policy) | Apache-2.0 | **Non-obvious fit:** feed it the AUP text directly. Too slow for the hot path; use for publish, appeals, async re-scan |
| ShieldGemma 2 (4B image) | Gemma terms (not OSI) | Image check if self-hosting |
| NeMo Guardrails / Guardrails AI | Apache-2.0; Python | Orchestration we can write in TypeScript; don't adopt as a runtime |

**Recommendation: three tiers.**

1. **Tier 0:** a rule-based floor for hard lines only (CSAM, sexual content involving minors, non-consensual intimate imagery of real people). Never depends on a model; always fails closed.
2. **Tier 1:** a fast multilingual model (small Qwen3Guard-Gen, or the hosted moderation API) on input and FIRE output.
3. **Tier 2:** gpt-oss-safeguard with the AUP as its policy, async, for publish, appeals and flagged sessions, and to label data for tuning Tier 1.

Whether Groq or Cerebras host these guard models is **unverified**; budget for a small self-hosted endpoint or the hosted API.

**Fail policy per gate** (replaces the blanket fail-closed rule):

| Gate | If the Tier 1/2 classifier is down | Rationale |
|---|---|---|
| Hard-line categories | Closed (Tier 0 is rule-based, so it never goes down) | Zero tolerance |
| Public publish (library, share, Forge Cards) | Closed: queue and retry | Public blast radius, and publishing can wait |
| Anonymous / demo endpoints | Closed | Abuse magnet |
| Teen accounts | Closed | Legal exposure and harm |
| Image generation output | Closed | High harm, needs visual check |
| Authenticated adult, private drafting or coaching | **Open, degraded:** Tier 0 + target platform's own moderation + async re-scan + flag | Otherwise one vendor outage takes the whole product down, and the output is text the user still has to paste somewhere |
| Any user whose risk score is elevated | Closed | Circuit breaker |

Also add a **fourth gate** on FIRE output. Today `FireService.ts` says "Safety is the caller's job", and callers check only the input.

## 4. PII and secret detection

| Option | Notes |
|---|---|
| Microsoft Presidio (MIT; the repo now redirects to `data-privacy-stack/presidio`, active 2026-11-10) | Mature recognizers plus an anonymizer. But it is Python plus spaCy: a second runtime next to a TypeScript lambdalith |
| Client-side deterministic recognizers (**recommended for v1**) | Regex plus checksums: Luhn for cards, Verhoeff for Aadhaar, plus PAN, IBAN, SSN, email, phone. Add secretlint/gitleaks rule sets for API keys, JWTs and private keys. Runs on every platform before data leaves the device |
| On-device NER (GLiNER, Apache-2.0) | For names and addresses later, if the data shows a need |

**UX:** an inline chip ("Looks like an OpenAI key; redact before sending?") offering reversible placeholders (`<EMAIL_1>`) restored in the result. Silent redaction breaks prompts. Presidio can come later as a batch sidecar for publish, share and log scrubbing, outside the request path.

## 5. Encryption and key management

**Current state.** `web/src/lib/crypto.ts` is a sound start: AES-256-GCM, random 12-byte IVs, PBKDF2-SHA256 at 600k iterations (the OWASP figure), a 256-bit recovery code, and a DEK wrapped twice. Five problems:

- (a) The server decrypts nothing but receives plaintext ideas for inference. This is "client-encrypted storage", not E2EE; name it that.
- (b) The DEK made at setup is extractable and cached, so XSS could export it. Re-import it as non-extractable after wrapping.
- (c) No additional authenticated data (AAD) binds ciphertext to `user_id`/`record_id`, so ciphertexts can be swapped between rows.
- (d) Both KEKs share one salt, and ciphertexts carry no key version.
- (e) Passphrases are friction; most users will skip them.

| Option | Trade-off |
|---|---|
| 1. Keep passphrase E2EE | Strong but unused. Recovery is painful |
| 2. Server-side KMS envelope keys per user | Simple, and crypto-shredding gives clean deletion. Not zero-knowledge: an insider or a breach of the KMS role exposes everything |
| 3. Full E2EE plus confidential-computing inference (TEE GPUs) | Ideal, but immature for a small team. Watch only |
| **4. Local-first vault + passkey-PRF-wrapped sync (non-obvious; recommended)** | Content and memory live on the device, under OS-held keys: Keychain/Secure Enclave, Android Keystore (via Tink), Electron `safeStorage`, WebCrypto non-extractable keys in IndexedDB. Sync is ciphertext only. The DEK is wrapped per passkey through the WebAuthn `prf` extension (MDN: a symmetric secret derived from the passkey), with HKDF, plus the recovery code. A passphrase is the fallback where PRF is missing. How widely PRF is supported across platforms is **unverified**, so feature-detect it |

**Inference** is labelled *transient processing*: each request carries only the profile slice it needs (context minimization), after client redaction, to no-training, zero-retention providers. `docs/compliance/subprocessors.md` lists the Groq DPA as "Requested", so today's zero-retention claim has no contract behind it yet.

**Learning:** cross-user learning uses only opt-in, content-free signals (the existing `outcome_signals` pattern) in aggregates of at least k users. Per-user learning runs on the device or over the encrypted profile.

## 6. On-device default; microphone and screen permissions

- **Dictation.** Default to on-device speech-to-text: Apple's speech APIs, WhisperKit (MIT), whisper.cpp (MIT), sherpa-onnx (Apache-2.0), or Moonshine streaming models (MIT; avoid its legacy non-English models, which are **non-commercial**). Cloud STT (today Groq Whisper) becomes a labelled opt-in fallback. Never persist audio. Apple counts on-device-only data as "not collected"; Play exempts on-device and true E2EE data.
- **Microphone UX.** Ask at first press-to-talk, never at onboarding. Show a recording indicator and a live transcript, auto-stop on silence, and write a specific purpose string.
- **Screen context** is the most dangerous capability. Only on explicit invocation, never continuous. Prefer the focused app's accessibility tree over pixels. Use a per-app allowlist that skips secure fields, password managers and banking apps. Process on device and send only reviewed text; store nothing.
- iOS has no general screen reading, so use the share sheet and App Intents. On Android, MediaProjection needs consent every session; avoid AccessibilityService, which Play restricts (details **unverified**).

## 7. Compliance map

| Regime | What it means for PromptAI |
|---|---|
| **GDPR** | Contract basis for the core; consent for memory and any training. Art. 25 by design; Art. 15/17/20 rights; likely a DPIA (profiling, voice); SCCs/DPF for US processors; 72-hour breach notice |
| **India DPDP Act 2023 + Rules 2025** | Phased start: Board provisions from 13 Nov 2025; further provisions from 13 Nov 2026 (three days from now); everything else from 13 May 2027. "Child" means under 18. Verifiable parental consent is required, and tracking, behavioural monitoring and targeted ads aimed at children are barred. So **teen mode = no behavioural personalization** unless a parent verifies. Penalties reach ₹250 crore per the Act's Schedule (**unverified** in this run) |
| **CCPA/CPRA** | Possibly below the thresholds at first, but design for it. The CPPA's ADMT, risk-assessment and cybersecurity-audit regulations were approved on 22 Sep 2025 and took effect 1 Jan 2026. No selling or sharing of data |
| **COPPA** | The FTC finalized amendments on 16 Jan 2025: separate consent before disclosing to third parties, and retention limits. Avoid "directed to children"; age-gate at 13 and above |
| **EU AI Act Art. 50** | Applies from 2 Aug 2026, so it is live now. Disclose AI interaction. Mark synthetic images and audio in a machine-readable way: C2PA via c2pa-js/c2pa-rs on FIRE images. Changes from the Digital Omnibus are **unverified**. Warning: if LEARN scores are ever used by institutions to assess students, that could fall under the Annex III high-risk education category |
| **Apple App Review 5.1.2(i)** | Must "clearly disclose ... third-party AI, and obtain explicit permission": a per-provider consent screen. 5.1.1(v): in-app account deletion. Privacy manifests for SDKs |
| **Google Play Data safety** | Declare cloud audio, user content, interactions; ephemeral processing is declared but not listed; in-transit encryption must cover all data; deletion path |

## 8. Abuse prevention

- **Durable quotas** per user, device and IP in Postgres, plus per-account cost ceilings (OWASP LLM10). The `/transcribe` cap is an in-memory `Map` that resets per Lambda instance; move it to the shared counter.
- **Anonymous endpoints:** ALTCHA (MIT, proof-of-work, no tracking) or Turnstile; fail closed.
- **FIRE:** cap output length and daily runs so it isn't a free LLM proxy.
- **Share links and mini-app forms:** `noindex`, a report button, outbound-link interstitials, and no password, card or OTP fields (phishing vector).
- **Library:** submission rate limits, new-account probation, Tier 2 review.

## 9. The current repo: keep, change, drop

**Keep:** the AUP ↔ category mapping, policy as config and classifier versioning (`safety-patterns.ts`, `types/Safety.ts`); the three gate positions; content-free decision logs and the append-only `audit_log` (`migrations/003`); appeals with consented review; the admin-plane "impossible by construction" invariants (`docs/admin-roles.md`); BYOK keys in SSM with no read-back (`KeyCustody.ts`); user-confirmed memory proposals (`MemoryExtractionAgent.ts`); the SSRF guard structure; Electron `sandbox`/`contextIsolation`; the credential-free extension content script with no auto-submit; audio never persisted; Stripe signature checks, `secureHeaders`, body limits and Zod validation.

**Change:**

- **Classifier.** Replace regex-only matching with Tier 0/1/2. Narrow `jailbreak` and `phishing` to operational misuse.
- **Fail policy.** Replace blanket fail-closed with the per-gate matrix.
- **FIRE.** Moderate outputs.
- **Prompt injection.** Nothing in `backend/src` handles it today. Apply §2 to `DocFetchService` → `PlatformProfileAgent`, `PromptImportAgent`, PKB ingestion and library templates.
- **`DocFetchService`.** Hand-rolled IP checks miss 100.64/10, IPv4-mapped 172.16/12 and NAT64, and DNS is resolved twice (check, then `fetch`), a rebinding gap. Use Smokescreen (MIT) or pin the resolved IP, as the MCP guidance advises.
- **`crypto.ts`.** Fix items (b)-(e) in §5. Add a passkey-PRF unlock.
- **`DELETE /me`.**
  - It isn't wrapped in a transaction.
  - It deletes `provider_connections` rows **without calling `revokeKey`**, which orphans BYOK secrets in SSM. `docs/retention-policy.md` claims the opposite.
  - I found no code that deletes the user from the auth provider.
  - `/export` returns only metadata; full export has to run client-side, since only the client can decrypt.
- **Docs drift.** `docs/data-classification.md` labels `prompt_versions.assembled` and `nodes_json` **[P] Public**; the compliance copy treats them as Restricted. The retention docs disagree on the audit log (36 months and deleted, vs 24 months and never deleted); `retention-sweep.ts` deletes at 36. The two subprocessor registers disagree, and neither lists Groq for audio, Cloudflare Workers AI, Pollinations or OpenRouter. Incident contacts are `tbd@`. **Fix:** one `data-map.yaml` (per field: class, purpose, retention, processor, region) that generates policy tables and store-label answers, with CI failing on drift.

**Drop:**

- The "E2EE" wording for content the server processes.
- 24-month retention of content-bearing sessions as a default.
- Any plan to bolt on a guardrail framework runtime.

## 10. What NOT to build

Our own safety model; a NeMo/Colang or Guardrails AI runtime; a full CaMeL interpreter; homomorphic encryption or TEE inference (for now); differential privacy in v1 (k-anonymity thresholds are enough); continuous screen or audio capture; custom cryptographic primitives; a consent-management platform (per-purpose toggles are enough); a Kids Category app; silent automatic redaction.

## 11. Incremental plan for 1-3 engineers

1. **Weeks 1-2:** fix `DELETE /me` (transaction, SSM revoke, auth deletion); durable transcribe quota; DEK fixes (non-extractable, AAD, key version); moderate FIRE output; collapse the docs into `data-map.yaml`.
2. **Weeks 3-5:** provenance and the taint policy engine; quarantined schema extraction for doc ingestion; spotlighting; hardened Markdown renderer; egress proxy; AgentDojo/promptfoo in CI.
3. **Weeks 6-10:** local-first vault plus passkey-PRF sync; on-device STT by default; client PII and secret chips; per-provider AI consent screen (Apple 5.1.2(i)).
4. **After that:** Qwen3Guard Tier 1 and gpt-oss-safeguard Tier 2; age assurance and teen mode before 13 May 2027; C2PA on images; DPIA.

## Sources

- https://arxiv.org/abs/2503.18813 (CaMeL, Debenedetti et al., 2025)
- https://github.com/google-research/camel-prompt-injection
- https://arxiv.org/abs/2506.08837 and https://arxiv.org/html/2506.08837 (Design Patterns for Securing LLM Agents)
- https://arxiv.org/abs/2403.14720 (Spotlighting, Hines et al., 2024)
- https://arxiv.org/abs/2505.03574 (LlamaFirewall)
- https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/
- https://genai.owasp.org/llm-top-10/
- https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M
- https://huggingface.co/meta-llama/Llama-Guard-4-12B
- https://huggingface.co/Qwen/Qwen3Guard-Gen-8B
- https://huggingface.co/openai/gpt-oss-safeguard-20b
- https://huggingface.co/google/shieldgemma-2-4b-it
- https://developers.openai.com/api/docs/guides/moderation
- https://modelcontextprotocol.io/specification/draft/basic/security_best_practices
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://developer.apple.com/app-store/app-privacy-details/
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/documentation/foundationmodels
- https://support.google.com/googleplay/android-developer/answer/10787469
- https://artificialintelligenceact.eu/article/50/
- https://en.wikipedia.org/wiki/Digital_Personal_Data_Protection_Act,_2023
- https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-finalizes-changes-childrens-privacy-rule-limiting-companies-ability-monetize-kids-data
- https://cppa.ca.gov/regulations/ccpa_updates.html
- https://github.com/data-privacy-stack/presidio
- https://github.com/secretlint/secretlint
- https://github.com/gitleaks/gitleaks
- https://github.com/urchade/GLiNER
- https://github.com/meta-llama/PurpleLlama
- https://github.com/NVIDIA-NeMo/Guardrails
- https://github.com/guardrails-ai/guardrails
- https://github.com/protectai/llm-guard
- https://github.com/ibm-granite/granite-guardian
- https://github.com/openai/gpt-oss-safeguard
- https://github.com/ethz-spylab/agentdojo
- https://github.com/promptfoo/promptfoo
- https://github.com/NVIDIA/garak
- https://github.com/microsoft/PyRIT
- https://github.com/stripe/smokescreen
- https://github.com/altcha-org/altcha
- https://github.com/ggml-org/whisper.cpp
- https://github.com/argmaxinc/WhisperKit
- https://github.com/k2-fsa/sherpa-onnx
- https://github.com/moonshine-ai/moonshine
- https://github.com/tink-crypto/tink-java
- https://github.com/contentauth/c2pa-js
- https://github.com/contentauth/c2pa-rs
