import { redraftNode, NodeLocked, NodeNotFound } from '../../src/services/NodeRedraftService';
import type { Platform } from '../../src/types/Platform';
import type { ProviderGenerateResponse } from '../../src/types/Provider';

/** Single-node re-draft (§10.6, T4.5). Provider is injected — no network. */

const platform = { platform_id: 'midjourney', display_name: 'Midjourney' } as Platform;

const nodes = [
  { type: 'subject', value: 'a red bicycle' },
  { type: 'style_aesthetic', value: 'flat vector art' },
  { type: 'lighting_mood', value: 'soft daylight', locked: true },
];

function gen(content: string): jest.Mock {
  return jest.fn(async (): Promise<ProviderGenerateResponse> => ({
    content,
    tokensUsed: { input: 20, output: 10 },
    finishReason: 'stop',
  }));
}

describe('redraftNode (T4.5)', () => {
  it('regenerates the target node from injected provider output', async () => {
    const fn = gen(JSON.stringify({
      value: 'a crimson racing bicycle',
      rationale: 'more specific subject',
      alternatives: [{ value: 'a rusty vintage bicycle', rationale: 'different mood', rank: 1 }],
    }));
    const result = await redraftNode(
      { platform, taskType: 'text_to_image', nodes, targetNodeType: 'subject', instruction: 'make it more specific' },
      fn as never
    );
    expect(result.value).toBe('a crimson racing bicycle');
    expect(result.alternatives).toHaveLength(1);
    // small tier, JSON format
    expect(fn).toHaveBeenCalledWith('drafting', 'small', expect.objectContaining({ responseFormat: 'json' }));
    // the other nodes are handed over as fixed context, the target is the one asked for
    const request = fn.mock.calls[0][2]; // (pipelineStep, complexity, request)
    expect(request.systemPrompt).toContain('subject');
    expect(request.messages[0].content).toContain('flat vector art');
  });

  it('refuses a locked target node with NodeLocked', async () => {
    const fn = gen('{}');
    await expect(
      redraftNode({ platform, taskType: 'text_to_image', nodes, targetNodeType: 'lighting_mood' }, fn as never)
    ).rejects.toBeInstanceOf(NodeLocked);
    expect(fn).not.toHaveBeenCalled(); // no model call for a locked node
  });

  it('throws NodeNotFound when the target type is absent', async () => {
    const fn = gen('{}');
    await expect(
      redraftNode({ platform, taskType: 'text_to_image', nodes, targetNodeType: 'output_format' }, fn as never)
    ).rejects.toBeInstanceOf(NodeNotFound);
  });

  it('retries once then fails on malformed output', async () => {
    const fn = gen('not json at all');
    await expect(
      redraftNode({ platform, taskType: 'text_to_image', nodes, targetNodeType: 'subject' }, fn as never)
    ).rejects.toThrow(/failed after retries/);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
