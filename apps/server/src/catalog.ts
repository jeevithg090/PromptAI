import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCard, parseLocalePack, type Card, type LocalePack } from '@promptai/core';

/**
 * Load every Tool Card in the catalog: tools/<id>/card.yaml plus the family
 * cards in families/*.yaml (the generic fallback lives there). Core reads no
 * files, so the server does it once at startup; a malformed card fails startup
 * rather than a request.
 */
export async function loadCatalog(root: string): Promise<Card[]> {
  const toolDirs = await readdir(path.join(root, 'tools'), { withFileTypes: true });
  const files = toolDirs.filter((d) => d.isDirectory()).map((d) => path.join(root, 'tools', d.name, 'card.yaml'));
  const families = await readdir(path.join(root, 'families'));
  // families/<id>.evals.yaml are golden cases for the gates, not cards.
  files.push(...families.filter((f) => f.endsWith('.yaml') && !f.endsWith('.evals.yaml')).map((f) => path.join(root, 'families', f)));

  const cards: Card[] = [];
  for (const file of files.sort()) {
    try {
      cards.push(parseCard(await readFile(file, 'utf8')));
    } catch (err) {
      throw new Error(`${path.relative(root, file)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return cards;
}

/** Load catalog/locales/<bcp47>/pack.yaml: cleanup rules and the voice-command grammar per locale. */
export async function loadLocales(root: string): Promise<LocalePack[]> {
  const dirs = await readdir(path.join(root, 'locales'), { withFileTypes: true });
  const packs: LocalePack[] = [];
  for (const d of dirs.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(root, 'locales', d.name, 'pack.yaml');
    try {
      packs.push(parseLocalePack(await readFile(file, 'utf8')));
    } catch (err) {
      throw new Error(`${path.relative(root, file)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return packs;
}
