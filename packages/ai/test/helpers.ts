/** Test helpers: the real routes file, a manual clock and a mock-model transport. No network. */
import { readFileSync } from 'node:fs';
import { MockLanguageModelV4 } from 'ai/test';
import { parse } from 'yaml';
import { parseRoutes } from '../src/routes.ts';
import type { Transport } from '../src/gateway.ts';

const ROUTES_YAML = readFileSync(new URL('../../../catalog/routes.yaml', import.meta.url), 'utf8');
export const routes = parseRoutes(ROUTES_YAML);
/** A fresh, unvalidated copy of routes.yaml to break in tests. */
// biome-ignore lint/suspicious/noExplicitAny: tests mutate arbitrary paths of the raw YAML to break validation.
export const rawRoutes = (): any => parse(ROUTES_YAML);

export type CallOptions = Parameters<MockLanguageModelV4['doGenerate']>[0];
export type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;

/** Timers fire only when the test calls fire(). */
export function manualClock() {
  const timers: Array<{ ms: number; fire: () => void; live: boolean }> = [];
  return {
    timers,
    now: () => 0,
    after(ms: number) {
      let fire!: () => void;
      const promise = new Promise<void>((resolve) => { fire = resolve; });
      const timer = { ms, fire, live: true };
      timers.push(timer);
      return { promise, cancel: () => { timer.live = false; } };
    },
    fire: () => {
      for (const t of timers.filter((t) => t.live)) t.fire();
    },
  };
}

/** Every model id resolves to a mock that answers with `reply`. */
export function mockTransport(reply: (call: CallOptions) => GenerateResult | PromiseLike<GenerateResult>) {
  const models: MockLanguageModelV4[] = [];
  const requested: string[] = [];
  const transport: Transport = {
    languageModel(modelId) {
      requested.push(modelId);
      const model = new MockLanguageModelV4({ provider: 'gateway', modelId, doGenerate: async (call) => reply(call) });
      models.push(model);
      return model;
    },
  };
  return { transport, requested, calls: () => models.flatMap((m) => m.doGenerateCalls) };
}

export const usage = (input: number, output: number): GenerateResult['usage'] => ({
  inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: output, text: output, reasoning: 0 },
});

export const textReply = (text: string, tokens = usage(1_200, 300)): GenerateResult => ({
  content: [{ type: 'text', text }],
  finishReason: { unified: 'stop', raw: 'end_turn' },
  usage: tokens,
  warnings: [],
});

/** What core sends to understand() for a Midjourney request. */
export const understandInput = {
  text: 'write a midjourney prompt of a cat at night, 16:9',
  locale: 'en',
  language: { spoken: ['en'] },
  tool: { id: 'midjourney', name: 'Midjourney', family: 'image.generate', audience: 'private_ai' as const },
  slots: [
    { id: 'aspect_ratio', label: 'Aspect ratio', options: ['1:1', '16:9', '9:16'] },
    { id: 'style', label: 'Style', options: ['photorealistic', 'illustration', 'anime'] },
  ],
  memories: [] as Array<{ id: string; kind: string; text: string }>,
};

export const frame = {
  family: 'image.generate',
  target: { toolId: 'midjourney', source: 'named' },
  goal: 'A Midjourney image of a cat at night in 16:9.',
  deliverable: 'an image',
  successCriteria: ['shows a cat', 'set at night'],
  slots: [
    { id: 'aspect_ratio', value: '16:9', source: 'said', confidence: 'high' },
    { id: 'style', value: null, source: 'inferred', confidence: 'low' },
  ],
  coveredForYou: [{ text: 'a lighting style', slotId: 'style' }],
  unsure: [],
  language: { spoken: ['en'], script: 'Latn' },
  risk: 'none',
};

export const repairInput = {
  goal: 'a cat at night shot on a Canon R5',
  brief: 'a cat at night shot on a Canon R5 --ar 16:9',
  problems: ['"Canon R5" is not in the user\'s words; remove it or use only what they said'],
  replyLanguage: 'en',
};
