-- 004_audit_immutability.sql — make audit_log truly append-only (§27.1, T3.1).
-- Adds a first-class session_id column + index, and revokes UPDATE/DELETE
-- so the application role has INSERT/SELECT only. Idempotent — re-running
-- is a no-op.

-- First-class session_id column (previously only embedded in detail jsonb).
-- Sessions are always created via crypto.randomUUID() so uuid is correct.
alter table audit_log add column if not exists session_id uuid;

-- Index for per-session trace reconstruction (GET /sessions/:id/trace, T3.1).
create index if not exists idx_audit_session on audit_log (session_id, created_at);

-- Revoke UPDATE/DELETE from PUBLIC — append-only by construction (§27.1).
-- REVOKE is idempotent in Postgres, but the DO block adds belt-and-suspenders
-- exception handling so re-running the migration is always safe.
do $$
begin
  revoke update, delete on audit_log from public;
exception when others then
  raise notice 'REVOKE skipped: %', SQLERRM;
end $$;

comment on table audit_log is
  'Append-only audit log (§27.1, T3.1). Application role has INSERT/SELECT only — UPDATE/DELETE revoked.';
