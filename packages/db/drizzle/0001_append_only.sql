-- Append-only and immutable tables (blueprint §12; the legacy
-- backend/migrations/004_audit_immutability.sql pattern). Triggers bind every
-- role, the table owner included: on Supabase the app often connects as the
-- owner, for whom the REVOKE below changes nothing.
create function promptai_refuse_change() returns trigger language plpgsql as $$
begin
  raise exception '% on % is not allowed', tg_op, tg_table_name using errcode = '42501';
end $$;
--> statement-breakpoint
-- Account erasure (DELETE /v1/me) is the one way consent history goes: that
-- transaction runs `set_config('promptai.erasure', 'on', true)` first.
create function promptai_refuse_unless_erasure() returns trigger language plpgsql as $$
begin
  if current_setting('promptai.erasure', true) = 'on' then
    return old;
  end if;
  raise exception '% on % is allowed only during account erasure', tg_op, tg_table_name using errcode = '42501';
end $$;
--> statement-breakpoint
create trigger audit_log_append_only before update or delete on audit_log for each row execute function promptai_refuse_change();
--> statement-breakpoint
create trigger audit_log_no_truncate before truncate on audit_log for each statement execute function promptai_refuse_change();
--> statement-breakpoint
create trigger consent_ledger_no_update before update on consent_ledger for each row execute function promptai_refuse_change();
--> statement-breakpoint
create trigger consent_ledger_erasure_only before delete on consent_ledger for each row execute function promptai_refuse_unless_erasure();
--> statement-breakpoint
create trigger consent_ledger_no_truncate before truncate on consent_ledger for each statement execute function promptai_refuse_change();
--> statement-breakpoint
-- A version is a snapshot: edits add a version, never change one. Rows are
-- deleted only with their artifact (erasure or a library delete).
create trigger artifact_versions_immutable before update on artifact_versions for each row execute function promptai_refuse_change();
--> statement-breakpoint
do $$
begin
  revoke update, delete, truncate on audit_log from public;
exception when others then
  raise notice 'REVOKE skipped: %', sqlerrm;
end $$;
