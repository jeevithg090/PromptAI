-- Platform request submissions (§5.4, T5.5). Users can request support for
-- a site not yet in the registry. This is the backend for the extension's
-- "Request support for this site" button.
create table if not exists platform_requests (
  id uuid primary key default gen_random_uuid(),
  origin text not null,
  note text,
  created_at timestamptz not null default now()
);
