import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rateLimit';
import { requestLogger } from '../middleware/logging';
import { onError } from '../middleware/errorHandler';
import { listPlatforms, getPlatform } from '../services/PlatformService';
import { Supervisor } from '../services/Supervisor';
import { design } from '../services/ResponseDesign';
import { persistSessionMetadata, meterUsage } from '../services/SessionService';
import { checkMonthlyBudget } from '../services/BudgetService';
import {
  savePrompt,
  saveVersion,
  listVersions,
  getVersion,
  restoreVersion,
  diffVersions,
  listPrompts,
  PromptNotFound,
  type SavePromptInput,
} from '../services/PromptService';
import { recommend } from '../services/RecommendationService';
import { analyzeTokenUsage } from '../services/TokenOptimizationAdvisor';
import { getPool } from '../utils/db';
import { logger } from '../utils/logger';
import { config } from '../config/env';
import { MODALITIES, type RecommendationRequest } from '../types/Recommendation';
import { feedbackSchema, type FeedbackBody } from '../types/Feedback';
import { underperformingDimensions } from '../services/OutcomeAnalytics';
import {
  IntentClassificationAgent,
  DocRetrievalAgent,
  ClarifyingQuestionAgent,
  DraftingAgent,
  CriticAgent,
  AlternativesAgent,
} from '../agents';
import type { PipelineContext } from '../types/Agent';
import type { AppEnv } from '../types/Http';

/**
 * All API routes — spec §31.2 Step 9. HTTP entry points only; business logic
 * lives in services (§32.1 dependency flow: handlers → services → agents).
 *
 * Stub routes return { status: 'not_implemented_yet' } with the task id that
 * will implement them, so the API surface is complete from day one.
 */
export function buildApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.onError(onError);
  app.use('*', requestLogger);
  // CORS — spec §23.4 (custom plumbing #3). Origins tighten when web/extension deploy (T4.1/T5.4).
  app.use('*', cors({ origin: (origin) => origin, allowHeaders: ['Authorization', 'Content-Type'] }));

  // ---- Public ----
  app.get('/health', (c) => c.json({ ok: true, service: 'pf-backend' }));

  // Platform Registry read path (§5.1) — will move behind KV edge cache (T5.5).
  app.get('/platforms', (c) => c.json({ platforms: listPlatforms() }));

  // Auth endpoints proxy Supabase Auth (§31.2 Step 7) — clients can also call
  // Supabase directly; these exist so the extension never embeds Supabase keys.
  app.post('/auth/signup', (c) => c.json({ status: 'not_implemented_yet', task: 'T1.4 (needs T1.2 credentials)' }, 501));
  app.post('/auth/login', (c) => c.json({ status: 'not_implemented_yet', task: 'T1.4 (needs T1.2 credentials)' }, 501));

  // ---- Authenticated ----
  const authed = new Hono<AppEnv>();
  authed.use('*', authMiddleware);
  authed.use('*', rateLimitMiddleware);

  authed.get('/projects', (c) => c.json({ status: 'not_implemented_yet', task: 'T1.4/T7.4', projects: [] }, 200));
  authed.post('/projects', (c) => c.json({ status: 'not_implemented_yet', task: 'T1.4/T7.4' }, 501));
  authed.get('/library', (c) => c.json({ status: 'not_implemented_yet', task: 'T4.7', entries: [] }, 200));
  /**
   * Prompt-performance feedback (§29.2, §10.7, T3.5).
   * Anonymized, aggregate-only: NO user_id or session_id written to the row.
   * `detail` is validated (max 500 chars) then dropped — no DB column for it.
   */
  authed.post('/feedback', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid feedback', issues: parsed.error.issues }, 400);
    }
    const fb = parsed.data as FeedbackBody;
    try {
      const pool = getPool();
      // INSERT into outcome_signals — NO user_id, NO session_id (§10.7).
      const rubricJson = fb.rubric_scores ? JSON.stringify(fb.rubric_scores) : null;
      await pool.query(
        `insert into outcome_signals (task_type, platform_id, rubric_scores, edit_count, reused, feedback)
         values ($1, $2, $3, $4, $5, $6)`,
        [fb.task_type, fb.platform_id, rubricJson, fb.edit_count ?? null, fb.reused ?? null, fb.outcome]
      );
      // detail is deliberately dropped — no column (§10.7).
      return c.json({ status: 'ok' });
    } catch (error) {
      logger.warn({ type: 'feedback:save_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'feedback unavailable' }, 503);
    }
  });

  /**
   * Outcome analytics (§29.2, §10.7, T3.5) — aggregate-only query over
   * outcome_signals returning per-dimension worked-vs-failed averages.
   */
  authed.get('/analytics/outcomes', async (c) => {
    try {
      const dims = await underperformingDimensions();
      return c.json({ status: 'ok', dimensions: dims });
    } catch (error) {
      logger.warn({ type: 'analytics_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'analytics unavailable' }, 503);
    }
  });

  // ---- Prompt versioning & history (§29.1, T3.4) ----

  /** Save a new prompt (version 1) + its first prompt_versions row. */
  authed.post('/prompts', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json<Partial<SavePromptInput>>();
    if (!body.platformId || !body.nodes || !body.assembled) {
      return c.json({ error: 'platformId, nodes, and assembled are required' }, 400);
    }
    try {
      const promptId = await savePrompt(userId, body as SavePromptInput);
      return c.json({ status: 'ok', prompt_id: promptId, version: 1 });
    } catch (error) {
      logger.warn({ type: 'prompt:save_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'save unavailable' }, 503);
    }
  });

  /** List the caller's prompts (metadata only). */
  authed.get('/prompts', async (c) => {
    const userId = c.get('userId');
    try {
      const prompts = await listPrompts(userId);
      return c.json({ status: 'ok', prompts });
    } catch (error) {
      logger.warn({ type: 'prompt:list_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'list unavailable' }, 503);
    }
  });

  /** List all versions of a prompt (metadata only, ownership-checked). */
  authed.get('/prompts/:id/versions', async (c) => {
    const userId = c.get('userId');
    const promptId = c.req.param('id');
    try {
      const versions = await listVersions(userId, promptId);
      return c.json({ status: 'ok', versions });
    } catch (error) {
      logger.warn({ type: 'prompt:versions_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'versions unavailable' }, 503);
    }
  });

  /** Get a specific version's full content (ownership-checked, 404 on other users'). */
  authed.get('/prompts/:id/versions/:v', async (c) => {
    const userId = c.get('userId');
    const promptId = c.req.param('id');
    const version = parseInt(c.req.param('v'), 10);
    if (isNaN(version)) {
      return c.json({ error: 'version must be a number' }, 400);
    }
    try {
      const v = await getVersion(userId, promptId, version);
      if (!v) return c.json({ error: 'version not found' }, 404);
      return c.json({ status: 'ok', version: v });
    } catch (error) {
      logger.warn({ type: 'prompt:version_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'version unavailable' }, 503);
    }
  });

  /** Restore an old version by saving its nodes as a NEW version. */
  authed.post('/prompts/:id/restore', async (c) => {
    const userId = c.get('userId');
    const promptId = c.req.param('id');
    const body = await c.req.json<{ version?: number }>();
    if (!body.version) {
      return c.json({ error: 'version is required' }, 400);
    }
    try {
      const newVersion = await restoreVersion(userId, promptId, body.version);
      return c.json({ status: 'ok', prompt_id: promptId, version: newVersion });
    } catch (error) {
      if (error instanceof PromptNotFound) return c.json({ error: 'prompt not found' }, 404);
      logger.warn({ type: 'prompt:restore_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'restore unavailable' }, 503);
    }
  });

  /** Diff two versions by node type (ownership-checked). */
  authed.get('/prompts/:id/diff', async (c) => {
    const userId = c.get('userId');
    const promptId = c.req.param('id');
    const fromV = parseInt(c.req.query('from') ?? '1', 10);
    const toV = parseInt(c.req.query('to') ?? '2', 10);
    if (isNaN(fromV) || isNaN(toV)) {
      return c.json({ error: 'from and to must be numbers' }, 400);
    }
    try {
      const a = await getVersion(userId, promptId, fromV);
      const b = await getVersion(userId, promptId, toV);
      if (!a || !b) return c.json({ error: 'version not found' }, 404);
      const diff = diffVersions(a.nodes_json, b.nodes_json);
      return c.json({ status: 'ok', diff });
    } catch (error) {
      logger.warn({ type: 'prompt:diff_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'diff unavailable' }, 503);
    }
  });

  /**
   * Model & platform recommendation (§15, TA.2). Ranks models for a task and
   * returns the trade-offs — never a single bare winner (§15.2).
   */
  authed.post('/recommend', async (c) => {
    const body = await c.req.json<Partial<RecommendationRequest>>().catch(() => ({}) as Partial<RecommendationRequest>);
    if (!body.modality || !MODALITIES.includes(body.modality)) {
      return c.json({ error: `modality is required, one of: ${MODALITIES.join(', ')}` }, 400);
    }
    const recommendations = recommend(body as RecommendationRequest);
    return c.json({ status: 'ok', recommendations });
  });

  /**
   * Token-reduction advisor (§16, TA.3). Deterministic suggestions for
   * spending fewer tokens for the same result — no LLM.
   */
  authed.post('/optimize', async (c) => {
    type OptimizeBody = { text?: string; platform_id?: string; has_pdf_attachment?: boolean };
    const body = await c.req.json<OptimizeBody>().catch(() => ({}) as OptimizeBody);
    if (!body.text) {
      return c.json({ error: 'text is required' }, 400);
    }
    const platform = body.platform_id ? getPlatform(body.platform_id) : undefined;
    return c.json({ status: 'ok', report: analyzeTokenUsage(body.text, { platform, hasPdfAttachment: body.has_pdf_attachment }) });
  });

  /**
   * Runs the pipeline for a context and shapes the HTTP response — shared by
   * POST /draft (new session) and POST /draft/:sessionId/clarify (resume with
   * answers). Persists session metadata + meters usage best-effort (§18, §19.1).
   */
  async function runPipeline(c: Context<AppEnv>, context: PipelineContext) {
    const supervisor = new Supervisor({
      intent: IntentClassificationAgent,
      docRetrieval: DocRetrievalAgent,
      clarify: ClarifyingQuestionAgent,
      draft: DraftingAgent,
      critic: CriticAgent,
      alternatives: AlternativesAgent,
    });

    // Pre-flight budget check (§16, §22.4, T3.2) — BEFORE any model call.
    if (config.BUDGET_ENFORCEMENT_ENABLED) {
      const budget = await checkMonthlyBudget(context.userId);
      if (!budget.allowed) {
        return c.json(
          {
            status: 'budget_exceeded',
            message: `Monthly token budget reached (${budget.used}/${budget.budget}). Resets on the 1st.`,
            used: budget.used,
            budget: budget.budget,
          },
          429
        );
      }
    }

    const result = await supervisor.run(context);

    // Persist metadata + meter tokens regardless of outcome (best-effort, no content).
    await persistSessionMetadata(result.context, result.finalState);
    await meterUsage(result.context, result.trace);

    if (result.finalState === 'blocked_by_safety') {
      return c.json(
        {
          status: 'blocked',
          reason: 'This request may violate our acceptable-use policy. You can rephrase, or appeal if you believe this is a mistake.',
          category: result.context.safety?.category,
          session_id: context.sessionId,
        },
        422
      );
    }
    if (result.finalState === 'failed') {
      return c.json({
        status: 'error',
        message: 'generation unavailable — please try again',
        degraded: result.context.finalDraft ? true : false,
        session_id: context.sessionId,
      }, 502);
    }

    // Paused for clarification (§11) — hand the questions back to the caller.
    if (result.finalState === 'awaiting_clarification') {
      return c.json({
        status: 'clarifying',
        session_id: context.sessionId,
        final_state: result.finalState,
        task_type: result.context.taskType,
        questions: result.context.pendingQuestions ?? [],
        can_generate_now: true, // caller may resubmit with just_generate to skip (§11.2)
        pipeline_trace: result.trace,
      });
    }

    return c.json({
      status: 'ok',
      session_id: context.sessionId,
      final_state: result.finalState,
      // The user-facing presentation (nodes + score + why-this-works + governance) — §8 L6, T2.10.
      response: design(result.context),
      // Raw draft retained for clients that want the unshaped structure.
      draft: result.context.finalDraft ?? null,
      pipeline_trace: result.trace,
    });
  }

  /**
   * Main drafting endpoint (§31.3 Step 20). Returns either clarifying
   * questions or a finished draft, depending on whether the task needs
   * clarification and whether the user asked to "just generate now".
   */
  authed.post('/draft', async (c) => {
    const body = await c.req.json<{ platform_id?: string; idea?: string; just_generate?: boolean }>();
    if (!body.platform_id || !body.idea) {
      return c.json({ error: 'platform_id and idea are required' }, 400);
    }
    const platform = getPlatform(body.platform_id);
    if (!platform) {
      return c.json({ error: `unknown platform '${body.platform_id}' — see GET /platforms` }, 404);
    }

    const context: PipelineContext = {
      userId: c.get('userId'),
      sessionId: crypto.randomUUID(),
      platform,
      userIdea: body.idea,
      justGenerate: body.just_generate ?? false,
    };
    return runPipeline(c, context);
  });

  /**
   * Resume a clarified session with the user's answers (§11). The server is
   * content-stateless until E2EE (T7.1), so the client re-supplies idea +
   * platform along with the answers; the session_id ties them to the metadata
   * row. Answered questions are skipped on this pass; supports "just generate".
   */
  authed.post('/draft/:sessionId/clarify', async (c) => {
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json<{
      platform_id?: string;
      idea?: string;
      clarifications?: Record<string, string>;
      just_generate?: boolean;
    }>();
    if (!body.platform_id || !body.idea) {
      return c.json({ error: 'platform_id and idea are required (client-supplied while server is content-stateless, pre-E2EE)' }, 400);
    }
    const platform = getPlatform(body.platform_id);
    if (!platform) {
      return c.json({ error: `unknown platform '${body.platform_id}' — see GET /platforms` }, 404);
    }

    const context: PipelineContext = {
      userId: c.get('userId'),
      sessionId, // reuse the same session id so metadata updates in place
      platform,
      userIdea: body.idea,
      clarifications: body.clarifications ?? {},
      justGenerate: body.just_generate ?? false,
    };
    return runPipeline(c, context);
  });
  authed.post('/appeal', (c) => c.json({ status: 'not_implemented_yet', task: 'T2.2/T7.5 (appeals queue)' }, 501));

  /**
   * Per-session observability — reconstruct any session end-to-end from
   * stored data alone (§27.1, §22.3, T3.1). Returns session metadata +
   * audit events + usage events, filtered to the calling user's own data.
   * A user may only trace their own sessions (404, not 403 — don't leak existence).
   */
  authed.get('/sessions/:sessionId/trace', async (c) => {
    const sessionId = c.req.param('sessionId');
    const userId = c.get('userId');
    try {
      const pool = getPool();
      // Ownership check: a user may only trace their own sessions.
      const sessionRes = await pool.query(
        `select id, platform_id, final_state, strength_score, rubric_scores, refinement_count, created_at
         from sessions where id = $1 and user_id = $2`,
        [sessionId, userId]
      );
      if (sessionRes.rows.length === 0) {
        return c.json({ error: 'session not found' }, 404);
      }
      // Audit rows for this session — filtered to this user's actor (§27.1).
      const auditRes = await pool.query(
        `select id, actor, action, status, detail, session_id, created_at
         from audit_log where session_id = $1 and actor = $2 order by created_at`,
        [sessionId, userId]
      );
      // Usage events for this session (token counts only, no content — §19.1).
      const usageRes = await pool.query(
        `select id, pipeline_step, tokens_used, created_at
         from usage_events where session_id = $1 and user_id = $2 order by created_at`,
        [sessionId, userId]
      );
      return c.json({ session: sessionRes.rows[0], events: auditRes.rows, usage: usageRes.rows });
    } catch (error) {
      logger.warn({ type: 'trace:db_error', sessionId, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'trace unavailable' }, 503);
    }
  });

  app.route('/', authed);
  return app;
}
