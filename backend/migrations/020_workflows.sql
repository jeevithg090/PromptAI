-- V2.5: Workflow Composer — ordered chains of prompts with piped variables
-- (step output → variable consumed by later steps). Local dev has no reachable
-- table, so the API supports an inline-definition run and the web falls back to
-- a localStorage-only builder when persistence is unavailable.
create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workflows_user on workflows (user_id);
