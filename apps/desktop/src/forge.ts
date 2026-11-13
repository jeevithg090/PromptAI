/** POST /v1/forge (packages/contract/src/forge.ts). */
import { forgeResponseSchema, type ForgeRequest, type ForgeResponse } from '@promptai/contract';

export function createForgeClient(baseUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 30_000) {
  const url = new URL('/v1/forge', baseUrl).toString();
  return {
    async forge(req: ForgeRequest): Promise<ForgeResponse> {
      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(req),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new Error(`couldn't reach the PromptAI server at ${baseUrl}`);
      }
      if (!res.ok) throw new Error(`the server answered ${res.status}`);
      const parsed = forgeResponseSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new Error('the server sent a draft this app cannot read');
      return parsed.data;
    },
  };
}
