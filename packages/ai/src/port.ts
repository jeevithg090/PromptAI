/**
 * createLlmPort: core's LlmPort over routed models (blueprint §6, §11).
 *
 * Make one port per forge request. Its usage() fills the response's usage fields,
 * and a refusal latches it: the refused call and every later call on the port
 * return the same terminal result without sending anything (core retries once,
 * and a refused request is never re-sent, to any provider).
 */
import { generateText, jsonSchema, NoObjectGeneratedError, Output, type LanguageModelUsage, type ProviderMetadata } from 'ai';
import { z } from 'zod';
import { intentFrameSchema } from '@promptai/contract';
import type { Clock, LlmPort } from '@promptai/core';
import { callSettings, type Transport } from './gateway.ts';
import { buildPrompt, estimateTokens, loadPrompt, responseSchema, type Prompt, type Sections } from './prompt.ts';
import { costUsd, type LlmFunction, type Routes } from './routes.ts';

/** What core accepts from repair() (packages/core/src/forge.ts). */
export const repairOutputSchema = z.object({
  goal: z.string().trim().min(1).max(4_000),
  subject: z.string().trim().min(1).max(2_000).optional(),
});

/** A call that produced nothing usable. Core treats it as degraded. */
export type LlmFailure =
  | { failed: 'refusal'; terminal: true; category: string | null }
  | { failed: 'invalid_output' | 'timeout' | 'over_cap' | 'error'; terminal: false };

export type CallRecord = {
  fn: LlmFunction;
  prompt: string;
  /** The model that answered, when known. */
  model: string | null;
  outcome: 'ok' | LlmFailure['failed'];
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
};
export type LlmUsage = { tokensIn: number; tokensOut: number; costUsd: number; calls: CallRecord[] };
export type GatewayLlmPort = LlmPort & { usage(): LlmUsage };

const TIMEOUT = Symbol('timeout');
const fail = (failed: Exclude<LlmFailure['failed'], 'refusal'>): LlmFailure => ({ failed, terminal: false });

function stopCategory(meta: ProviderMetadata | undefined): string | null {
  const details = meta?.anthropic?.stopDetails as { category?: unknown } | undefined;
  return typeof details?.category === 'string' ? details.category : null;
}

export function createLlmPort({ routes, transport, clock }: { routes: Routes; transport: Transport; clock: Clock }): GatewayLlmPort {
  const prompts = { understand: loadPrompt('understand.v1'), repair: loadPrompt('repair.v1') };
  const calls: CallRecord[] = [];
  let refused: LlmFailure | null = null;

  async function call<T>(fn: LlmFunction, prompt: Prompt, sections: Sections, schema: z.ZodType<T>, budgetMs: number): Promise<T | LlmFailure> {
    if (refused) return refused;
    const route = routes.functions[fn];
    const { instructions, messages } = buildPrompt(prompt, sections);
    const format = responseSchema(schema);

    // Cost from the route's price table: the served model's price, or the dearest in the list.
    const cost = (model: string | null, tokensIn: number, tokensOut: number) => {
      const known = model !== null && route.models.includes(model) ? [model] : route.models;
      return Math.max(...known.map((id) => costUsd(routes.models[id]!.price, tokensIn, tokensOut)));
    };
    const estimatedIn = estimateTokens(JSON.stringify(format) + instructions + JSON.stringify(messages));
    const worstCase = cost(null, estimatedIn, route.maxOutputTokens);

    const finish = <R>(result: R, outcome: CallRecord['outcome'], model: string | null, usage?: LanguageModelUsage): R => {
      const tokensIn = usage ? usage.inputTokens ?? estimatedIn : 0;
      const tokensOut = usage ? usage.outputTokens ?? route.maxOutputTokens : 0;
      // A call cut off by the timeout may still be billed, so it counts at its bound.
      const usd = usage ? cost(model, tokensIn, tokensOut) : outcome === 'timeout' ? worstCase : 0;
      calls.push({ fn, prompt: prompt.id, model, outcome, tokensIn, tokensOut, costUsd: usd });
      return result;
    };
    const failure = (f: LlmFailure, model: string | null, usage?: LanguageModelUsage) => finish(f, f.failed, model, usage);
    const refusal = (model: string | null, usage: LanguageModelUsage | undefined, category: string | null) => {
      refused = { failed: 'refusal', terminal: true, category };
      return failure(refused, model, usage);
    };

    if (worstCase > route.capUsd) return failure(fail('over_cap'), null);

    const abort = new AbortController();
    const timer = clock.after(Math.min(route.timeoutMs, budgetMs));
    try {
      const out = await Promise.race([
        generateText({
          model: transport.languageModel(route.models[0]!),
          instructions,
          messages,
          output: Output.object({ schema: jsonSchema<unknown>(format) }),
          ...callSettings(route),
          maxRetries: 0, // core retries once; the gateway handles provider failover
          abortSignal: abort.signal,
        }),
        timer.promise.then((): typeof TIMEOUT => TIMEOUT, (): typeof TIMEOUT => TIMEOUT),
      ]);
      if (out === TIMEOUT) {
        abort.abort();
        return failure(fail('timeout'), null);
      }
      const model = out.finalStep.response.modelId;
      if (out.finishReason === 'content-filter') return refusal(model, out.usage, stopCategory(out.finalStep.providerMetadata));
      const parsed = schema.safeParse(out.output); // validated again on return
      return parsed.success ? finish(parsed.data, 'ok', model, out.usage) : failure(fail('invalid_output'), model, out.usage);
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e)) {
        const model = e.response?.modelId ?? null;
        if (e.finishReason === 'content-filter') return refusal(model, e.usage, null);
        return failure(fail('invalid_output'), model, e.usage);
      }
      return failure(fail(abort.signal.aborted ? 'timeout' : 'error'), null);
    } finally {
      timer.cancel();
    }
  }

  return {
    understand: (input, { timeoutMs }) => call('understand', prompts.understand, {
      card: { tool: input.tool, slots: input.slots },
      ask: { locale: input.locale, text: input.text },
    }, intentFrameSchema, timeoutMs),
    // core's repair is compose's one LLM pass over the problems the checks found
    repair: (input, { timeoutMs }) => call('compose', prompts.repair, { ask: input }, repairOutputSchema, timeoutMs),
    usage: () => ({
      tokensIn: calls.reduce((n, c) => n + c.tokensIn, 0),
      tokensOut: calls.reduce((n, c) => n + c.tokensOut, 0),
      costUsd: calls.reduce((n, c) => n + c.costUsd, 0),
      calls: [...calls],
    }),
  };
}
