import { serializeNodes } from '../../src/services/PromptSerializer';
import type { PromptNode } from '../../src/types/Prompt';
import type { Platform } from '../../src/types/Platform';

/** T2.8 serializer tests — §13.3 platform dialects, pure function. */
function platform(id: string): Platform {
  return {
    platform_id: id,
    display_name: id,
    modalities: ['image'],
    url_patterns: [],
    dom_fingerprint_selectors: [],
    input_selector_candidates: [],
    docs_url: 'https://example.com/docs',
    quirks: [],
    syntax_rules: [],
    max_prompt_tokens: 4000,
    tos_reviewed: true,
  };
}

function node(type: PromptNode['type'], value: string, position: number): PromptNode {
  return { type, value, alternatives: [], locked: false, position, defaulted: false };
}

const horseNodes: PromptNode[] = [
  node('subject', 'a chestnut horse', 0),
  node('action_behavior', 'galloping through shallow water', 1),
  node('style_aesthetic', 'photorealistic', 2),
  node('composition_camera', 'wide shot', 3),
  node('lighting_mood', 'golden hour', 4),
  node('technical_parameters', '--ar 16:9', 5),
  node('negative_prompt', 'text, watermark', 6),
];

describe('serializeNodes (§13.3)', () => {
  it('Midjourney: comma-joined tags, --no for negatives, parameters at the very end', () => {
    const out = serializeNodes(horseNodes, platform('midjourney'));
    expect(out).toBe(
      'a chestnut horse, galloping through shallow water, photorealistic, wide shot, golden hour --no text, watermark --ar 16:9'
    );
  });

  it('Stable Diffusion: tag list with a dedicated Negative prompt line', () => {
    const sd = horseNodes.map((n) => (n.type === 'technical_parameters' ? { ...n, value: 'sharp focus' } : n));
    const out = serializeNodes(sd, platform('stability_stable_diffusion'));
    expect(out).toBe(
      'a chestnut horse, galloping through shallow water, photorealistic, wide shot, golden hour, sharp focus\n\nNegative prompt: text, watermark'
    );
  });

  it('conversational platforms: scene sentences, a Requirements block, and an explicit exclusion line', () => {
    const gm = horseNodes.map((n) => (n.type === 'technical_parameters' ? { ...n, value: 'The image must be in 16:9 landscape format' } : n));
    const out = serializeNodes(gm, platform('google_gemini'));
    // Scene nodes are joined as SENTENCES, never comma-fused (the fragment-salad bug).
    expect(out).toContain('a chestnut horse. galloping through shallow water. photorealistic. wide shot. golden hour.');
    // Technical parameters / constraints become an enumerated Requirements block.
    expect(out).toContain('Requirements:\n- The image must be in 16:9 landscape format.');
    expect(out).toContain('Do not include: text, watermark.');
  });

  it('conversational platforms: composes fluent prose, not comma-fused fragments', () => {
    const nodes: PromptNode[] = [
      node('persona_role', 'You are an expert copywriter.', 0),
      node('subject', 'Write a product description for eco-friendly water bottles', 1),
      node('constraints_rules', 'Keep it under 150 words', 2),
      node('output_format', 'Return plain text', 3),
    ];
    const out = serializeNodes(nodes, platform('openai_chatgpt'));
    // No node value should be comma-joined to the next (each ends with sentence punctuation).
    expect(out).toContain('You are an expert copywriter. Write a product description for eco-friendly water bottles.');
    expect(out).toContain('Requirements:\n- Keep it under 150 words.');
    expect(out).toContain('Output format: Return plain text.');
    // The ".," artifact from the old comma-join must never appear.
    expect(out).not.toContain('.,');
  });

  it('orders by node position regardless of array order', () => {
    const shuffled = [...horseNodes].reverse();
    expect(serializeNodes(shuffled, platform('midjourney'))).toBe(serializeNodes(horseNodes, platform('midjourney')));
  });

  it('skips empty-valued nodes', () => {
    const withEmpty = [...horseNodes, node('persona_role', '   ', 7)];
    expect(serializeNodes(withEmpty, platform('midjourney'))).toBe(serializeNodes(horseNodes, platform('midjourney')));
  });
});
