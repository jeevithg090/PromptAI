-- F2.4: prompt template variables. Derived server-side at save time from the
-- assembled text ({{name}} / {{name|default}} slots). Stored as jsonb array of
-- {name, default?}. Never trust a client-sent list — always re-derive.
alter table prompts add column if not exists variables jsonb;
alter table library_entries add column if not exists variables jsonb;
