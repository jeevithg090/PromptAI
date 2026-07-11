-- 008_user_keys.sql — E2EE user key storage (§19.2, T7.1).
-- Server stores WRAPPED keys only — never a raw DEK or KEK.
-- Wrapped keys are AES-GCM(KEK, DEK) with an appended IV.
-- Two wrapped copies exist: one for passphrase-derived KEK, one for recovery-code-derived KEK.

create table if not exists user_keys (
  user_id uuid primary key references app_users(id) on delete cascade,
  wrapped_dek_pass text not null,           -- wrapped with passphrase-derived KEK (base64 iv.ciphertext)
  wrapped_dek_recovery text not null,       -- wrapped with recovery-code-derived KEK
  kdf_salt text not null,                   -- base64 16-byte salt for PBKDF2
  kdf_iterations int not null default 600000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
