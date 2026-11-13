-- Share-link hardening (blueprint §18 fix-now). Anyone viewing a public share
-- can report it with a reason code; an admin takedown revokes the link and
-- records why. Reports are content-free: a reason code, no reporter identity
-- and no free text. Keep the reason list in sync with SHARE_REPORT_REASONS
-- (backend/src/services/ShareService.ts).
alter table share_links add column if not exists takedown_reason text
  check (takedown_reason in ('illegal','child_safety','harassment','sexual','privacy','copyright','spam','other'));

create table if not exists share_reports (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references share_links(id) on delete cascade,
  reason text not null
    check (reason in ('illegal','child_safety','harassment','sexual','privacy','copyright','spam','other')),
  created_at timestamptz not null default now()
);

create index if not exists idx_share_reports_link on share_reports (share_link_id);
