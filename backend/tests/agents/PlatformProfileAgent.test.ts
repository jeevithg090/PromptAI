import { PlatformProfileAgent } from '../../src/agents/PlatformProfileAgent';
import type { ProviderGenerateResponse } from '../../src/types/Provider';

/** V1.1 — docs text → platform profile. Provider injected, no network. */

const pages = [
  { url: 'https://docs.acme.ai/prompting', text: 'Acme AI generates videos from text. Keep prompts under 500 words. Describe camera moves explicitly.' },
  { url: 'https://docs.acme.ai/models', text: 'Acme Turbo is fast; Acme Pro is high quality.' },
];

const goodProfile = {
  display_name: 'Acme AI',
  modalities: ['video'],
  syntax_rules: ['Describe camera moves explicitly', 'Keep prompts under 500 words'],
  quirks: ['Ignores negative phrasing'],
  max_prompt_tokens: 700,
  example_prompts: ['A drone shot over a canyon at sunrise'],
  modes: [{ mode_id: 'turbo', name: 'Acme Turbo', best_for: ['speed'], avoid_for: [], notes: 'Fast drafts.' }],
  chunks: [
    { content: 'Describe camera moves explicitly for reliable motion in Acme AI.', source_url: 'https://docs.acme.ai/prompting' },
    { content: 'Acme prompts should stay under 500 words for best adherence.', source_url: 'https://docs.acme.ai/prompting' },
    { content: 'Acme Pro trades speed for quality; use it for final renders.', source_url: 'https://docs.acme.ai/models' },
  ],
};

function gen(content: string): jest.Mock {
  return jest.fn(async (): Promise<ProviderGenerateResponse> => ({
    content,
    tokensUsed: { input: 100, output: 80 },
    finishReason: 'stop',
  }));
}

describe('PlatformProfileAgent (V1.1)', () => {
  it('produces a custom platform + chunks from docs text', async () => {
    const fn = gen(JSON.stringify(goodProfile));
    const agent = new PlatformProfileAgent(fn as never);
    const result = await agent.profile(pages);
    expect(result.platform.platform_id).toBe('custom:acme-ai');
    expect(result.platform.display_name).toBe('Acme AI');
    expect(result.platform.modalities).toEqual(['video']);
    expect(result.platform.docs_url).toBe(pages[0]!.url);
    expect(result.chunks.length).toBe(3);
    expect(result.chunks.every((c) => c.kind === 'pkb' && c.platformId === 'custom:acme-ai')).toBe(true);
    expect(fn).toHaveBeenCalledWith('platform_profile', 'large', expect.objectContaining({ responseFormat: 'json' }));
  });

  it('replaces hallucinated chunk source URLs with the fetched seed URL', async () => {
    const withBadUrl = { ...goodProfile, chunks: [...goodProfile.chunks.slice(0, 2), { content: 'A lesson that claims a made-up source page.', source_url: 'https://totally-invented.example/nope' }] };
    const agent = new PlatformProfileAgent(gen(JSON.stringify(withBadUrl)) as never);
    const result = await agent.profile(pages);
    expect(result.chunks[2]!.sourceUrl).toBe(pages[0]!.url);
  });

  it('uses the user name hint for the platform id', async () => {
    const agent = new PlatformProfileAgent(gen(JSON.stringify(goodProfile)) as never);
    const result = await agent.profile(pages, 'My Video Tool');
    expect(result.platform.platform_id).toBe('custom:my-video-tool');
  });

  it('retries once then fails honestly on malformed output', async () => {
    const fn = gen('this is not json');
    const agent = new PlatformProfileAgent(fn as never);
    await expect(agent.profile(pages)).rejects.toThrow(/failed after retries/);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
