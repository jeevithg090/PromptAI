/**
 * The content bundle's commands (docs/gates.md "Signed content bundle"). Run
 * from the repo root:
 *
 *   pnpm bundle:keys     dev keys in .keys/ (gitignored): two roots, a CI key and its delegation
 *   pnpm bundle:build    catalog/ -> dist/bundle/{files/, files.json, meta.json}
 *   pnpm bundle:sign     sign dist/bundle/meta.json with the CI key, then verify the result
 *
 * For the offline root ceremony: `keygen --out <file.pem>` and
 * `delegate --ci-public <key> --root <root.pem> --out <delegation.json>`.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  buildBundle,
  canonicalJson,
  createDelegation,
  createMeta,
  generateKeyPair,
  loadBundle,
  publicKeyOf,
  signDelegation,
  signMeta,
  type Delegation,
  type Meta,
  type Signature,
} from './index.ts';

type DelegationFile = { delegation: Delegation; rootSignatures: Signature[] };

const USAGE = `usage: node packages/bundle/src/cli.ts <command> [options]
  keys      [--dir .keys]
  keygen    --out <key.pem>
  delegate  --root <root.pem> --out <delegation.json> [--ci-public <key>] [--months 12] [--not-before <ISO time>]
  build     [--catalog catalog] [--out dist/bundle] [--version <n>] [--channel dev] [--min-client 0.0.0] [--ttl-days 30]
  sign      [--out dist/bundle] [--key .keys/ci.pem] [--delegation .keys/delegation.json] [--roots .keys/trusted-roots.json]
            (without --key, the PEM in $PROMPTAI_BUNDLE_CI_KEY is used when set)`;

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
const writeSecret = (file: string, pem: string) => writeFile(file, pem, { mode: 0o600, flag: 'wx' });

async function keys(dir: string) {
  if (existsSync(path.join(dir, 'ci.pem'))) throw new Error(`${dir}/ci.pem already exists; delete ${dir}/ to make new dev keys`);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const [root1, root2, ci] = [generateKeyPair(), generateKeyPair(), generateKeyPair()];
  const delegation = createDelegation({ publicKey: ci.publicKey, notBefore: new Date() });
  const file: DelegationFile = {
    delegation,
    rootSignatures: [signDelegation(delegation, root1.privateKeyPem), signDelegation(delegation, root2.privateKeyPem)],
  };
  await writeSecret(path.join(dir, 'root-1.pem'), root1.privateKeyPem);
  await writeSecret(path.join(dir, 'root-2.pem'), root2.privateKeyPem);
  await writeSecret(path.join(dir, 'ci.pem'), ci.privateKeyPem);
  await writeFile(path.join(dir, 'trusted-roots.json'), json([root1.publicKey, root2.publicKey]));
  await writeFile(path.join(dir, 'delegation.json'), json(file));
  console.log(`Dev keys written to ${dir}/: root-1.pem, root-2.pem, ci.pem (delegated until ${delegation.expires}), trusted-roots.json, delegation.json.`);
  console.log('Local development only. Real root keys are made and kept offline: see docs/gates.md.');
}

async function keygen(out: string | undefined) {
  if (!out) throw new Error('keygen needs --out <key.pem>');
  const key = generateKeyPair();
  await writeSecret(out, key.privateKeyPem);
  console.log(`Private key: ${out}\nPublic key:  ${key.publicKey}\nKey id:      ${key.keyId}`);
}

async function delegate(v: Record<string, string | undefined>) {
  if (!v.root || !v.out) throw new Error('delegate needs --root <root.pem> and --out <delegation.json>');
  let file: DelegationFile;
  if (existsSync(v.out)) {
    file = JSON.parse(await readFile(v.out, 'utf8')) as DelegationFile;
    if (v['ci-public'] && v['ci-public'] !== file.delegation.publicKey) throw new Error(`${v.out} delegates a different CI key`);
  } else {
    if (!v['ci-public']) throw new Error('a new delegation needs --ci-public <key>');
    const notBefore = v['not-before'] ? new Date(v['not-before']) : new Date();
    file = { delegation: createDelegation({ publicKey: v['ci-public'], notBefore, months: v.months ? Number(v.months) : undefined }), rootSignatures: [] };
  }
  const sig = signDelegation(file.delegation, await readFile(v.root, 'utf8'));
  file.rootSignatures = [...file.rootSignatures.filter((s) => s.keyId !== sig.keyId), sig];
  await writeFile(v.out, json(file));
  console.log(`${v.out}: signed by root ${sig.keyId.slice(0, 12)}… (${file.rootSignatures.length} root signature(s)); the CI key is delegated until ${file.delegation.expires}.`);
}

async function build(v: Record<string, string | undefined>) {
  const catalog = v.catalog ?? 'catalog';
  const out = v.out ?? 'dist/bundle';
  const built = await buildBundle(catalog);
  const meta = createMeta({
    bundleHash: built.bundleHash,
    // Unix seconds: increases with every build, so clients can refuse a rollback.
    version: v.version ? Number(v.version) : Math.floor(Date.now() / 1000),
    channel: v.channel ?? 'dev',
    minClientVersion: v['min-client'] ?? '0.0.0',
    now: new Date(),
    ttlDays: v['ttl-days'] ? Number(v['ttl-days']) : undefined,
  });
  // Only what build writes is replaced, so a mistaken --out cannot wipe a directory.
  await rm(path.join(out, 'files'), { recursive: true, force: true });
  await rm(path.join(out, 'signatures.json'), { force: true });
  for (const [p, bytes] of built.files) {
    const dest = path.join(out, 'files', p);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
  }
  await writeFile(path.join(out, 'files.json'), json(built.manifest));
  await writeFile(path.join(out, 'meta.json'), `${canonicalJson(meta)}\n`);
  console.log(`${out}: ${built.files.size} files, version ${meta.version}, channel ${meta.channel}, expires ${meta.expires}, bundleHash ${meta.bundleHash}. Unsigned: run bundle:sign.`);
}

async function signBundle(v: Record<string, string | undefined>) {
  const out = v.out ?? 'dist/bundle';
  const keyPem = v.key ? await readFile(v.key, 'utf8') : process.env.PROMPTAI_BUNDLE_CI_KEY || (await readFile('.keys/ci.pem', 'utf8'));
  const { delegation, rootSignatures } = JSON.parse(await readFile(v.delegation ?? '.keys/delegation.json', 'utf8')) as DelegationFile;
  if (publicKeyOf(keyPem) !== delegation.publicKey) throw new Error('this CI key is not the one the delegation names');
  const meta = JSON.parse(await readFile(path.join(out, 'meta.json'), 'utf8')) as Meta;
  await writeFile(path.join(out, 'signatures.json'), json({ delegation, rootSignatures, meta: signMeta(meta, keyPem) }));

  const roots = JSON.parse(await readFile(v.roots ?? '.keys/trusted-roots.json', 'utf8')) as string[];
  const result = await loadBundle(out, roots, { now: new Date(), channel: meta.channel, clientVersion: meta.minClientVersion });
  if (!result.ok) throw new Error(`signed, but the bundle does not verify (${result.code}): ${result.reason}`);
  console.log(`${out}: signed and verified (version ${meta.version}, ${result.manifest.files.length} files).`);
}

const [command, ...args] = process.argv.slice(2);
try {
  const { values } = parseArgs({
    args,
    strict: true,
    options: Object.fromEntries(
      ['dir', 'out', 'catalog', 'version', 'channel', 'min-client', 'ttl-days', 'key', 'delegation', 'roots', 'ci-public', 'root', 'months', 'not-before'].map((o) => [o, { type: 'string' as const }]),
    ),
  });
  const v = values as Record<string, string | undefined>;
  if (command === 'keys') await keys(v.dir ?? '.keys');
  else if (command === 'keygen') await keygen(v.out);
  else if (command === 'delegate') await delegate(v);
  else if (command === 'build') await build(v);
  else if (command === 'sign') await signBundle(v);
  else {
    console.error(USAGE);
    process.exitCode = 2;
  }
} catch (err) {
  console.error(`bundle ${command ?? ''}: ${(err as Error).message}`);
  process.exitCode = 1;
}
