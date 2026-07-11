import type { ProviderAdapter } from '../../types/Provider';
import { OpenCodeZenAdapter } from './OpenCodeZenAdapter';
import { GroqAdapter } from './GroqAdapter';
import { CerebrasAdapter } from './CerebrasAdapter';
import { MockAdapter } from './MockAdapter';
import { OpenAIAdapter } from './OpenAIAdapter';
import { GoogleChatAdapter } from './GoogleChatAdapter';
import { isEnabled } from '../../services/FeatureFlags';

/**
 * Maps a routing table's `provider` name to a concrete adapter instance.
 * Adding a provider = one line here + one adapter class; nothing else in
 * the pipeline changes (§9.1, §32.2).
 */
const adapters: Record<string, ProviderAdapter> = {
  groq: new GroqAdapter(),
  cerebras: new CerebrasAdapter(),
  opencode_zen: new OpenCodeZenAdapter(),
  mock: new MockAdapter(),
  openai: new OpenAIAdapter(),
  google: new GoogleChatAdapter(),
};

export async function getProvider(name: string): Promise<ProviderAdapter> {
  // Kill-switch check (§21.2, T7.5): admin can disable any provider via feature_flags.
  const flagKey = `provider_${name}_enabled`;
  const enabled = await isEnabled(flagKey);
  if (!enabled) {
    throw new Error(`Provider '${name}' is currently disabled (admin kill-switch).`);
  }
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(`Unknown provider: ${name}`);
  }
  return adapter;
}
