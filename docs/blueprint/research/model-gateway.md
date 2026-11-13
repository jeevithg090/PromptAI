# Model gateway, routing and on-device AI

Research lens: model access layer for PromptAI (repo name PromptForge). Written 2026-11-10. Prices come from the OpenRouter public catalog (`/api/v1/models` and `/endpoints`, read today), first-party pricing pages and the Runpod catalog, also read today. Every cost figure below is my own arithmetic on those prices. Benchmark-style quality claims are marked **unverified**: PromptAI has to measure them on its own eval set.

Note on method: the shared web-search budget ran out before this agent started, so every source was fetched directly (official docs, GitHub, Hugging Face and OpenRouter APIs). What I could not check is marked unverified.

---

## 1. Bottom line

Do **not** build or self-host a gateway. Make the model layer three thin parts:

1. **Device first.** One `LocalModel` interface per platform: Apple Foundation Models on iOS/macOS, ML Kit GenAI on Android, Chrome built-in AI on web and extensions, plus a tiny ONNX classifier that runs everywhere. It handles triage, rewriting, autocomplete and dictation cleanup at zero marginal cost.
2. **One policy router in the Hono backend**, built on **Vercel AI SDK 7** (Apache-2.0). It talks to **Vercel AI Gateway** as the primary path: zero token markup, BYOK with no fee, ordered model fallbacks and budgets. **OpenRouter** is the secondary path. Direct provider keys are the last resort.
3. **A learning loop, not a learned router.** Day one runs a deterministic policy table and logs every routing decision with its outcome. A contextual bandit replaces the rules only after enough reward data exists.

Estimated inference cost: about **$0.60 per typical active user per month**, ranging from $0.20 (light user) to $3 (heavy user). That is roughly half the cost of using one mid-tier model for everything. The bigger win is latency: one or two model calls per action instead of 6 to 9 sequential calls.

---

## 2. What the current repo does (keep / change / drop)

Files read: `config/model-routing.json`, `backend/src/services/ModelRouter.ts`, `backend/src/services/providers/*`, `backend/src/types/Provider.ts`, `config/model-pricing.json`, `config/model-capabilities.json`, and the BYOK paths in `backend/src/handlers/routes.ts`.

**Keep**
- The single `generate()` entry point (`services/providers/index.ts`). No agent imports a provider SDK, which is the right seam.
- Routing as config, plus the per-provider kill-switch flags (`ProviderRegistry.ts`).
- `MockAdapter` and `PROVIDER_FORCE_MOCK` for load tests, and the provider contract tests.
- The BYOK custody principle in the architecture doc §9.4: envelope-encrypted keys and no plaintext read-back path, including for admins.

**Change**
- **Route key:** `pipeline_step × complexity` is tied to the 13-agent pipeline. Use `task × tier × constraints` (latency, privacy, schema, tools).
- **No fallbacks:** each route names one provider, so a Groq free-tier 429 fails the request. Add ordered fallback chains and a circuit breaker.
- **JSON:** `response_format: json_object` returns valid JSON but does not enforce a schema. Use schema-enforced output plus Zod (section 5).
- **Truncation retry:** doubling `max_tokens` on `length` makes a looping model cost twice. Use per-task caps and effort levels.
- **Sampling params:** the adapter always sends `temperature`, which Anthropic's API version `2026-10-21` rejects with a 400. Gate parameters on model capabilities.
- **Stale prices:** `config/model-pricing.json` lists `claude-sonnet-5` at $3/$15 and `gpt-5.6-luna` at $1/$6; the live catalog shows $2/$10 and $0.20/$1.20. Pull prices from the gateway catalog.
- **Missing:** streaming, prompt caching and per-call cost metering.

**Bug to fix now: BYOK key misrouting.** `createSupervisor` (`backend/src/handlers/routes.ts:863-877`) selects only `secret_ref` from `provider_connections` and ignores the connection's `provider` column. It then injects `apiKeyOverride` into whichever adapter the route table picks, which is Groq for most steps. A user's OpenAI or Google key would be sent as a Bearer token to Groq's API. That discloses the key to a third party, and the request fails anyway. The compare path at `routes.ts:1232` reads `provider` correctly. Fix: filter routes to the connection's provider, or reject the call.

**Drop**
- The fixed 13-agent sequence that runs a critic on every draft (up to `CRITIC_MAX_REFINEMENTS=2`).
- `ModelRefreshAgent` and the cron scrape, plus the hand-written capability matrix with benchmark strings like "~82%" that nobody can verify.
- `OpenCodeZenAdapter`, which is unused. Also most hand-written adapters, which the AI SDK providers replace.
- **Production reliance on free tiers.** Google's pricing page says free-tier Gemini data is used to improve Google's products. That is unacceptable for a product built on understanding the user personally.

---

## 3. Gateways compared

| Option | What it is | Cost to us | Fallbacks / routing | BYOK | Verdict |
|---|---|---|---|---|---|
| **Vercel AI Gateway** | Hosted, works with AI SDK 7, Chat Completions, Messages and Responses APIs | "No markup and no platform fee on tokens"; payment processing fees apply; team-wide ZDR $0.10/1k requests, per-request ZDR free | `providerOptions.gateway.models` (ordered model fallbacks) plus `order`/`only` (provider order); budgets per key | No fee, paid tier only. **Caveat:** a failed BYOK request is retried on system credentials and charged to our balance, and budgets exclude BYOK spend | **Adopt (primary)** |
| **OpenRouter** | Hosted catalog, 467 models in today's read | No inference markup; credit-purchase fee (amount not rendered on the FAQ page); BYOK free up to $25k/month, then 5% | Automatic provider fallback; Auto Router is free and switches models rarely within a session to preserve the cache | Yes | **Adopt (secondary, and the recommended "one key" for BYOK users)** |
| **Cloudflare AI Gateway** | Proxy in front of providers | Core features free; Unified Billing adds 5% to credit purchases; logs: 100k total on Workers Free | Model aliases, dynamic routes, caching, rate limits | Stored keys | **Trial** if the backend moves to Workers (revival.md proposes this for SSE) |
| **LiteLLM** | Python SDK and self-hosted proxy | MIT core; `enterprise/` directory under a separate license | Rich | Yes | **Avoid** self-hosting the proxy: 2026 advisories include critical auth bypass via host-header injection (GHSA-4xpc-pv4p-pm3w), privilege escalation to proxy admin (GHSA-7hp6-4w63-5g45) and a master-key leak (GHSA-w4c7-34wj-hqm8). It is also Python in a TypeScript stack |
| **Portkey gateway** | Open-source TS gateway plus SaaS | MIT | Configs, guardrails, retries | Yes | **Assess.** The last release was v1.15.2 (2026-01-12); the 2.0 branch is a pre-release |
| **Helicone** | Observability with a gateway | Free: 10k requests; Pro $79/month | Caching, fallbacks | n/a | **Avoid as core.** The separate `ai-gateway` repo is GPL-3.0 with no push since 2025-11, and the pricing page says "no longer part of Mintlify" |
| **Bifrost (Maxim)** | Self-hosted Go gateway | Apache-2.0, active | Failover, semantic cache, budgets, virtual keys | Yes | **Assess.** Use only if an enterprise customer requires a VPC-hosted gateway |
| **Non-obvious: no gateway** | AI SDK providers called directly, with our own fallback list | $0 | Our own code | Yes | **Keep as the outage path.** The same AI SDK code can point straight at Anthropic/OpenAI/Google if the gateway is down |

**Why Vercel AI Gateway plus the AI SDK:** the backend is TypeScript (Hono). AI SDK 7 (`ai@7.0.168`, published today) gives one typed API for streaming, tools and structured output (`generateText({ output: Output.object({ schema }) })`) across providers. The gateway then adds fallbacks, budgets and ZDR filtering without a service we have to run. OpenRouter is the hedge: a wider open-model catalog and the best fit for BYOK. Both speak OpenAI- and Anthropic-compatible APIs, so switching is a base-URL change.

---

## 4. Learned routing: RouteLLM, NotDiamond, Martian and the alternatives

- **RouteLLM** (Apache-2.0): last push 2024-08. Keep the idea (route easy queries to the cheap model using preference data), not the code. **Avoid.**
- **NotDiamond**: commercial; its open RoRF router (MIT) was last pushed 2024-09. **Assess** as a benchmark only. **Martian**: commercial; current details **unverified**.
- **OpenRouter Auto Router**: free. It rates "eleven aspects of the request," picks a model and an effort level, and avoids switching models mid-session to preserve the cache. **Trial** as the baseline to beat.
- **Arch-Router-1.5B / Plano** (Katanemo): the model is under the **non-OSI katanemo-research license**; Plano is Apache-2.0. **Assess** after a license review.
- **vLLM Semantic Router** (Apache-2.0): only relevant if PromptAI self-hosts. **Not now.**
- **TensorZero**: its site says "no longer maintained"; the repo was archived in June 2026. **Avoid.**

**Recommendation.** Routing is a learning problem tied to PromptAI's own reward signal: did the user accept, copy or run the output without re-asking? No vendor router sees that signal. Roll it out in three steps:

1. **Rules (day one).** A policy table (section 6). Every call logs `{task, features, arm, propensity, cost, latency, outcome}`.
2. **Offline router.** Once enough labelled outcomes exist (a heuristic threshold of about 10k per task, unverified), train a logistic or small-MLP router on prompt embeddings plus user features. It predicts P(accept | arm), and offline policy evaluation compares it against the rules.
3. **Contextual bandit online.** Thompson sampling over a few arms (`cheap`, `standard`, `frontier` × effort), with reward = acceptance − λ·cost. Decisions are made once per task or session, not per turn, because caches are model-scoped. Hard guardrails stay in place: budget caps and privacy class.

This connects to the learning-rl and prediction lenses: the router is one bandit among the platform's personalization bandits.

A caution from Anthropic's cost guidance: before building a cascade, measure the simpler option, the strongest model at lower effort. One model means one cache namespace. Start with **two cloud models**, not five.

---

## 5. Structured outputs, caching, fallbacks and cost controls

**Structured outputs: one schema, every runtime.** Define each task's input and output once in Zod, in a shared package.
- Server: AI SDK `Output.object` maps to native modes. Anthropic uses `output_config.format` and `strict: true` tools. Groq enforces `strict: true` constrained decoding only on `gpt-oss-20b`, `gpt-oss-120b`, `qwen3.8-27b` and `muse-spark-open`, and does not support streaming or tools with it. Other Groq models fall back to JSON-object mode.
- Apple: `@Generable` for compile-time types. `DynamicGenerationSchema` builds schemas at runtime, so the same JSON Schema can drive the on-device model.
- Chrome Prompt API: `responseConstraint` takes a JSON Schema.
- Always validate with Zod. Allow **at most one** repair attempt on a cheap model, then return a typed error. Never loop.

**Prompt caching.** Order every request as stable prefix first (tools, then system prompt, then platform knowledge pack), volatile content last. Today's cache-read prices: Claude Sonnet 5.5 $0.20 per MTok (Anthropic first-party; OpenRouter lists $0.10) vs $2 fresh input; Claude Haiku 5.5 $0.01 vs $0.10; GPT-5.6 Luna $0.02 vs $0.20; Gemini 3.5 Flash-Lite $0.03 plus $1/MTok/hour storage. Keep a session on one model so the cache stays warm.

**Fallbacks.**
- Chain = same model on another provider, then a sibling model in the same tier, then one tier down, then on-device, then a graceful "draft locally" response.
- Opus 5.5 and Sonnet 5.5 support Anthropic's server-side refusal fallbacks (`fallbacks: "default"`, beta). Handle `stop_reason: "refusal"` as a routing event.
- Circuit-break any provider whose rolling error rate rises above a threshold.

**Cost controls.** Per-task `max_tokens` and effort; a per-user daily budget that degrades softly (frontier → standard → cheap → device); gateway budgets per key; loop guards (at most 2 model calls per action by default, 1 repair, a step cap per agent run, idempotency keys). Memory extraction and nightly personalization go through the **Batch** API at half price (Haiku 5.5 batch: $0.05/$0.25).

---

## 6. Routing policy by task

| Task | Tier and default | Fallback | Output | Latency target |
|---|---|---|---|---|
| Intent and domain classification, missing-information detection | **Device**: ONNX encoder classifier (Transformers.js on web, ONNX Runtime/Core ML native); generative check via Apple FM, Gemini Nano or Chrome Prompt API | Cheap cloud: Claude Haiku 5.5 or gpt-oss-20b (strict schema) | Schema | <300 ms device |
| Autocomplete / ghost text / next-action suggestions | **Device only** (Apple FM, Chrome Prompt API, WebLLM opt-in) | Turn the feature off; never stream cloud calls per keystroke | Text | <150 ms |
| Rewrite, tone, proofreading, dictation cleanup | **Device**: Apple FM; ML Kit Rewriting/Proofreading; Chrome Rewriter/Proofreader (developer or origin trial) | Haiku 5.5 | Text | <700 ms |
| Clarifying questions | Cheap cloud (Haiku 5.5, Gemini Flash-Lite) | gpt-oss-20b | Schema | <1 s |
| Main answer: drafting, tool coaching, plans | **Standard**: Claude Sonnet 5.5 at low/medium effort; alternates GPT-5.6 Luna, Gemini 3.6 Flash | Next model in the gateway `models` list | Stream + schema | first token <1 s |
| Hard reasoning, long agent runs, high-stakes domains | **Frontier**: Claude Opus 5.5; alternates GPT-5.6 Sol, Gemini 3.1 Pro | Standard tier with a warning | Stream | user-initiated |
| Critic / verifier | Cheap tier, only when draft confidence is low (about 30% of actions) | Skip | Schema | async |
| Memory extraction, profile update | Haiku 5.5 **Batch** | Retry next batch | Schema | hours |
| Transcription | **Device**: Apple SpeechAnalyzer (iOS/macOS 26+); ML Kit GenAI Speech Recognition (alpha); WhisperKit / whisper.cpp / Moonshine on desktop | Groq `whisper-large-v3-turbo` ($0.04/h, Groq-stated 12% WER); `whisper-large-v3` ($0.111/h, 10.3% WER) for accuracy-critical audio | Text + timestamps | streaming |
| Run the prompt on the target model ("FIRE") | The user's choice, through BYOK or the gateway | Gateway fallback | Stream | n/a |

**On-device reality check (verified today):**
- **Apple Foundation Models**: on iOS/macOS 26, 4,096 tokens per session, guided generation and tool calling. iOS 27 adds `PrivateCloudComputeLanguageModel` (larger context, stronger reasoning, behind a *managed entitlement* with a usage quota), image attachments, watchOS 27, and a `LanguageModelExecutor` protocol for plugging in other models. **Implication:** the Swift client can use one session API for the device model, Apple PCC and PromptAI's own cloud model.
- **Android ML Kit GenAI**: Summarization, Proofreading, Rewriting, Image Description and a Prompt API on Gemini Nano 2/3/4. Devices are limited (Pixel 9–11, Galaxy S25/S26, some others), inference is foreground only, and per-app quotas apply. Plan for most Android users to take the cloud path.
- **Chrome built-in AI**: Summarizer, Translator and Language Detector are stable since Chrome 138; the Prompt API is stable for extensions since 138 (the status table lists 148 for web); Writer, Rewriter and Proofreader are in trials. It needs 22 GB free disk and more than 4 GB VRAM (or 16 GB RAM and 4 cores), and **does not run in Chrome on Android or iOS**. That makes it a fit for the desktop Chrome extension only (Firefox has no equivalent).
- **Small open models** (opt-in local mode, future fine-tunes): Qwen3.5-0.8B/2B/4B (Apache-2.0), Gemma 4 E2B/E4B (Apache-2.0), Phi-4-mini (MIT), SmolLM3-3B (Apache-2.0). **License flags:** Gemma 3/3n (Gemma terms), Llama 3.2 (community license with MAU and use terms), Liquid LFM2/2.5 ("other") and Arch-Router (katanemo-research) are not OSI. Quality on PromptAI's tasks is **unverified**; run the eval first.
- **Desktop runtimes:** MLX / mlx-swift-lm (MIT) on Apple silicon; Ollama and llama.cpp (both MIT) as an opt-in local provider detected on localhost; ONNX Runtime GenAI (MIT) on Windows and Linux.
- **React Native** (if the platform lens picks it): `@react-native-ai/apple` (MIT, AI SDK-compatible), llama.rn (MIT), react-native-executorch (MIT), Cactus (Apache-2.0). Model downloads are opt-in.

---

## 7. Cost per active user

Assumptions, applied per assisted action:
- Triage: 1,200 input / 150 output tokens, 50% on-device.
- Main generation: 2,500 cached + 2,500 fresh input / 1,200 output. Mix: 70% cheap-main (GPT-5.6 Luna or Haiku 5.5), 25% Sonnet 5.5, 5% Opus 5.5 (Opus calls use 6,000 input / 3,000 output).
- Verifier on 30% of actions (Haiku 5.5, 3,000 / 200).
- Batched memory extraction (Haiku 5.5 batch, 1,500 / 200).

| Component | $ per action |
|---|---|
| Triage (50% cloud, Haiku 5.5) | 0.0001 |
| Cheap main, 70% (Luna: $0.00199 each) | 0.0014 |
| Standard main, 25% (Sonnet 5.5: $0.0175 each) | 0.0044 |
| Frontier, 5% (Opus 5.5: $0.084 each) | 0.0042 |
| Verifier (30%) + memory batch | 0.0002 |
| **Total** | **≈ $0.010** |

| User type | Actions/month | Inference $/month |
|---|---|---|
| Light | 20 | ~$0.21 |
| **Typical** | **60** | **~$0.62** |
| Heavy | 300 | ~$3.10 |

Dictation adds very little: 60 min/month, half of it on-device, the rest on Groq turbo, comes to about $0.02, plus about $0.007 for the cleanup pass. For comparison, putting every action on Sonnet 5.5 costs about $1.10 per typical user per month, and on Opus 5.5 about $2.10. Gateway fees on top: $0 (Vercel, excluding payment processing), a credit-purchase fee (OpenRouter), or 5% (Cloudflare Unified Billing). **Heavy users are the risk,** so per-user budgets are needed from launch.

**Self-hosting check (Runpod catalog, read today):**
- RTX 4090 24 GB: secure pod $0.89/h (about $650/month at 24/7); serverless $1.34/h, with stock HIGH in US-IL-1.
- L4: serverless $0.75/h, stock LOW. A40 48 GB: serverless $1.22/h, stock HIGH in CA-MTL-1 and EU-SE-1. H100 SXM: serverless $5.39/h, stock LOW.
- Against gpt-oss-20b on the API at $0.03/$0.13 (about $0.055/M blended at 3:1 input:output), one always-on 4090 pod breaks even at about **11.8B tokens/month**. That means sustaining about 4,500 tok/s, and whether one 4090 can do that is **unverified**. Serverless cold starts take minutes, which rules it out for interactive use.
- Runpod's language Public Endpoints (GLM-5.3 at $0.77/$2.42, Kimi, Granite 4.0 H Small, Qwen3-32B-AWQ) do not beat the gateway catalog on price.
- **Verdict:** no self-hosted inference until a single open model exceeds about $5k/month in spend, or a fine-tuned private model is needed.

---

## 8. Bring-your-own-key

1. **Two custody modes.** Device-held (Keychain, Android Keystore, OS keychain): the client calls the provider directly and the key never touches PromptAI. Server-held (web and server-side agents): envelope encryption under KMS, use and delete only, never read back.
2. **The connection binds to a provider.** Routing filters to models that key can reach, which fixes the section 2 bug.
3. **Supported keys:** an OpenRouter key as the "one key for everything" (BYOK free up to $25k/month); a Vercel AI Gateway key (no fee, but turn off or account for the system-credential retry); native Anthropic/OpenAI/Google keys; local Ollama or LM Studio URLs on desktop.
4. **Validate on save** with a 1-token call, and show which models the key reaches.
5. **Meter BYOK spend separately** and never count it against PromptAI budgets.

---

## 9. What NOT to build

- Our own gateway service, or a self-hosted LiteLLM proxy.
- A learned router before reward logs exist; an in-house model capability or benchmark matrix; any model-scraping cron.
- Self-hosted GPU inference for general traffic.
- Cloud autocomplete on every keystroke.
- Multi-GB model downloads turned on by default (mobile or WebLLM). Local models are opt-in only.
- A fixed critic on every draft, or unbounded repair loops.
- Free-tier providers in production paths.

---

## Sources

- https://vercel.com/docs/ai-gateway/pricing
- https://vercel.com/docs/ai-gateway/models-and-providers/model-fallbacks
- https://openrouter.ai/docs/faq
- https://openrouter.ai/docs/guides/routing/routers/auto-router
- https://openrouter.ai/api/v1/models
- https://openrouter.ai/api/v1/models/openai/gpt-oss-20b/endpoints
- https://developers.cloudflare.com/ai-gateway/
- https://developers.cloudflare.com/ai-gateway/reference/pricing/
- https://www.helicone.ai/pricing
- https://www.tensorzero.com/
- https://www.notdiamond.ai/
- https://github.com/BerriAI/litellm/security/advisories
- https://github.com/Portkey-AI/gateway
- https://github.com/maximhq/bifrost
- https://github.com/lm-sys/RouteLLM
- https://github.com/katanemo/plano
- https://huggingface.co/katanemo/Arch-Router-1.5B
- https://github.com/vllm-project/semantic-router
- https://github.com/vercel/ai
- https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
- https://console.groq.com/docs/structured-outputs
- https://console.groq.com/docs/speech-to-text
- https://aistudio.google.com/docs/pricing
- https://developer.apple.com/documentation/foundationmodels
- https://developer.apple.com/documentation/foundationmodels/privatecloudcomputelanguagemodel
- https://developer.apple.com/documentation/foundationmodels/managing-the-context-window
- https://developer.apple.com/documentation/speech/speechanalyzer
- https://developers.google.com/ml-kit/genai
- https://developers.google.com/ml-kit/genai/speech-recognition/android
- https://developer.chrome.com/docs/ai/built-in-apis
- https://developer.chrome.com/docs/ai/get-started
- https://github.com/mlc-ai/web-llm
- https://github.com/huggingface/transformers.js
- https://github.com/ml-explore/mlx-swift-lm
- https://github.com/ggml-org/llama.cpp
- https://github.com/ollama/ollama
- https://github.com/microsoft/onnxruntime-genai
- https://github.com/callstackincubator/ai
- https://github.com/cactus-compute/cactus
- https://github.com/argmaxinc/WhisperKit
- https://github.com/moonshine-ai/moonshine
- https://huggingface.co/Qwen/Qwen3.5-2B
- https://huggingface.co/google/gemma-4-E2B-it
- https://huggingface.co/microsoft/Phi-4-mini-instruct
- https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct
- https://platform.claude.com/docs/en/about-claude/pricing
- https://docs.runpod.io (GPU catalog and Public Endpoints read via Runpod MCP `list-gpu-types`, `list-public-endpoints`, 2026-11-10)
