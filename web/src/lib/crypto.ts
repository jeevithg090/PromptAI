/**
 * Client-side E2EE (§19.2, T7.1).
 * WebCrypto only — no crypto npm dependencies.
 *
 * Design:
 * - Per-user DEK (256-bit AES-GCM), generated client-side on first setup.
 * - KEK derived from passphrase via PBKDF2(SHA-256, 600k iterations, random salt).
 * - Recovery code: 32 random bytes → 8×4 char base32 groups, shown once.
 * - DEK is AES-GCM-wrapped with each KEK and stored server-side.
 * - Content: AES-GCM(DEK, plaintext), 12-byte IV, stored as base64(IV.ciphertext).
 *
 * Recovery code entropy: 32 bytes = 256 bits. Base32 = 5 bits/char → 52 chars,
 * formatted as 8 groups of 4 chars with hyphens (e.g. "ABCD-EFGH-...").
 */

const KDF_ITERATIONS = 600_000;
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

function base32Encode(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let bits = 0;
  let value = 0;
  let result = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

function formatRecoveryCode(raw: string): string {
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += 4) {
    groups.push(raw.slice(i, i + 4).padEnd(4, '='));
  }
  return groups.join('-');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const saltBuf = new Uint8Array(salt).buffer as ArrayBuffer;
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuf, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

let cachedDek: CryptoKey | null = null;

export function isUnlocked(): boolean {
  return cachedDek !== null;
}

export function lock(): void {
  cachedDek = null;
}

/**
 * Generate a new DEK and wrap it with both the passphrase-derived KEK
 * and the recovery-code-derived KEK. Returns the wrapped keys + salt +
 * recovery code (shown once, not stored server-side).
 */
export async function setupEncryption(passphrase: string): Promise<{
  wrappedDekPass: string;
  wrappedDekRecovery: string;
  kdfSalt: string;
  recoveryCode: string;
}> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await deriveKey(passphrase, salt);

  // Generate DEK
  const dek = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );

  // Wrap DEK with passphrase KEK
  const ivPass = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const wrappedPass = await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv: ivPass.buffer as ArrayBuffer });
  const wrappedDekPass = bytesToBase64(new Uint8Array([...ivPass, ...new Uint8Array(wrappedPass)]));

  // Generate recovery code and derive a second KEK
  const recoveryRaw = crypto.getRandomValues(new Uint8Array(32));
  const recoveryCode = formatRecoveryCode(base32Encode(recoveryRaw));
  const recoveryKek = await deriveKey(recoveryCode, salt);

  const ivRecovery = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const wrappedRecovery = await crypto.subtle.wrapKey('raw', dek, recoveryKek, { name: 'AES-GCM', iv: ivRecovery.buffer as ArrayBuffer });
  const wrappedDekRecovery = bytesToBase64(new Uint8Array([...ivRecovery, ...new Uint8Array(wrappedRecovery)]));

  // Cache DEK
  cachedDek = dek;

  return {
    wrappedDekPass,
    wrappedDekRecovery,
    kdfSalt: bytesToBase64(salt),
    recoveryCode,
  };
}

/**
 * Unwrap the DEK from a stored wrapped key using either the passphrase
 * or recovery code. Caches the DEK in memory for the session.
 */
export async function unlock(
  passphraseOrRecovery: string,
  wrappedDekB64: string,
  kdfSaltB64: string
): Promise<void> {
  const salt = base64ToBytes(kdfSaltB64);
  const kek = await deriveKey(passphraseOrRecovery, salt);

  const wrapped = base64ToBytes(wrappedDekB64);
  const iv = wrapped.slice(0, IV_LENGTH);
  const ciphertext = wrapped.slice(IV_LENGTH);

  cachedDek = await crypto.subtle.unwrapKey(
    'raw',
    ciphertext.buffer as ArrayBuffer,
    kek,
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Encrypt a JSON-serializable object. Returns base64(IV.ciphertext). */
export async function encrypt(obj: unknown): Promise<string> {
  if (!cachedDek) throw new Error('encryption not unlocked');
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(JSON.stringify(obj));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, cachedDek, encoded.buffer as ArrayBuffer);
  return bytesToBase64(new Uint8Array([...iv, ...new Uint8Array(ciphertext)]));
}

/** Decrypt a base64(IV.ciphertext) back to the original object. */
export async function decrypt<T = unknown>(payload: string): Promise<T> {
  if (!cachedDek) throw new Error('decryption not unlocked');
  const data = base64ToBytes(payload);
  const iv = data.slice(0, IV_LENGTH);
  const ciphertext = data.slice(IV_LENGTH);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, cachedDek, ciphertext.buffer as ArrayBuffer);
  return JSON.parse(new TextDecoder().decode(decrypted)) as T;
}
