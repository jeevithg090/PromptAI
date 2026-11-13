# Unit economics that shape architecture (wave 2)

Research lens: cost per active user, pricing, and the architecture choices that move margin. Written 2026-11-10. Model: `research/business-economics.xlsx` (9 sheets, 5,007 formulas, 0 errors, every input sourced or marked as an assumption). Scripts and raw measurements: `spikes/w2-economics/` (`measure.py`, `build_xlsx.py`; values computed with the Python `formulas` engine because LibreOffice is not installed). This report builds on `model-gateway.md`, `dictation.md`, `data-sync-backend.md` and `BLUEPRINT-draft.md` and does not repeat them.

## Headline

On today's prices, PromptAI's cost per active user is small for most people and large for a few. A Regular user (80 forges and 2 hours of dictation a month) costs **$0.47/month** in the recommended device-first architecture and **$0.79** if everything runs in the cloud. A Power user (400 forges, 10 hours) costs **$2.25** versus **$3.84**.

Three choices decide whether a $12 plan earns a healthy margin:

1. **The model-tier routing policy.** One standard-tier draft costs 20 times a cheap-tier draft.
2. **Where the free tier's speech recognition runs.**
3. **Which store collects the money.**

On-device processing matters less per paid user than people expect. It matters a great deal for the free tier, and it is what makes a generous free tier affordable at all.

**Recommendation: option 2, device-first hybrid.**
- On-device STT and cleanup by default; cloud drafting on a cheap-first router with a quota on standard and frontier calls.
- One Pro plan at $12/month or $96/year.
- Pull in the user-funded routes from option 3: BYOK, Sign in with ChatGPT plan usage, and the MCP host. These are a pressure valve for power users and an unlimited free path, not a separate cheap tier.

At 10k MAU with 5% paid, the model gives a 79% margin after payment fees, against 60% for cloud-first. Cloud-first with a premium STT vendor and a Wispr-style free tier comes out at **-1%**.

## 1. Evidence measured in this spike

Every number below is deterministic: token counts and file durations, no wall-clock timings. The M5's concurrency noise does not affect it.

| Measure | Value | Source |
|---|---|---|
| Tool Card size | median 1,024 tokens, max 1,740 | 8 cards in `spikes/prompt-representation/cards` (tiktoken o200k proxy) |
| Brief JSON Schema | **2,571 tokens** | `schema/brief.schema.json` |
| Brief output | median 393 tokens | 9 fixtures |
| Rendered prompt | median 332 tokens, p90 807 | deterministic render, no model call |
| Dictation length | median 6.0 s, mean 8.7 s, p90 14.1 s (human clips: median 10.5 s) | 133 clips, `spikes/asr-testset/manifest.jsonl` |
| Speaking rate | 152 wpm, 188 transcript tokens per minute | same |
| Billing inflation on these clips | 10 s minimum: **+40.5%**; +3 s session overhead: +34.6%; +1.5 s: +17.3%; per-second rounding: +6.7% | same |

Two findings carry weight:

- **The schema, not the Tool Card, is the largest part of every draft prompt.** At 2,571 tokens it is 58% of the cacheable prefix. Keep it in the cached prefix and trim it before adding more card content.
- **Short dictations inflate billed seconds.** Groq bills at least 10 s per request ([Groq docs](https://console.groq.com/docs/model/whisper-large-v3-turbo)). AssemblyAI streaming "is billed on WebSocket session duration, including idle time" ([pricing](https://www.assemblyai.com/pricing)). So the client must open the stream on key-down and close it on release, never keep a warm socket. The model applies these factors to every vendor's effective $/hour.

One correction for wave 1: Anthropic's first-party cache hit on Sonnet 5.5 is **$0.10/MTok** (0.05x base), not $0.20 as `model-gateway.md` says ([pricing](https://platform.claude.com/docs/en/about-claude/pricing)). The minimum cacheable prefix on all 5.5 models is 512 tokens. Caches are shared within a workspace when prefixes match exactly ([prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)). The shared schema + system + card prefix therefore hits across users. Anything per-user must come after it.

Per-call costs at measured sizes (Haiku 5.5 / Sonnet 5.5 / Opus 5.5, 60% cache hits, 1.15x tokenizer multiplier as an unverified assumption):

| Call | Cheap | Standard | Frontier |
|---|---|---|---|
| Draft (4,395 cached + 750 fresh in, 593 out) | $0.0007 | $0.0139 | $0.0278 |

The blueprint's per-forge `Budget` of $0.02 would refuse an Opus draft at these sizes. Either raise the frontier budget to about $0.04, or shrink the schema.

## 2. Market pricing (read 2026-11-10)

| Product | Paid plan, monthly / annual-equivalent | What is capped | Notes |
|---|---|---|---|
| Wispr Flow | Pro $15 / $12 | Free: weekly word limit, no longer stated as a number | Cloud-only. Third-party trackers report the free iPhone allowance was cut in October ([pricing](https://wisprflow.ai/pricing), [UsagePricing](https://www.usagepricing.com/blueprint/activity/wisprflow-2026-10-23-free-iphone-word-limit-cut)) |
| Superwhisper | Pro $8.49; $84.99/yr; $249.99 lifetime | Free: unlimited local Whisper | Own API keys on Pro ([site](https://superwhisper.com/); annual and lifetime are third-party, [Voicy](https://usevoicy.com/blog/superwhisper-pricing)) |
| Raycast | Pro $10 / $8 (500 AI credits); Plus $20 (3,000); Max $50 (7,500) | Credits; BYOK on Pro | [pricing](https://www.raycast.com/pricing) |
| ChatGPT | Go $8, Plus $20, Pro from $100 ($200 for 20x) | Message limits | Third-party, because the price fields did not render ([CometAPI](https://www.cometapi.com/chatgpt-pricing-2026-free-vs-go-vs-plus-vs-pro/), [Dupple](https://dupple.com/learn/chatgpt-plus-vs-pro)) |
| Claude | Pro $20 / $17; Max $100; Team $25 / $20 | 5-hour and weekly usage | [pricing](https://claude.com/pricing) |
| Grammarly | Pro $30 monthly; $144/yr ($12) | n/a | [support](https://support.grammarly.com/hc/en-us/articles/115000090011) |

Paid dictation and launcher tools cluster at $10–15 monthly and $8–12 annual. Only Superwhisper sells a lifetime licence, which its mostly on-device, zero-marginal-cost design makes safe. Raycast's **credits** are a precedent for metering only the costly part.

## 3. Cost per active user per month

Profiles (forges / dictation minutes per month, assumptions): Free 10 / 40; Light 20 / 30; Regular 80 / 120; Power 400 / 600 (~91k words; a top-11% Wispr user reported 107k words in 90 days, [review](https://mrktcorrect.pages.dev/blog/wispr-flow-review)); Extreme 800 / 1,250. Tier mix: 75% cheap, 22% standard, 3% frontier.

| COGS $/user/month | 1 Cloud-first | 2 Device-first hybrid | 3 User-funded |
|---|---|---|---|
| Light | 0.21 | 0.13 | 0.05 |
| Regular | 0.79 | 0.47 | 0.15 |
| Power | 3.84 | 2.25 | 0.67 |
| Extreme | 7.81 | 4.51 | n/a |
| Free user | 0.147 | 0.053 | 0.037 |

| Margin after fees and COGS, % of list | 1 ($12) | 2 ($12) | 3 ($6) |
|---|---|---|---|
| Light | 91.6% | 92.3% | 90.0% |
| Regular | 86.9% | 89.5% | 88.4% |
| Power | 61.4% | 74.7% | 79.8% |
| Extreme | 28.4% | 55.9% | n/a |

A Regular user in option 1 costs $0.354 for drafting (45%), $0.282 for cloud STT (36%), $0.048 for cleanup, $0.032 for observability and $0.020 of fixed infrastructure. In option 2, cloud STT falls to $0.056 and drafting dominates.

**Storage, sync and embeddings are each under 1% of COGS everywhere**, so choose them on privacy and simplicity. Fixed infrastructure (2 Fly machines, Supabase Pro + Medium compute, Langfuse Core, store fees) is about $199/month: $0.02 per MAU at 10k, but $0.40 in a 500-user beta.

**Langfuse is a real line item:** at $8 per 100k units and ~5 units per forge it costs $0.16 per Power user, more than storage, sync and embeddings together. Sampling at 10% recovers 1.2 points.

## 4. Options compared

**Option 1: Cloud-first.**
- **What:** one cloud STT vendor on every surface, with cloud cleanup, understand and draft. This is the blueprint's MVP extended.
- **For:** simplest code and the best accuracy in noise and Hindi (`dictation.md`).
- **Against:** the free tier pays per cloud minute. At Soniox prices a free user costs $0.147, free users eat 23% of revenue, and an 80% portfolio margin needs 26% paid. With AssemblyAI Universal-3.6 Pro ($0.61/h effective) a free user costs $0.46, free-tier cost is **72% of revenue** and portfolio margin **-0.8%**.
- **Fit:** acceptable for a paid-only beta, wrong as the steady state.

**Option 2: Device-first hybrid (recommended).**
- **What:** Parakeet, SpeechAnalyzer or WhisperKit plus rules cleanup on desktop by default (80% of minutes on-device in the model); cloud STT for mobile and fallback; Apple Foundation Models or Chrome built-in AI for the understand step where present; cloud draft with a cheap-first router; BYOK for a minority.
- **Result:** Regular $0.47, Power $2.25. Portfolio margin 79.1%, free-tier cost 8.4% of revenue, paid share needed for 80% only 5.6%.
- **Why it wins:** it holds cost per free user near $0.05 while keeping cloud-grade drafting.

**Option 3, non-obvious: User-funded inference.**
- **What:** the drafting runs on the user's own AI plan. Since OpenAI DevDay (2026-09-29), "Sign in with ChatGPT" can request the `chatgpt.tokens.use.direct` scope so that Plus and Pro users' requests count against their ChatGPT plan ([WorkOS](https://workos.com/blog/sign-in-with-chatgpt-plan-usage-scope), [The New Stack](https://thenewstack.io/sign-in-with-chatgpt/)). The same holds when PromptAI runs as an MCP server inside ChatGPT or Claude, where the host model writes, and for BYOK.
- **Result:** COGS falls to $0.15 (Regular) and $0.67 (Power).
- **Constraints:**
  - The direct path is documented for open-source and locally hosted apps; paid hosted products go through an interest form.
  - Requests must set `store: false` and `stream: true`. They may not send system-role items, `temperature` or `max_output_tokens`.
  - Limits end in a 429 (`subscription_sharing_usage_limit_exceeded`) with no automatic fallback.
  - Anthropic forbids third-party use of Claude subscription OAuth since February 2026 ([WinBuzzer](https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/)), so this is a ChatGPT-only path, plus API keys.
- **As a business:** a $6 "Lite" price earns $5.30 gross profit per Regular user against $10.74 for option 2. The portfolio makes $2,267/month against $4,745. It only matches option 2 if the lower price more than doubles conversion. So it is a feature set to adopt, not a pricing tier.

**Legacy check.** The repo's 13-agent pipeline runs on free tiers (Groq, Gemini, Cerebras in `config/model-routing.json`): free until it breaks, and Google's free tier may train on data. On paid models, 7 extra cheap calls per forge add $1.74 per Power user (-14.5 points). The single `forge()` is also the economic choice.

## 5. Which architecture choices move margin most

From the Summary sheet's sensitivity table: one lever is changed at a time from option 2, Pro $12 monthly on Stripe, and ranked by mix-weighted change in gross profit per paid user. Points are the change in Power-user margin.

| Rank | Lever | Power margin change | $/paid user |
|---|---|---|---|
| 1 | Frontier model for every draft | -70.1 pts | -3.76 |
| 2 | All-cloud STT + premium vendor | -48.1 | -2.58 |
| 3 | Standard tier as default (95% Sonnet) | -30.5 | -1.63 |
| 4 | Legacy multi-agent pipeline (+7 calls) | -14.5 | -0.78 |
| 5 | User-funded inference for 85% of drafts | +11.8 | +0.63 |
| 6 | Cheap tier only | +11.1 | +0.60 |
| 7 | All dictation via cloud STT (Soniox) | -9.4 | -0.50 |
| 8 | Premium STT vendor at 20% cloud share | -7.7 | -0.41 |
| 9 | No prompt-cache hits | -7.3 | -0.39 |
| 10 | 90% cache hits (shared prefix at scale) | +3.6 | +0.20 |
| 11 | GPT-5.6 Luna instead of Haiku 5.5 as cheap tier | -3.3 | -0.18 |
| 12 | Cloud dictation cleanup | -1.8 | -0.10 |
| 13–17 | Groq batch STT, trace sampling 10%, DeepSeek V4 Flash, understand in cloud, cloud embeddings | under 1.5 each | under 0.08 |

Pricing and channel levers, which change revenue rather than COGS:
- The App Store's standard 30% costs **23.4 points** on every plan.
- The Small Business Program's 15% ([Apple](https://developer.apple.com/app-store/small-business-program/)) and Google Play's reported 10% + 5% Play Billing (third-party) cost 8.4 points each.
- Stripe Managed Payments as merchant of record costs 3.0 points.
- Annual billing at $96 cuts gross profit by $3.56 per user-month and leaves the margin percentage about the same.

The ordering is clear. **The model router policy matters most,** then **STT location × vendor**, then **the payment channel**, then **call count and prompt caching**. Everything about storage, sync, embeddings and the understand step is a rounding error.

A practical budget follows from table G: before a $12 Pro user drops below 80% margin, they can stream about 8.5 cloud hours a month on Soniox real-time (~78k words), about 2.0 hours on AssemblyAI Universal-3.6 Pro (~18k words), or about 21 hours on Groq turbo batch.

## 6. Free-tier design

The free tier is where architecture shows up in the P&L. At a 5% paid share, each paid user carries 19 free users. A Regular Pro user's gross profit funds about 200 option-2 free users, but only 71 option-1 free users.

Design that follows:
- **Unlimited on-device dictation on desktop**, with rules cleanup. Marginal cost is $0, and it competes directly with Wispr Flow's capped free tier and Superwhisper's free local tier.
- **Capped cloud minutes on mobile**, about 30 min/month, since phones lack Parakeet in v1.
- **A small cloud forge quota on the cheap tier only**, about 10–20 a month. Each costs about $0.0007–0.0012.
- **Unlimited forges when the user brings the model** (BYOK, Sign in with ChatGPT, or the MCP host). Our cost is then about $0.04 per user-month, mostly fixed share, Langfuse and memory extraction.
- **Never paywall Device-only mode** (blueprint decision 10). Privacy is not the paid lever; cloud quota and frontier credits are.

The RevenueCat 2026 benchmark puts freemium download-to-paid at a median of 2.1%, and 2.4% for AI apps, with AI apps churning about 30% faster ([SaaStr summary](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/), [PPC Land](https://ppc.land/ai-apps-earn-41-more-per-user-but-churn-30-faster-revenuecat-finds/)). That is per download, not per MAU, so the model's 5% of MAU is optimistic. Option 2 still clears an 80% margin at 5.6% paid; option 1 needs 26%.

## 7. BYOK and on-device: what they do to margin

- **BYOK** helps margin on exactly the users who threaten it. At 85% user-funded drafts, the Power-user margin goes from 74.7% to 86.5%.
- **Price BYOK the same as Pro.** Raycast and Superwhisper both include BYOK on their normal Pro plan. A discount invites arbitrage and adds a plan to maintain.
- **Meter BYOK spend separately** (`model-gateway.md`). Never retry a failed BYOK request on our credentials, which Vercel AI Gateway does by default.
- **On-device STT** saves $0.23 per Regular and $1.13 per Power user a month at Soniox prices (~4x against a premium vendor). At 10k MAU, option 1 → 2 is worth $1,133/month of gross profit ($4,793 against the premium variant).
- **On-device's own cost sits outside COGS:** a second runtime, ~0.4 GB model downloads (free from Hugging Face) and accuracy risk. In year one its case is privacy, latency and offline, money second; it becomes decisive for the free tier and at 100k MAU (~$11k/month).

## 8. Pricing recommendation

- **Free:** as in §6.
- **Pro: $12/month or $96/year**, billed on the web through Stripe.
  - $96/year undercuts Wispr's $144 and matches Raycast Pro.
  - Include fair-use **frontier and standard credits**, Raycast-style, and degrade softly to the cheap tier after them. The blueprint's per-user daily ceiling enforces this.
  - Under option 2 a Power user stays at about 75% margin and an Extreme user at 56% (28% under option 1); credits cap the tail further.
- **No Lite tier, and no lifetime licence until the cloud share of COGS is measured.** A lifetime licence only works if ongoing cloud cost tends to zero (Superwhisper's model). PromptAI's drafting value is cloud-heavy unless the user funds it.
- **iOS:** join the Small Business Program on day one.
  - Use the US link-out to web checkout while Apple is barred from charging on it. Its proposed 5% (SBP) to 15% fee is pending ([TechCrunch](https://techcrunch.com/2026/08/14/apple-proposes-to-take-a-15-cut-of-purchases-made-outside-the-app-store/)).
  - Use RevenueCat (free to $2.5k MTR, then 1%, [pricing](https://www.revenuecat.com/pricing/)) only when IAP is needed.
- **Tax compliance:** a 1–3 person team should accept Stripe Managed Payments' 3.5% ([Stripe](https://stripe.com/pricing)) to avoid running VAT and GST registrations itself. That is a judgment call; it costs 3 points.

## 9. Architecture implications

- **Router as a cost policy.** The cheap tier is the default. Standard and frontier tiers are earned by confidence, task class or user credits, and logged with propensities so the cost-aware bandit (§8 of the blueprint) can learn `acceptance − λ·cost`. A 22% standard share is already 69% of draft spend.
- **Prompt layout.** Schema and tools, then system, then card, then per-user memory, then the ask. That keeps the shared prefix (above the 512-token minimum) cacheable across users. Shrink the 2,571-token schema before growing cards.
- **Budgets.** Set a per-tier `Budget` (cheap $0.005, standard $0.02, frontier $0.04), not one $0.02 cap. Keep the per-user daily ceiling in Postgres from launch.
- **STT client discipline.** Open streams only while the key is held, close on release, and batch-fallback short clips knowing they bill a 10 s minimum. Make vendor routing a URL-swappable config, because vendor price is a 4x lever.
- **Free tier enforced by the architecture.** Desktop on-device by default, mobile cloud minutes metered in `usage_counters`, and forges unmetered when user-funded.
- **A user-funded route class in the gateway.** Add a `user_plan` route: Sign in with ChatGPT, honouring its restrictions (instructions not as system-role items, no `max_output_tokens`, so the budget must be enforced by prompt and truncation), plus BYOK. Treat its 429 as a soft stop with a clear message, not a silent switch to our credentials.
- **MCP tools return scaffolds.** `forge_brief` called from a host with its own model should return the IntentFrame, chips and the Tool Card rendering contract for the host model to compose, so inference stays at near-zero cost.
- **Observability sampling.** Trace 100% in beta and about 10% at scale, always keeping errors and decisions.
- **Single `forge()`.** No agent fan-out at request time. It is a margin decision as much as a reliability one.

## 10. Risks and unverified items

- Prices move monthly (Groq retired models twice in two months); refresh the Prices sheet from the nightly routes-check.
- **Third-party, unverified:** ChatGPT plan prices, Superwhisper annual/lifetime, Deepgram, Stripe's US 2.9% + 30¢, Google Play's 2026 fees.
- **Assumptions to refit on beta logs:** tokenizer multiplier (1.15x), system-prompt sizes, session overhead, usage profiles. The test clips are short, so real long-form dictation would shrink the billing factors.
- **Sign in with ChatGPT plan usage** requires approval for paid hosted products, and its terms may restrict charging for plan-covered features. One secondary source claims so; WorkOS did not confirm it.
- **Apple's link-out fee** may land between 5% and 15%.
- **Not modelled:** support, refunds (AI apps median 4.2% per RevenueCat), chargebacks, revenue taxes, and the engineering cost of two runtimes.

## Sources

- Wispr Flow pricing: https://wisprflow.ai/pricing ; free-tier change (third-party): https://www.usagepricing.com/blueprint/activity/wisprflow-2026-10-23-free-iphone-word-limit-cut
- Superwhisper: https://superwhisper.com/ ; https://usevoicy.com/blog/superwhisper-pricing
- Raycast: https://www.raycast.com/pricing
- Claude plans: https://claude.com/pricing
- ChatGPT plans (third-party): https://www.cometapi.com/chatgpt-pricing-2026-free-vs-go-vs-plus-vs-pro/ ; https://dupple.com/learn/chatgpt-plus-vs-pro
- Grammarly: https://support.grammarly.com/hc/en-us/articles/115000090011
- Anthropic API pricing: https://platform.claude.com/docs/en/about-claude/pricing ; prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- OpenRouter catalog (LLM and embedding prices): https://openrouter.ai/api/v1/models ; https://openrouter.ai/api/v1/embeddings/models
- Soniox: https://soniox.com/pricing ; AssemblyAI: https://www.assemblyai.com/pricing ; Groq Whisper: https://console.groq.com/docs/model/whisper-large-v3-turbo ; https://www.morphllm.com/groq-pricing ; Deepgram (third-party): https://diyai.io/ai-tools/speech-to-text/deepgram-pricing-2026/
- Supabase: https://supabase.com/pricing ; Fly.io: https://docs.fly.io/about/pricing ; Railway: https://railway.com/pricing ; Langfuse: https://langfuse.com/pricing
- Stripe: https://stripe.com/pricing ; US card rate (third-party): https://www.activepieces.com/blog/stripe-pricing-2026-total-transaction-add-on-costs.md
- Apple Small Business Program: https://developer.apple.com/app-store/small-business-program/ ; link-out fee proposal: https://techcrunch.com/2026/08/14/apple-proposes-to-take-a-15-cut-of-purchases-made-outside-the-app-store/
- Google Play fees (third-party): https://www.phonearena.com/news/google-pay-store-developer-fee-subscriptions_id135932 ; https://www.techspot.com/news/111572-google-cuts-play-store-fee-20-opens-door.html
- RevenueCat pricing: https://www.revenuecat.com/pricing/ ; State of Subscription Apps 2026 summaries: https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/ ; https://ppc.land/ai-apps-earn-41-more-per-user-but-churn-30-faster-revenuecat-finds/
- Sign in with ChatGPT plan usage: https://workos.com/blog/sign-in-with-chatgpt-plan-usage-scope ; https://thenewstack.io/sign-in-with-chatgpt/
- Anthropic subscription OAuth ban: https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/
- Dictation volume anecdotes: https://mrktcorrect.pages.dev/blog/wispr-flow-review ; https://hn.jakechampion.name/reader/https://modulovalue.com/blog/voxtral-transcribe-and-wispr-flow
- GitHub activity checks via `gh api` (2026-11-10): langfuse/langfuse, getlago/lago, openmeterio/openmeter, RevenueCat/purchases-ios, RevenueCat/purchases-capacitor, cjpais/Handy, ggml-org/whisper.cpp, argmaxinc/WhisperKit, stripe/stripe-node
- Wave 1 inputs: `research/model-gateway.md`, `research/dictation.md`, `research/data-sync-backend.md`, `BLUEPRINT-draft.md`; spike data in `spikes/prompt-representation` and `spikes/asr-testset`
