-- 005_rate_limits.sql — Postgres-backed rate limiting (§23.4, §16, T3.2).
-- Fixed-window counter per user per minute. user_id is text (dev-bypass ids
-- are not uuids). The middleware upsert-increments and denies when count
-- exceeds RATE_LIMIT_REQUESTS_PER_MINUTE, falling back to in-memory on DB error.

create table if not exists rate_limits (
  user_id text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (user_id, window_start)
);
