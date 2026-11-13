-- Content-free product events (blueprint §12), written by POST /v1/events.
-- `id` is the client-generated UUIDv7 and the idempotency key: inserts use
-- `on conflict (id) do nothing`, so a retried event is stored exactly once.
--
-- `user_id` (and the origin tag, language dimensions and monthly partitions
-- from §12) wait for auth: until a request carries a verified user there is
-- nothing trustworthy to put in it.
--
-- One statement per file: PGlite's query() runs a single statement per call.
create table events (
  id uuid primary key,
  type text not null,
  at timestamptz not null,
  props jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
