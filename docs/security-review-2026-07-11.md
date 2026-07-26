# Security Review — 2026-07-11 (F0.5, post-Phase-7 re-run of T3.8)

Re-run of the T3.8 checklist extended over everything shipped since 2026-07-09: E2EE (T7.1), BYOK/KeyCustody (T7.2), Memory/Projects ciphertext (T7.3/7.4), the admin plane (T7.5), community-library submissions (T7.6), billing/Stripe (T7.7), and teams (T8.4). Findings are prefixed `SR2-` to distinguish from the T3.8 `S-` set.

**Outcome: 1 HIGH + 4 MEDIUM/LOW found and fixed this pass; 0 critical/high open.** Regression tests added for the HIGH.

## Findings

| ID | Area | Severity | Status | Summary |
|---|---|---|---|---|
| SR2-1 | Library / PII | **HIGH** | ✅ FIXED | Public `GET /library` and `GET /library/:id` (both unauthed) joined `app_users.email as attributed_email` and the detail route returned `l.*` — exposing the **contributor's email address** (and internal user ids) to any anonymous caller whenever an author opted into credit. **Fix:** removed the email join on both public endpoints; curated the detail column set; expose only a boolean `attributed`. Regression tests assert the SQL contains no `au.email`/`l.*` and the JSON contains no `@`. (The admin-key-gated `GET /library/pending` still shows submitter email — acceptable; moderators need it.) |
| SR2-2 | Billing / PII | MEDIUM | ✅ FIXED | The Stripe webhook persisted the **entire** event object (`JSON.stringify(event.data.object)`) into `billing_events.payload`, which can carry customer email/address/payment metadata beyond the §19.1 data classification — the migration comment itself mandates "only customer id + event ids stored." **Fix:** store `null` payload (event id + type suffice for idempotency). |
| SR2-3 | Billing / entitlement | MEDIUM | ✅ FIXED | `checkout.session.completed` set `plan='pro'` but never stored `stripe_customer_id`; `customer.subscription.deleted` downgrades `where stripe_customer_id = $1`, so **cancellations could never downgrade** — a cancelled user kept pro entitlements indefinitely. **Fix:** capture `session.customer` and persist `stripe_customer_id` on checkout completion. |
| SR2-4 | Admin plane | MEDIUM | ✅ FIXED | The admin deployable lacked the `secureHeaders()` + 100KB body-size cap the consumer backend got in T3.8. **Fix:** added both `app.use('*', ...)` in `admin/src/index.ts`. |
| SR2-5 | Sessions | LOW | ⚠️ documented | `PATCH /sessions/:sessionId/content` **is** ownership-scoped (`update ... where id=$2 and user_id=$3` — no cross-user write, contrary to an initial hypothesis), but returns 200 even when 0 rows match a non-owned/missing session — a misleading success, not a data leak. Recommend checking `rowCount → 404`. Owner: low-priority hardening. |
| SR2-6 | Dependencies | LOW (dev-only) | ⚠️ documented | `npm audit`: backend **0**, admin **0**, web **2 moderate** (below high gate), extension **1 moderate + 1 high**. The extension high is `esbuild <=0.24.2` (via vite) — the dev-server-only CORS advisory (GHSA-67mh-4wv8-2f99); it affects the local dev server, **not shipped extension code**. Fixing needs a breaking vite major bump. Owner: dedicated dependency-bump PR. |

## Checklist results (verified holding — no finding)

- **BYOK non-retrievability (§21.3):** `KeyCustody` writes keys to SSM SecureString only; `resolveKey` decrypts in-memory per-request and is never called by any route that returns the value; `GET /connections` returns `id/provider/status/created_at` only — **never `secret_ref` or key material**. No read-back path exists for consumer or admin. Key material never appears in a log statement (`storeKey`/`revokeKey` log ids only).
- **E2EE plaintext (§19.2):** grep of all `logger.*` calls — no `*_ciphertext` value logged. No server-side content decryption exists in `backend/` or `admin/` (only SSM `WithDecryption` for BYOK, and doc comments). Server is content-stateless; content lives only in `*_ciphertext` columns written by clients.
- **Cross-user IDOR:** `memory/:id`, `projects/:id`, `connections/:id`, `sessions/:sessionId/content`, `sessions/:sessionId/trace`, `teams/:id/members`, `prompts/*` — all carry an ownership/role WHERE clause and 404/403 on miss (no existence leak). Teams member mutations are owner-gated (403 otherwise).
- **Stripe webhook auth:** `stripe.webhooks.constructEvent` verifies the signature on every event; a missing signature → 400; **`STRIPE_WEBHOOK_SECRET` unset → 501 (refuses), never accept-unsigned**; replays are idempotent via `billing_events`.
- **Admin authz:** every admin route behind `adminAuth` (JWT + `ADMIN_ALLOWED_EMAILS`); unauthed/non-Bearer/invalid all rejected (3 passing tests). No import path from `admin/` into consumer key material (separate deployable). No decryption capability by construction.
- **Injection:** all `pool.query` calls parameterized (`$1`…); the pgvector literal is `Number.isFinite`-guarded (S-3 from T3.8 holds).
- **Plan-gate:** entitlement checks are server-side (F0.1); fail-open to free (cost control, not a bypass — a fail-open only ever *grants less*, never more, except the free baseline).

## Re-verified §21.4 invariants

No admin path can read plaintext user content, memory, or BYOK keys — confirmed by code-path audit (no decrypt function exists server-side; SSM read is BYOK-only and not exposed by any admin route). Every fix above ships with or is covered by tests; `npm test` green (backend 44 suites / 330 tests after the SR2-1 regression tests).

## Owner follow-ups (non-blocking)

- [ ] SR2-5: return 404 from `PATCH /sessions/:sessionId/content` on a 0-row update.
- [ ] SR2-6: bump vite/esbuild in extension + web in a dedicated PR (breaking; dev-only risk).
- [ ] Re-run this review once F1/F2 add `/enhance`, `/transcribe`, `/compare`, and `/share/:slug` (new content + public surfaces).
