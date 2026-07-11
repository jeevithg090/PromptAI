# Access Review Process — PromptForge

Quarterly review of all access controls. Document every review with date, reviewer, and findings.

## Scope
1. **AWS IAM**: List all IAM users/roles; verify least-privilege; remove unused keys > 90 days
2. **Supabase**: List all project members; verify role assignments; remove inactive members
3. **GitHub**: List all repo collaborators; verify access is current
4. **Admin roles**: Verify `admin_readonly_plus` Postgres role grants match §21.3 spec
5. **Feature flags**: Verify kill-switches are testable (flip + revert on staging)

## Schedule
- Quarterly: January, April, July, October
- Triggered: After any P1/P2 incident, after onboarding/offboarding

## Template
```markdown
## Access Review — [DATE]
**Reviewer**: [NAME]

### AWS IAM
- [ ] All users active: [LIST]
- [ ] Unused keys removed: [COUNT]
- [ ] Least-privilege verified: [Y/N]

### Supabase
- [ ] Project members current: [LIST]
- [ ] Admin roles correct: [LIST]

### GitHub
- [ ] Collaborators current: [LIST]
- [ ] Branch protections active: [Y/N]

### DB Roles
- [ ] admin_readonly_plus grants verified: [Y/N]
- [ ] No unauthorized schema access: [Y/N]

### Findings
[ANY ISSUES FOUND]
```

## Evidence
Store completed reviews in `docs/compliance/access-review-YYYY-QN.md` and commit to repo.
