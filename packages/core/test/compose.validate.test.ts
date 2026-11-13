/** Validator tests: Zod Brief IR, card schema, vendor request schemas, and the no-tool-names rule. */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { BriefSchema, parseBrief } from '../src/compose/ir.ts';
import { CardSchema, parseCard } from '../src/compose/card.ts';
import { render } from '../src/compose/render.ts';
import { allCards, cardYaml, fixtureIds, loadCard, loadFixture, toolIds, INVALID_DIR } from './helpers.ts';

const manifest: Record<string, string> = JSON.parse(readFileSync(`${INVALID_DIR}_manifest.json`, 'utf8'));

it('every valid fixture passes Zod', () => {
  for (const id of fixtureIds()) {
    const z = parseBrief(loadFixture(id));
    expect(z.ok, `${id}: ${!z.ok && z.errors.join('; ')}`).toBe(true);
  }
});

describe('invalid brief rejected by Zod and by the renderer', () => {
  for (const name of Object.keys(manifest)) {
    it(name, () => {
      const data = JSON.parse(readFileSync(`${INVALID_DIR}${name}.json`, 'utf8'));
      expect(parseBrief(data).ok).toBe(false);
      const r = render(data, loadCard('claude'));
      expect(r.ok).toBe(false);
      expect(r.issues.every((i) => i.code === 'brief_invalid' && i.path)).toBe(true);
    });
  }
});

it('every catalog card validates', () => {
  expect(toolIds()).toHaveLength(8);
  for (const id of [...toolIds(), 'generic']) expect(() => parseCard(cardYaml(id)), id).not.toThrow();
});

it('broken cards are rejected with useful messages', () => {
  const good = YAML.parse(cardYaml('midjourney'));
  const broken: Array<[string, (c: any) => void, RegExp]> = [
    ['text field without template', (c) => { delete c.fields[0].template; }, /template/],
    ['positive_rewrite without table', (c) => { c.negation = { strategy: 'positive_rewrite' }; }, /rewrite table/],
    ['non-url source', (c) => { c.sources = ['docs page']; }, /url|URL/i],
    ['unknown key (typo)', (c) => { c.feilds = c.fields; }, /unrecognized|Unrecognized/i],
    ['bad param lookup path', (c) => { c.params.aspect_ratio.from = ['brief.params.ar']; }, /Invalid|pattern|match/i],
    ['duplicate field names', (c) => { c.fields.push({ ...c.fields[0] }); }, /duplicate/],
    ['insert names a missing field', (c) => { c.insert = 'nope'; }, /insert/],
    ['low-impact slot without default', (c) => { c.slots.push({ id: 'x', label: 'X', impact: 2, to: 'audience' }); }, /needs a default/],
    ['three pick slots', (c) => { c.slots.push({ id: 'x', label: 'X', impact: 3, to: 'audience' }, { id: 'y', label: 'Y', impact: 3, to: 'role' }); }, /at most 2/],
    ['duplicate slot ids', (c) => { c.slots.push({ ...c.slots[0] }); }, /duplicate slot/],
    ['invalid slot pattern', (c) => { c.slots[0].pattern = '('; }, /invalid pattern/],
  ];
  for (const [label, mutate, re] of broken) {
    const c = structuredClone(good); mutate(c);
    const r = CardSchema.safeParse(c);
    expect(r.success, label).toBe(false);
    expect(r.error!.issues.map((i) => i.message).join(' '), label).toMatch(re);
    expect(() => parseCard(YAML.stringify(c)), label).toThrow(/card invalid/);
  }
});

it('param rules: invalid values are dropped or clamped, never passed through', () => {
  const b = structuredClone(loadFixture('product-shot')) as any;
  b.params.aspect_ratio = '4:5';
  b.tool_params.midjourney = { stylize: 5000, chaos: 'lots', made_up: 1 };
  const r = render(b, loadCard('midjourney'));
  const codes = r.issues.map((i) => i.code);
  expect(codes).toContain('param_clamped');            // stylize 5000 -> 1000
  expect(codes).toContain('param_invalid');            // chaos 'lots'
  expect(codes).toContain('tool_param_unknown');       // made_up
  expect(r.fields.prompt as string).toMatch(/--s 1000/);
  expect(r.fields.prompt as string).not.toMatch(/--chaos/);
});

it('Zod defaults normalize a minimal brief', () => {
  const r = BriefSchema.parse(loadFixture('minimal'));
  expect(r.avoid).toEqual([]);
  expect(r.style).toEqual({ tone: [], descriptors: [], references: [] });
  expect(r.locale).toBe('en');
});

it('vendor request schema catches a body the API would reject (FLUX 3: 422 on unknown fields)', () => {
  const card = structuredClone(loadCard('flux3'));
  const req = card.fields.find((f) => f.name === 'request')!;
  req.body = { ...req.body, seed: '=brief.params.seed' };          // a field other BFL endpoints accept, this one does not
  const b = structuredClone(loadFixture('product-shot') as any); b.params.seed = 7;
  const r = render(b, card);
  const v = r.issues.filter((i) => i.code === 'schema_violation');
  expect(v).toHaveLength(1);
  expect(v[0]!.message).toMatch(/Unrecognized key: "seed"/);
  // the unmodified card never sends seed and says so
  const ok = render(b, loadCard('flux3'));
  expect(ok.issues.some((i) => i.code === 'param_unsupported' && i.path === '/params/seed')).toBe(true);
  expect((ok.fields.request as any).seed).toBeUndefined();
});

it('a broken vendor schema is a card bug reported as an issue, not a crash', () => {
  const card = structuredClone(loadCard('flux3'));
  card.fields.find((f) => f.name === 'request')!.schema = { type: 'no-such-type' };
  const r = render(loadFixture('product-shot'), card);
  expect(r.issues.some((i) => i.code === 'vendor_schema_invalid')).toBe(true);
});

it('every catalog card renders every fixture without hard errors', () => {
  for (const card of allCards()) for (const fx of fixtureIds()) {
    const r = render(loadFixture(fx), card);
    expect(r.issues.filter((i) => ['template_error', 'template_artifact', 'schema_violation'].includes(i.code)), `${card.id}/${fx}`).toEqual([]);
  }
});

/** src/*.ts with comments stripped (comments may mention tools and APIs). */
function sources(): Array<[string, string]> {
  const dir = fileURLToPath(new URL('../src/', import.meta.url));
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
  expect(files.length).toBeGreaterThan(3);
  return files.map((f) => [f, readFileSync(`${dir}${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')]);
}

it('tool-specific values live only in cards: no tool names in src/', () => {
  const names = ['midjourney', 'suno', 'claude', 'anthropic', 'openai', 'gpt', 'flux', 'bfl', 'omni', 'veo', 'cursor', 'github', '--ar', '--no'];
  for (const [f, src] of sources()) {
    for (const n of names) expect(src.toLowerCase().includes(n), `${f} mentions "${n}"`).toBe(false);
  }
});

it('core does no I/O: no fs, network, clock, timers, env, DOM or randomness in src/', () => {
  // the tsconfig loads Node types for the tests, so the type checker cannot enforce this for src/
  const banned = [/from ['"](?:node:|fs|path|os|http|https|net|child_process)/, /\brequire\(/, /\bprocess\./, /\bfetch\(/, /\bDate\b/, /\bperformance\./,
    /\bset(?:Timeout|Interval|Immediate)\b/, /\b(?:window|document|navigator|localStorage)\./, /\bglobalThis\b/, /\bMath\.random\b/, /\bimport\.meta\b/];
  for (const [f, src] of sources()) {
    for (const re of banned) expect(re.test(src), `${f} matches ${re}`).toBe(false);
  }
});
