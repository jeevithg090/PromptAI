import { readTree, loadBundle, type VerifyOptions } from '@promptai/bundle';
import { parseCard, parseLocalePack, type Card, type LocalePack } from '@promptai/core';

/** The catalog as text by path relative to its root ("tools/claude/card.yaml"). */
export type CatalogFiles = ReadonlyMap<string, string>;

const decode = (files: ReadonlyMap<string, Uint8Array>): CatalogFiles => new Map([...files].map(([p, bytes]) => [p, new TextDecoder().decode(bytes)]));

/** Every file under a catalog directory: the dev path. Production reads the signed bundle instead. */
export async function readCatalogDir(root: string): Promise<CatalogFiles> {
  return decode(await readTree(root, { skipDotfiles: true }));
}

/**
 * The catalog from a signed content bundle (blueprint §16, TUF-lite): refuses
 * a bundle that is tampered with, expired, for another channel, signed by an
 * undelegated key, or older than `lastSeenVersion`.
 */
export async function readSignedCatalog(dir: string, trustedRoots: readonly string[], opts: VerifyOptions): Promise<{ files: CatalogFiles; version: number }> {
  const res = await loadBundle(dir, trustedRoots, opts);
  if (!res.ok) throw new Error(`the catalog bundle in ${dir} failed verification (${res.code}): ${res.reason}`);
  return { files: decode(res.files), version: res.meta.version };
}

function parseAt<T>(file: string, parse: () => T): T {
  try {
    return parse();
  } catch (err) {
    throw new Error(`${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Tool Cards (tools/<id>/card.yaml) and family cards (families/*.yaml; their
 * *.evals.yaml are golden cases for the gates). Core reads no files, so the
 * server parses them once at startup; a malformed card fails startup, naming the file.
 */
export function cardsFrom(files: CatalogFiles): Card[] {
  const isCard = (p: string) => /^tools\/[^/]+\/card\.yaml$/.test(p) || (/^families\/[^/]+\.yaml$/.test(p) && !p.endsWith('.evals.yaml'));
  return [...files.keys()].filter(isCard).sort().map((p) => parseAt(p, () => parseCard(files.get(p)!)));
}

/** catalog/locales/<bcp47>/pack.yaml: cleanup rules and the voice-command grammar per locale. */
export function localesFrom(files: CatalogFiles): LocalePack[] {
  return [...files.keys()].filter((p) => /^locales\/[^/]+\/pack\.yaml$/.test(p)).sort().map((p) => parseAt(p, () => parseLocalePack(files.get(p)!)));
}

/** The cards in a catalog directory (tests and dev). */
export async function loadCatalog(root: string): Promise<Card[]> {
  return cardsFrom(await readCatalogDir(root));
}

/** The locale packs in a catalog directory (tests and dev). */
export async function loadLocales(root: string): Promise<LocalePack[]> {
  return localesFrom(await readCatalogDir(root));
}
