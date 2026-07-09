# PromptForge — Backend

The orchestration backend: a single "Lambdalith" (one AWS Lambda behind a Function URL, Hono router) that is internally rigorously modular. See `../prompt-assistant-technical-architecture.md` for the full design and `../task.md` for the build sequence.

## Quick start (no cloud accounts needed)

```bash
cd backend
npm install
cp .env.example .env      # DEV_AUTH_BYPASS=true lets you hit protected routes locally
npm run dev               # starts http://localhost:3001
curl localhost:3001/health          # -> {"ok":true,"service":"pf-backend"}
curl localhost:3001/platforms       # -> the launch platform registry
```

Draft through the pipeline (stub agents, real supervisor + safety gates + tracing):

```bash
curl -X POST localhost:3001/draft \
  -H 'Authorization: Bearer dev' -H 'Content-Type: application/json' \
  -d '{"platform_id":"google_gemini","idea":"create an image of a horse running"}'
```

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Build + run the local Node server |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Jest unit + integration suite |
| `npm run test:coverage` | Coverage report |
| `npm run migrate` | Apply pending SQL migrations (needs `SUPABASE_URL`/DB creds — task T1.2) |

## Layout (spec §32.1 — one-way deps: handlers → services → agents/guardrails → utils/types)

```
src/
├── agents/       # each agent implements the Agent contract; placeholders until T2.5–T2.11
├── guardrails/   # ContentSafetyClassifier (fail-closed), TokenGovernor (deterministic)
├── services/     # Supervisor state machine, PlatformService (registry)
├── handlers/     # HTTP routes only
├── middleware/   # auth (JWT), rateLimit, errorHandler, logging
├── types/        # TypeScript + Zod source of truth (Agent, Prompt/nodes, Platform, Safety)
├── utils/        # logger (structured, never logs content)
└── config/       # env (Zod-validated), safety-patterns (config not code)
migrations/       # numbered SQL, applied in order
tests/            # mirrors src/ + integration/
```

## Status

Implemented: T1.1 (skeleton, CI, config, logging), T2.1 (types/contract), T2.2 (safety classifier v1 + harness), T2.3 (Supervisor state machine + stub agents), T1.4 partial (middleware + route stubs; live auth needs T1.2 credentials), T1.3 (migration files; runner + live DB need T1.2).

Next: provision cloud (T1.2), wire real agents (T2.4–T2.12). See `../task.md`.

## Deploys (T3.6 — CI/CD)

CI/CD lives in `.github/workflows/`. Flow: **PR → gate**, **merge to `main` → staging auto-deploy**, **manual prod promotion**, **instant rollback**.

### Required GitHub repository secrets

| Secret | Used by | Purpose |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | staging / prod / rollback | IAM user with `lambda:UpdateFunctionCode`, `PublishVersion`, `Get/Create/UpdateAlias`, `GetFunctionConfiguration` on `PromptAI` |
| `AWS_SECRET_ACCESS_KEY` | staging / prod / rollback | — |
| `DATABASE_URL` | staging | Supabase **pooler** URL for `npm run migrate` (never the direct `db.<ref>` host) |

`gitleaks` uses the built-in `GITHUB_TOKEN` — no setup needed.

### Pipeline

- **`ci.yml` → `test`** (every push/PR): gitleaks → typecheck → `npm audit --audit-level=high` → jest. This is the merge gate.
- **`ci.yml` → `build`**: `npm run build`, uploads `dist/` + `config/` as an artifact.
- **`ci.yml` → `deploy-staging`** (push to `main` only): install → build → **run migrations first** → prune to prod deps → zip → `update-function-code` on `$LATEST` → `wait function-updated` → smoke-test `/health`. Migrations must be backward-compatible with the still-running old code (expand/contract).

### Promote to prod / rollback

Production is served by the **`prod` Lambda alias** (immutable published versions), promoted manually:

- **Promote:** run the **Deploy Prod (promote)** workflow (Actions tab), input `confirm: deploy-prod`. It publishes a version from the current `$LATEST` and repoints `prod`. The job summary prints the previous version as the **rollback target**.
- **Rollback:** run the **Rollback Prod** workflow with `version: <N>` (from a prior promote summary). This repoints the alias — sub-second, no rebuild.

### One-time: point API Gateway at the `prod` alias

The API Gateway integration currently targets `$LATEST`. To serve prod from the alias instead, run once:

```bash
# 1. Find the integration id
aws apigatewayv2 get-integrations --api-id qsfu5lcqt2 --region us-east-1
# 2. Repoint it to the prod alias ARN (…:function:PromptAI:prod)
aws apigatewayv2 update-integration --api-id qsfu5lcqt2 \
  --integration-id <INTEGRATION_ID> \
  --integration-uri arn:aws:lambda:us-east-1:340601548031:function:PromptAI:prod \
  --region us-east-1
# 3. Grant the gateway permission to invoke the alias
aws lambda add-permission --function-name PromptAI:prod \
  --statement-id apigw-prod --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com --region us-east-1
```

### Break-glass: manual deploy

CI is the normal path, but the manual deploy still works if Actions is unavailable:

```bash
cd backend && npm run build && cd .. \
  && zip -r /tmp/lambda.zip backend/dist backend/node_modules config -x '*.map' \
  && aws lambda update-function-code --function-name PromptAI \
       --zip-file fileb:///tmp/lambda.zip --region us-east-1
```

## Security notes baked in

- Prompt content, memory, and BYOK keys are never written to logs (§19.1).
- Safety classifier **fails closed** — classifier outage refuses generation (§33.7).
- `DEV_AUTH_BYPASS` is refused when `NODE_ENV=production` (`config/env.ts`).
- Secrets live in `.env` (gitignored) locally and AWS SSM in prod — never in code.
