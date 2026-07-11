-- T7.5: feature flags + kill switches read by the consumer backend at
-- request time. Cached for 60s in the consumer via a simple in-memory map.
-- Managed by the admin control plane (superadmin, step-up).
create table if not exists feature_flags (
  key text primary key,
  value jsonb not null default 'true',
  updated_at timestamptz not null default now()
);

-- Seed defaults:
insert into feature_flags (key, value) values
  ('visual_preview_enabled', 'true'),
  ('live_fetch_enabled', 'true'),
  ('demo_enabled', 'true'),
  ('provider_groq_enabled', 'true'),
  ('provider_cerebras_enabled', 'true'),
  ('provider_opencode_zen_enabled', 'true'),
  ('provider_openai_enabled', 'true'),
  ('provider_google_enabled', 'true'),
  ('provider_mock_enabled', 'true')
on conflict (key) do nothing;
