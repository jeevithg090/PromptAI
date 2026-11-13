/**
 * G1 goldens (docs/blueprint/BLUEPRINT.md §14, docs/gates.md): run every
 * catalog/tools/<id>/evals.yaml through @promptai/core's forge with the parsed
 * catalog cards, a fixed clock and no LLM, so a failure is deterministic.
 *
 *   pnpm gates:g1 [--catalog catalog] [--evals <dir with tools/<id>/evals.yaml>]
 */
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { forgeRequestSchema, forgeResponseSchema, type ForgeResponseParsed } from '@promptai/contract';
import { forge, parseCard, type Card, type Clock } from '@promptai/core';

const severities = { block: z.number().int().nonnegative(), warn: z.number().int().nonnegative(), info: z.number().int().nonnegative() };

/** One case. Unknown keys are errors, so a typo can't turn a check off. */
export const evalCaseSchema = z.strictObject({
  name: z.string().trim().min(1),
  input: forgeRequestSchema.strict(),
  expect: z.strictObject({
    toolId: z.string().min(1).optional(),
    briefIncludes: z.array(z.string().min(1)).optional(),
    briefExcludes: z.array(z.string().min(1)).optional(),
    noUnsourced: z.boolean().optional(),
    maxIssues: z.strictObject(severities).partial().optional(),
  }),
});
export type EvalCase = z.output<typeof evalCaseSchema>;

export const evalFileSchema = z
  .array(evalCaseSchema)
  .min(1)
  .refine((cases) => new Set(cases.map((c) => c.name)).size === cases.length, { message: 'case names must be unique' });

/** forge() reads time only through this port; a constant clock keeps runs reproducible. */
export const FIXED_CLOCK: Clock = {
  now: () => 0,
  after: () => ({ promise: new Promise<void>(() => {}), cancel: () => {} }),
};

/** Every card: tools/<id>/card.yaml plus families/*.yaml (where the generic fallback lives). */
export async function loadCards(catalogDir: string): Promise<Card[]> {
  const toolDirs = await readdir(path.join(catalogDir, 'tools'), { withFileTypes: true });
  const files = toolDirs.filter((d) => d.isDirectory()).map((d) => path.join(catalogDir, 'tools', d.name, 'card.yaml'));
  for (const f of await readdir(path.join(catalogDir, 'families'))) {
    if (f.endsWith('.yaml') && !f.endsWith('.evals.yaml')) files.push(path.join(catalogDir, 'families', f));
  }
  const cards: Card[] = [];
  for (const file of files.sort()) {
    try {
      cards.push(parseCard(await readFile(file, 'utf8')));
    } catch (err) {
      throw new Error(`${path.relative(catalogDir, file)}: ${(err as Error).message}`);
    }
  }
  return cards;
}

/** What failed for one case; empty means it passed. */
async function runCase(cards: readonly Card[], c: EvalCase): Promise<string[]> {
  try {
    const out = forgeResponseSchema.safeParse(await forge(c.input, { cards, clock: FIXED_CLOCK }));
    if (!out.success) return [`the response breaks the contract: ${out.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`];
    return check(c.expect, out.data);
  } catch (err) {
    return [`forge threw: ${(err as Error).message}`];
  }
}

/** The case's expectations against one forge response. */
export function check(e: EvalCase['expect'], res: ForgeResponseParsed): string[] {
  const failures: string[] = [];
  if (e.toolId !== undefined && res.toolId !== e.toolId) failures.push(`toolId is "${res.toolId}", expected "${e.toolId}"`);
  for (const s of e.briefIncludes ?? []) if (!res.brief.includes(s)) failures.push(`brief is missing ${JSON.stringify(s)}`);
  for (const s of e.briefExcludes ?? []) if (res.brief.includes(s)) failures.push(`brief contains ${JSON.stringify(s)}`);
  if (e.noUnsourced && res.unsourced.length > 0) failures.push(`unsourced specifics: ${res.unsourced.map((u) => JSON.stringify(u)).join(', ')}`);
  for (const [severity, max] of Object.entries(e.maxIssues ?? {})) {
    const found = res.issues.filter((i) => i.severity === severity);
    if (found.length > max) failures.push(`${found.length} ${severity} issue(s), at most ${max} allowed: ${found.map((i) => i.code).join(', ')}`);
  }
  return failures;
}

export type ToolResult = { toolId: string; file: string } & ({ error: string } | { cases: Array<{ name: string; failures: string[] }> });
export type G1Report = { tools: ToolResult[]; withoutEvals: string[] };

/** Every eval file: <dir>/tools/<id>/evals.yaml and <dir>/families/<id>.evals.yaml. */
async function evalFiles(evalsDir: string): Promise<Array<{ toolId: string; file: string }>> {
  const found: Array<{ toolId: string; file: string }> = [];
  for (const d of await readdir(path.join(evalsDir, 'tools'), { withFileTypes: true })) {
    const file = path.join(evalsDir, 'tools', d.name, 'evals.yaml');
    if (d.isDirectory() && existsSync(file)) found.push({ toolId: d.name, file });
  }
  const familiesDir = path.join(evalsDir, 'families');
  if (existsSync(familiesDir)) {
    for (const f of await readdir(familiesDir)) {
      if (!f.endsWith('.evals.yaml')) continue;
      // The card id comes from the sibling card file (families/writing.doc.yaml has id writing-doc).
      const card = parseCard(await readFile(path.join(familiesDir, f.replace(/\.evals\.yaml$/, '.yaml')), 'utf8'));
      found.push({ toolId: card.id, file: path.join(familiesDir, f) });
    }
  }
  return found.sort((a, b) => a.toolId.localeCompare(b.toolId));
}

/** Run every eval file under evalsDir against the cards in catalogDir. */
export async function runG1(catalogDir: string, evalsDir = catalogDir): Promise<G1Report> {
  const cards = await loadCards(catalogDir);
  const tools: ToolResult[] = [];
  for (const { toolId, file } of await evalFiles(evalsDir)) {
    if (!cards.some((c) => c.id === toolId)) {
      tools.push({ toolId, file, error: `no card with id "${toolId}" in ${catalogDir}` });
      continue;
    }
    let parsed: EvalCase[];
    try {
      const r = evalFileSchema.safeParse(parseYaml(await readFile(file, 'utf8')));
      if (!r.success) throw new Error(r.error.issues.map((i) => `${i.path.join('.') || 'file'}: ${i.message}`).join('; '));
      parsed = r.data;
    } catch (err) {
      tools.push({ toolId, file, error: (err as Error).message });
      continue;
    }
    const cases = [];
    for (const c of parsed) cases.push({ name: c.name, failures: await runCase(cards, c) });
    tools.push({ toolId, file, cases });
  }
  const covered = new Set(tools.map((t) => t.toolId));
  const withoutEvals = cards.map((c) => c.id).filter((id) => !covered.has(id)).sort();
  return { tools, withoutEvals };
}

export const failed = (r: G1Report) => r.tools.some((t) => 'error' in t || t.cases.some((c) => c.failures.length > 0));

export function format(r: G1Report): string {
  const lines: string[] = [];
  let cases = 0;
  let failing = 0;
  for (const t of r.tools) {
    if ('error' in t) {
      lines.push(`  FAIL  ${t.toolId}: ${t.error}`);
      continue;
    }
    const bad = t.cases.filter((c) => c.failures.length > 0);
    cases += t.cases.length;
    failing += bad.length;
    lines.push(`  ${bad.length ? 'FAIL' : 'PASS'}  ${t.toolId.padEnd(20)} ${t.cases.length - bad.length}/${t.cases.length}`);
    for (const c of bad) for (const f of c.failures) lines.push(`        x ${JSON.stringify(c.name)}: ${f}`);
  }
  for (const id of r.withoutEvals) lines.push(`  ----  ${id.padEnd(20)} no evals.yaml`);
  const errors = r.tools.filter((t) => 'error' in t).length;
  lines.push(
    `G1: ${cases - failing}/${cases} cases passed in ${r.tools.length - errors} tool(s)` +
      (errors ? `; ${errors} evals file(s) could not run` : '') +
      (r.withoutEvals.length ? `; ${r.withoutEvals.length} card(s) have no evals.yaml` : ''),
  );
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const { values } = parseArgs({ options: { catalog: { type: 'string', default: 'catalog' }, evals: { type: 'string' } }, strict: true });
  const report = await runG1(values.catalog, values.evals ?? values.catalog);
  console.log(`G1 goldens: ${path.join(values.evals ?? values.catalog, 'tools/*/evals.yaml')} (fixed clock, no LLM)`);
  console.log(format(report));
  if (failed(report)) process.exitCode = 1;
}
