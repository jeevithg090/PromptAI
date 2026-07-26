# PromptForge

> **PromptForge** (placeholder brand) is a **reverse-prompting assistant**. You type a rough idea — *"an image of a horse running"* — and it interviews you briefly, drafts an *excellent*, platform-tailored prompt (Midjourney, ChatGPT, Claude, Gemini, Stable Diffusion, …), scores it against an 8-dimension quality rubric (0–100 strength score), explains why it works, and lets you edit it node-by-node. It also **enhances prompts you already have** (paste one in → parsed, scored, improved).

This is the monorepo for all product surfaces. The authoritative design doc is [`prompt-assistant-technical-architecture.md`](prompt-assistant-technical-architecture.md) (referenced as "§N"). The build ledger is [`task.md`](task.md) (Phases 0–8 + TA); the **live plan** is [`final-task.md`](final-task.md) (Phases F0–F2, with cold-start execution prompts in [`final-task-prompt.md`](final-task-prompt.md)).

## Surfaces

| Dir | What | Stack | Status |
|---|---|---|---|
| [`backend/`](backend/) | The "Lambdalith" API (all product logic) | TypeScript · Hono · AWS Lambda + API Gateway · Supabase Postgres/pgvector | Live · 44 test suites |
| [`web/`](web/) | Web app (draft, clarify, node editor, enhance, history, library) | Next.js 16 (static export) · Cloudflare Pages | Builds · 12 static pages |
| [`extension/`](extension/) | Chrome extension (in-context overlay + insert + detection) | MV3 · React · Vite | Loads unpacked |
| [`firefox-extension/`](firefox-extension/) | Firefox MV3 port | MV3 · React · Vite | Scaffold |
| [`admin/`](admin/) | Admin control plane (separate deployable, no user-content decryption by construction) | TypeScript · Hono · port 3002 | Scaffold + auth |
| [`macos/`](macos/) | Native macOS menu-bar app | Swift · SwiftUI | Scaffold |
| [`macos-sdk/`](macos-sdk/) | Embeddable Swift client | Swift package | Scaffold |
| `desktop/` | Electron app (macOS + Windows) — **created in F1.2** | Electron · Vite · React | Planned |
| [`config/`](config/) | Runtime config (repo root): platform registry, model routing, strategy profiles, PKB seed, plans | JSON | — |
| [`docs/`](docs/) | Design docs, rubric, taxonomy, data model, security reviews, compliance, API contracts | Markdown | — |

## Quickstart per surface

```bash
# Backend (local server on :3001, auth bypassed for curl testing)
cd backend && npm install && npm run dev

# Web (Next.js dev server on :3000)
cd web && npm install && npm run dev

# Chrome extension (build then load extension/dist unpacked)
cd extension && npm install && npm run build

# Firefox extension (build then load via about:debugging)
cd firefox-extension && npm install && npm run build

# Admin plane (port 3002)
cd admin && npm install && npm run dev

# macOS app / SDK
cd macos && swift build      # or open in Xcode 16+
cd macos-sdk && swift build
```

Standard checks per surface: `npm run typecheck` + `npm test` (backend/admin/extension), `npx tsc --noEmit && npm run build` (web/extension), `swift build` (macos/macos-sdk).

## Backend HTTP API (current)

Public: `GET /health` · `GET /platforms` · `GET /demo/examples` · `POST /demo/draft` · `GET /library` · `GET /library/:id` · `POST /platform-requests` · `POST /billing/webhook`

Authed pipeline: `POST /draft` · `POST /draft/:sessionId/clarify` · `POST /draft/:sessionId/again` · `POST /enhance` *(F1.1)* · `POST /preview` · `POST /preview/visual` · `POST /serialize` · `POST /redraft-node` · `POST /fanout` · `POST /transcribe` *(F1.3)* · `POST /compare` *(F2.5)*

Prompts & versions: `POST/GET /prompts` · `GET /prompts/:id/versions` · `GET /prompts/:id/versions/:v` · `POST /prompts/:id/restore` · `GET /prompts/:id/diff`

Personalization: `GET/POST/PATCH/DELETE /memory` · `GET/POST /projects` · `GET/PATCH/DELETE /projects/:id`

Account/plans/billing: `POST /me/bootstrap` · `GET /me/usage` · `GET /me/progress` · `DELETE /me` · `GET /export` · `GET /sessions` · `GET /sessions/:sessionId/trace` · `PATCH /sessions/:sessionId/content` · `POST /billing/checkout`

BYOK: `PUT/GET /keys` · `POST/GET /connections` · `DELETE /connections/:id`

Teams: `POST/GET /teams` · `POST /teams/:id/members` · `DELETE /teams/:id/members/:userId`

Analysis/library/admin-adjacent: `POST /recommend` · `GET /capabilities` · `POST /optimize` · `POST /feedback` · `GET /analytics/outcomes` · `GET /analytics/improvements` · `POST /library/submit` · `GET /library/pending` · `PATCH /library/:id/moderate`

Status-code contracts (esp. the budget-429 vs plan-403 distinction): [`docs/api-contracts.md`](docs/api-contracts.md).

## Key engineering rules (from `task.md` §0)

One-way dependency flow (`handlers → services → agents/guardrails → utils/types`); config-over-code (no hardcoded thresholds/models/platform data); privacy (never log prompt content; content persists only in `*_ciphertext` columns); safety fails closed; every service/agent/route gets tests; numbered idempotent SQL migrations. LLM providers are swapped via `config/model-routing.json` (default: Groq).
