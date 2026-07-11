# Data Classification (§19.1)

## [R] Restricted
- **Definition:** Full-content data that is NEVER stored plaintext. Encrypted at rest with client-derived keys (§19.2). Ephemerally decrypted in-memory during processing only.
- **Example fields:** prompt ciphertext (PROMPT.node_set, assembled_final_string), memory ciphertext (MEMORY_ENTRY.statement), BYOK keys (AWS SSM SecureString — never in the primary DB), project ciphertext (PROJECT.name, description, pinned_node_set), SESSION.raw_user_idea, clarification Q&A content
- **Retention:** Until user deletes or account deletion (30-day hard delete)
- **Encryption:** AES-256-GCM client-side. Zero-knowledge per §19.3. Server never holds a decryption capability.

## [P] Private (processing-visible)
- **Definition:** Plaintext data visible during pipeline processing but not persisted as raw content. May be stored as derived artifacts (embeddings, classifications) that do not reconstruct original text.
- **Example fields:** intent classification labels, clarification Q&A answers (in-memory only, §19.4), PKB chunk embeddings (1536-d vector, no original text), pipeline state transitions (state, timing, agent, cost per step), rubric scores, refinement count
- **Retention:** Derived embeddings retained indefinitely (no source text recoverable). In-memory pipeline data is ephemeral — never persisted.
- **Encryption:** No content-level encryption required; access scoped to pipeline execution context.

## [I] Internal
- **Definition:** Operational and analytics data visible to the platform. Content-free by design — never contains user prompt text, memory, or personal information beyond email/name.
- **Example fields:** USAGE_EVENT (tokens, cost, steps, provider), OUTCOME_SIGNAL (anonymized rubric outcomes, edit count), SESSION metadata (id, user_id, platform_id, created_at, final_state), AUDIT_LOG_ENTRY (actor, action, before/after summary), SAFETY_DECISION (classifier version, decision, category), APP_USER.id/email/plan, PLATFORM_REQUEST logs
- **Retention:** Usage events and session metadata: 24 months. Audit log: 24 months minimum (append-only, never deleted). Outcome signals: indefinite (aggregated, anonymized).
- **Encryption:** Standard at-rest encryption (AES-256 AWS/Supabase managed). No application-layer encryption.

## [PB] Public
- **Definition:** Content intentionally published or curated for public consumption. No user identity or private data attached.
- **Example fields:** LIBRARY_ENTRY node-set templates, preview, description, tags, popularity counters; PLATFORM_REGISTRY model capability matrix (context window, cost tier, latency, supported modalities)
- **Retention:** Indefinite. Moderation-only removal for policy violations.
- **Encryption:** No application-layer encryption. Protected by integrity checks (signed hashes for registry entries).
