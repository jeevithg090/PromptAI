import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CLOCK_SKEW_MS,
  buildBundle,
  canonicalJson,
  compareVersions,
  createDelegation,
  createMeta,
  generateKeyPair,
  hashManifest,
  keyIdOf,
  loadBundle,
  manifestOf,
  signDelegation,
  signMeta,
  verifyBundle,
  type Delegation,
  type Meta,
  type VerifyOptions,
} from '../src/index.ts';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const REPO = path.resolve(import.meta.dirname, '../../..');
const CLI = path.join(REPO, 'packages/bundle/src/cli.ts');
const bytes = (s: string) => new TextEncoder().encode(s);

/** A valid signed bundle; each test breaks one thing. */
function setup() {
  const root1 = generateKeyPair();
  const root2 = generateKeyPair();
  const ci = generateKeyPair();
  const files = new Map([
    ['tools/claude/card.yaml', bytes('id: claude\n')],
    ['families/generic.yaml', bytes('id: generic\n')],
  ]);
  const meta = createMeta({ bundleHash: hashManifest(manifestOf(files)), version: 7, channel: 'stable', minClientVersion: '1.2.0', now: NOW });
  const delegation = createDelegation({ publicKey: ci.publicKey, notBefore: new Date(NOW.getTime() - DAY) });
  const rootSignatures = [signDelegation(delegation, root1.privateKeyPem), signDelegation(delegation, root2.privateKeyPem)];
  const signatures = { delegation, rootSignatures, meta: signMeta(meta, ci.privateKeyPem) };
  const roots = [root1.publicKey, root2.publicKey];
  const opts: VerifyOptions = { now: NOW, channel: 'stable', clientVersion: '1.2.0', lastSeenVersion: 6 };
  return { root1, root2, ci, files, meta, delegation, rootSignatures, signatures, roots, opts };
}

/** Sign a delegation with both roots. */
const delegated = (b: ReturnType<typeof setup>, delegation: Delegation) => [
  signDelegation(delegation, b.root1.privateKeyPem),
  signDelegation(delegation, b.root2.privateKeyPem),
];

describe('verifyBundle', () => {
  it('accepts a correctly signed bundle', () => {
    const b = setup();
    const r = verifyBundle(b.files, b.meta, b.signatures, b.roots, b.opts);
    expect(r).toMatchObject({ ok: true, meta: b.meta });
    expect(r.ok && r.manifest.files.map((f) => f.path)).toEqual(['families/generic.yaml', 'tools/claude/card.yaml']);
  });

  it('verifies the parsed JSON, so key order and whitespace do not matter', () => {
    const b = setup();
    const reordered = JSON.parse(JSON.stringify({ bundleHash: b.meta.bundleHash, channel: b.meta.channel, expires: b.meta.expires, minClientVersion: b.meta.minClientVersion, version: b.meta.version }, null, 2));
    expect(verifyBundle(b.files, reordered, JSON.parse(JSON.stringify(b.signatures)), b.roots, b.opts).ok).toBe(true);
  });

  describe('tampering', () => {
    it.each([
      ['a changed file', (f: Map<string, Uint8Array>) => f.set('tools/claude/card.yaml', bytes('id: claude\nevil: true\n'))],
      ['an added file', (f: Map<string, Uint8Array>) => f.set('tools/evil/card.yaml', bytes('id: evil\n'))],
      ['a removed file', (f: Map<string, Uint8Array>) => f.delete('families/generic.yaml')],
      ['a renamed file', (f: Map<string, Uint8Array>) => {
        f.set('families/generic2.yaml', f.get('families/generic.yaml')!);
        f.delete('families/generic.yaml');
      }],
      ['a path that escapes the bundle', (f: Map<string, Uint8Array>) => f.set('../outside.yaml', bytes('x'))],
    ])('rejects %s', (_name, change) => {
      const b = setup();
      change(b.files);
      expect(verifyBundle(b.files, b.meta, b.signatures, b.roots, b.opts)).toMatchObject({ ok: false, code: 'tampered' });
    });

    it('rejects mix and match: a valid meta from another bundle', () => {
      const b = setup();
      const other = new Map([['tools/claude/card.yaml', bytes('id: claude\nold: true\n')]]);
      const otherMeta = createMeta({ ...b.meta, bundleHash: hashManifest(manifestOf(other)), now: NOW });
      const sigs = { ...b.signatures, meta: signMeta(otherMeta, b.ci.privateKeyPem) };
      expect(verifyBundle(b.files, otherMeta, sigs, b.roots, b.opts)).toMatchObject({ ok: false, code: 'tampered' });
    });

    it.each<[string, (m: Meta) => Meta]>([
      ['a bumped version', (m) => ({ ...m, version: m.version + 100 })],
      ['an extended expiry', (m) => ({ ...m, expires: new Date(Date.parse(m.expires) + DAY).toISOString() })],
      ['another channel', (m) => ({ ...m, channel: 'beta' })],
      ['a lowered minClientVersion', (m) => ({ ...m, minClientVersion: '0.0.1' })],
      ['a swapped bundleHash', (m) => ({ ...m, bundleHash: createHash('sha256').update('x').digest('hex') })],
    ])('rejects meta.json edited after signing: %s', (_name, edit) => {
      const b = setup();
      expect(verifyBundle(b.files, edit(b.meta), b.signatures, b.roots, b.opts)).toMatchObject({ ok: false, code: 'bad_signature' });
    });

    it('rejects a signed meta.json with an unknown field', () => {
      const b = setup();
      const meta = { ...b.meta, extra: 1 } as unknown as Meta;
      const sigs = { ...b.signatures, meta: signMeta(meta, b.ci.privateKeyPem) };
      expect(verifyBundle(b.files, meta, sigs, b.roots, b.opts)).toMatchObject({ ok: false, code: 'malformed' });
    });
  });

  describe('freshness (freeze attacks)', () => {
    it('rejects an expired meta.json: a replayed old bundle stops working once it expires', () => {
      const b = setup();
      const later = { ...b.opts, now: new Date(Date.parse(b.meta.expires)) };
      expect(verifyBundle(b.files, b.meta, b.signatures, b.roots, later)).toMatchObject({ ok: false, code: 'expired' });
      const justBefore = { ...b.opts, now: new Date(Date.parse(b.meta.expires) - 1) };
      expect(verifyBundle(b.files, b.meta, b.signatures, b.roots, justBefore).ok).toBe(true);
    });

    it('rejects a meta.json that expires more than 30 days ahead, so a stolen or buggy signature cannot freeze clients for long', () => {
      const b = setup();
      const far = { ...b.meta, expires: new Date(NOW.getTime() + 31 * DAY + CLOCK_SKEW_MS).toISOString() };
      const sigs = { ...b.signatures, meta: signMeta(far, b.ci.privateKeyPem) };
      expect(verifyBundle(b.files, far, sigs, b.roots, b.opts)).toMatchObject({ ok: false, code: 'expires_too_far' });
      // A client whose clock runs up to a day slow still accepts a fresh 30-day bundle.
      const slowClock = { ...b.opts, now: new Date(NOW.getTime() - CLOCK_SKEW_MS + 1000) };
      expect(verifyBundle(b.files, b.meta, b.signatures, b.roots, slowClock).ok).toBe(true);
    });

    it('createMeta refuses an expiry beyond 30 days', () => {
      const b = setup();
      expect(() => createMeta({ ...b.meta, now: NOW, ttlDays: 31 })).toThrow(/ttlDays/);
      expect(() => createMeta({ ...b.meta, now: NOW, ttlDays: 0 })).toThrow(/ttlDays/);
    });
  });

  describe('rollback, channel and client version', () => {
    it('rejects a version below the last one seen, and accepts the same one again', () => {
      const b = setup();
      expect(verifyBundle(b.files, b.meta, b.signatures, b.roots, { ...b.opts, lastSeenVersion: 8 })).toMatchObject({ ok: false, code: 'rollback' });
      expect(verifyBundle(b.files, b.meta, b.signatures, b.roots, { ...b.opts, lastSeenVersion: 7 }).ok).toBe(true);
      expect(verifyBundle(b.files, b.meta, b.signatures, b.roots, { ...b.opts, lastSeenVersion: undefined }).ok).toBe(true);
    });

    it('rejects a bundle for another channel', () => {
      const b = setup();
      expect(verifyBundle(b.files, b.meta, b.signatures, b.roots, { ...b.opts, channel: 'beta' })).toMatchObject({ ok: false, code: 'wrong_channel' });
    });

    it('rejects a client older than minClientVersion, comparing numerically', () => {
      const b = setup();
      expect(verifyBundle(b.files, b.meta, b.signatures, b.roots, { ...b.opts, clientVersion: '1.1.9' })).toMatchObject({ ok: false, code: 'client_too_old' });
      expect(verifyBundle(b.files, b.meta, b.signatures, b.roots, { ...b.opts, clientVersion: '1.10.0' }).ok).toBe(true);
      expect(() => verifyBundle(b.files, b.meta, b.signatures, b.roots, { ...b.opts, clientVersion: 'v1' })).toThrow(RangeError);
    });
  });

  describe('keys', () => {
    it('rejects meta.json signed by a key that was never delegated', () => {
      const b = setup();
      const stranger = generateKeyPair();
      const sigs = { ...b.signatures, meta: signMeta(b.meta, stranger.privateKeyPem) };
      expect(verifyBundle(b.files, b.meta, sigs, b.roots, b.opts)).toMatchObject({ ok: false, code: 'unknown_key' });
    });

    it('rejects meta.json signed directly by a root key (roots only delegate)', () => {
      const b = setup();
      const sigs = { ...b.signatures, meta: signMeta(b.meta, b.root1.privateKeyPem) };
      expect(verifyBundle(b.files, b.meta, sigs, b.roots, b.opts)).toMatchObject({ ok: false, code: 'unknown_key' });
    });

    it('rejects a signature by another key that claims the CI key id', () => {
      const b = setup();
      const forged = { keyId: b.ci.keyId, sig: signMeta(b.meta, generateKeyPair().privateKeyPem).sig };
      expect(verifyBundle(b.files, b.meta, { ...b.signatures, meta: forged }, b.roots, b.opts)).toMatchObject({ ok: false, code: 'bad_signature' });
    });

    it('rejects a delegation swapped for an attacker key', () => {
      const b = setup();
      const attacker = generateKeyPair();
      const delegation = { ...b.delegation, publicKey: attacker.publicKey, keyId: attacker.keyId };
      const sigs = { delegation, rootSignatures: b.rootSignatures, meta: signMeta(b.meta, attacker.privateKeyPem) };
      expect(verifyBundle(b.files, b.meta, sigs, b.roots, b.opts)).toMatchObject({ ok: false, code: 'untrusted_delegation' });
    });

    it('needs two distinct trusted roots on the delegation', () => {
      const b = setup();
      const [one, two] = b.rootSignatures;
      const untrusted = signDelegation(b.delegation, generateKeyPair().privateKeyPem);
      for (const rootSignatures of [[one!], [one!, one!], [one!, untrusted], []]) {
        expect(verifyBundle(b.files, b.meta, { ...b.signatures, rootSignatures }, b.roots, b.opts)).toMatchObject({ ok: false, code: 'untrusted_delegation' });
      }
      // The same root listed twice in trustedRoots still counts once.
      expect(verifyBundle(b.files, b.meta, b.signatures, [b.root1.publicKey, b.root1.publicKey], b.opts)).toMatchObject({ ok: false, code: 'untrusted_delegation' });
      expect(verifyBundle(b.files, b.meta, { ...b.signatures, rootSignatures: [two!, untrusted, one!] }, b.roots, b.opts).ok).toBe(true);
    });

    it('rejects an expired CI key, and one not valid yet', () => {
      const b = setup();
      const old = createDelegation({ publicKey: b.ci.publicKey, notBefore: new Date(NOW.getTime() - 400 * DAY) });
      const sigs = { delegation: old, rootSignatures: delegated(b, old), meta: b.signatures.meta };
      expect(verifyBundle(b.files, b.meta, sigs, b.roots, b.opts)).toMatchObject({ ok: false, code: 'ci_key_expired' });

      const future = createDelegation({ publicKey: b.ci.publicKey, notBefore: new Date(NOW.getTime() + DAY) });
      const sigs2 = { delegation: future, rootSignatures: delegated(b, future), meta: b.signatures.meta };
      expect(verifyBundle(b.files, b.meta, sigs2, b.roots, b.opts)).toMatchObject({ ok: false, code: 'ci_key_not_yet_valid' });
    });

    it('rejects a CI key delegated for more than 12 months, even when both roots signed it', () => {
      const b = setup();
      const long = { ...b.delegation, expires: new Date(Date.parse(b.delegation.notBefore) + 370 * DAY).toISOString() };
      const sigs = { delegation: long, rootSignatures: delegated(b, long), meta: b.signatures.meta };
      expect(verifyBundle(b.files, b.meta, sigs, b.roots, b.opts)).toMatchObject({ ok: false, code: 'malformed', reason: expect.stringMatching(/12 months/) });
      expect(() => createDelegation({ publicKey: b.ci.publicKey, notBefore: NOW, months: 13 })).toThrow(/months/);
    });

    it('rejects a delegation for another role (the updater and code signing have their own keys)', () => {
      const b = setup();
      const updater = { ...b.delegation, role: 'updater' } as unknown as Delegation;
      const sigs = { delegation: updater, rootSignatures: delegated(b, updater), meta: b.signatures.meta };
      expect(verifyBundle(b.files, b.meta, sigs, b.roots, b.opts)).toMatchObject({ ok: false, code: 'wrong_role' });
    });
  });

  it('never throws on junk bundle data', () => {
    const b = setup();
    const junk: unknown[] = [null, 'x', 42, [], {}, { delegation: null, rootSignatures: [], meta: {} }, { ...b.signatures, rootSignatures: 'x' }];
    for (const sigs of junk) expect(verifyBundle(b.files, b.meta, sigs, b.roots, b.opts)).toMatchObject({ ok: false, code: 'malformed' });
    for (const meta of [null, 'x', 1, [], { ...b.meta, version: Number.NaN }]) {
      expect(verifyBundle(b.files, meta, b.signatures, b.roots, b.opts).ok).toBe(false);
    }
    const tooMany = { ...b.signatures, rootSignatures: Array(9).fill(b.rootSignatures[0]) };
    expect(verifyBundle(b.files, b.meta, tooMany, b.roots, b.opts)).toMatchObject({ ok: false, code: 'malformed' });
  });
});

describe('encoding', () => {
  it('canonicalJson sorts keys and has no whitespace', () => {
    expect(canonicalJson({ b: [1, { d: true, c: null }], a: 'x', u: undefined })).toBe('{"a":"x","b":[1,{"c":null,"d":true}]}');
    expect(() => canonicalJson({ n: Number.NaN })).toThrow(TypeError);
  });

  it('compareVersions compares dotted numbers', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('2026.11.13', '2026.11.13.0')).toBe(0);
    expect(compareVersions('0.9', '1')).toBe(-1);
  });

  it('keyIdOf is the sha256 of the raw public key', () => {
    const k = generateKeyPair();
    expect(k.keyId).toBe(keyIdOf(k.publicKey));
    expect(k.keyId).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('buildBundle', () => {
  const temps: string[] = [];
  afterEach(async () => {
    for (const t of temps.splice(0)) await rm(t, { recursive: true, force: true });
  });

  it('lists every catalog file with its sha256, deterministically', async () => {
    const catalog = path.join(REPO, 'catalog');
    const a = await buildBundle(catalog);
    const b = await buildBundle(catalog);
    expect(a.bundleHash).toBe(b.bundleHash);
    const onDisk = (await readdir(catalog, { recursive: true, withFileTypes: true }))
      .filter((e) => e.isFile() && !e.name.startsWith('.'))
      .map((e) => path.relative(catalog, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
      .sort();
    expect(a.manifest.files.map((f) => f.path)).toEqual(onDisk);
    for (const f of a.manifest.files) {
      expect(f.sha256).toBe(createHash('sha256').update(await readFile(path.join(catalog, f.path))).digest('hex'));
    }
  });

  it('skips dotfiles and refuses symlinks', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bundle-'));
    temps.push(dir);
    await mkdir(path.join(dir, 'tools'));
    await writeFile(path.join(dir, 'tools', 'card.yaml'), 'id: x\n');
    await writeFile(path.join(dir, '.DS_Store'), 'junk');
    expect((await buildBundle(dir)).manifest.files.map((f) => f.path)).toEqual(['tools/card.yaml']);
    await symlink('/etc/hosts', path.join(dir, 'tools', 'hosts'));
    await expect(buildBundle(dir)).rejects.toThrow(/only plain files/);
  });
});

describe('cli: keys, build, sign', () => {
  it('produces a bundle that loadBundle accepts, and rejects once a file changes', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bundle-cli-'));
    try {
      const { PROMPTAI_BUNDLE_CI_KEY: _unused, ...env } = process.env;
      const run = (...args: string[]) => execFileSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', env });
      run('keys');
      expect(() => run('keys')).toThrow(/already exists/);
      run('build', '--catalog', path.join(REPO, 'catalog'), '--version', '42', '--channel', 'stable');
      expect(run('sign')).toMatch(/signed and verified/);

      const roots = JSON.parse(await readFile(path.join(dir, '.keys/trusted-roots.json'), 'utf8')) as string[];
      const opts = { now: new Date(), channel: 'stable', clientVersion: '0.0.0', lastSeenVersion: 41 };
      const ok = await loadBundle(path.join(dir, 'dist/bundle'), roots, opts);
      expect(ok).toMatchObject({ ok: true, meta: { version: 42, channel: 'stable' } });
      expect(ok.ok && ok.files.has('families/generic.yaml')).toBe(true);

      await writeFile(path.join(dir, 'dist/bundle/files/families/generic.yaml'), 'id: generic\nevil: true\n');
      expect(await loadBundle(path.join(dir, 'dist/bundle'), roots, opts)).toMatchObject({ ok: false, code: 'tampered' });
      expect(await loadBundle(path.join(dir, 'missing'), roots, opts)).toMatchObject({ ok: false, code: 'malformed' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('the offline ceremony: keygen, then each root signs the delegation separately', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bundle-ceremony-'));
    try {
      const run = (...args: string[]) => execFileSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8' });
      const pub = (out: string) => /Public key:\s+(\S+)/.exec(out)![1]!;
      const r1 = pub(run('keygen', '--out', 'root-1.pem'));
      const r2 = pub(run('keygen', '--out', 'root-2.pem'));
      const ci = pub(run('keygen', '--out', 'ci.pem'));
      expect(run('delegate', '--ci-public', ci, '--root', 'root-1.pem', '--out', 'delegation.json')).toMatch(/1 root signature/);
      expect(run('delegate', '--root', 'root-2.pem', '--out', 'delegation.json')).toMatch(/2 root signature/);
      await writeFile(path.join(dir, 'roots.json'), JSON.stringify([r1, r2]));
      run('build', '--catalog', path.join(REPO, 'catalog'));
      expect(run('sign', '--key', 'ci.pem', '--delegation', 'delegation.json', '--roots', 'roots.json')).toMatch(/signed and verified/);
      // Signing with a key the delegation doesn't name fails.
      expect(() => run('sign', '--key', 'root-1.pem', '--delegation', 'delegation.json', '--roots', 'roots.json')).toThrow(/not the one the delegation names/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
