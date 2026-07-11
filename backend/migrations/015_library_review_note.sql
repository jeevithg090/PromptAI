-- T7.6: reviewer note on library moderation decisions (§14.2).
alter table library_entries add column if not exists review_note text;
