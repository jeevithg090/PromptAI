import { generatePreview } from '../../src/services/PreviewService';

// The provider layer (generate → fetch) is always mocked in tests (§32.4).
// PreviewService calls generate() which routes to the Groq adapter and
// ultimately global.fetch. We mock fetch to return a valid chat response.
function mockFetchOk(content: string) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 50, completion_tokens: 30 },
    }),
  });
}

function mockFetchError() {
  global.fetch = jest.fn().mockRejectedValue(new Error('provider unreachable'));
}

describe('PreviewService (T6.1)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a preview string on successful generation', async () => {
    mockFetchOk('A horse galloping through a sunset-lit field.');
    const result = await generatePreview(
      { platform_id: 'midjourney', task_type: 'text_to_image', known: { subject: 'horse', style: 'photorealistic' } },
      'user-1',
      'session-1'
    );
    expect(result.preview).toBe('A horse galloping through a sunset-lit field.');
    expect(result.tokensUsed).toBe(30);
  });

  it('returns null preview when provider errors', async () => {
    mockFetchError();
    const result = await generatePreview(
      { platform_id: 'midjourney', task_type: 'text_to_image', known: { subject: 'horse' } },
      'user-1',
      'session-1'
    );
    expect(result.preview).toBeNull();
    expect(result.tokensUsed).toBe(0);
  });

  it('returns null preview on empty response content', async () => {
    mockFetchOk('');
    const result = await generatePreview(
      { platform_id: 'midjourney', task_type: 'text_to_image', known: {} },
      'user-1',
      'session-1'
    );
    expect(result.preview).toBeNull();
  });

  it('handles empty known map gracefully', async () => {
    mockFetchOk('A generic creative output.');
    const result = await generatePreview(
      { platform_id: 'openai_chatgpt', task_type: 'chat_persona', known: {} },
      'user-1',
      'session-1'
    );
    expect(result.preview).toBe('A generic creative output.');
  });
});
