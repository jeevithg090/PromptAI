import type { Agent, AgentOutput, KnowledgeChunk, PipelineContext } from '../types/Agent';
import type { ClarifyingQuestion, DraftPrompt, RubricEvaluation, TaskType } from '../types/Prompt';
import { ContentSafetyClassifier, classifyOrFailClosed } from '../guardrails/ContentSafetyClassifier';
import { govern } from '../guardrails/TokenGovernor';
import { logger } from '../utils/logger';
import { audit } from './AuditService';
import { checkSessionCap } from './BudgetService';
import { setProgress } from './SessionProgress';
import { PipelineGraph, END, cont, halt, interrupt, type NodeOutcome } from './PipelineGraph';

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

/** Which agent produces the transition INTO each state (draft mode — from a rough idea). */
const STEP_SEQUENCE: Array<{ to: PipelineState; agentKey: string }> = [
  { to: 'intent_classified', agentKey: 'intent' },
  { to: 'docs_retrieved', agentKey: 'docRetrieval' },
  { to: 'clarifying', agentKey: 'clarify' },
  { to: 'drafting', agentKey: 'draft' },
  { to: 'critiqued', agentKey: 'critic' },
  { to: 'alternatives_attached', agentKey: 'alternatives' },
];

/**
 * Enhance mode (F1.1) — improve a FINISHED prompt the user pasted in. No
 * intent classification or clarification: the import agent parses the prompt
 * into nodes (→ 'drafting' state, so safety gate 2 still fires on the result),
 * docs are retrieved for grounding, and the Critic's bounded refine loop does
 * the actual improving. Both safety gates stay intact.
 */
const ENHANCE_SEQUENCE: Array<{ to: PipelineState; agentKey: string }> = [
  { to: 'drafting', agentKey: 'import' },
  { to: 'docs_retrieved', agentKey: 'docRetrieval' },
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

    // Real progress (F2.1) — synchronous, no await, zero added latency.
    if (ctx?.userId && ctx?.sessionId) setProgress(ctx.sessionId, ctx.userId, to);

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
      case 'import':
        // Enhance mode (F1.1): the imported draft becomes the starting point the
        // Critic refines; taskType feeds docRetrieval; platformHint is surfaced.
        // Keep an untouched copy as the "before" for the improvement delta.
        if (data.draft) {
          context.finalDraft = data.draft as DraftPrompt;
          context.importedDraft = data.draft as DraftPrompt;
        }
        if (typeof data.task_type === 'string') context.taskType = data.task_type as TaskType;
        if ('platform_hint' in data) context.platformHint = (data.platform_hint as string | null) ?? null;
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
        // The Critic's pre-refinement score is the enhance "before" baseline (F1.1).
        if (data.initialEvaluation) context.baselineEvaluation = data.initialEvaluation as RubricEvaluation;
        break;
    }
  }

  /**
   * One agent step, as a graph node handler (V1.7). Runs the agent, applies its
   * output, records the transition, then evaluates the step's exit conditions —
   * failure, session-cap runaway, the clarification interrupt, and safety gate 2 —
   * returning the outcome the graph runtime routes on. Behavior is identical to
   * the previous inline for-loop body.
   */
  private async runStep(step: { to: PipelineState; agentKey: string }, context: PipelineContext): Promise<NodeOutcome> {
    // "Just generate now" skips the clarifying step entirely (§10.6, §11.2).
    if (step.agentKey === 'clarify' && context.justGenerate) return cont();
    // A resumed session carries its task type and entities; re-classifying could change the questions.
    if (step.agentKey === 'intent' && context.taskType) return cont();

    const agent = this.agents[step.agentKey];
    if (!agent) {
      this.transition('failed', step.agentKey, 'failure', 0, 0, context);
      return halt(`No agent registered for step '${step.agentKey}'`);
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
      return halt(output.error);
    }

    this.applyOutput(step.agentKey, output, context);
    this.transition(step.to, agent.name, output.status, durationMs, output.tokensUsed ?? 0, context);

    // ---- Runaway protection (§22.4, T3.2) — halt if session token cap exceeded ----
    const capCheck = checkSessionCap(this.trace);
    if (capCheck.exceeded) {
      logger.error({ type: 'budget:runaway_halted', sessionId: context.sessionId, used: capCheck.used });
      this.transition('failed', 'BudgetService', 'failure', 0, 0, context);
      return halt('session token cap exceeded');
    }

    // ---- Pause for clarification (§11) — a first-class graph interrupt (V1.7) ----
    // If the Clarifying agent surfaced questions and the user hasn't opted to
    // "just generate now", suspend here and hand the questions back. The caller
    // resumes via /draft/:sessionId/clarify with answers merged into
    // context.clarifications; on resume the pipeline re-runs and answered
    // questions are skipped (or the remaining ones are asked).
    if (step.agentKey === 'clarify' && !context.justGenerate && (context.pendingQuestions?.length ?? 0) > 0) {
      this.transition('awaiting_clarification', 'Supervisor', 'success', 0, 0, context);
      return interrupt('awaiting_clarification');
    }

    // ---- Safety gate 2: post-generation, before the user ever sees it (§33.3) ----
    if (step.to === 'drafting' && context.finalDraft) {
      const postFlight = await classifyOrFailClosed(this.safety, context.finalDraft.assembled, context);
      if (!postFlight.safe) {
        context.safety = postFlight;
        this.transition('blocked_by_safety', 'ContentSafetyClassifier', 'failure', 0, 0, context);
        return halt(postFlight.reason);
      }
    }

    return cont();
  }

  /**
   * Declare the pipeline as an explicit graph (V1.7): safety pre-flight →
   * agent steps (with the clarify interrupt and safety gate 2 as node exits) →
   * governance → END. Topology is the same for draft and enhance modes, only
   * the step nodes differ. See docs/orchestration-review.md.
   */
  private buildGraph(sequence: Array<{ to: PipelineState; agentKey: string }>): PipelineGraph<PipelineContext> {
    const g = new PipelineGraph<PipelineContext>();
    const stepNode = (i: number) => `step:${i}:${sequence[i]!.agentKey}`;
    const firstNode = sequence.length ? stepNode(0) : 'governance';

    g.addNode('context_resolved', (ctx) => {
      this.transition('context_resolved', 'ContextAgent(rule-based)', 'success', 0, 0, ctx);
      return cont();
    });
    g.setEntry('context_resolved');
    g.addEdge('context_resolved', 'safety_pre');

    // ---- Safety gate 1: pre-flight on the user's idea + clarifications (§33.3) ----
    g.addNode('safety_pre', async (ctx) => {
      const preFlightText = [ctx.userIdea, ...Object.values(ctx.clarifications ?? {})].join('\n');
      const preFlight = await classifyOrFailClosed(this.safety, preFlightText, ctx);
      ctx.safety = preFlight;
      if (!preFlight.safe) {
        this.transition('blocked_by_safety', 'ContentSafetyClassifier', 'failure', 0, 0, ctx);
        return halt(preFlight.reason);
      }
      return cont();
    });
    g.addEdge('safety_pre', firstNode);

    sequence.forEach((step, i) => {
      g.addNode(stepNode(i), (ctx) => this.runStep(step, ctx));
      g.addEdge(stepNode(i), i + 1 < sequence.length ? stepNode(i + 1) : 'governance');
    });

    // Governance is deterministic utility code, not an agent (§7.1, §16).
    g.addNode('governance', (ctx) => {
      if (ctx.finalDraft) ctx.governorReport = govern(ctx.finalDraft.assembled, ctx.platform);
      this.transition('governed', 'TokenGovernor(deterministic)', 'success', 0, 0, ctx);
      this.transition('ready_for_review', 'Supervisor', 'success', 0, 0, ctx);
      return cont();
    });
    g.addEdge('governance', END);

    return g;
  }

  /**
   * Run the pipeline for one session.
   * `justGenerate` in context short-circuits the clarifying step (§11.2).
   */
  async run(context: PipelineContext): Promise<SupervisorResult> {
    const sequence = context.mode === 'enhance' ? ENHANCE_SEQUENCE : STEP_SEQUENCE;
    const result = await this.buildGraph(sequence).run(context);

    // The node handlers own this.state/this.trace via transition(); the graph's
    // halt reason (if any) becomes the blockedReason. Interrupts (clarification)
    // and normal completion carry no blockedReason — matching the prior contract.
    const blockedReason = result.halted?.kind === 'halt' ? result.halted.reason : undefined;
    return { finalState: this.state, context, trace: this.trace, blockedReason };
  }
}
