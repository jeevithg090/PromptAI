import { describe, expect, it, vi } from 'vitest';
import type { ForgeResponse } from '@promptai/contract';
import { createForgeClient } from '../src/forge.ts';

const DRAFT: ForgeResponse = {
  toolId: 'generic',
  toolName: 'Any AI tool',
  brief: 'Plan my week.',
  assumptions: [],
  unsourced: [],
  coverage: { covered: 1, total: 1 },
  usage: { llmCalls: 1, ms: 10 },
};

describe('forge client', () => {
  it('posts the request as JSON to /v1/forge and returns the parsed draft', async () => {
    const fetchImpl = vi.fn(async () => Response.json(DRAFT));
    const client = createForgeClient('http://localhost:8787', fetchImpl as typeof fetch);
    await expect(client.forge({ text: 'plan my week', hostApp: 'com.apple.Notes' })).resolves.toEqual(DRAFT);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:8787/v1/forge');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ text: 'plan my week', hostApp: 'com.apple.Notes' });
  });

  it('turns an HTTP error, a network error and a malformed draft into readable errors', async () => {
    const status = createForgeClient('http://x', (async () => new Response('', { status: 503 })) as typeof fetch);
    await expect(status.forge({ text: 'hi' })).rejects.toThrow('the server answered 503');
    const offline = createForgeClient('http://x', (async () => Promise.reject(new TypeError('fetch failed'))) as typeof fetch);
    await expect(offline.forge({ text: 'hi' })).rejects.toThrow(/couldn't reach/);
    const junk = createForgeClient('http://x', (async () => Response.json({ brief: 1 })) as typeof fetch);
    await expect(junk.forge({ text: 'hi' })).rejects.toThrow(/cannot read/);
  });
});
