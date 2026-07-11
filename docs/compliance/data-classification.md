# Data Classification — PromptForge

Every table and column classified per §19.1.

## Classification Legend
- **[P] Public/Metadata** — user-facing labels, platform definitions, non-sensitive. Readable by anyone; safe to log.
- **[E] Encrypted** — stored as ciphertext only. Server cannot read without user's DEK. Never logged.
- **[N] Non-sensitive Operational** — DB-level, audit, metering data. Readable by backend + admin.

## Table Classification

| Table | Columns | Classification | Notes |
|-------|---------|---------------|-------|
| `app_users` | id, email, plan, monthly_token_budget, created_at | [P] | Billing status only |
| `app_users` | stripe_customer_id | [P] | Stripe customer reference (no card data) |
| `sessions` | id, user_id, project_id, platform_id, final_state, strength_score, created_at | [P] | Metadata only |
| `sessions` | content_ciphertext | [E] | T7.1 — user's idea + clarification history |
| `prompts` | id, user_id, session_id, task_type, platform_id, strength_score, created_at | [P] | Metadata only |
| `prompt_versions` | id, version, assembled | [P] | Public prompt text (assembled from public knowledge) |
| `prompt_versions` | nodes_json | [P] | Transitioning to ciphertext (T7.1) |
| `prompt_versions` | content_ciphertext | [E] | T7.1 — node content (encrypted) |
| `prompt_versions` | rubric_scores | [P] | Quality metrics |
| `user_keys` | user_id, wrapped_dek_pass, wrapped_dek_recovery, kdf_salt, kdf_iterations | [N] | Wrapped keys — server cannot decrypt |
| `provider_connections` | id, user_id, provider, secret_ref | [N] | SSM references — no key material |
| `memory_entries` | id, user_id, scope, source, status, statement_ciphertext | [E] | Encrypted user preferences |
| `memory_entries` | task_type | [P] | Metadata for relevance filtering |
| `projects` | id, user_id, name, description | [P] | User-facing labels |
| `projects` | content_ciphertext | [E] | Pinned preferences |
| `library_entries` | all columns | [P] | Public community content |
| `knowledge_chunks` | all columns | [P] | Platform knowledge (public) |
| `platforms` | all columns | [P] | Platform definitions |
| `model_capability_records` | all columns | [P] | Model specs |
| `feature_flags` | all columns | [N] | Admin-managed kill switches |
| `billing_events` | all columns | [N] | Stripe event audit |
| `outcome_signals` | all columns | [N] | Anonymized analytics |
| `audit_log` | all columns except detail | [N] | Audit trail |
| `audit_log` | detail | [P] → [N] | Metadata only — never contains prompt content |
| `rate_limits` | all columns | [N] | Rate limiting state |
