import { describe, expect, it } from 'vitest';
import { callSettings } from '../src/gateway.ts';
import { routesSchema } from '../src/routes.ts';
import { rawRoutes, routes } from './helpers.ts';

const family = (id: string) => id.split('/')[0];

describe('catalog/routes.yaml', () => {
  it('routes all six functions, cheap on Haiku 5.5 and standard on Sonnet 5.5', () => {
    expect(Object.keys(routes.functions).sort()).toEqual(['answer', 'clean', 'compose', 'learn', 'understand', 'verify']);
    for (const [fn, r] of Object.entries(routes.functions)) {
      if (fn === 'verify') continue; // another family by rule
      expect(r.models[0], fn).toBe(r.role === 'cheap' ? 'anthropic/claude-haiku-5.5' : 'anthropic/claude-sonnet-5.5');
    }
  });

  it('takes verify from a different family than compose', () => {
    const compose = new Set(routes.functions.compose.models.map(family));
    for (const id of routes.functions.verify.models) expect(compose.has(family(id)), id).toBe(false);
  });

  it('keeps every call under the per-tier caps', () => {
    for (const r of Object.values(routes.functions)) expect(r.capUsd).toBeLessThanOrEqual(routes.caps[r.role]);
    expect(routes.caps).toEqual({ cheap: 0.005, standard: 0.02, frontier: 0.04 });
  });

  // biome-ignore lint/suspicious/noExplicitAny: each case edits an arbitrary path of the raw YAML.
  const rejects: Array<[string, (r: any) => void, RegExp]> = [
    ['a sampling parameter', (r) => { r.functions.understand.temperature = 0; }, /unrecognized key/i],
    ['a missing function', (r) => { delete r.functions.learn; }, /functions\.learn: Invalid input/],
    ['an unknown model', (r) => { r.functions.understand.models = ['anthropic/claude-haiku-9']; }, /not in models/],
    ['thinking off on Sonnet 5.5', (r) => { r.functions.compose.thinking.mode = 'off'; }, /does not accept thinking off/],
    ['between_tools above effort high', (r) => { r.functions.compose.thinking.effort = 'xhigh'; }, /effort high or below/],
    ['a cap above its role', (r) => { r.functions.understand.capUsd = 0.01; }, /above the cheap cap/],
    ['output tokens that alone reach the cap', (r) => { r.functions.understand.maxOutputTokens = 20_000; }, /reaches the cap/],
    ['verify in compose\'s family', (r) => { r.functions.verify.models = ['anthropic/claude-haiku-5.5']; }, /different family than compose/],
    ['a model listed twice', (r) => { r.functions.learn.models.push('openai/gpt-6-luna'); }, /listed twice/],
  ];
  it.each(rejects)('rejects %s', (_, breakIt, message) => {
    const r = rawRoutes();
    breakIt(r);
    const result = routesSchema.safeParse(r);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')).toMatch(message);
  });
});

describe('callSettings (the gateway adapter)', () => {
  it('pins thinking and effort, turns on ZDR and sets no sampling parameters', () => {
    expect(callSettings(routes.functions.understand)).toEqual({
      maxOutputTokens: 1_000,
      reasoning: 'none',
      providerOptions: {
        gateway: { zeroDataRetention: true, caching: 'auto' },
        anthropic: { thinking: { type: 'disabled' }, effort: 'low' },
      },
    });
    expect(callSettings(routes.functions.compose).providerOptions.anthropic).toEqual({ thinking: { type: 'between_tools' }, effort: 'medium' });
  });

  it('passes the rest of the model list as gateway fallbacks', () => {
    const s = callSettings(routes.functions.answer);
    expect(s.providerOptions.gateway).toEqual({ zeroDataRetention: true, caching: 'auto', models: ['anthropic/claude-haiku-5.5'] });
    expect(s.reasoning).toBe('medium');
    expect(s.providerOptions.anthropic).toEqual({ thinking: { type: 'adaptive' }, effort: 'medium' });
  });
});
