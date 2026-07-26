import { api } from './api';
import { estimateTokens } from './tokens';
import type { DesignedNode, DesignedResponse, TaskType } from './api-types';

const NODE_LABELS: Record<string, string> = {
  subject: 'Subject',
  action_behavior: 'Action / Behavior',
  setting_context: 'Setting / Context',
  style_aesthetic: 'Style / Aesthetic',
  composition_camera: 'Composition / Camera',
  lighting_mood: 'Lighting / Mood',
  persona_role: 'Persona / Role',
  constraints_rules: 'Constraints / Rules',
  technical_parameters: 'Technical Parameters',
  negative_prompt: 'Negative Prompt',
  output_format: 'Output Format',
};

/** Normalize partial nodes (from debug/migrate) into full DesignedNodes the editor can render. */
export function normalizeNodes(raw: Array<Partial<DesignedNode> & { type: string; value: string }>): DesignedNode[] {
  return raw.map((n, i) => ({
    type: n.type as DesignedNode['type'],
    label: n.label ?? NODE_LABELS[n.type] ?? n.type.replace(/_/g, ' '),
    value: n.value,
    rationale: n.rationale,
    alternatives: n.alternatives ?? [],
    locked: n.locked ?? false,
    position: n.position ?? i,
    defaulted: n.defaulted ?? false,
  }));
}

/**
 * Build a full DesignedResponse from a bare node set (V2 tools that return
 * nodes but no scored response). Serializes server-side to get the assembled
 * string + governor; strength is left undefined (the editor renders "unscored").
 */
export async function toDesignedResponse(
  platformId: string,
  platformName: string,
  taskType: TaskType,
  rawNodes: Array<Partial<DesignedNode> & { type: string; value: string }>,
): Promise<DesignedResponse> {
  const nodes = normalizeNodes(rawNodes);
  let assembled = nodes.map((n) => n.value).join(', ');
  let governor: DesignedResponse['governor'] | undefined;
  try {
    const res = await api.serialize({ platform_id: platformId, nodes });
    assembled = res.assembled;
    if (res.governor) governor = res.governor as DesignedResponse['governor'];
  } catch {
    // keep the naive join if serialize is unavailable
  }
  return {
    platformId,
    platformName,
    taskType,
    assembled,
    nodes,
    whyThisWorks: [],
    improvementHints: [],
    governor: governor ?? { tokenCount: estimateTokens(assembled), maxPromptTokens: 0, withinLimit: true, nearLimit: false, suggestions: [] },
    defaultedNodeTypes: [],
    refinementCount: 0,
  };
}
