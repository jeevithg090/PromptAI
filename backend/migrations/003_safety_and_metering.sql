-- 003_safety_and_metering.sql — safety decisions, appeals, metering, outcome
-- signals, library, BYOK references, audit log (spec §33.6, §29.2, §18, §21.1).

create table if not exists safety_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  session_id uuid,
  classifier_version text not null,
  decision text not null check (decision in ('allowed','blocked','flagged')),
  category text,
  confidence real,
  failed_closed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_safety_user on safety_decisions(user_id);

create table if not exists appeals (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid,
  user_id uuid not null references app_users(id) on delete cascade,
  reason_ciphertext text,                 -- [E] until surfaced to reviewer with consent (§33.4)
  status text not null default 'pending' check (status in ('pending','upheld','overturned')),
  reviewer text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists usage_events (
  id bigint generated always as identity primary key,
  user_id uuid references app_users(id) on delete set null,
  session_id uuid,
  pipeline_step text,
  provider_connection text default 'default',
  tokens_used integer not null default 0,
  cost_usd numeric(10,6) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_usage_user_month on usage_events(user_id, created_at);

-- Anonymized, aggregate-only — never joined to identity (§10.7, §29.2).
create table if not exists outcome_signals (
  id bigint generated always as identity primary key,
  task_type text not null,
  platform_id text,
  rubric_scores jsonb,
  edit_count integer,
  reused boolean,
  feedback text check (feedback in ('worked','didnt_work','mixed')),
  created_at timestamptz not null default now()
);

create table if not exists library_entries (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('internally_seeded','human_submitted','autonomously_published')),
  title text not null,
  description text not null,
  modality text not null,
  platform_tags text[] not null default '{}',
  template jsonb not null,                -- node set with customizable-node markers (public content)
  preview_url text,
  popularity integer not null default 0,
  remix_count integer not null default 0,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending','approved','rejected')),
  version integer not null default 1,
  created_at timestamptz not null default now()
);

-- BYOK: key REFERENCE only — the key itself lives in the secrets manager (§9.4).
create table if not exists provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  provider text not null,
  secret_ref text not null,               -- SSM parameter name, never key material
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now()
);

-- Append-only audit log (§21.1, §27.1). Immutability enforced by revoking
-- UPDATE/DELETE from the application role (run as superuser after role setup):
--   revoke update, delete on audit_log from <app_role>;
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  actor text not null,                    -- user id, admin id, or system agent name
  action text not null,
  status text not null,
  detail jsonb,                           -- metadata only — never content plaintext
  created_at timestamptz not null default now()
);
