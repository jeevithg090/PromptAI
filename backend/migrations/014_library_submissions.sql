-- T7.6: submission attribution and user_id for library entries.
alter table library_entries add column if not exists user_id uuid references app_users(id) on delete set null;
alter table library_entries add column if not exists attributed_user_id uuid references app_users(id) on delete set null;
alter table library_entries add column if not exists reviewed_by uuid;
alter table library_entries add column if not exists reviewed_at timestamptz;
