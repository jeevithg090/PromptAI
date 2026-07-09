import { normalizeRawNodes, draftResponseSchema } from '../../src/agents/draftShared';
import type { PromptNode } from '../../src/types/Prompt';

/**
 * Live-observed on Groq/Llama-3.3-70b: the model reliably omits the "type"
 * key on every node despite explicit instructions and a few-shot example.
 * These tests lock in the positional-fallback fix.
 */
describe('normalizeRawNodes', () => {
  const order: PromptNode['type'][] = ['subject', 'action_behavior', 'style_aesthetic'];

  it('fills in missing type positionally from requiredOrder', () => {
    const raw = {
      nodes: [
        { value: 'a horse', alternatives: [] },
        { value: 'running', alternatives: [] },
        { value: 'photorealistic', alternatives: [] },
      ],
    };
    const result = normalizeRawNodes(raw, order) as { nodes: Array<{ type: string }> };
    expect(result.nodes.map((n) => n.type)).toEqual(order);
  });

  it('leaves a valid explicit type untouched even if it differs from position', () => {
    const raw = { nodes: [{ type: 'style_aesthetic', value: 'x', alternatives: [] }] };
    const result = normalizeRawNodes(raw, order) as { nodes: Array<{ type: string }> };
    expect(result.nodes[0]?.type).toBe('style_aesthetic'); // not overwritten to 'subject'
  });

  it('replaces an invalid (hallucinated) type positionally', () => {
    const raw = { nodes: [{ type: 'not_a_real_type', value: 'x', alternatives: [] }] };
    const result = normalizeRawNodes(raw, order) as { nodes: Array<{ type: string }> };
    expect(result.nodes[0]?.type).toBe('subject');
  });

  it('falls back to the last required type when the model returns more nodes than required_nodes has slots', () => {
    const raw = { nodes: [{ value: 'a' }, { value: 'b' }, { value: 'c' }, { value: 'd' }] };
    const result = normalizeRawNodes(raw, order) as { nodes: Array<{ type: string }> };
    expect(result.nodes.map((n) => n.type)).toEqual(['subject', 'action_behavior', 'style_aesthetic', 'style_aesthetic']);
  });

  it('is a no-op on malformed input (schema validation catches it downstream)', () => {
    expect(normalizeRawNodes(null, order)).toBeNull();
    expect(normalizeRawNodes({ notNodes: [] }, order)).toEqual({ notNodes: [] });
  });

  it('end-to-end: normalized output satisfies draftResponseSchema', () => {
    const raw = { nodes: [{ value: 'a horse', rationale: 'x', alternatives: [] }] };
    expect(() => draftResponseSchema.parse(normalizeRawNodes(raw, order))).not.toThrow();
  });

  it('drops nodes with an empty-string value — treated as an intentional omission, not a schema violation', () => {
    const raw = {
      nodes: [
        { type: 'subject', value: 'a horse', alternatives: [] },
        { type: 'style_aesthetic', value: '   ', alternatives: [] }, // whitespace-only
        { type: 'action_behavior', value: '', alternatives: [] },
      ],
    };
    const result = normalizeRawNodes(raw, order) as { nodes: Array<{ type: string }> };
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.type).toBe('subject');
  });

  it('end-to-end: an empty-valued node (e.g. unused negative_prompt) no longer breaks validation', () => {
    const raw = {
      nodes: [
        { type: 'subject', value: 'a horse', rationale: 'x', alternatives: [] },
        { type: 'action_behavior', value: '', rationale: 'nothing to exclude', alternatives: [] },
      ],
    };
    const parsed = draftResponseSchema.parse(normalizeRawNodes(raw, order));
    expect(parsed.nodes).toHaveLength(1);
  });
});
