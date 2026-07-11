-- 009_content_ciphertext.sql — add content_ciphertext column to prompt_versions (T7.1).
-- After this migration, new prompt version writes use content_ciphertext instead of nodes_json.
-- Existing plaintext versions remain readable until a client-side one-time migration re-encrypts them
-- and the cleanup migration (010) nullifies nodes_json.

alter table prompt_versions add column if not exists content_ciphertext text;

-- Migration 010 will be triggered manually after client migration confirms:
-- alter table prompt_versions alter column nodes_json drop not null;
