export type OverlayStep =
  | { phase: 'initial' }
  | { phase: 'clarifying'; sessionId: string; questions: ClarifyingQuestion[]; taskType: string }
  | { phase: 'drafting' }
  | { phase: 'result'; sessionId: string; response: DesignedResponse }
  | { phase: 'error'; message: string };

export interface ClarifyingQuestion {
  id: string;
  text: string;
  type: 'mcq' | 'free_text';
  options?: string[];
  allow_other: boolean;
  maps_to_node: string;
  priority: number;
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
  governor: GovernorPresentation;
  defaultedNodeTypes: string[];
  refinementCount: number;
}

export interface DesignedNode {
  type: string;
  label: string;
  value: string;
  rationale?: string;
  alternatives: NodeAlternative[];
  locked: boolean;
  position: number;
  defaulted: boolean;
}

export interface NodeAlternative {
  value: string;
  rationale: string;
  rank: number;
}

export interface StrengthPresentation {
  score: number;
  band: string;
  dimensions: Array<{
    dimension: string;
    label: string;
    score: number;
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
