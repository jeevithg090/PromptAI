# API Status-Code Contracts

> Source of truth for what each non-2xx status means on the core `/draft` family
> and adjacent routes. Written for F0.1 to resolve the T3.2 (budget) vs T7.7
> (plan) collision. Keep code + tests aligned with this table.

## The budget-vs-plan distinction (F0.1 decision)

Two different "you can't do this right now" conditions were colliding on 402:

| Condition | Status | Body `status` | Owner | Meaning |
|---|---|---|---|---|
| Monthly token **budget** exhausted | **429** | `budget_exceeded` | BudgetService (T3.2) | You've spent your token allowance this month. Resets on the 1st. Includes `used`/`budget`. Retryable next cycle. |
| **Plan** doesn't include a feature/platform | **403** | `plan_restricted` | PlanService (T7.7) | Your plan tier doesn't entitle this platform/feature. Includes `feature`/`plan`. Fixed by upgrading, not waiting. |

Rationale: 429 = rate/quota (temporal, retry later); 403 = authorization/entitlement (won't change without an upgrade). 402 "Payment Required" is reserved/inconsistently supported by intermediaries, so we avoid it.

**Fail-open:** `getEntitlements` (PlanService) and `checkMonthlyBudget` (BudgetService) both **fail open** on DB error — plans/budgets are cost controls, not security boundaries. A plans-table or usage-table outage must never 500 the draft path; it logs `plan:check_skipped` / `budget:check_skipped` and proceeds as free-tier / under-budget.

## Full `/draft` family status table

| Status | Body `status` / shape | Cause |
|---|---|---|
| 200 | `ok` (finished) or `clarifying` (paused for questions) | Normal pipeline outcome |
| 400 | `{error, issues}` | Body failed Zod validation (missing/oversized `platform_id`/`idea`) |
| 401 | (auth middleware) | Missing/invalid JWT |
| 403 | `plan_restricted` | Plan tier doesn't include this platform/feature |
| 404 | `{error}` | Unknown `platform_id`; or ownership miss on a `:id`/`:sessionId` route (no existence leak) |
| 413 | (body-limit middleware) | Request body > 100KB |
| 422 | `blocked` | Content-safety gate refused the request (§33.3). Runs inside the pipeline, after auth/plan/budget infra checks. |
| 429 | `budget_exceeded` (monthly) or rate-limit | Token budget exhausted, or per-minute rate limit tripped |
| 502 | `error` (`degraded` flag) | Pipeline failed even after degradation ladder (intent is the only fatal step) |
| 503 | (infra) | Required DB read genuinely unavailable on a route that can't fail open (e.g. `/sessions/:id/trace`) |

## Ordering guarantee

On `/draft` the checks run: **auth (401) → body validation (400) → unknown platform (404) → plan entitlement (403, fail-open) → budget (429, fail-open) → pipeline → safety (422) / degraded-failure (502)**. Because plan and budget both fail open, an infrastructure outage in either cannot preempt the safety gate or turn a valid draft into a 5xx.
