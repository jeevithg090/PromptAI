import { chatRefine } from '../../src/services/ChatRefineService';
import type { Platform } from '../../src/types/Platform';
import type { ProviderGenerateResponse } from '../../src/types/Provider';

/** Conversational refinement — provider is injected, no network. */

const platform = { platform_id: 'midjourney', display_name: 'Midjourney' } as Platform;

const currentNodes = [
  { type: 'subject', value: 'a red bicycle' },
  { type: 'lighting_mood', value: 'soft daylight', locked: true },
];

function gen(content: string): jest.Mock {
  return jest.fn(async (): Promise<ProviderGenerateResponse> => ({
    content,
    tokensUsed: { input: 20, output: 10 },
    finishReason: 'stop',
  }));
}

describe('chatRefine', () => {
  it('returns a follow-up question when the model asks for more info', async () => {
    const fn = gen(JSON.stringify({ type: 'question', message: 'What mood are you going for?' }));
    const result = await chatRefine(
      { platform, taskType: 'text_to_image', currentNodes, messages: [{ role: 'user', content: 'make it moodier' }] },
      fn as never
    );
    expect(result).toEqual({ type: 'question', message: 'What mood are you going for?' });
    expect(fn).toHaveBeenCalledWith('chat_refine', 'large', expect.objectContaining({ responseFormat: 'json' }));
  });

  it('returns an updated node set and re-serializes the assembled prompt', async () => {
    const fn = gen(JSON.stringify({
      type: 'prompt',
      message: 'Made the bicycle rustier.',
      nodes: [
        { type: 'subject', value: 'a rusty crimson bicycle', rationale: 'more evocative', alternatives: [] },
        { type: 'lighting_mood', value: 'soft daylight', rationale: '', alternatives: [] },
      ],
    }));
    const result = await chatRefine(
      { platform, taskType: 'text_to_image', currentNodes, messages: [{ role: 'user', content: 'make the bicycle rustier' }] },
      fn as never
    );
    if (result.type !== 'prompt') throw new Error('expected a prompt result');
    expect(result.message).toBe('Made the bicycle rustier.');
    expect(result.nodes.find((n) => n.type === 'subject')?.value).toBe('a rusty crimson bicycle');
    expect(result.assembled).toContain('a rusty crimson bicycle');
  });

  it('never lets the model change a locked node, even if it tries', async () => {
    const fn = gen(JSON.stringify({
      type: 'prompt',
      message: 'Updated.',
      nodes: [
        { type: 'subject', value: 'a red bicycle', rationale: '', alternatives: [] },
        { type: 'lighting_mood', value: 'dramatic neon glow', rationale: '', alternatives: [] }, // model tried to change a locked node
      ],
    }));
    const result = await chatRefine(
      { platform, taskType: 'text_to_image', currentNodes, messages: [{ role: 'user', content: 'change everything' }] },
      fn as never
    );
    if (result.type !== 'prompt') throw new Error('expected a prompt result');
    const lightingNode = result.nodes.find((n) => n.type === 'lighting_mood');
    expect(lightingNode?.value).toBe('soft daylight'); // unchanged, defense in depth
    expect(lightingNode?.locked).toBe(true);
  });

  it('rejects a request whose last message is not from the user', async () => {
    const fn = gen('{}');
    await expect(
      chatRefine(
        { platform, taskType: 'text_to_image', currentNodes, messages: [{ role: 'assistant', content: 'hi' }] },
        fn as never
      )
    ).rejects.toThrow(/last message must be from the user/);
    expect(fn).not.toHaveBeenCalled();
  });

  it('retries once then fails on malformed output', async () => {
    const fn = gen('not json at all');
    await expect(
      chatRefine(
        { platform, taskType: 'text_to_image', currentNodes, messages: [{ role: 'user', content: 'help' }] },
        fn as never
      )
    ).rejects.toThrow(/failed after retries/);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
