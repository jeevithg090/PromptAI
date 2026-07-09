# Admin Roles & Permissions Matrix — v1.0

> **Spec reference:** §21, §31.1 Step 5. Governs the Admin Control Plane (Phase 7, task T7.5) — a physically separate deployable with its own auth, network boundary, and database project.

## Global invariants (secure **by construction**, not by permission check — §21.3)

These are not permissions that are "denied" — they are capabilities that **do not exist in the admin service's code or key material**. A fully compromised superadmin credential still cannot do any of these:

| Capability | Status |
|---|---|
| Decrypt user prompt content, Memory entries, Project content | **Impossible — no decryption code path or key material in the admin service** |
| Retrieve a plaintext BYOK provider key | **Impossible — keys are revocable-only; no retrieval path exists anywhere, including the consumer service** |
| Edit or delete audit-log entries | **Impossible — append-only store; no UPDATE/DELETE grants for any role** |
| Read raw prompt text from logs/analytics | **Impossible — plaintext is never written to logs by any service (§19.1)** |

## Authentication requirements (all roles)

- SSO + hardware-key/passkey MFA. No password-only access, ever.
- Short session lifetimes; IP allowlisting where feasible.
- **Step-up re-authentication** before any action marked ⚠️ below.
- Every action writes an immutable audit entry: who, what, when, before/after state.

## Role matrix

### Role: Support
- **Can:** view account metadata (name, email, plan, billing status, quotas); view a user's usage/cost metering; adjust quota within plan bounds; process support tickets; view aggregate service health.
- **Cannot:** view any encrypted content class; view pipeline trace details beyond status/timing; modify the Platform Registry, PKB/MPKB, or capability matrix; touch feature flags, deploys, or billing configuration; view safety-decision details beyond count/category for the user they're assisting.

### Role: Security
- **Can:** view the full audit log; view safety decisions and the appeals queue; review appealed prompts (appeal = user's explicit consent to review that specific blocked prompt); trigger security reviews; view anomaly/cost-spike alerts; ⚠️ suspend an account for policy violation.
- **Cannot:** decrypt any user content beyond consented appeal payloads; modify BYOK connections (may ⚠️ revoke on incident); modify infra config, registry, or knowledge bases; alter audit logs (impossible anyway — see invariants).

### Role: Content-Ops (registry & knowledge)
- **Can:** manage the Platform Registry (add/edit/deprecate platforms — each addition requires a recorded ToS review, §29.4); manage PKB/MPKB (force re-ingestion, review/override low-confidence chunks, edit strategy profiles); manage the Model Capability Matrix; moderate the library queue (human-submitted and autonomously-proposed templates — this content is explicitly public-bound, so it's visible); review "request platform support" submissions.
- **Cannot:** view user accounts beyond aggregate stats; touch billing, feature flags, deploys, or security tooling.

### Role: Infra
- **Can:** deploy code via the CI pipeline; manage infrastructure configuration; ⚠️ toggle feature flags and kill-switches (per agent role, per provider adapter); manage the model routing table; view pipeline observability (traces are content-free by design).
- **Cannot:** view user data of any class; approve security policy changes; moderate content; modify plans/billing. The person who writes a deploy is not its sole approver (§27.2).

### Role: Superadmin
- **Can:** everything above, plus ⚠️ billing configuration, ⚠️ role grants/revocations (logged + reviewed quarterly, §27.2), ⚠️ data-subject request processing (export/delete — operates on encrypted blobs and account rows, never plaintext content).
- **Cannot:** anything in the global invariants table. Superadmin is small (≤2 people) and every superadmin action is audit-logged and anomaly-monitored.

## Separation-of-duties rules (§27.2)

1. Deploy author ≠ sole deploy approver.
2. Audit-log readers (Security) cannot hold write-capable infra permissions simultaneously.
3. Role grants are reviewed quarterly; the review itself is logged as evidence.
4. Departing member off-boarding: access revoked same-day via documented checklist; orphaned credentials are an audit failure.

## What this means for implementation (T7.5)

- Admin backend = separate Lambda + separate Supabase project (its own auth pool). No shared runtime, no shared database role, **no import path** from admin code into consumer-service key-handling modules.
- RBAC enforced server-side per route; the UI hides what the role can't do, but the API is the boundary.
- The visibility table in §21.4 is the acceptance test: write integration tests that attempt each forbidden access per role and assert failure.
