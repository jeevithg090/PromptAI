# Data Retention Policy — PromptForge

Automated deletion via `npm run retention` (T7.8). Schedule: monthly cron.

| Table | Retention | Action | Notes |
|-------|-----------|--------|-------|
| `sessions` | 24 months | DELETE | Metadata only; content_ciphertext [E] deleted with row |
| `usage_events` | 24 months | DELETE | Metering data; no content |
| `audit_log` | 36 months | DELETE | Immutable audit trail; compliance evidence |
| `rate_limits` | 7 days | DELETE | Expiring rate-limit windows |
| `billing_events` | 7 years | RETAIN | Stripe audit; required for financial compliance |
| `prompts` + `prompt_versions` | User-controlled | User delete only | User owns their prompts; we never auto-delete |
| `memory_entries` | User-controlled | User delete only | User controls their memory |
| `provider_connections` | User-controlled | User delete only | SSM keys revoked on user deletion |
| `feature_flags` | N/A | Admin-managed | Never auto-deleted |
| `library_entries` | N/A | Admin moderation | Community content; moderation removes |
| `outcome_signals` | 24 months | DELETE | Anonymized analytics |

## Content Classification
- **[E] Encrypted columns** are effectively user-controlled — without the user's DEK, ciphertext is dead data. Deleting the DEK (via DELETE /me) satisfies erasure.
- **[P] Prompt content** (assembled text) is public knowledge derived from platform docs; no PHI.
- **[N] Audit/metering** contains no prompt content or user content.
