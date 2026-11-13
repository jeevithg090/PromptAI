import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCard, type Card } from '@promptai/core';

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
  files.push(...families.filter((f) => f.endsWith('.yaml')).map((f) => path.join(root, 'families', f)));

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
