/**
 * Opt-in live smoke: one real understand call through AI Gateway.
 * Skipped unless AI_GATEWAY_API_KEY is set, so CI and local runs make no network calls.
 *   AI_GATEWAY_API_KEY=... pnpm --filter @promptai/ai exec vitest run test/live.test.ts
 */
import { describe, expect, it } from 'vitest';
import { intentFrameSchema } from '@promptai/contract';
import type { Clock } from '@promptai/core';
import { gatewayTransport } from '../src/gateway.ts';
import { createLlmPort } from '../src/port.ts';
import { routes, understandInput } from './helpers.ts';

const key = process.env.AI_GATEWAY_API_KEY;
const realClock: Clock = {
  now: () => Date.now(),
  after(ms) {
    let id: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<void>((resolve) => { id = setTimeout(resolve, ms); });
    return { promise, cancel: () => clearTimeout(id) };
  },
};

describe.skipIf(!key)('live AI Gateway (AI_GATEWAY_API_KEY)', () => {
  it('understand returns an IntentFrame within the route cap', { timeout: 30_000 }, async () => {
    const port = createLlmPort({ routes, transport: gatewayTransport(key!), clock: realClock });
    const out = await port.understand(understandInput, { timeoutMs: 20_000 });
    const usage = port.usage();
    expect(intentFrameSchema.safeParse(out).success, JSON.stringify({ out, usage })).toBe(true);
    expect(usage.calls[0]?.outcome).toBe('ok');
    expect(usage.tokensIn).toBeGreaterThan(0);
    expect(usage.costUsd).toBeLessThanOrEqual(routes.functions.understand.capUsd);
  });
});
