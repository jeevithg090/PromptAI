/**
 * The catalog's trust checks (blueprint §10, Tool Atlas): every claim quote is a
 * literal substring of the cached source page, and every card's evals.yaml is in
 * W4's format and passes on the deterministic path.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import YAML from 'yaml';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { forgeRequestSchema } from '@promptai/contract';
import { forge } from '../src/forge.ts';
import { allCards, evalsPath, LAUNCH_TOOLS, SOURCES_DIR } from './helpers.ts';
import { fakeClock } from './fakes.ts';

const cards = allCards();

/** catalog/sources/<tool>/<page>.txt: a "source: <url>" header block, "---", then the quoted paragraphs verbatim. */
type Cached = { file: string; url: string; body: string };
const cached: Cached[] = readdirSync(SOURCES_DIR).flatMap((tool) => readdirSync(`${SOURCES_DIR}${tool}`).map((f) => {
  const file = `${tool}/${f}`;
  const text = readFileSync(`${SOURCES_DIR}${file}`, 'utf8');
  const split = text.indexOf('\n---\n');
  const url = /^source: (\S+)$/m.exec(text.slice(0, split))?.[1] ?? '';
  return { file, url, body: text.slice(split + 5) };
}));

describe('sourced claims', () => {
  it('every cached page names its source, is small, and is cited', () => {
    const cited = new Set(cards.flatMap((c) => c.claims.map((cl) => cl.source)));
    for (const c of cached) {
      expect(c.url, c.file).toMatch(/^https:\/\//);
      expect(c.body.length, `${c.file}: keep only the quoted paragraphs`).toBeLessThan(2_500);
      expect(cited.has(c.url), `${c.file} is not cited by any claim`).toBe(true);
    }
    expect(new Set(cached.map((c) => c.url)).size).toBe(cached.length);
  });

  for (const card of cards) {
    if (card.claims.length === 0) continue;
    it(`${card.id}: every claim quote is a literal substring of its cached source`, () => {
      for (const cl of card.claims) {
        const page = cached.find((c) => c.url === cl.source);
        expect(page, `${card.id}/${cl.id}: no cached copy of ${cl.source} under catalog/sources/`).toBeDefined();
        expect(page!.body.includes(cl.quote), `${card.id}/${cl.id}: quote not found verbatim in ${page!.file}`).toBe(true);
      }
    });
  }

  it('the check is literal: one changed character fails it', () => {
    expect(cached.length).toBe(13);
    const claims = cards.flatMap((c) => c.claims);
    expect(claims.length).toBeGreaterThanOrEqual(30);
    for (const cl of claims) {
      const page = cached.find((c) => c.url === cl.source)!;
      const altered = cl.quote.replace(/[a-z]/, (ch) => (ch === 'z' ? 'y' : String.fromCharCode(ch.charCodeAt(0) + 1)));
      expect(page.body.includes(altered), `${cl.id}: altered quote still matches`).toBe(false);
    }
  });
});

/** W4's runner reads exactly this shape. */
const EvalCase = z.object({
  name: z.string().min(1),
  input: z.unknown(),
  expect: z.object({
    toolId: z.string().optional(),
    briefIncludes: z.array(z.string()).optional(),
    briefExcludes: z.array(z.string()).optional(),
    noUnsourced: z.boolean().optional(),
    maxIssues: z.object({ block: z.literal(0) }).strict().optional(),
  }).strict(),
}).strict();

describe('evals.yaml', () => {
  it('covers every card', () => {
    const total = cards.reduce((n, c) => n + (YAML.parse(readFileSync(evalsPath(c.id), 'utf8')) as unknown[]).length, 0);
    expect(total).toBeGreaterThanOrEqual(60);
  });

  for (const card of cards) {
    const path = evalsPath(card.id);
    it(`${card.id}: present, in W4's format, and passing without an LLM`, async () => {
      expect(existsSync(path), `missing ${path}`).toBe(true);
      const cases = z.array(EvalCase).min(1).parse(YAML.parse(readFileSync(path, 'utf8')));
      if (LAUNCH_TOOLS.includes(card.id)) {
        expect(cases.length, `${card.id}: 3-5 cases per launch tool`).toBeGreaterThanOrEqual(3);
        expect(cases.length).toBeLessThanOrEqual(5);
      }
      for (const c of cases) {
        const req = forgeRequestSchema.parse(c.input);
        const res = await forge(req, { cards, clock: fakeClock() });
        const at = `${card.id} / ${c.name}`;
        if (c.expect.toolId !== undefined) expect(res.toolId, at).toBe(c.expect.toolId);
        for (const s of c.expect.briefIncludes ?? []) expect(res.brief, at).toContain(s);
        for (const s of c.expect.briefExcludes ?? []) expect(res.brief, at).not.toContain(s);
        if (c.expect.noUnsourced) expect(res.unsourced, at).toEqual([]);
        if (c.expect.maxIssues) expect(res.issues?.filter((i) => i.severity === 'block'), at).toEqual([]);
      }
    });
  }
});
