import { simulateCost } from '../../src/services/CostSimulator';
import { lintDeterministic } from '../../src/utils/styleLint';
import { debugPrompt } from '../../src/services/PromptDebugService';
import { analyzeAmbiguity } from '../../src/services/AmbiguityService';
import { migratePrompt } from '../../src/services/MigrationService';
import { getPlatform } from '../../src/services/PlatformService';
import type { ProviderGenerateResponse } from '../../src/types/Provider';

function gen(content: unknown): jest.Mock {
  return jest.fn(async (): Promise<ProviderGenerateResponse> => ({
    content: typeof content === 'string' ? content : JSON.stringify(content),
    tokensUsed: { input: 40, output: 30 },
    finishReason: 'stop',
  }));
}

describe('CostSimulator (V2.6) — deterministic', () => {
  it('estimates cost per text model and picks a cheapest safe option', () => {
    const res = simulateCost('a fairly detailed prompt about a red bicycle at golden hour, 50mm lens', 500);
    expect(res.input_tokens).toBeGreaterThan(0);
    expect(res.rows.length).toBeGreaterThan(3);
    expect(res.rows.every((r) => r.context_fit_pct >= 0)).toBe(true);
    // Sorted cheapest-first (nulls last).
    const costs = res.rows.map((r) => r.est_cost_usd).filter((c): c is number => c != null);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
    expect(res.disclaimer).toMatch(/not billing truth/i);
  });
});

describe('styleLint (V2.8) — deterministic rules', () => {
  const target = { assembled: 'Write a cutting-edge blog post about coffee.', nodeTypes: ['subject', 'output_format'] };

  it('flags a banned term', () => {
    const v = lintDeterministic(target, [{ kind: 'banned_term', value: 'cutting-edge' }]);
    expect(v).toHaveLength(1);
    expect(v[0]!.severity).toBe('high');
  });

  it('flags a missing required term and required node', () => {
    const v = lintDeterministic(target, [
      { kind: 'required_term', value: 'disclaimer' },
      { kind: 'required_node', value: 'negative_prompt' },
    ]);
    expect(v).toHaveLength(2);
  });

  it('passes clean text', () => {
    expect(lintDeterministic(target, [{ kind: 'required_term', value: 'coffee' }])).toHaveLength(0);
  });

  it('flags over-length prompts', () => {
    const v = lintDeterministic(target, [{ kind: 'max_length_tokens', value: '2' }]);
    expect(v).toHaveLength(1);
  });
});

describe('debugPrompt (V2.1)', () => {
  it('returns node-level diagnosis + a patched prompt', async () => {
    const fn = gen({
      diagnosis: [{ node_type: 'constraints_rules', fault: 'no length limit', evidence: 'a 900-word essay', severity: 'high' }],
      patched_nodes: [{ type: 'subject', value: 'a haiku about rain', rationale: 'fix', alternatives: [] }],
      patch_summary: 'Added a strict length constraint.',
    });
    const res = await debugPrompt({ prompt: 'write about rain', actualOutput: 'a 900-word essay', expected: 'a haiku' }, fn as never);
    expect(res.diagnosis[0]!.severity).toBe('high');
    expect(res.patched_nodes.length).toBeGreaterThan(0);
    expect(fn).toHaveBeenCalledWith('debug', 'large', expect.objectContaining({ responseFormat: 'json' }));
  });

  it('retries then fails on malformed output', async () => {
    const fn = gen('nope');
    await expect(debugPrompt({ prompt: 'x', actualOutput: 'y', expected: 'z' }, fn as never)).rejects.toThrow(/failed after retries/);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('analyzeAmbiguity (V2.7)', () => {
  it('keeps only spans that actually occur in the prompt', async () => {
    const assembled = 'a nice image, high quality, make it pop';
    const fn = gen({
      findings: [
        { text: 'make it pop', risk: 'ambiguous', reason: 'subjective', fix: 'specify colors/contrast' },
        { text: 'THIS IS NOT IN THE PROMPT', risk: 'underspecified', reason: 'x', fix: 'y' },
      ],
    });
    const res = await analyzeAmbiguity({ assembled, platform: getPlatform('midjourney')! }, fn as never);
    expect(res.findings).toHaveLength(1); // hallucinated span dropped
    expect(res.findings[0]!.start).toBe(assembled.indexOf('make it pop'));
    expect(res.findings[0]!.end).toBe(assembled.indexOf('make it pop') + 'make it pop'.length);
  });
});

describe('migratePrompt (V2.4)', () => {
  it('translates nodes and serializes both sides for a diff', async () => {
    const fn = gen({
      target_nodes: [{ type: 'subject', value: 'a red bicycle', rationale: 'kept', alternatives: [] }],
      change_report: [{ node_type: 'technical_parameters', action: 'dropped', from: '--ar 16:9', to: '', reason: 'SD uses resolution, not --ar' }],
      risk_flags: ['aspect ratio expressed differently'],
    });
    const res = await migratePrompt(
      { nodes: [{ type: 'subject', value: 'a red bicycle' }, { type: 'technical_parameters', value: '--ar 16:9' }], source: getPlatform('midjourney')!, target: getPlatform('stability_stable_diffusion')! },
      fn as never
    );
    expect(res.target_assembled).toContain('a red bicycle');
    expect(res.source_assembled).toContain('--ar 16:9');
    expect(res.change_report[0]!.action).toBe('dropped');
    expect(res.risk_flags.length).toBe(1);
  });
});

// ---- V2.5 Workflow Composer + V2.3 Regression Suite ----
import { runWorkflow } from '../../src/services/WorkflowService';
import { runPromptTests } from '../../src/services/PromptTestService';

describe('runWorkflow (V2.5)', () => {
  it('pipes each step output into the next step via {{var}}', async () => {
    const calls: string[] = [];
    const fn = jest.fn(async (_s: string, _c: string, req: { messages: Array<{ content: string }> }): Promise<ProviderGenerateResponse> => {
      calls.push(req.messages[0]!.content);
      return { content: `OUT(${calls.length})`, tokensUsed: { input: 10, output: 10 }, finishReason: 'stop' };
    });
    const res = await runWorkflow(
      {
        name: 'wf',
        inputs: { topic: 'coffee' },
        steps: [
          { name: 'outline', prompt: 'Outline about {{topic}}', output_var: 'outline' },
          { name: 'write', prompt: 'Write from: {{outline}}', output_var: 'article' },
        ],
      },
      fn as never
    );
    expect(res.results).toHaveLength(2);
    expect(calls[0]).toContain('coffee'); // input var filled
    expect(calls[1]).toContain('OUT(1)'); // step 1 output piped into step 2
    expect(res.variables.article).toBe('OUT(2)');
    expect(res.total_tokens).toBe(40);
  });
});

describe('runPromptTests (V2.3)', () => {
  const gen2 = (out: string): jest.Mock =>
    jest.fn(async (step: string): Promise<ProviderGenerateResponse> => ({
      content: step === 'judge' ? JSON.stringify({ pass: true, reason: 'ok' }) : out,
      tokensUsed: { input: 10, output: 10 },
      finishReason: 'stop',
    }));

  it('grades deterministic assertions and computes a pass rate', async () => {
    const fn = gen2('The answer is 42 and it is concise.');
    const res = await runPromptTests(
      'Answer: {{q}}',
      [
        { name: 'has 42', var_values: { q: 'x' }, assertions: [{ kind: 'contains', value: '42' }] },
        { name: 'not verbose', var_values: { q: 'y' }, assertions: [{ kind: 'max_words', value: '3' }] },
      ],
      fn as never
    );
    expect(res.results[0]!.pass).toBe(true);
    expect(res.results[1]!.pass).toBe(false); // 8 words > 3
    expect(res.pass_rate).toBe(50);
  });

  it('uses the LLM judge for judge-kind assertions', async () => {
    const fn = gen2('anything');
    const res = await runPromptTests('p', [{ name: 'j', var_values: {}, assertions: [{ kind: 'judge', value: 'is polite' }] }], fn as never);
    expect(res.results[0]!.assertions[0]!.pass).toBe(true);
    expect(res.results[0]!.assertions[0]!.detail).toBe('ok');
  });
});
