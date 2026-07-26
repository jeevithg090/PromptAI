/**
 * A/B prompt comparison via BYOK (F2.5). Runs two prompt variants through the
 * user's OWN connected provider (their key, their cost) and returns both
 * outputs side by side. Outputs are EPHEMERAL — never persisted, never logged
 * (§19.1). Used to let a user prove an enhancement is actually better.
 */
import { OpenAIAdapter } from './providers/OpenAIAdapter';
import { GoogleChatAdapter } from './providers/GoogleChatAdapter';
import type { ProviderAdapter } from '../types/Provider';

export interface CompareOutput {
  output: string;
  latency_ms: number;
  tokens?: number;
}

// Sensible cheap default model per BYOK provider (the user can't pick a model
// in v1 — this is a quick "does it work better" check, not a full playground).
const DEFAULT_MODEL: Record<string, string> = {
  openai: 'gpt-4o-mini',
  google: 'gemini-1.5-flash',
};

function adapterFor(provider: string): ProviderAdapter {
  if (provider === 'openai') return new OpenAIAdapter();
  if (provider === 'google') return new GoogleChatAdapter();
  throw new Error(`unsupported provider '${provider}'`);
}

async function runOne(provider: string, apiKey: string, prompt: string): Promise<CompareOutput> {
  const adapter = adapterFor(provider);
  const model = DEFAULT_MODEL[provider] ?? 'gpt-4o-mini';
  const started = Date.now();
  const res = await adapter.generate({
    model,
    apiKeyOverride: apiKey,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 800,
    temperature: 0.7,
  });
  return {
    output: res.content,
    latency_ms: Date.now() - started,
    tokens: res.tokensUsed.input + res.tokensUsed.output,
  };
}

/** Run both prompts concurrently through the user's provider. 30s overall cap. */
export async function compare(
  provider: string,
  apiKey: string,
  promptA: string,
  promptB: string
): Promise<{ a: CompareOutput; b: CompareOutput }> {
  const withTimeout = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('comparison timed out')), 30_000)),
    ]);

  const [a, b] = await Promise.all([
    withTimeout(runOne(provider, apiKey, promptA)),
    withTimeout(runOne(provider, apiKey, promptB)),
  ]);
  return { a, b };
}
