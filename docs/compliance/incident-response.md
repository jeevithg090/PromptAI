# Incident Response Plan — PromptForge

## Severity Levels
- **P1 — Critical**: Data breach, key compromise, service-wide outage
- **P2 — High**: Single account compromise, partial data exposure
- **P3 — Medium**: Bug causing incorrect behavior, moderate user impact
- **P4 — Low**: Cosmetic issue, minor impact

## First-Hour Checklist (P1/P2)
1. **Contain**: Rotate all provider API keys (admin dashboard kill-switches + manual SSM revoke)
2. **Assess**: Query audit_log for scope of unauthorized access
3. **Notify**: Users affected within 72 hours (GDPR Art. 33)
4. **Document**: Create incident ticket with timeline

## Provider Key Compromise Playbook
1. Kill-switch: disable the provider via `feature_flags` (admin dashboard → provider_<name>_enabled = false)
2. Revoke: `DELETE /connections/:id` via user's account (or admin-level if user unavailable)
3. SSM delete: `revokeKey(secret_ref)` in KeyCustody.ts
4. Notify affected users: "Your API key for [provider] was revoked. Reconnect in Account → Provider Connections."

## Escalation
- P1: Immediate Slack alert to security@promptforge team
- P2: Email notification within 24 hours
- P3/P4: Tracked in issue tracker; resolved per normal sprint

## Contact
- Security: security@promptforge.dev
- Privacy: privacy@promptforge.dev
