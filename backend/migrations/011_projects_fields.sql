-- T7.4: project metadata fields (name/description are [P] user-facing labels).
alter table projects add column if not exists name text not null default 'Untitled';
alter table projects add column if not exists description text;
