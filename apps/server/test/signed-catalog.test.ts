import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBundle, createDelegation, createMeta, generateKeyPair, signDelegation, signMeta } from '@promptai/bundle';
import { cardsFrom, loadCatalog, readSignedCatalog } from '../src/catalog.ts';

/** The real catalog, built and signed with fresh keys the way CI does it (two roots delegate a CI key). */
const CATALOG = path.resolve(import.meta.dirname, '../../../catalog');

async function signedBundle(now: Date) {
  const { files, bundleHash } = await buildBundle(CATALOG);
  const [rootA, rootB, ci] = [generateKeyPair(), generateKeyPair(), generateKeyPair()];
  const delegation = createDelegation({ publicKey: ci.publicKey, notBefore: now });
  const meta = createMeta({ bundleHash, version: 7, channel: 'stable', minClientVersion: '0.0.0', now });
  const signatures = { delegation, rootSignatures: [signDelegation(delegation, rootA.privateKeyPem), signDelegation(delegation, rootB.privateKeyPem)], meta: signMeta(meta, ci.privateKeyPem) };
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bundle-'));
  for (const [rel, bytes] of files) {
    await mkdir(path.dirname(path.join(dir, 'files', rel)), { recursive: true });
    await writeFile(path.join(dir, 'files', rel), bytes);
  }
  await writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta));
  await writeFile(path.join(dir, 'signatures.json'), JSON.stringify(signatures));
  return { dir, roots: [rootA.publicKey, rootB.publicKey] };
}

describe('the signed catalog', () => {
  const now = new Date();
  const opts = { now, channel: 'stable', clientVersion: '0.0.0' };

  it('loads the same cards from a verified bundle as from catalog/', async () => {
    const { dir, roots } = await signedBundle(now);
    const signed = await readSignedCatalog(dir, roots, opts);
    expect(signed.version).toBe(7);
    expect(cardsFrom(signed.files).map((c) => c.id)).toEqual((await loadCatalog(CATALOG)).map((c) => c.id));
    expect(signed.files.has('routes.yaml')).toBe(true);
  });

  it('refuses a bundle with a tampered card, or one chained to other roots', async () => {
    const { dir, roots } = await signedBundle(now);
    await writeFile(path.join(dir, 'files', 'tools', 'claude', 'card.yaml'), 'id: claude\n# tampered\n');
    await expect(readSignedCatalog(dir, roots, opts)).rejects.toThrow(/failed verification/);
    const fresh = await signedBundle(now);
    await expect(readSignedCatalog(fresh.dir, [generateKeyPair().publicKey, generateKeyPair().publicKey], opts)).rejects.toThrow(/failed verification/);
  });
});
