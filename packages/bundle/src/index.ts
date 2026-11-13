/**
 * The signed content bundle, TUF-lite (docs/blueprint/BLUEPRINT.md §16
 * "Plugins are data"; procedure in docs/gates.md).
 *
 *   two offline root keys --sign--> a delegation: one CI key, role content-bundle, valid ≤12 months
 *   the CI key            --signs--> meta.json: { version, expires (≤30 days), channel, minClientVersion, bundleHash }
 *   bundleHash = sha256 of the manifest: every catalog file's path, size and sha256
 *
 * Signatures are ed25519 (node:crypto) over canonical JSON. The updater and
 * code signing use other keys and roots; a delegation for any role other than
 * content-bundle is rejected here.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const ROLE = 'content-bundle';
/** Distinct trusted roots that must sign a delegation. */
export const ROOT_THRESHOLD = 2;
export const MAX_META_DAYS = 30;
export const MAX_CI_KEY_MONTHS = 12;
/** Client clock error tolerated when checking how far ahead a meta expires. */
export const CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** More root signatures than this is malformed (bounds the work an attacker can cause). */
const MAX_ROOT_SIGNATURES = 8;

export type FileEntry = { path: string; size: number; sha256: string };
export type Manifest = { files: FileEntry[] };
export type Meta = { version: number; expires: string; channel: string; minClientVersion: string; bundleHash: string };
export type Delegation = { role: typeof ROLE; keyId: string; publicKey: string; notBefore: string; expires: string };
export type Signature = { keyId: string; sig: string };
export type Signatures = { delegation: Delegation; rootSignatures: Signature[]; meta: Signature };
export type KeyPair = { privateKeyPem: string; publicKey: string; keyId: string };

export type VerifyOptions = {
  now: Date;
  /** The channel this client follows, e.g. "stable". */
  channel: string;
  /** This client's version, compared with the meta's minClientVersion. */
  clientVersion: string;
  /** The highest bundle version this client has accepted before. */
  lastSeenVersion?: number;
};
export type VerifyCode =
  | 'malformed'
  | 'wrong_role'
  | 'untrusted_delegation'
  | 'ci_key_not_yet_valid'
  | 'ci_key_expired'
  | 'unknown_key'
  | 'bad_signature'
  | 'expired'
  | 'expires_too_far'
  | 'rollback'
  | 'wrong_channel'
  | 'client_too_old'
  | 'tampered';
type Failure = { ok: false; code: VerifyCode; reason: string };
export type VerifyResult = { ok: true; meta: Meta; manifest: Manifest } | Failure;
export type LoadResult = { ok: true; meta: Meta; manifest: Manifest; files: Map<string, Uint8Array> } | Failure;

// ---------------------------------------------------------------- encoding

/** JSON with object keys sorted and no whitespace: the bytes that are signed. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonicalJson: numbers must be finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => (value as Record<string, unknown>)[k] !== undefined);
    keys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  throw new TypeError(`canonicalJson: cannot encode a ${typeof value}`);
}

const sha256Hex = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

// ---------------------------------------------------------------- keys

const PUBLIC_KEY = /^[A-Za-z0-9_-]{43}$/; // 32 raw bytes, base64url
const SIG = /^[A-Za-z0-9_-]{86}$/; // 64 raw bytes, base64url
const HEX64 = /^[0-9a-f]{64}$/;

/** A key's id: sha256 of its raw 32-byte public key, hex. */
export function keyIdOf(publicKey: string): string {
  return sha256Hex(Buffer.from(publicKey, 'base64url'));
}

const rawPublicKey = (key: KeyObject) => key.export({ format: 'jwk' }).x as string;

export function generateKeyPair(): KeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pub = rawPublicKey(publicKey);
  return { privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(), publicKey: pub, keyId: keyIdOf(pub) };
}

function privateKey(pem: string): KeyObject {
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('bundle keys must be ed25519');
  return key;
}

/** The base64url public key of a PEM private key. */
export function publicKeyOf(privateKeyPem: string): string {
  return rawPublicKey(createPublicKey(privateKey(privateKeyPem)));
}

function importPublicKey(publicKey: string): KeyObject | null {
  if (!PUBLIC_KEY.test(publicKey)) return null;
  try {
    return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: publicKey }, format: 'jwk' });
  } catch {
    return null;
  }
}

function signValue(value: unknown, privateKeyPem: string): Signature {
  const key = privateKey(privateKeyPem);
  return { keyId: keyIdOf(rawPublicKey(createPublicKey(key))), sig: sign(null, Buffer.from(canonicalJson(value)), key).toString('base64url') };
}

function verifyValue(value: unknown, signature: Signature, publicKey: string): boolean {
  const key = importPublicKey(publicKey);
  if (!key || signature.keyId !== keyIdOf(publicKey)) return false;
  try {
    return verify(null, Buffer.from(canonicalJson(value)), key, Buffer.from(signature.sig, 'base64url'));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- manifest

/** Bundle paths: relative, "/"-separated, no "." or ".." segments, a conservative character set. */
function assertSafePath(p: string): void {
  const ok = p.split('/').every((seg) => /^[A-Za-z0-9._-]+$/.test(seg) && seg !== '.' && seg !== '..');
  if (!ok) throw new Error(`unsafe bundle path: ${JSON.stringify(p)}`);
}

/** The manifest of a set of files, sorted by path. */
export function manifestOf(files: ReadonlyMap<string, Uint8Array>): Manifest {
  const entries = [...files].map(([p, bytes]): FileEntry => {
    assertSafePath(p);
    return { path: p, size: bytes.byteLength, sha256: sha256Hex(bytes) };
  });
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files: entries };
}

export const hashManifest = (manifest: Manifest): string => sha256Hex(canonicalJson(manifest));

/** Every file under dir, keyed by its "/"-separated relative path. Symlinks and other special files are refused. */
export async function readTree(dir: string, opts: { skipDotfiles?: boolean } = {}): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  async function walk(rel: string): Promise<void> {
    for (const entry of await readdir(path.join(dir, rel), { withFileTypes: true })) {
      if (opts.skipDotfiles && entry.name.startsWith('.')) continue;
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(r);
      else if (entry.isFile()) files.set(r, await readFile(path.join(dir, r)));
      else throw new Error(`${r}: only plain files and directories can be bundled`);
    }
  }
  await walk('');
  return files;
}

/**
 * List every file in the catalog with its sha256. Dotfiles (.DS_Store, editor
 * files) are skipped so a bundle doesn't depend on whose machine built it.
 */
export async function buildBundle(catalogDir: string): Promise<{ files: Map<string, Uint8Array>; manifest: Manifest; bundleHash: string }> {
  const files = await readTree(catalogDir, { skipDotfiles: true });
  if (files.size === 0) throw new Error(`${catalogDir}: no files to bundle`);
  const manifest = manifestOf(files);
  return { files, manifest, bundleHash: hashManifest(manifest) };
}

// ---------------------------------------------------------------- meta and delegation

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const isIso = (v: unknown): v is string => typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(v));
const VERSION = /^\d{1,9}(?:\.\d{1,9}){0,3}$/;
const CHANNEL = /^[a-z][a-z0-9-]{0,31}$/;

function hasExactKeys(v: unknown, keys: readonly string[]): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const own = Object.keys(v);
  return own.length === keys.length && keys.every((k) => own.includes(k));
}

/** Compare dotted numeric versions (semver cores or CalVer): -1, 0 or 1. */
export function compareVersions(a: string, b: string): number {
  if (!VERSION.test(a) || !VERSION.test(b)) throw new RangeError(`versions are dotted numbers: ${JSON.stringify(a)}, ${JSON.stringify(b)}`);
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

function metaProblem(m: unknown): string | null {
  if (!hasExactKeys(m, ['version', 'expires', 'channel', 'minClientVersion', 'bundleHash'])) return 'meta must have exactly version, expires, channel, minClientVersion and bundleHash';
  if (!Number.isSafeInteger(m.version) || (m.version as number) < 1) return 'meta.version must be a positive integer';
  if (!isIso(m.expires)) return 'meta.expires must be an ISO 8601 UTC time';
  if (typeof m.channel !== 'string' || !CHANNEL.test(m.channel)) return 'meta.channel must match [a-z][a-z0-9-]{0,31}';
  if (typeof m.minClientVersion !== 'string' || !VERSION.test(m.minClientVersion)) return 'meta.minClientVersion must be a dotted numeric version';
  if (typeof m.bundleHash !== 'string' || !HEX64.test(m.bundleHash)) return 'meta.bundleHash must be a sha256 hex digest';
  return null;
}

function delegationProblem(d: Record<string, unknown>): string | null {
  if (!hasExactKeys(d, ['role', 'keyId', 'publicKey', 'notBefore', 'expires'])) return 'delegation must have exactly role, keyId, publicKey, notBefore and expires';
  if (typeof d.publicKey !== 'string' || !importPublicKey(d.publicKey)) return 'delegation.publicKey must be a base64url ed25519 public key';
  if (d.keyId !== keyIdOf(d.publicKey)) return 'delegation.keyId does not match its public key';
  if (!isIso(d.notBefore) || !isIso(d.expires)) return 'delegation.notBefore and expires must be ISO 8601 UTC times';
  const from = new Date(d.notBefore);
  const to = Date.parse(d.expires);
  if (to <= from.getTime()) return 'delegation.expires must be after notBefore';
  if (to > addMonths(from, MAX_CI_KEY_MONTHS).getTime()) return `a CI key may be delegated for at most ${MAX_CI_KEY_MONTHS} months`;
  return null;
}

const isSignature = (v: unknown): v is Signature =>
  hasExactKeys(v, ['keyId', 'sig']) && typeof v.keyId === 'string' && HEX64.test(v.keyId) && typeof v.sig === 'string' && SIG.test(v.sig);

export function createMeta(input: { bundleHash: string; version: number; channel: string; minClientVersion: string; now: Date; ttlDays?: number }): Meta {
  const ttlDays = input.ttlDays ?? MAX_META_DAYS;
  if (!(ttlDays > 0 && ttlDays <= MAX_META_DAYS)) throw new RangeError(`ttlDays must be more than 0 and at most ${MAX_META_DAYS}`);
  const meta: Meta = {
    version: input.version,
    expires: new Date(input.now.getTime() + ttlDays * DAY_MS).toISOString(),
    channel: input.channel,
    minClientVersion: input.minClientVersion,
    bundleHash: input.bundleHash,
  };
  const problem = metaProblem(meta);
  if (problem) throw new Error(problem);
  return meta;
}

/** Delegate the content-bundle role to a CI key for `months` (≤12) from notBefore. The roots sign it offline. */
export function createDelegation(input: { publicKey: string; notBefore: Date; months?: number }): Delegation {
  const months = input.months ?? MAX_CI_KEY_MONTHS;
  if (!Number.isInteger(months) || months < 1 || months > MAX_CI_KEY_MONTHS) throw new RangeError(`months must be an integer from 1 to ${MAX_CI_KEY_MONTHS}`);
  const delegation: Delegation = {
    role: ROLE,
    keyId: keyIdOf(input.publicKey),
    publicKey: input.publicKey,
    notBefore: input.notBefore.toISOString(),
    expires: addMonths(input.notBefore, months).toISOString(),
  };
  const problem = delegationProblem(delegation);
  if (problem) throw new Error(problem);
  return delegation;
}

export const signDelegation = (delegation: Delegation, rootPrivateKeyPem: string): Signature => signValue(delegation, rootPrivateKeyPem);
export const signMeta = (meta: Meta, ciPrivateKeyPem: string): Signature => signValue(meta, ciPrivateKeyPem);

// ---------------------------------------------------------------- verify

const fail = (code: VerifyCode, reason: string): Failure => ({ ok: false, code, reason });

/**
 * Check a bundle before anything in it is used. Never throws on bad bundle
 * data (only on invalid options); on failure keep the last good bundle.
 * Use the files from this map, not a second read of the disk.
 */
export function verifyBundle(
  files: ReadonlyMap<string, Uint8Array>,
  meta: unknown,
  signatures: unknown,
  trustedRoots: readonly string[],
  opts: VerifyOptions,
): VerifyResult {
  const now = opts.now.getTime();
  if (Number.isNaN(now)) throw new RangeError('opts.now is not a valid date');
  if (!VERSION.test(opts.clientVersion)) throw new RangeError('opts.clientVersion must be a dotted numeric version');

  // 1. Shapes, before any signature work.
  if (!hasExactKeys(signatures, ['delegation', 'rootSignatures', 'meta'])) return fail('malformed', 'signatures must have exactly delegation, rootSignatures and meta');
  const { delegation, rootSignatures, meta: metaSig } = signatures;
  if (!Array.isArray(rootSignatures) || rootSignatures.length > MAX_ROOT_SIGNATURES || !rootSignatures.every(isSignature) || !isSignature(metaSig)) {
    return fail('malformed', 'signatures are { keyId: sha256 hex, sig: base64url ed25519 }');
  }
  if (typeof delegation !== 'object' || delegation === null || Array.isArray(delegation)) return fail('malformed', 'delegation must be an object');
  const d = delegation as Record<string, unknown>;
  if (d.role !== ROLE) return fail('wrong_role', `the delegation is for ${JSON.stringify(d.role)}, not ${ROLE}`);
  const problem = delegationProblem(d);
  if (problem) return fail('malformed', problem);
  const del = d as Delegation;

  // 2. The CI key: delegated by at least ROOT_THRESHOLD distinct trusted roots, and in date.
  const roots = new Map(trustedRoots.map((k) => [keyIdOf(k), k]));
  const signers = new Set<string>();
  for (const s of rootSignatures) {
    const root = roots.get(s.keyId);
    if (root && verifyValue(del, s, root)) signers.add(s.keyId);
  }
  if (signers.size < ROOT_THRESHOLD) return fail('untrusted_delegation', `the CI key is signed by ${signers.size} trusted root(s); ${ROOT_THRESHOLD} are required`);
  if (now < Date.parse(del.notBefore)) return fail('ci_key_not_yet_valid', `the CI key is valid from ${del.notBefore}`);
  if (now >= Date.parse(del.expires)) return fail('ci_key_expired', `the CI key expired at ${del.expires}`);

  // 3. meta.json: signed by that CI key, then parsed.
  if (metaSig.keyId !== del.keyId) return fail('unknown_key', `meta.json is signed by key ${metaSig.keyId.slice(0, 12)}…, which is not the delegated CI key`);
  if (!verifyValue(meta, metaSig, del.publicKey)) return fail('bad_signature', 'the meta.json signature does not verify');
  const metaProblemText = metaProblem(meta);
  if (metaProblemText) return fail('malformed', metaProblemText);
  const m = meta as Meta;

  // 4. Freshness, rollback, channel and client.
  const expires = Date.parse(m.expires);
  if (now >= expires) return fail('expired', `meta.json expired at ${m.expires}`);
  if (expires > now + MAX_META_DAYS * DAY_MS + CLOCK_SKEW_MS) return fail('expires_too_far', `meta.json expires more than ${MAX_META_DAYS} days ahead (${m.expires})`);
  if (opts.lastSeenVersion !== undefined && m.version < opts.lastSeenVersion) return fail('rollback', `version ${m.version} is older than ${opts.lastSeenVersion}, the last one accepted`);
  if (m.channel !== opts.channel) return fail('wrong_channel', `the bundle is for channel ${m.channel}, not ${opts.channel}`);
  if (compareVersions(opts.clientVersion, m.minClientVersion) < 0) return fail('client_too_old', `the bundle needs client ${m.minClientVersion} or later; this is ${opts.clientVersion}`);

  // 5. Content.
  let manifest: Manifest;
  try {
    manifest = manifestOf(files);
  } catch (err) {
    return fail('tampered', (err as Error).message);
  }
  if (hashManifest(manifest) !== m.bundleHash) return fail('tampered', 'the files do not match meta.bundleHash');
  return { ok: true, meta: m, manifest };
}

/** Read a bundle directory (files/, meta.json, signatures.json) and verify it. */
export async function loadBundle(dir: string, trustedRoots: readonly string[], opts: VerifyOptions): Promise<LoadResult> {
  let files: Map<string, Uint8Array>;
  let meta: unknown;
  let signatures: unknown;
  try {
    files = await readTree(path.join(dir, 'files'));
    meta = JSON.parse(await readFile(path.join(dir, 'meta.json'), 'utf8'));
    signatures = JSON.parse(await readFile(path.join(dir, 'signatures.json'), 'utf8'));
  } catch (err) {
    return fail('malformed', `cannot read the bundle: ${(err as Error).message}`);
  }
  const result = verifyBundle(files, meta, signatures, trustedRoots, opts);
  return result.ok ? { ...result, files } : result;
}
