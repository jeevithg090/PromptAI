# Core Data Model (plain-language intent) — v1.0

> **Spec reference:** §17, §18, §19.1, §31.1 Step 4. This is the *intent* document the SQL schema (migrations, task T1.3) is derived from — field descriptions, not DDL. Every field is marked with its data class per §19.1:
> **[P]** plaintext server-stored · **[E]** encrypted at rest, client-derived keys (opaque blob to the server) · **[N]** never persisted.

## USER
- id, created_at [P]
- name, email [P] — the *only* personal plaintext the product stores by design
- plan / quota tier, billing status [P] (billing card data lives in the payment processor, never here)
- wrapped DEK material per device [P — ciphertext only; the server can never unwrap it] (§19.3)
- preferences beyond basic account settings [E]

## SESSION — one clarification-to-draft flow instance
- id, user_id, platform_id, project_id (optional), created_at [P]
- pipeline state transitions (state, timing, agent, tokens, cost per step) [P — trace metadata only, no content] (§7.2)
- prompt strength score + per-dimension rubric scores, critic findings summary, refinement count [P — numeric/enum only]
- raw user idea, clarification Q&A content [E]
- in-flight decrypted content during agent processing [N — ephemeral memory only, §19.4]

## PROJECT (§17.6)
- id, user_id, created_at [P]
- name, description, default_platform, pinned node set [E]
- scope key threaded through context assembly + memory retrieval [P — the id itself]
- Designed multi-user-ready (future owner/editor/viewer roles, §28.7) but single-user in v1.

## PROMPT
- id, user_id, project_id?, platform_id, session_id, created_at [P]
- node set (ordered, typed, with alternatives + lock state), assembled final string [E]
- strength score + rubric sub-scores [P — numbers only]
- version chain: every edit creates an immutable prior-version record (§29.1) [E content, P metadata]
- user feedback: worked / didn't / mixed + optional note (§29.2) — enum [P], note [E]
- library opt-in flag ("may be considered for autonomous curation") [P] — default OFF, explicit consent only (§14.4)

## PROMPT_NODE (embedded in PROMPT's encrypted payload; described for shape)
- type: subject | action_behavior | setting_context | style_aesthetic | composition_camera | lighting_mood | persona_role | constraints_rules | technical_parameters | negative_prompt | output_format (§13.1)
- primary value; 2–4 ranked alternatives each with a short rationale; locked flag; position

## MEMORY_ENTRY (§17)
- id, user_id, scope (global | project_id), source (agent_proposed | user_added), status (pending_confirmation | active), created_at [P]
- statement — one human-readable preference sentence [E]
- Agent-proposed entries are pending until the user confirms; user can view/edit/delete/add; reset per scope.

## KNOWLEDGE_CHUNK (PKB) / MPKB_ENTRY (§6, §10.2) — all [P]; contains no user data
- source URL, ingestion timestamp, content hash, trust/confidence score, platform_id / model_family tags
- chunk text + embedding vector (1536-d, pgvector)
- MPKB_ENTRY additionally: category (negation-handling, few-shot guidance, formatting sensitivity, …), model_family, version
- STRATEGY_PROFILE (§10.3): versioned config per task type — drafting template, technique requirements, format requirements

## MODEL_CAPABILITY_RECORD (§15.1) — [P]
- model/platform id, modality support, context window, cost tier, latency profile, qualitative strengths, pricing data, last_verified — perishable, refreshed by ingestion, never hardcoded

## LIBRARY_ENTRY (§14.1) — [P]; public-bound content by definition
- node set template, customizable-node markers, preview, description, modality + platform tags
- source: internally_seeded | human_submitted | autonomously_published
- popularity counters, remix/fork count, version history, moderation status

## PROVIDER_CONNECTION (BYOK, §9.4/9.6) — 
- id, user_id, provider type, status, created_at [P]
- envelope-encrypted key **reference** into the secrets manager (SSM SecureString) — the key itself never enters the primary DB in any form
- per-connection usage counters [P]
- Property: **revocable, never retrievable.** No code path returns the plaintext key to any client or admin.

## USAGE_EVENT (§18) — [P]; deliberately content-free
- user_id, session_id, pipeline steps run, tokens consumed, cost, provider connection used, timestamp
- Billing/analytics never require decrypting user content.

## OUTCOME_SIGNAL (§10.7, §29.2) — [P]; anonymized, aggregate-only
- task_type, platform_id, rubric-dimension outcomes, edit count before accept, reuse flag, thumbs up/down
- **Never** linked to user identity; never contains content.

## SAFETY_DECISION (§33.6) — [P]
- user_id, session_id, classifier version, decision (allowed | blocked | flagged), category, confidence, timestamp
- Content itself is not stored here; the blocked prompt stays in the user's encrypted session record.

## APPEAL (§33.4)
- prompt ref, user_id, status (pending | upheld | overturned), reviewer, timestamps [P]; user's appeal reason [E until surfaced to the reviewer with consent — appeals explicitly authorize review of the specific blocked prompt]

## AUDIT_LOG_ENTRY (§21.1, §27.1) — [P]; append-only
- actor (user/admin/system agent), action, before/after state summary, timestamp, request id
- No UPDATE or DELETE grants for any application role — immutability enforced at the database, not by convention.

## ADMIN_USER / ROLE (§21) — [P]; lives in the **separate admin Supabase project**
- role: support | security | infra | superadmin per `docs/admin-roles.md`
- No admin table, role, or credential grants access to [E] content — the decryption capability does not exist in the admin service (§21.3).

## Retention intent (§27.4)
- Sessions/traces: 90 days full, then aggregate-only.
- Usage events: 24 months (billing/tax driven).
- Outcome signals: indefinite (anonymized aggregates).
- User content [E]: until user deletion — deleting the blob + wrapped keys IS the deletion (§19.6).
- Audit log: 24 months minimum (compliance evidence).
