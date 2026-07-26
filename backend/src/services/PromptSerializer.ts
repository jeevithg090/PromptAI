import type { Platform } from '../types/Platform';
import type { PromptNode } from '../types/Prompt';

/**
 * Platform-aware serialization — spec §13.3.
 * Pure and deterministic: ordered nodes → the final string in the target
 * platform's dialect. Keyword platforms (Midjourney, Stable Diffusion) get
 * comma-joined tags with their native negation mechanism; conversational
 * platforms get flowing prose with constraints/format as explicit sentences.
 * The dialect ships as code because it IS platform syntax (registry
 * syntax_rules document it for humans; PKB chunks teach the drafting model).
 */
function ordered(nodes: PromptNode[]): PromptNode[] {
  return [...nodes].sort((a, b) => a.position - b.position);
}

function values(nodes: PromptNode[], ...types: PromptNode['type'][]): string[] {
  return nodes.filter((n) => types.includes(n.type) && n.value.trim() !== '').map((n) => n.value.trim());
}

function serializeMidjourney(nodes: PromptNode[]): string {
  const body = values(
    nodes,
    'subject', 'action_behavior', 'setting_context', 'style_aesthetic',
    'composition_camera', 'lighting_mood', 'persona_role', 'constraints_rules', 'output_format'
  ).join(', ');
  const params = values(nodes, 'technical_parameters').join(' ');
  const negatives = values(nodes, 'negative_prompt').join(', ');

  let out = body;
  if (negatives) out += ` --no ${negatives}`;
  if (params) out += ` ${params}`;
  return out.trim();
}

function serializeStableDiffusion(nodes: PromptNode[]): string {
  const body = values(
    nodes,
    'subject', 'action_behavior', 'setting_context', 'style_aesthetic',
    'composition_camera', 'lighting_mood', 'technical_parameters'
  ).join(', ');
  const negatives = values(nodes, 'negative_prompt').join(', ');
  return negatives ? `${body}\n\nNegative prompt: ${negatives}` : body;
}

/** Ensure a node value reads as a complete sentence: single-spaced and terminally punctuated. */
function asSentence(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return /[.!?:]$/.test(t) ? t : `${t}.`;
}

/**
 * Conversational platforms (Gemini, ChatGPT, Claude): a role/task paragraph
 * followed by an explicit Requirements bullet list and an Output format line.
 * Node values are complete instructions (the drafting model writes them in the
 * platform's register), so they are joined as SENTENCES — never comma-fused,
 * which used to produce fragment-salad like "…stainless steel, designed to…, The".
 * Sections are blank-line separated so the model reads structure, not a run-on.
 */
function serializeConversational(nodes: PromptNode[]): string {
  const sections: string[] = [];

  // 1. Role + task description as an opening paragraph (each node = one sentence).
  const intro = values(
    nodes,
    'persona_role', 'subject', 'action_behavior', 'setting_context', 'style_aesthetic', 'composition_camera', 'lighting_mood'
  ).map(asSentence);
  if (intro.length) sections.push(intro.join(' '));

  // 2. Constraints + technical parameters as an enumerated Requirements block —
  // models follow explicit bullet rules more reliably than rules buried in prose.
  const requirements = values(nodes, 'constraints_rules', 'technical_parameters').map(asSentence);
  if (requirements.length) {
    sections.push(`Requirements:\n${requirements.map((r) => `- ${r}`).join('\n')}`);
  }

  // 3. Output format as its own directive line.
  const format = values(nodes, 'output_format').map(asSentence);
  if (format.length) sections.push(`Output format: ${format.join(' ')}`);

  // 4. Negatives — conversational models handle negation poorly mid-prose (PKB),
  // so keep it a separate, explicit line.
  const negatives = values(nodes, 'negative_prompt');
  if (negatives.length) sections.push(`Do not include: ${negatives.join(', ')}.`);

  // Collapse runs of spaces/tabs but PRESERVE the newlines that structure the block.
  return sections.join('\n\n').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

export function serializeNodes(nodes: PromptNode[], platform: Platform): string {
  const sorted = ordered(nodes);
  switch (platform.platform_id) {
    case 'midjourney':
      return serializeMidjourney(sorted);
    case 'stability_stable_diffusion':
      return serializeStableDiffusion(sorted);
    default:
      return serializeConversational(sorted);
  }
}
