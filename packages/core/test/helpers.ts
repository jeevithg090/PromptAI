/** Test-only file access: core itself reads nothing from disk. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { parseCard, type Card } from '../src/compose/card.ts';
import type { RenderResult } from '../src/compose/render.ts';
import { parseLocalePack, type LocalePack } from '../src/locale.ts';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export const CATALOG_DIR = here('../../../catalog/');
export const TOOLS_DIR = `${CATALOG_DIR}tools/`;
export const FAMILIES_DIR = `${CATALOG_DIR}families/`;
export const LOCALES_DIR = `${CATALOG_DIR}locales/`;
export const SOURCES_DIR = `${CATALOG_DIR}sources/`;
export const BRIEFS_DIR = here('./fixtures/briefs/');
export const INVALID_DIR = here('./fixtures/invalid/');
export const GOLDEN_DIR = here('./fixtures/golden/');

/** The 10 launch tools (blueprint §2, B19). */
export const LAUNCH_TOOLS = ['gpt', 'claude', 'gemini', 'cursor', 'claude-code', 'perplexity', 'midjourney', 'gmail', 'google-docs', 'notion'];

export function toolIds(): string[] {
  return readdirSync(TOOLS_DIR).sort();
}
/** catalog/families/<name>.yaml files, keyed by the card id inside (writing.email.yaml holds "writing-email"). */
const families = new Map<string, string>(
  readdirSync(FAMILIES_DIR).filter((f) => f.endsWith('.yaml') && !f.endsWith('.evals.yaml')).sort()
    .map((f) => [String(YAML.parse(readFileSync(`${FAMILIES_DIR}${f}`, 'utf8')).id), `${FAMILIES_DIR}${f}`]),
);
export function familyIds(): string[] {
  return [...families.keys()];
}
export function cardPath(id: string): string {
  return families.get(id) ?? `${TOOLS_DIR}${id}/card.yaml`;
}
/** A card's evals.yaml: catalog/tools/<id>/evals.yaml, or catalog/families/<name>.evals.yaml next to a family card. */
export function evalsPath(id: string): string {
  const f = families.get(id);
  return f ? f.replace(/\.yaml$/, '.evals.yaml') : `${TOOLS_DIR}${id}/evals.yaml`;
}
export function cardYaml(id: string): string {
  return readFileSync(cardPath(id), 'utf8');
}
const cache = new Map<string, Card>();
export function loadCard(id: string): Card {
  let c = cache.get(id);
  if (!c) { c = parseCard(cardYaml(id)); cache.set(id, c); }
  return c;
}
/** Every tool card plus every family card (the generic fallback included). */
export function allCards(): Card[] {
  return [...toolIds(), ...familyIds()].map(loadCard);
}
export function fixtureIds(): string[] {
  return readdirSync(BRIEFS_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
}
export function loadFixture(id: string): unknown {
  return JSON.parse(readFileSync(`${BRIEFS_DIR}${id}.json`, 'utf8'));
}
export function localePacks(): LocalePack[] {
  return readdirSync(LOCALES_DIR).sort().filter((d) => existsSync(`${LOCALES_DIR}${d}/pack.yaml`))
    .map((d) => parseLocalePack(readFileSync(`${LOCALES_DIR}${d}/pack.yaml`, 'utf8')));
}
export function localePack(tag: string): LocalePack {
  return parseLocalePack(readFileSync(`${LOCALES_DIR}${tag}/pack.yaml`, 'utf8'));
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
