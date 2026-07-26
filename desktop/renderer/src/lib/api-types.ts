// Mirrors web/src/lib/api-types.ts (which mirrors backend/src/types) — update together.
// Only the DTOs the desktop renderer needs.

export type NodeType =
  | 'subject' | 'action_behavior' | 'setting_context' | 'style_aesthetic'
  | 'composition_camera' | 'lighting_mood' | 'persona_role' | 'constraints_rules'
  | 'technical_parameters' | 'negative_prompt' | 'output_format';

export type RubricDimension =
  | 'specificity' | 'unambiguity' | 'non_conflict' | 'platform_fit'
  | 'constraint_completeness' | 'format_determinacy' | 'context_efficiency' | 'technique_fit';

export interface NodeAlternative { value: string; rationale: string; rank: number; }

export interface DesignedNode {
  type: NodeType;
  label: string;
  value: string;
  rationale?: string;
  alternatives: NodeAlternative[];
  locked: boolean;
  position: number;
  defaulted: boolean;
}

export interface StrengthPresentation {
  score: number;
  band: string;
  dimensions: Array<{ dimension: RubricDimension; label: string; score: 1 | 2 | 3; weight: number }>;
}

export interface DesignedResponse {
  platformId: string;
  platformName: string;
  taskType: string;
  assembled: string;
  nodes: DesignedNode[];
  strength?: StrengthPresentation;
  whyThisWorks: string[];
  improvementHints: string[];
  defaultedNodeTypes: NodeType[];
  refinementCount: number;
}

export interface ClarifyingQuestion {
  id: string;
  text: string;
  type: 'mcq' | 'free_text';
  options?: string[];
  allow_other: boolean;
  maps_to_node: NodeType;
  priority: number;
}

export interface Platform { platform_id: string; display_name: string; modalities: string[]; }

export type DraftResponse =
  | { status: 'ok'; session_id: string; final_state: string; response: DesignedResponse; draft: unknown }
  | { status: 'clarifying'; session_id: string; final_state: string; questions: ClarifyingQuestion[]; can_generate_now: boolean }
  | { status: string; message?: string; reason?: string; session_id?: string };

export interface EnhanceResponse {
  status: 'ok';
  session_id: string;
  original: { nodes: DesignedNode[]; evaluation: { overallStrength: number } | null };
  enhanced: DesignedResponse | null;
  improvement: { before: number; after: number; dimension_deltas: Array<{ dimension: RubricDimension; before: number; after: number }>; note: 'improved' | 'already_strong' };
  platform_hint: string | null;
}
