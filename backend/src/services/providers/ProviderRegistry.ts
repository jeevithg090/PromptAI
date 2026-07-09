import type { ProviderAdapter } from '../../types/Provider';
import { OpenCodeZenAdapter } from './OpenCodeZenAdapter';
import { GroqAdapter } from './GroqAdapter';
import { CerebrasAdapter } from './CerebrasAdapter';
import { MockAdapter } from './MockAdapter';

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
};

export function getProvider(name: string): ProviderAdapter {
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(`Unknown provider: ${name}`);
  }
  return adapter;
}
