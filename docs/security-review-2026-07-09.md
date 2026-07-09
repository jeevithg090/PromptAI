# Security review — PromptForge backend (T3.8 · §31.4 Step 28, §27, §33)

**Date:** 2026-07-09
**Scope:** the backend Lambdalith (`backend/`) — auth, routes, services, config, CI.
**Reviewer:** internal (structured checklist below). Re-run required after Phase 7
(E2EE + BYOK) lands, per `task.md` T3.8 dependency note.

**Outcome:** No **critical** or **high** findings open. Several **medium** hardening
items were fixed in this pass (secure headers, body-size cap, request-body Zod
validation, JWT algorithm pinning, pgvector finite-guard). Remaining items are
**low**/informational with owners and target tasks.

## Findings table

| ID | Area | Severity | Finding | Fix / Owner |
|----|------|----------|---------|-------------|
| S-1 | AuthN/AuthZ | low | JWT verified via jose but algorithm was not explicitly pinned (jose already rejects `alg:none`, so not exploitable — defense-in-depth only). | **Fixed:** `algorithms: ['ES256']` (JWKS) / `['HS256']` (secret) in `middleware/auth.ts`. |
| S-2 | AuthN/AuthZ | — (pass) | Every non-public route is behind `authMiddleware` + `rateLimitMiddleware`; `:id` routes (prompts, versions, diff, sessions trace) all filter by `user_id`/`actor` and return 404 (not 403) to avoid existence leaks. `DEV_AUTH_BYPASS` refused in production (`config/env.ts`, tested). | No change needed. |
| S-3 | Injection | low | All `pool.query` calls are parameterized (`$1`…); zero string-interpolated SQL. The only constructed literal is the pgvector query vector in `PKBService`, bound as `$2` — not injectable, but a non-finite element would build a malformed literal. | **Fixed:** `Number.isFinite` guard on every element before joining (`PKBService.retrieve`), tested. |
| S-4 | Input validation | medium | `POST /draft` and `/draft/:id/clarify` bodies were hand-checked (truthy field checks), allowing wrong types and unbounded string lengths. | **Fixed:** `draftBodySchema` / `clarifyBodySchema` (Zod) in `types/Http.ts`, `safeParse` in the routes; length caps (idea ≤ 10KB, answers ≤ 2KB). Tested. Other bodies (`/feedback`, `/recommend`, `/optimize`) were already validated. |
| S-5 | Headers | medium | No security response headers (HSTS, nosniff, frame options). | **Fixed:** `secureHeaders()` mounted app-wide. Tested. |
| S-6 | DoS | medium | No request body-size limit — a multi-MB body would be parsed into memory. | **Fixed:** `bodyLimit({ maxSize: 100KB })` → 413. Tested. Rate limiting (T3.2) already present (per-user Postgres fixed-window + in-memory fallback). |
| S-7 | CORS | low | CORS reflects any origin. Acceptable pre-launch (no cookies; auth is a bearer token, not ambient credentials), but must tighten before the web/extension ship. | **Owner:** T4.1 / T5.4 — tighten `origin` to web + extension origins. `SECURITY TODO` comment added at the CORS mount. |
| S-8 | SSRF | — (pass/invariant) | No endpoint fetches a user-supplied URL today. | **Invariant to keep:** the T5.2 live-fetch RAG feature MUST allowlist registry `docs_url` hosts only. Recorded here. |
| S-9 | Secrets | — (pass) | `gitleaks` runs in CI; `.env` is gitignored (`.gitignore`); no secret value is logged (only a help message names a key). Provider keys are read only inside adapters. | No change needed. |
| S-10 | Safety bypass | — (pass) | Traced every `generate()` caller: all are agents invoked by the `Supervisor`, which runs **safety gate 1** before any model call and **gate 2** after drafting (fail-closed, §33.7). `/optimize` and `/recommend` are deterministic — no LLM call. No path reaches a model without passing safety. | No change needed. |
| S-11 | Dependencies | — (pass) | `npm audit --audit-level=high` → **0 vulnerabilities**. Dependabot (weekly) added in T3.6. | No change needed. |
| S-12 | Privacy (§19.1) | — (pass) | Server is content-stateless pre-E2EE: `sessions`/`usage_events`/`audit_log` store metadata + token counts only; `AuditService` guards `detail` values > 500 chars. Prompt content, clarification text, and keys are never logged. | Re-verify after T7.1 (E2EE/BYOK) introduces ciphertext columns + user keys — that is the primary trigger for the T3.8 re-run. |

## Checklist walked (§33 / §27)

1. **AuthN/AuthZ** — S-1, S-2. ✔
2. **Injection** — S-3. ✔
3. **Input validation** — S-4. ✔
4. **SSRF** — S-8 (none today; invariant recorded). ✔
5. **Secrets** — S-9. ✔
6. **Headers / CORS** — S-5, S-7. ✔
7. **DoS** — S-6. ✔
8. **Safety bypasses** — S-10. ✔
9. **Dependency audit** — S-11. ✔
10. **Fixes + tests** — all medium items fixed with tests (`tests/integration/security.test.ts`, `tests/unit/env.test.ts`). ✔

## Deferred (owners)

- **S-7 CORS tightening** → T4.1 / T5.4.
- **S-8 SSRF allowlist** → T5.2 (live-fetch RAG).
- **Full re-run** → after Phase 7 (E2EE + BYOK), when key-extraction and
  cross-user encrypted-content access become in-scope (§27, §21.3).
