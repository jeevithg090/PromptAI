-- T7.3: plaintext task_type tag for relevance filtering (§17.4, §19.1 [P]).
-- The statement itself stays encrypted in statement_ciphertext [E]; this column
-- is metadata only so the client can cheaply filter without decrypting every row.
alter table memory_entries add column if not exists task_type text;
create index if not exists idx_memory_task_type on memory_entries(user_id, task_type);
