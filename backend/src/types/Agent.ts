import type { ClarifyingQuestion, DraftPrompt, PromptNode, RubricEvaluation, TaskType } from './Prompt';
import type { Platform } from './Platform';
import type { SafetyDecision } from './Safety';
import type { GovernorReport } from '../guardrails/TokenGovernor';

/**
 * The standard agent contract — spec §32.2.
 * Every agent implements exactly this interface so agents are swappable and
 * the Supervisor never special-cases any of them.
 */
export interface Agent {
  name: string;
  execute(input: AgentInput): Promise<AgentOutput>;
}

export interface AgentInput {
  context: PipelineContext;
  params: Record<string, unknown>;
}

export interface AgentOutput {
  status: 'success' | 'failure' | 'partial';
  data?: Record<string, unknown>;
  error?: string;
  tokensUsed?: number;
}

/**
 * Everything an agent might need — assembled once by the Context Assembly
 * Layer (§8 L2) and threaded through the pipeline. Mutated only by the
 * Supervisor between steps, never by agents directly.
 */
export interface PipelineContext {
  userId: string;
  sessionId: string;
  projectId?: string;
  platform: Platform;
  userIdea: string;
  taskType?: TaskType;
  entities?: Record<string, string>;
  clarifications?: Record<string, string>;
  pendingQuestions?: ClarifyingQuestion[];
  pkbChunks?: KnowledgeChunk[];
  memory?: MemoryEntry[];
  draftNodes?: PromptNode[];
  evaluation?: RubricEvaluation;
  finalDraft?: DraftPrompt;
  /** Deterministic token/length report — attached by the Supervisor's governance step (§16, T2.10). */
  governorReport?: GovernorReport;
  safety?: SafetyDecision;
  /** User pressed "just generate now" — Supervisor short-circuits clarification (§11.2). */
  justGenerate?: boolean;
  /** BYOK connection id (§9.4, T7.2) — resolved to an API key server-side. */
  connectionId?: string;
  /** Plaintext memory statements carried into drafting (§17.4, T7.3). Max 5, 500 chars each. */
  memories?: string[];
  /** User has opted into anonymous curation (T8.2, §14.4). */
  optedIn?: boolean;
  /** Pipeline mode (F1.1): 'draft' (default) generates from an idea; 'enhance' improves a pasted finished prompt. */
  mode?: 'draft' | 'enhance';
  /** Enhance mode: the platform the imported prompt looks written for (surfaced to the UI, not necessarily the target). */
  platformHint?: string | null;
  /** Enhance mode: the Critic's pre-refinement score of the imported prompt — the "before" baseline for the improvement delta. */
  baselineEvaluation?: RubricEvaluation;
  /** Enhance mode: the untouched imported draft (before the Critic refined it) — the "before" nodes. */
  importedDraft?: DraftPrompt;
}

/** Curation candidate proposed by the CurationAgent (§14.4, T8.2). */
export interface CurationCandidate {
  title: string;
  description: string;
  template: string;
  taskType: TaskType;
  platformId: string;
}

/** PKB / MPKB retrieval unit — spec §6, §10.2, §18. */
export interface KnowledgeChunk {
  id: string;
  kind: 'pkb' | 'mpkb';
  platformId?: string;
  modelFamily?: string;
  content: string;
  sourceUrl: string;
  ingestedAt: string;
  trustScore: number;
  /** Cosine similarity vs. query vector (0–1). Only populated when returned from retrieve(). */
  similarity?: number;
}

/** A single human-readable preference statement — spec §17.1. */
export interface MemoryEntry {
  id: string;
  scope: 'global' | string; // 'global' or a project_id
  statement: string;
  source: 'agent_proposed' | 'user_added';
  status: 'pending_confirmation' | 'active';
}
