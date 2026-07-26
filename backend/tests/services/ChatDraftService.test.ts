import { ChatDraftService } from '../../src/services/ChatDraftService';
import { getPlatform } from '../../src/services/PlatformService';
import type { ProviderGenerateResponse } from '../../src/types/Provider';

/** V1.4 — chat-first drafting. Provider injected; no network. */

const platform = getPlatform('midjourney')!;

/** Route canned replies by a marker in the system prompt, like the integration mock. */
function router(chatReply: unknown, criticReply: unknown): jest.Mock {
  return jest.fn(async (step: string): Promise<ProviderGenerateResponse> => {
    const content = step === 'critic' ? criticReply : chatReply;
    return { content: JSON.stringify(content), tokensUsed: { input: 50, output: 40 }, finishReason: 'stop' };
  });
}

const goodCritic = {
  scores: { specificity: 3, unambiguity: 3, non_conflict: 3, platform_fit: 3, constraint_completeness: 3, format_determinacy: 3, context_efficiency: 2, technique_fit: 3 },
  issues: [],
};

describe('ChatDraftService (V1.4)', () => {
  it('returns a follow-up question when the model asks for one', async () => {
    const fn = router({ type: 'question', message: 'What mood do you want?' }, goodCritic);
    const result = await new ChatDraftService(fn as never).draft({
      userId: 'u1',
      platform,
      messages: [{ role: 'user', content: 'make me a poster' }],
    });
    expect(result.type).toBe('question');
    if (result.type === 'question') expect(result.message).toContain('mood');
    // chat_draft step, JSON format
    expect(fn).toHaveBeenCalledWith('chat_draft', 'large', expect.objectContaining({ responseFormat: 'json' }));
  });

  it('produces a scored DesignedResponse when the model emits a draft', async () => {
    const draftReply = {
      type: 'draft',
      message: 'Built you a moody Kyoto poster prompt.',
      task_type: 'text_to_image',
      nodes: [
        { type: 'subject', value: 'a vintage travel poster of Kyoto', rationale: 'names the subject', alternatives: [] },
        { type: 'style_aesthetic', value: 'bold mid-century typography, muted autumn palette', rationale: 'style', alternatives: [] },
      ],
    };
    const fn = router(draftReply, goodCritic);
    const result = await new ChatDraftService(fn as never).draft({
      userId: 'u1',
      platform,
      messages: [{ role: 'user', content: 'a Kyoto autumn travel poster' }],
    });
    expect(result.type).toBe('draft');
    if (result.type === 'draft') {
      expect(result.response.strength?.score).toBeGreaterThan(0);
      expect(result.response.assembled).toContain('Kyoto');
      expect(result.response.nodes.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('includes attachment text in the model context', async () => {
    const fn = router({ type: 'question', message: 'ok?' }, goodCritic);
    await new ChatDraftService(fn as never).draft({
      userId: 'u1',
      platform,
      messages: [{ role: 'user', content: 'use my brand guide' }],
      attachments: [{ name: 'brand.md', mime: 'text/markdown', text: 'Our brand color is teal #0d9488.' }],
    });
    const sentMessages = fn.mock.calls[0][2].messages;
    expect(JSON.stringify(sentMessages)).toContain('teal #0d9488');
    expect(JSON.stringify(sentMessages)).toContain('brand.md');
  });

  it('rejects a request whose last message is not from the user', async () => {
    const fn = router({}, goodCritic);
    await expect(
      new ChatDraftService(fn as never).draft({ userId: 'u1', platform, messages: [{ role: 'assistant', content: 'hi' }] })
    ).rejects.toThrow(/last message must be from the user/);
  });

  it('retries once then fails on malformed output', async () => {
    const fn = jest.fn(async (): Promise<ProviderGenerateResponse> => ({ content: 'not json', tokensUsed: { input: 1, output: 1 }, finishReason: 'stop' }));
    await expect(
      new ChatDraftService(fn as never).draft({ userId: 'u1', platform, messages: [{ role: 'user', content: 'help' }] })
    ).rejects.toThrow(/failed after retries/);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
