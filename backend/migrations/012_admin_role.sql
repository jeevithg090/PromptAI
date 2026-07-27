-- T7.5: admin_readonly_plus Postgres role (§21.3).
-- Run this as superuser after the application role exists.
-- The password must be set manually via Supabase dashboard:
--   alter role admin_readonly_plus with password '<generated-password>';
-- Then configure the admin backend's DATABASE_URL to use this role.
--
-- Grants are designed so the admin deployable CANNOT read ciphertext columns
-- (user_keys, memory_entries, provider_connections, prompts, projects).

do $$
begin
  if not exists (select from pg_catalog.pg_roles where rolname = 'admin_readonly_plus') then
    create role admin_readonly_plus noinherit;
  end if;
end
$$;

-- Usage: connect
grant usage on schema public to admin_readonly_plus;

-- Read-only tables (metadata only — no ciphertext columns):
grant select on sessions to admin_readonly_plus;
grant select on usage_events to admin_readonly_plus;
grant select on audit_log to admin_readonly_plus;
grant select on outcome_signals to admin_readonly_plus;
grant select on platform_requests to admin_readonly_plus;
grant select on rate_limits to admin_readonly_plus;
grant select on app_users to admin_readonly_plus;

-- Read-write tables (moderation, content management):
grant select, insert, update on library_entries to admin_readonly_plus;
grant select on knowledge_chunks to admin_readonly_plus;
grant insert, update on knowledge_chunks to admin_readonly_plus;
grant select on platforms to admin_readonly_plus;
grant insert, update on platforms to admin_readonly_plus;
grant select on model_capability_records to admin_readonly_plus;
grant insert, update on model_capability_records to admin_readonly_plus;
-- feature_flags grants live in 013 (table is created there, after this file runs).

-- Audit log insert (every admin action is logged):
grant insert on audit_log to admin_readonly_plus;

-- EXPLICITLY NOT GRANTED:
-- user_keys, memory_entries, prompts, prompt_versions, provider_connections, projects
