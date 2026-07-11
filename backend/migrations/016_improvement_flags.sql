-- T7.9: improvement flags from outcome analysis (§10.7, §28.5).
create table if not exists improvement_flags (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('strategy_profile','mpkb_category')),
  target text not null,
  reason text not null,
  metrics jsonb,
  status text not null default 'open' check (status in ('open','resolved')),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
