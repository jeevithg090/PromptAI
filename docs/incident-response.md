# Incident Response Plan

## Severity Definition
- **Critical:** Any unauthorized access to prompt content, memory, or BYOK keys
- **High:** Suspected vulnerability in auth/safety/encryption layers
- **Medium:** Logged anomaly in audit trail; provider data breach affecting downstream
- **Low:** Configuration drift, missing migration, stale dependency

## Response Phases (§27.2)
1. **Detection** — Automated: error-rate alerting (T3.3), budget runaway halt (T3.2), audit immutability violation. Manual: user report, admin review.
2. **Triage** — Pager contacts (during business hours), verify severity within 30min.
3. **Containment** — Feature flag kill-switch (T7.5), rate-limit change, key rotation.
4. **Remediation** — Deploy fix via CI/CD, verify with test suite.
5. **Postmortem** — Within 7 days; findings added to this document.

## Contact
- Security: tbd@promptforge.app (replace when operational)
- Infra: tbd@promptforge.app (replace when operational)
