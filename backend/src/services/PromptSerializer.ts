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

/** Conversational platforms (Gemini, ChatGPT, Claude): prose paragraph + explicit constraint/format lines. */
function serializeConversational(nodes: PromptNode[]): string {
  const parts: string[] = [];

  const persona = values(nodes, 'persona_role');
  if (persona.length) parts.push(persona.join(' '));

  const scene = values(nodes, 'subject', 'action_behavior', 'setting_context', 'style_aesthetic', 'composition_camera', 'lighting_mood');
  if (scene.length) parts.push(scene.join(', ') + '.');

  for (const c of values(nodes, 'constraints_rules')) parts.push(c.endsWith('.') ? c : `${c}.`);
  for (const t of values(nodes, 'technical_parameters')) parts.push(t.endsWith('.') ? t : `${t}.`);
  for (const f of values(nodes, 'output_format')) parts.push(f.endsWith('.') ? f : `${f}.`);
  // Conversational models handle negation poorly mid-prose (PKB) — keep it a separate, explicit line.
  const negatives = values(nodes, 'negative_prompt');
  if (negatives.length) parts.push(`Do not include: ${negatives.join(', ')}.`);

  return parts.join(' ').replace(/\s+/g, ' ').trim();
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
