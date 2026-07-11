# Data Retention Policy (§27.3)

| Data Class | Entity | Retention | Deletion Mechanism |
|---|---|---|---|
| [R] | Prompt ciphertext | Until user deletes or account deletion | Hard delete from DB row |
| [R] | Memory ciphertext | Until user deletes or account deletion | Hard delete from DB row |
| [R] | BYOK keys | 30 days post-revocation (then SSM deletion job) | `aws ssm delete-parameter` |
| [P] | PKB embeddings | Indefinite (no original text stored) | Cascade with source deletion |
| [I] | Usage events | 24 months for billing analytics, then aggregated-only | Cron job: `delete where created_at < now() - interval '24 months'` |
| [I] | Outcome signals | 24 months | Same cron job |
| [I] | Audit log | 24 months minimum (compliance evidence) | Append-only, never deleted |
| [I] | Session metadata | 24 months | Same cron job |
| [I] | Platform requests | 12 months | Same cron job |
| [PB] | Library templates | Indefinite | Moderation-only (content is public) |
| [PB] | Platform registry | Indefinite | Config-driven |

## Deletion Jobs
- Scheduled: GitHub Actions weekly (cron `0 5 * * 1`) runs SQL against the backend for each tier.
- Self-service: Users can delete their own data via the account page (§27.4).
