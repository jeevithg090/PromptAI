import type { Agent, AgentOutput, KnowledgeChunk, PipelineContext } from '../types/Agent';
import type { ClarifyingQuestion, DraftPrompt, RubricEvaluation, TaskType } from '../types/Prompt';
import { ContentSafetyClassifier, classifyOrFailClosed } from '../guardrails/ContentSafetyClassifier';
import { govern } from '../guardrails/TokenGovernor';
import { logger } from '../utils/logger';
import { audit } from './AuditService';
import { checkSessionCap } from './BudgetService';

/**
 * Supervisor/Planner — spec §7.2, §31.3 Step 11.
 * Owns the pipeline state machine, decides which agent runs next, logs every
 * transition, and enforces the safety gates (§33.3: before drafting and
 * after drafting). Agents are looked up from a registry — the Supervisor has
 * no knowledge of any agent's internals (§32.2).
 */
export const PIPELINE_STATES = [
  'created',
  'context_resolved',
  'intent_classified',
  'docs_retrieved',
  'clarifying',
  'awaiting_clarification',
  'drafting',
  'critiqued',
  'alternatives_attached',
  'governed',
  'ready_for_review',
  'blocked_by_safety',
  'failed',
] as const;
export type PipelineState = (typeof PIPELINE_STATES)[number];

/** Which agent produces the transition INTO each state. */
const STEP_SEQUENCE: Array<{ to: PipelineState; agentKey: string }> = [
  { to: 'intent_classified', agentKey: 'intent' },
  { to: 'docs_retrieved', agentKey: 'docRetrieval' },
  { to: 'clarifying', agentKey: 'clarify' },
  { to: 'drafting', agentKey: 'draft' },
  { to: 'critiqued', agentKey: 'critic' },
  { to: 'alternatives_attached', agentKey: 'alternatives' },
];

export interface TransitionRecord {
  from: PipelineState;
  to: PipelineState;
  agent: string;
  status: AgentOutput['status'];
  durationMs: number;
  tokensUsed: number;
}

export interface SupervisorResult {
  finalState: PipelineState;
  context: PipelineContext;
  trace: TransitionRecord[];
  blockedReason?: string;
}

export class Supervisor {
  private state: PipelineState = 'created';
  private readonly trace: TransitionRecord[] = [];

  constructor(
    private readonly agents: Record<string, Agent>,
    private readonly safety: ContentSafetyClassifier = new ContentSafetyClassifier()
  ) {}

  private transition(to: PipelineState, agent: string, status: AgentOutput['status'], durationMs: number, tokensUsed = 0, ctx?: PipelineContext): void {
    const record: TransitionRecord = { from: this.state, to, agent, status, durationMs, tokensUsed };
    this.trace.push(record);
    // Trace metadata only — never prompt content (§19.1).
    logger.info({
      type: 'pipeline:transition',
      sessionId: ctx?.sessionId,
      userId: ctx?.userId,
      ...record,
    });
    this.state = to;

    // Immutable audit log (§27.1, T3.1) — fire-and-forget, never blocks the pipeline.
    if (ctx?.userId) {
      void audit({
        actor: ctx.userId,
        action: 'pipeline:transition',
        status: status === 'failure' ? 'failure' : 'success',
        sessionId: ctx.sessionId,
        detail: { from: record.from, to: record.to, agent: record.agent, durationMs: record.durationMs, tokensUsed: record.tokensUsed },
      });
    }
  }

  /**
   * Merge a successful agent's output into the pipeline context.
   * Context is mutated only here, never by agents directly (types/Agent.ts
   * contract) — each step writes only its own well-known fields.
   */
  private applyOutput(agentKey: string, output: AgentOutput, context: PipelineContext): void {
    const data = output.data;
    if (!data) return;
    switch (agentKey) {
      case 'intent':
        if (typeof data.task_type === 'string') context.taskType = data.task_type as TaskType;
        if (data.entities && typeof data.entities === 'object') context.entities = data.entities as Record<string, string>;
        break;
      case 'docRetrieval':
        if (Array.isArray(data.chunks)) context.pkbChunks = data.chunks as KnowledgeChunk[];
        break;
      case 'clarify':
        if (Array.isArray(data.questions)) context.pendingQuestions = data.questions as ClarifyingQuestion[];
        break;
      case 'draft':
      case 'critic':
      case 'alternatives':
        if (data.draft) context.finalDraft = data.draft as DraftPrompt;
        if (data.evaluation) context.evaluation = data.evaluation as RubricEvaluation;
        break;
    }
  }

  /**
   * Run the pipeline for one session.
   * `justGenerate` in context short-circuits the clarifying step (§11.2).
   */
  async run(context: PipelineContext): Promise<SupervisorResult> {
    this.transition('context_resolved', 'ContextAgent(rule-based)', 'success', 0, 0, context);

    // ---- Safety gate 1: pre-flight on the user's idea + clarifications (§33.3) ----
    const preFlightText = [context.userIdea, ...Object.values(context.clarifications ?? {})].join('\n');
    const preFlight = await classifyOrFailClosed(this.safety, preFlightText, context);
    context.safety = preFlight;
    if (!preFlight.safe) {
      this.transition('blocked_by_safety', 'ContentSafetyClassifier', 'failure', 0, 0, context);
      return { finalState: this.state, context, trace: this.trace, blockedReason: preFlight.reason };
    }

    for (const step of STEP_SEQUENCE) {
      // "Just generate now" skips the clarifying step entirely (§10.6, §11.2).
      if (step.agentKey === 'clarify' && context.justGenerate) continue;

      const agent = this.agents[step.agentKey];
      if (!agent) {
        this.transition('failed', step.agentKey, 'failure', 0, 0, context);
        return { finalState: this.state, context, trace: this.trace, blockedReason: `No agent registered for step '${step.agentKey}'` };
      }

      const started = Date.now();
      let output: AgentOutput;
      try {
        output = await agent.execute({ context, params: {} });
      } catch (error) {
        // Agents shouldn't throw (§32.5) — but if one does, fail the pipeline cleanly.
        logger.error({
          type: 'agent:uncaught_error',
          agent: agent.name,
          sessionId: context.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        output = { status: 'failure', error: 'internal agent error' };
      }
      const durationMs = Date.now() - started;

      if (output.status === 'failure') {
        this.transition('failed', agent.name, 'failure', durationMs, output.tokensUsed ?? 0, context);
        return { finalState: this.state, context, trace: this.trace, blockedReason: output.error };
      }

      this.applyOutput(step.agentKey, output, context);
      this.transition(step.to, agent.name, output.status, durationMs, output.tokensUsed ?? 0, context);

      // ---- Runaway protection (§22.4, T3.2) — halt if session token cap exceeded ----
      const capCheck = checkSessionCap(this.trace);
      if (capCheck.exceeded) {
        logger.error({ type: 'budget:runaway_halted', sessionId: context.sessionId, used: capCheck.used });
        this.transition('failed', 'BudgetService', 'failure', 0, 0, context);
        return { finalState: this.state, context, trace: this.trace, blockedReason: 'session token cap exceeded' };
      }

      // ---- Pause for clarification (§11) ----
      // If the Clarifying agent surfaced questions and the user hasn't opted
      // to "just generate now", stop here and hand the questions back. The
      // caller resumes via /draft/:sessionId/clarify with answers merged into
      // context.clarifications; on resume, answered questions are skipped and
      // the pipeline continues (or asks the remaining ones).
      if (step.agentKey === 'clarify' && !context.justGenerate && (context.pendingQuestions?.length ?? 0) > 0) {
        this.transition('awaiting_clarification', 'Supervisor', 'success', 0, 0, context);
        return { finalState: this.state, context, trace: this.trace };
      }

      // ---- Safety gate 2: post-generation, before the user ever sees it (§33.3) ----
      if (step.to === 'drafting' && context.finalDraft) {
        const postFlight = await classifyOrFailClosed(this.safety, context.finalDraft.assembled, context);
        if (!postFlight.safe) {
          context.safety = postFlight;
          this.transition('blocked_by_safety', 'ContentSafetyClassifier', 'failure', 0, 0, context);
          return { finalState: this.state, context, trace: this.trace, blockedReason: postFlight.reason };
        }
      }
    }

    // Governance is deterministic utility code, not an agent (§7.1, §16).
    // Runs the real Token & Context Governor over the assembled prompt and
    // attaches its report to the context for the Response Design layer (T2.10).
    if (context.finalDraft) {
      context.governorReport = govern(context.finalDraft.assembled, context.platform);
    }
    this.transition('governed', 'TokenGovernor(deterministic)', 'success', 0, 0, context);
    this.transition('ready_for_review', 'Supervisor', 'success', 0, 0, context);

    return { finalState: this.state, context, trace: this.trace };
  }
}
