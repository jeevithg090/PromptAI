-- T7.7: billing / Stripe integration (§28.2).
-- Card data never touches our servers (§19.1); only customer id + event ids stored.
alter table app_users add column if not exists stripe_customer_id text;

-- Idempotent billing events: prevents double-processing on webhook retries.
create table if not exists billing_events (
  event_id text primary key,
  type text not null,
  payload jsonb,
  processed_at timestamptz not null default now()
);
