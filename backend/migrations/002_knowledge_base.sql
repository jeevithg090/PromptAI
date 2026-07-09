-- 002_knowledge_base.sql — PKB, MPKB, platform registry, capability matrix
-- (spec §5.1, §6, §10.2, §15.1). No user data in any of these tables.

create extension if not exists vector;

create table if not exists platforms (
  platform_id text primary key,
  display_name text not null,
  modalities text[] not null,
  url_patterns text[] not null,
  dom_fingerprint_selectors text[] not null default '{}',
  input_selector_candidates text[] not null default '{}',
  docs_url text not null,
  quirks text[] not null default '{}',
  syntax_rules text[] not null default '{}',
  max_prompt_tokens integer not null,
  tos_reviewed boolean not null default false,
  schema_version text not null,
  last_verified date not null,
  deprecated boolean not null default false
);

create table if not exists knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('pkb','mpkb')),
  platform_id text references platforms(platform_id),
  model_family text,                      -- mpkb entries
  category text,                          -- mpkb: negation_handling, few_shot, formatting, ...
  content text not null,
  embedding vector(1536),
  source_url text not null,
  content_hash text not null,
  trust_score real not null default 1.0,  -- community sources ingest lower (§6.1)
  ingested_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now()
);
create index if not exists idx_chunks_platform on knowledge_chunks(platform_id, kind);
-- ivfflat needs data before it's useful; created here so similarity search works from the start (§23.2).
create index if not exists idx_chunks_embedding on knowledge_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table if not exists strategy_profiles (
  id uuid primary key default gen_random_uuid(),
  task_type text not null,
  version integer not null default 1,
  profile jsonb not null,                 -- drafting template + technique requirements (§10.3)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (task_type, version)
);

create table if not exists model_capability_records (
  id uuid primary key default gen_random_uuid(),
  model_id text not null,
  platform_id text references platforms(platform_id),
  modalities text[] not null,
  context_window integer,
  cost_tier text,
  latency_profile text,
  strengths text[],
  pricing jsonb,
  last_verified date not null,
  unique (model_id, platform_id)
);
