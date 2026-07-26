-- V2.3: Prompt Regression Suite — test cases attached to a saved prompt, run
-- against the provider and graded by deterministic assertions (+ optional
-- LLM judge). Local dev has no reachable table for this, so the API degrades
-- to a stateless run (no persistence) when the DB is unavailable.
create table if not exists prompt_tests (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references prompts(id) on delete cascade,
  user_id text not null,
  name text not null,
  var_values jsonb not null default '{}'::jsonb,
  assertions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_prompt_tests_prompt on prompt_tests (prompt_id);
