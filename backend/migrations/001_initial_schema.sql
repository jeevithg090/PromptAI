-- 001_initial_schema.sql — core entities (spec §18, docs/data-model.md)
-- Data classes: encrypted content is stored as opaque ciphertext (bytea/text),
-- never plaintext (§19.1). auth.users is Supabase Auth's table; app tables
-- reference its UUID.

create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key,                    -- = auth.users.id
  name text not null,                     -- [P] one of the only two plaintext PII fields
  email text not null unique,             -- [P]
  plan text not null default 'free',
  monthly_token_budget integer not null default 10000,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  content_ciphertext text,                -- [E] name/description/pinned nodes as one encrypted blob
  default_platform text,
  created_at timestamptz not null default now()
);
create index if not exists idx_projects_user on projects(user_id);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  platform_id text not null,
  final_state text,
  strength_score integer,                 -- [P] numeric only
  rubric_scores jsonb,                    -- [P] per-dimension numbers only
  refinement_count integer default 0,
  content_ciphertext text,                -- [E] idea + clarification history
  created_at timestamptz not null default now()
);
create index if not exists idx_sessions_user on sessions(user_id);
create index if not exists idx_sessions_platform on sessions(platform_id);

create table if not exists prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  session_id uuid references sessions(id) on delete set null,
  platform_id text not null,
  version integer not null default 1,
  parent_version_id uuid references prompts(id), -- version chain (§29.1)
  content_ciphertext text not null,       -- [E] node set + assembled string
  strength_score integer,
  rubric_scores jsonb,
  feedback text check (feedback in ('worked','didnt_work','mixed')),
  library_opt_in boolean not null default false, -- §14.4 hard consent gate
  created_at timestamptz not null default now()
);
create index if not exists idx_prompts_user on prompts(user_id);
create index if not exists idx_prompts_project on prompts(project_id);

create table if not exists memory_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  scope text not null default 'global',   -- 'global' or a project_id
  source text not null check (source in ('agent_proposed','user_added')),
  status text not null default 'pending_confirmation'
    check (status in ('pending_confirmation','active')),
  statement_ciphertext text not null,     -- [E]
  created_at timestamptz not null default now()
);
create index if not exists idx_memory_user_scope on memory_entries(user_id, scope);
