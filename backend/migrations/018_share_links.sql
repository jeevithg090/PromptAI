-- F2.4: safety-gated, revocable public share links for prompts. The slug is an
-- unguessable 22-char base64url token. GET /share/:slug is public and returns
-- NO owner identity. Revoked links set revoked_at and 404.
create table if not exists share_links (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references prompts(id) on delete cascade,
  slug text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists idx_share_links_slug on share_links (slug) where revoked_at is null;
