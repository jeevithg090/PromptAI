import type { NodeAlternative, NodeType, RubricDimension, TaskType } from './Prompt';

/**
 * User-facing presentation shape — spec §8 L6, §9.3, §10.5.
 * The output of the Response Design Layer: exactly what the web UI (T4.5/T4.6)
 * and extension render. This contract is fixture-tested so the frontend can
 * build against it before the backend is deployed.
 */
export interface DesignedNode {
  type: NodeType;
  /** Human-friendly label for the node type, e.g. "Lighting / Mood". */
  label: string;
  value: string;
  /** Why this value was chosen — grounded in PKB/MPKB where the drafting model cited it (§10.5). */
  rationale?: string;
  alternatives: NodeAlternative[];
  locked: boolean;
  position: number;
  /** True when "just generate now" filled this with an unconfirmed default (§11.2) — UI flags it. */
  defaulted: boolean;
}

export type StrengthBand = 'Needs work' | 'Solid' | 'Strong' | 'Excellent';

export interface StrengthPresentation {
  score: number; // 0–100
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

export interface DesignedResponse {
  platformId: string;
  platformName: string;
  taskType: TaskType;
  /** The final platform-serialized prompt string, ready to copy/insert. */
  assembled: string;
  nodes: DesignedNode[];
  /** Absent only if the Critic degraded (scoring unavailable) — UI shows "unscored". */
  strength?: StrengthPresentation;
  /** Grounded "why this works" lessons, drawn from the PKB/MPKB the draft was built on (§10.5). */
  whyThisWorks: string[];
  /** The Critic's flagged issues, surfaced as improvement hints. */
  improvementHints: string[];
  governor: GovernorPresentation;
  /** Node types that were assumed via "just generate now" (§11.2). */
  defaultedNodeTypes: NodeType[];
  refinementCount: number;
}
