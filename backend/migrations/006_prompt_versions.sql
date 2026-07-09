-- 006_prompt_versions.sql — immutable prompt version history (§29.1, T3.4).
--
-- [P]-classified interim exception: nodes_json stores prompt node structure
-- in plaintext JSON. This is an approved pre-E2EE MVP exception — replaced
-- by ciphertext in T7.1. If the product owner rejects this exception, versions
-- are stored client-side instead and this table is dropped.

create table if not exists prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references prompts(id) on delete cascade,
  version int not null,
  nodes_json jsonb not null,               -- [P] interim: node set as JSON (→ ciphertext in T7.1)
  strength_score int,
  rubric_scores jsonb,
  created_at timestamptz not null default now(),
  unique(prompt_id, version)
);
create index if not exists idx_prompt_versions_prompt on prompt_versions(prompt_id, version);
