import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forgeResponseSchema } from '@promptai/contract';
import { check, evalFileSchema, failed, format, runG1 } from '../src/g1.ts';

const REPO = path.resolve(import.meta.dirname, '../../..');
const CATALOG = path.join(REPO, 'catalog');
const SAMPLES = path.join(REPO, 'packages/gates/samples');
const CLI = path.join(REPO, 'packages/gates/src/g1.ts');

let dir: string;
async function evalsFor(toolId: string, yaml: string): Promise<string> {
  const root = await mkdtemp(path.join(dir, 'evals-'));
  await mkdir(path.join(root, 'tools', toolId), { recursive: true });
  await writeFile(path.join(root, 'tools', toolId, 'evals.yaml'), yaml);
  return root;
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'g1-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('G1 runner', () => {
  it('passes the sample cases against the real catalog cards', async () => {
    const report = await runG1(CATALOG, SAMPLES);
    expect(failed(report)).toBe(false);
    expect(report.tools).toEqual([{ toolId: 'claude', file: path.join(SAMPLES, 'tools/claude/evals.yaml'), cases: [expect.objectContaining({ failures: [] }), expect.objectContaining({ failures: [] })] }]);
    expect(report.withoutEvals).not.toContain('claude');
  });

  it('reports every failed expectation, per case', async () => {
    const root = await evalsFor(
      'claude',
      `
- name: wrong on purpose
  input: { text: "write a launch email in Claude for 3 March", toolHint: claude }
  expect:
    toolId: gpt
    briefIncludes: [a phrase that is not there]
    briefExcludes: ["<task>"]
    noUnsourced: true
- name: still fine
  input: { text: "write a launch email in Claude" }
  expect: { toolId: claude }
`,
    );
    const report = await runG1(CATALOG, root);
    expect(failed(report)).toBe(true);
    const tool = report.tools[0]!;
    expect('cases' in tool && tool.cases.map((c) => c.failures.length)).toEqual([3, 0]);
    const text = format(report);
    expect(text).toContain('FAIL  claude');
    expect(text).toContain('toolId is "claude", expected "gpt"');
    expect(text).toContain('brief is missing "a phrase that is not there"');
    expect(text).toContain('brief contains "<task>"');
    expect(text).toContain('1/2 cases passed');
  });

  it('checks unsourced specifics and issue counts', () => {
    // The deterministic path rarely produces either, so the check runs on a made-up response.
    const res = forgeResponseSchema.parse({
      toolId: 'claude',
      toolName: 'Claude',
      brief: 'Send it on 3 March.',
      assumptions: [],
      unsourced: ['3 March'],
      issues: [
        { code: 'over_limit', message: 'too long', severity: 'block' },
        { code: 'escaped_syntax', message: 'escaped', severity: 'warn' },
      ],
      coverage: { covered: 1, total: 2 },
      usage: { llmCalls: 0, ms: 0 },
    });
    expect(check({ noUnsourced: true, maxIssues: { block: 0, warn: 1 } }, res)).toEqual([
      'unsourced specifics: "3 March"',
      '1 block issue(s), at most 0 allowed: over_limit',
    ]);
    expect(check({ noUnsourced: false, maxIssues: { block: 1 } }, res)).toEqual([]);
  });

  it('rejects a malformed evals file instead of skipping checks', async () => {
    const typo = await evalsFor('claude', '- name: typo\n  input: { text: "x in Claude" }\n  expect: { briefInclude: [x] }\n');
    const typoReport = await runG1(CATALOG, typo);
    expect(failed(typoReport)).toBe(true);
    expect(format(typoReport)).toMatch(/FAIL {2}claude: .*briefInclude/);

    const unknownTool = await evalsFor('no-such-tool', '- name: a\n  input: { text: "x" }\n  expect: {}\n');
    expect(format(await runG1(CATALOG, unknownTool))).toContain('no card with id "no-such-tool"');

    expect(evalFileSchema.safeParse([]).success).toBe(false);
    const dup = { name: 'a', input: { text: 'x' }, expect: {} };
    expect(evalFileSchema.safeParse([dup, dup]).success).toBe(false);
    expect(evalFileSchema.safeParse([{ ...dup, input: { text: 'x', toolhint: 'claude' } }]).success).toBe(false);
  });

  it('exits non-zero from the command line on a failure, and zero on the samples', async () => {
    const root = await evalsFor('claude', '- name: wrong\n  input: { text: "x in Claude" }\n  expect: { toolId: gpt }\n');
    const bad = spawnSync(process.execPath, [CLI, '--catalog', CATALOG, '--evals', root], { encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain('FAIL');
    const good = spawnSync(process.execPath, [CLI, '--catalog', CATALOG, '--evals', SAMPLES], { encoding: 'utf8' });
    expect(good.status).toBe(0);
    expect(good.stdout).toContain('PASS  claude');
  });
});
