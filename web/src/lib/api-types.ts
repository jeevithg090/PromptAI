/**
 * Mirrors backend/src/types — update together.
 * These are the DTOs the UI renders. Hand-copied (never cross-package imports)
 * so the web app stays independent of the backend's internal module structure.
 */

export type NodeType =
  | 'subject' | 'action_behavior' | 'setting_context' | 'style_aesthetic'
  | 'composition_camera' | 'lighting_mood' | 'persona_role' | 'constraints_rules'
  | 'technical_parameters' | 'negative_prompt' | 'output_format';

export type TaskType =
  | 'text_to_image' | 'text_to_video' | 'chat_persona' | 'reasoning_code'
  | 'extraction_classification' | 'long_form_writing';

export type RubricDimension =
  | 'specificity' | 'unambiguity' | 'non_conflict' | 'platform_fit'
  | 'constraint_completeness' | 'format_determinacy' | 'context_efficiency'
  | 'technique_fit';

export type StrengthBand = 'Needs work' | 'Solid' | 'Strong' | 'Excellent';

export interface NodeAlternative {
  value: string;
  rationale: string;
  rank: number;
}

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
  band: StrengthBand;
  dimensions: Array<{
    dimension: RubricDimension;
    label: string;
    score: 1 | 2 | 3;
    weight: number;
  }>;
}

export interface GovernorPresentation {
  tokenCount: number;
  maxPromptTokens: number;
  withinLimit: boolean;
  nearLimit: boolean;
  suggestions: string[];
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

export interface Recommendation {
  model: {
    model_id: string;
    display_name: string;
    provider: string;
    modalities: string[];
    context_window: number;
    cost_tier: number;
    latency_tier: number;
    strengths: string[];
    notes?: string;
  };
  score: number;
  tradeoff: string;
}

export interface Modality {
  id: string;
  label: string;
}

export interface Platform {
  platform_id: string;
  display_name: string;
  modalities: string[];
}

export interface DesignedResponse {
  platformId: string;
  platformName: string;
  taskType: TaskType;
  assembled: string;
  nodes: DesignedNode[];
  strength?: StrengthPresentation;
  whyThisWorks: string[];
  improvementHints: string[];
  governor: GovernorPresentation;
  defaultedNodeTypes: NodeType[];
  refinementCount: number;
}

export interface DraftResponseOk {
  status: 'ok';
  session_id: string;
  final_state: string;
  response: DesignedResponse;
  draft: unknown;
  pipeline_trace: unknown[];
  memory_proposals?: Array<{ id: string; scope: string; statement: string; source: string; status: string }>;
}

export interface DraftResponseClarifying {
  status: 'clarifying';
  session_id: string;
  final_state: 'awaiting_clarification';
  task_type: TaskType;
  questions: ClarifyingQuestion[];
  can_generate_now: boolean;
  pipeline_trace: unknown[];
}

export interface DraftResponseBlocked {
  status: 'blocked';
  reason: string;
  category?: string;
  session_id: string;
}

export interface DraftResponseBudgetExceeded {
  status: 'budget_exceeded';
  message: string;
  used: number;
  budget: number;
}

export interface DraftResponseError {
  status: 'error';
  message: string;
  degraded: boolean;
  session_id: string;
}

export type DraftResponseRateLimited = {
  status: 'rate_limited';
  message: string;
}

export type DraftResponse = DraftResponseOk | DraftResponseClarifying | DraftResponseBlocked | DraftResponseBudgetExceeded | DraftResponseError | DraftResponseRateLimited;

export interface SessionSummary {
  id: string;
  platform_id: string;
  final_state: string;
  strength_score: number | null;
  created_at: string;
}

export interface AgainBody {
  platform_id: string;
  idea: string;
  carried_preferences: Record<string, string>;
  connection_id?: string;
}

export interface PreviewResponse {
  preview: string | null;
  tokens_used?: number;
}

export interface PreviewBody {
  platform_id: string;
  task_type: string;
  known: Record<string, string>;
  session_id?: string;
}

export interface VisualPreviewBody {
  platform_id: string;
  assembled: string;
}

export interface VisualPreviewResponse {
  imageBase64: string;
  mime: string;
  disclaimer: string;
}

export interface LibrarySeedItem {
  id: string;
  title: string;
  description: string;
  platform_id: string;
  idea: string;
  modality: string;
}