# @promptai/ai

The model gateway (blueprint §6 "Routing", §11 "Budget"). It implements core's `LlmPort` (`understand`, `repair`) on the Vercel AI SDK with the AI Gateway provider, routed by `catalog/routes.yaml`.

```ts
import { createLlmPort, gatewayTransport, parseRoutes } from '@promptai/ai';

const routes = parseRoutes(readFileSync('catalog/routes.yaml', 'utf8'));   // throws if invalid
const transport = gatewayTransport(process.env.AI_GATEWAY_API_KEY!);

// One port per forge request: usage() is per request, and a refusal latches the port.
const llm = createLlmPort({ routes, transport, clock });
const res = await forge(req, { cards, clock, llm });
const { tokensIn, tokensOut, costUsd } = llm.usage();     // fill the response's usage fields
```

`understand` resolves with a contract `IntentFrame`, and `repair` with `{ goal, subject? }`. When a call yields nothing usable, it resolves with an `LlmFailure` instead of throwing: `invalid_output`, `timeout`, `over_cap` or `error`, which core treats as degraded, or `refusal`, which is terminal. After a refusal, every later call on that port returns the same refusal and sends nothing, so core's retry never re-sends a refused request to any model or provider.

## Configure a key

1. In the Vercel dashboard, open AI Gateway and create an API key.
2. Set `AI_GATEWAY_API_KEY` in the server's environment and pass it to `gatewayTransport`. The transport takes the key explicitly, so it never falls back to a Vercel OIDC token.
3. ZDR needs a paid gateway account (Pro or Enterprise, or purchased credits). Without one, every call returns 403 and degrades. Each request already sets `zeroDataRetention: true`. Turning on team-wide ZDR and "Disallow Prompt Training" in the gateway settings also covers requests that don't come from this package.

To run the live smoke test (one real `understand` call, a fraction of a cent):

```bash
AI_GATEWAY_API_KEY=... pnpm --filter @promptai/ai exec vitest run test/live.test.ts
```

Without the key, that test is skipped, and the rest of the suite uses the AI SDK's mock model with no network.

## How a route maps to the gateway

`src/gateway.ts` is the only file that knows gateway and provider option names.

| `routes.yaml` | Sent as |
|---|---|
| `models[0]` | the model the call is sent to (`transport.languageModel`) |
| `models[1..]` | `providerOptions.gateway.models`: fallbacks the gateway tries when a model fails. A refusal is a successful response, so it never falls back |
| (always) | `providerOptions.gateway.zeroDataRetention: true`, which applies to fallbacks too; `caching: 'auto'` for the stable prefix |
| `thinking.mode`, `thinking.effort` | `providerOptions.anthropic.thinking.type` (`adaptive`, `disabled` for `off`, or `between_tools`) and `.effort`, plus the portable `reasoning` (`none` for `off`, else the effort) for non-Claude models |
| `maxOutputTokens` | `maxOutputTokens`, which counts thinking |
| `timeoutMs` | an abort after the smaller of this and the forge budget core passes in |
| `capUsd` + `models.*.price` | checked before sending: estimated input plus `maxOutputTokens`, priced at the dearest listed model, must fit the cap. Otherwise the call returns `over_cap` and is never sent |

No sampling parameters are ever sent, and the schema rejects them in `routes.yaml`, because Claude API version 2026-10-21 rejects `temperature`, `top_p` and `top_k`. `maxRetries` is 0: core retries once, and the gateway handles provider failover.

`parseRoutes` also checks these rules:
- every listed model is in `models` and accepts the route's thinking mode (Sonnet 5.5 rejects `off`, and only Sonnet 5.5 accepts `between_tools`);
- `off` and `between_tools` run only at effort `high` or below;
- `capUsd` stays within its role's cap, and `maxOutputTokens` alone can't reach it;
- `verify` shares no family with `compose`.

`repair` runs on the `compose` route, since it is compose's one LLM pass over the problems the checks found.

## Cost

Cost is estimated from the token usage the gateway reports and the price table in `routes.yaml`, using the price of the model that answered. All input counts at the full input price, so cache reads make the figure a slight overestimate. A call cut off by its timeout counts at its worst-case bound, because the provider may still bill it. Calls that fail with an error count as $0.

## Prompts

Prompts live in `prompts/<function>.v<n>.md`. To change one, add a new version file and point `src/port.ts` at it; each call record names the prompt it used. Every prompt is assembled in the same order, so the cacheable prefix stays byte-stable: schema (the response format) → system prompt → `<card>` → `<memory>` → `<ask>`. Blocks hold JSON with `<` escaped, so user text can't close its block.
