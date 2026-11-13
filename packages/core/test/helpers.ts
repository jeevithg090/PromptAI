/** Test-only file access: core itself reads nothing from disk. */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCard, type Card } from '../src/compose/card.ts';
import type { RenderResult } from '../src/compose/render.ts';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export const CATALOG_DIR = here('../../../catalog/');
export const TOOLS_DIR = `${CATALOG_DIR}tools/`;
export const BRIEFS_DIR = here('./fixtures/briefs/');
export const INVALID_DIR = here('./fixtures/invalid/');
export const GOLDEN_DIR = here('./fixtures/golden/');

export function toolIds(): string[] {
  return readdirSync(TOOLS_DIR).sort();
}
export function cardYaml(id: string): string {
  return readFileSync(id === 'generic' ? `${CATALOG_DIR}families/generic.yaml` : `${TOOLS_DIR}${id}/card.yaml`, 'utf8');
}
const cache = new Map<string, Card>();
export function loadCard(id: string): Card {
  let c = cache.get(id);
  if (!c) { c = parseCard(cardYaml(id)); cache.set(id, c); }
  return c;
}
/** Every tool card plus the generic fallback. */
export function allCards(): Card[] {
  return [...toolIds(), 'generic'].map(loadCard);
}
export function fixtureIds(): string[] {
  return readdirSync(BRIEFS_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
}
export function loadFixture(id: string): unknown {
  return JSON.parse(readFileSync(`${BRIEFS_DIR}${id}.json`, 'utf8'));
}

/** Stable, diff-friendly golden text (unchanged from the spike). */
export function goldenText(fixture: string, r: RenderResult): string {
  const parts = [`# fixture: ${fixture}  target: ${r.target}  card: ${r.card_version}  ok: ${r.ok}`];
  for (const [k, v] of Object.entries(r.fields)) {
    parts.push(`\n## field: ${k}\n${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}`);
  }
  parts.push('\n## issues');
  for (const i of r.issues) parts.push(`${i.level} ${i.code} ${i.path ?? '-'} | ${i.message}`);
  const c = r.coverage;
  parts.push(`\n## coverage\nrendered ${c.rendered} of ${c.total - c.ignored} applicable (${c.ignored} declared not applicable), rate ${c.rate}`);
  parts.push(`dropped: ${c.dropped.join(', ') || 'none'}`);
  return parts.join('\n') + '\n';
}
