import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
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
import { recommend, loadCapabilityMatrix } from '../services/RecommendationService';
import { analyzeTokenUsage } from '../services/TokenOptimizationAdvisor';
import { redraftNode, NodeLocked, NodeNotFound } from '../services/NodeRedraftService';
import { getDemoExample, listDemoExamples } from '../services/DemoService';
import { getPool } from '../utils/db';
import { logger } from '../utils/logger';
import { config } from '../config/env';
import { MODALITIES, type RecommendationRequest } from '../types/Recommendation';
import { feedbackSchema, type FeedbackBody } from '../types/Feedback';
import { underperformingDimensions } from '../services/OutcomeAnalytics';
import { analyzeImprovements } from '../services/ContinuousImprovement';
import {
  IntentClassificationAgent,
  DocRetrievalAgent,
  ClarifyingQuestionAgent,
  DraftingAgent,
  CriticAgent,
  AlternativesAgent,
  MemoryExtractionAgent,
  IntentClassificationAgentClass,
  DraftingAgentClass,
  CriticAgentClass,
  AlternativesAgentClass,
} from '../agents';
import type { PipelineContext, MemoryEntry } from '../types/Agent';
import { generate } from '../services/providers';
import { type AppEnv, draftBodySchema, clarifyBodySchema, againBodySchema, serializeBodySchema, redraftNodeBodySchema, fanoutBodySchema, demoDraftBodySchema, previewBodySchema, previewVisualBodySchema, platformRequestBodySchema, createTeamBodySchema, addTeamMemberBodySchema } from '../types/Http';
import { generatePreview } from '../services/PreviewService';
import { GeminiImageAdapter } from '../services/providers/GeminiImageAdapter';
import { getProvider } from '../services/providers/ProviderRegistry';
import { storeKey, resolveKey, revokeKey } from '../services/KeyCustody';
import { getEntitlements, checkGate, getPlanConfig } from '../services/PlanService';

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
  // Security response headers (§27, T3.8) — HSTS, X-Content-Type-Options,
  // frame-deny, referrer policy, etc. Cheap defense-in-depth for an API.
  app.use('*', secureHeaders());
  // Body-size cap (§27 DoS, T3.8) — reject bodies over 100KB with 413 before
  // parsing. Our largest legitimate body (draft idea) is ~10KB.
  app.use(
    '*',
    bodyLimit({ maxSize: 100 * 1024, onError: (c) => c.json({ error: 'request body too large (max 100KB)' }, 413) })
  );
  // CORS — spec §23.4, T4.1/T5.4. Allowlisted origins or reflect matching ones.
  const allowedOrigins = config.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return origin;
        // Allow health and platforms from any origin (public endpoints).
        return undefined;
      },
      allowHeaders: ['Authorization', 'Content-Type'],
    })
  );

  // ---- Public ----
  app.get('/health', (c) => c.json({ ok: true, service: 'pf-backend' }));

  // Platform Registry read path (§5.1, T5.5) — edge-cacheable.
  app.get('/platforms', (c) => {
    c.header('Cache-Control', 'public, max-age=3600');
    return c.json({ platforms: listPlatforms() });
  });

  // Auth endpoints proxy Supabase Auth (§31.2 Step 7) — clients can also call
  // Supabase directly; these exist so the extension never embeds Supabase keys.
  app.post('/auth/signup', (c) => c.json({ status: 'not_implemented_yet', task: 'T1.4 (needs T1.2 credentials)' }, 501));
  app.post('/auth/login', (c) => c.json({ status: 'not_implemented_yet', task: 'T1.4 (needs T1.2 credentials)' }, 501));

  // ---- Authenticated ----
  const authed = new Hono<AppEnv>();
  authed.use('*', authMiddleware);
  authed.use('*', rateLimitMiddleware);

  authed.get('/projects', async (c) => {
    const userId = c.get('userId');
    try {
      const pool = getPool();
      const res = await pool.query(
        `select id, name, description, content_ciphertext, default_platform, created_at
         from projects where user_id = $1 order by created_at desc`,
        [userId]
      );
      return c.json({ status: 'ok', projects: res.rows });
    } catch (error) {
      logger.warn({ type: 'projects:list_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'projects unavailable' }, 503);
    }
  });

  authed.post('/projects', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({}));
    const { name, description, default_platform, content_ciphertext } = body as Record<string, unknown>;
    if (!name || typeof name !== 'string') {
      return c.json({ error: 'name is required (string)' }, 400);
    }
    try {
      const pool = getPool();
      const res = await pool.query(
        `insert into projects (user_id, name, description, default_platform, content_ciphertext)
         values ($1, $2, $3, $4, $5)
         returning id, created_at`,
        [userId, name, description ?? null, default_platform ?? null, content_ciphertext ?? null]
      );
      return c.json({ status: 'ok', id: res.rows[0].id, created_at: res.rows[0].created_at });
    } catch (error) {
      logger.warn({ type: 'projects:create_error', userId, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'failed to create project' }, 500);
    }
  });

  authed.get('/projects/:id', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    try {
      const pool = getPool();
      const res = await pool.query(
        `select id, name, description, content_ciphertext, default_platform, created_at
         from projects where id = $1 and user_id = $2`,
        [id, userId]
      );
      if (res.rows.length === 0) return c.json({ error: 'project not found' }, 404);
      return c.json({ status: 'ok', project: res.rows[0] });
    } catch (error) {
      logger.warn({ type: 'projects:get_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'project unavailable' }, 503);
    }
  });

  authed.patch('/projects/:id', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { name, description, default_platform, content_ciphertext } = body as Record<string, unknown>;
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (typeof name === 'string') { updates.push(`name = $${idx++}`); params.push(name); }
    if (typeof description === 'string') { updates.push(`description = $${idx++}`); params.push(description); }
    if (typeof default_platform === 'string') { updates.push(`default_platform = $${idx++}`); params.push(default_platform); }
    if (typeof content_ciphertext === 'string') { updates.push(`content_ciphertext = $${idx++}`); params.push(content_ciphertext); }
    if (updates.length === 0) return c.json({ error: 'no fields to update' }, 400);
    params.push(id, userId);
    try {
      const pool = getPool();
      const res = await pool.query(
        `update projects set ${updates.join(', ')} where id = $${idx++} and user_id = $${idx}
         returning id`,
        params
      );
      if (res.rows.length === 0) return c.json({ error: 'project not found' }, 404);
      return c.json({ status: 'ok' });
    } catch (error) {
      logger.warn({ type: 'projects:update_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'failed to update project' }, 500);
    }
  });

  authed.delete('/projects/:id', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    try {
      const pool = getPool();
      // delete project-scoped memory, then the project (sessions' project_id set null via FK)
      await pool.query(`delete from memory_entries where scope = $1 and user_id = $2`, [id, userId]);
      const res = await pool.query(
        `delete from projects where id = $1 and user_id = $2 returning id`,
        [id, userId]
      );
      if (res.rows.length === 0) return c.json({ error: 'project not found' }, 404);
      return c.json({ status: 'ok' });
    } catch (error) {
      logger.warn({ type: 'projects:delete_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'failed to delete project' }, 500);
    }
  });
  // NOTE (T4 review): the MVP library is served CLIENT-SIDE from
  // web/src/data/library-seeds.json — the web app never calls a backend library
  // route. The DB-backed library (library_entries table already exists in
  // migration 003; seed + GET /library + GET /library/:id + POST /library/:id/remix
  // with remix counts + moderation) is deferred until it earns its keep. Until
  // then there is deliberately no /library endpoint (a 501 stub only misleads).
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

  /**
   * Continuous improvement suggestions (§29.3, T7.9) — aggregate-only query
   * over outcome_signals returning tuning recommendations.
   */
  authed.get('/analytics/improvements', async (c) => {
    try {
      const improvements = await analyzeImprovements();
      return c.json({ status: 'ok', improvements, generated_at: new Date().toISOString() });
    } catch (error) {
      logger.warn({ type: 'improvements_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'improvements unavailable' }, 503);
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
   * Capability matrix (§15.1, T5.7). Returns the full model-capability matrix
   * plus last_verified for freshness display.
   */
  authed.get('/capabilities', async (c) => {
    const matrix = loadCapabilityMatrix();
    return c.json({ status: 'ok', capabilities: matrix.models, last_verified: matrix.last_verified });
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
   * Per-session preview cap (in-memory, max 30 calls per session, §12.3).
   */
  const previewSessionCaps = new Map<string, number>();

  /**
   * Live textual preview (§12.1, §12.3, T6.1). Generates a 1–2 sentence
   * "what you'll likely get" description based on current node/answer state.
   * Non-streaming v1 (API Gateway buffers responses; streaming needs Function
   * URLs which are org-blocked on this account — see T3.8). Groq 8B is fast
   * enough (~300ms) that streaming isn't needed.
   */
  authed.post('/preview', async (c) => {
    const parsed = previewBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'invalid preview request', issues: parsed.error.issues }, 400);
    }
    const body = parsed.data;
    const userId = c.get('userId');
    // Per-session cap (§12.3): max 30 preview calls per session.
    const capKey = body.session_id ?? `user:${userId}`;
    if (previewSessionCaps.size > 10_000) previewSessionCaps.clear();
    const previewCount = previewSessionCaps.get(capKey) ?? 0;
    if (previewCount >= 30) {
      return c.json({ error: 'preview cap reached (30 per session)' }, 429);
    }
    previewSessionCaps.set(capKey, previewCount + 1);

    try {
      const result = await generatePreview(
        { platform_id: body.platform_id, task_type: body.task_type, known: body.known },
        userId,
        capKey
      );
      return c.json({ preview: result.preview, tokens_used: result.tokensUsed });
    } catch (error) {
      logger.warn({
        type: 'preview:error',
        reason: error instanceof Error ? error.message : String(error),
      });
      return c.json({ preview: null });
    }
  });

  /**
   * Optional visual preview (§12.2, T6.2).
   * Gated behind VISUAL_PREVIEW_ENABLED env (default false).
   * Per-session cap 3 (in-memory), per-user 10/day (in-memory map keyed by date).
   * Only available for image-modality platforms.
   */
  const visualPreviewSessionCaps = new Map<string, number>();
  const visualPreviewUserDailyCaps = new Map<string, { date: string; count: number }>();

  authed.post('/preview/visual', async (c) => {
    if (!config.VISUAL_PREVIEW_ENABLED) {
      return c.json({ error: 'visual preview is disabled' }, 404);
    }

    const parsed = previewVisualBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'platform_id and assembled are required', issues: parsed.error.issues }, 400);
    }
    const body = parsed.data;
    const userId = c.get('userId');
    const sessionId = c.req.header('x-session-id') ?? userId;

    // Only image-modality platforms
    const platform = getPlatform(body.platform_id);
    if (!platform) {
      return c.json({ error: `unknown platform '${body.platform_id}'` }, 404);
    }
    if (!platform.modalities.includes('image')) {
      return c.json({ error: `visual preview not available for '${platform.display_name}' — non-image platform` }, 400);
    }

    // Per-session cap (3)
    const sessionCount = visualPreviewSessionCaps.get(sessionId) ?? 0;
    if (sessionCount >= 3) {
      return c.json({ error: 'visual preview limit reached for this session', message: 'Visual preview limited to 3 per session. Regenerate only on node changes.' }, 429);
    }

    // Per-user daily cap (10) — in-memory keyed by userId+date
    const today = new Date().toISOString().slice(0, 10);
    const userKey = `${userId}:${today}`;
    const userEntry = visualPreviewUserDailyCaps.get(userKey);
    const userCount = userEntry?.date === today ? userEntry.count : 0;
    if (userCount >= 10) {
      return c.json({ error: 'daily visual preview limit reached', message: 'Visual preview limited to 10 per day per user.' }, 429);
    }

    // Generate
    const adapter = new GeminiImageAdapter();
    let imageBase64: string;
    let mime: string;
    try {
      const result = await adapter.generateImage(body.assembled);
      imageBase64 = result.imageBase64;
      mime = result.mime;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      logger.warn({ type: 'route:visual_preview_error', userId, sessionId, error: msg });
      return c.json({ error: 'visual preview generation failed', detail: msg }, 503);
    }

    // Update caps
    visualPreviewSessionCaps.set(sessionId, sessionCount + 1);
    visualPreviewUserDailyCaps.set(userKey, { date: today, count: userCount + 1 });

    // Meter usage: visual previews have no token count, record a 0-token event with the
    // step name so budget tracking can count "calls" if needed. Best-effort (non-blocking).
    try {
      const pool = getPool();
      pool.query(
        `insert into usage_events (user_id, session_id, pipeline_step, tokens_used) values ($1, $2, $3, 0) on conflict do nothing`,
        [userId, sessionId, 'visual_preview']
      ).catch(() => {});
    } catch {
      // DB unavailable — skip metering, not fatal
    }

    const platformDisplay = platform.display_name;
    return c.json({
      imageBase64,
      mime,
      disclaimer: `Preview rendered by ${adapter.name}, not by ${platformDisplay} — expect differences.`,
    });
  });

  /**
   * Runs the pipeline for a context and shapes the HTTP response — shared by
   * POST /draft (new session) and POST /draft/:sessionId/clarify (resume with
   * answers). Persists session metadata + meters usage best-effort (§18, §19.1).
   */
  async function runPipeline(c: Context<AppEnv>, context: PipelineContext) {
    // BYOK (§9.4, T7.2): resolve connection → API key → bind to agents.
    let apiKeyOverride: string | undefined;
    if (context.connectionId) {
      const pool = getPool();
      const connRes = await pool.query(
        `select secret_ref from provider_connections where id = $1 and user_id = $2 and status = 'active'`,
        [context.connectionId, context.userId]
      );
      if (connRes.rows.length > 0) {
        apiKeyOverride = await resolveKey(connRes.rows[0].secret_ref);
      }
    }

    const wrappedGenerate = apiKeyOverride
      ? ((step: string, complexity: any, req: any) => generate(step, complexity, { ...req, apiKeyOverride })) as typeof generate
      : generate;

    const supervisor = new Supervisor({
      intent: apiKeyOverride ? new IntentClassificationAgentClass(wrappedGenerate) : IntentClassificationAgent,
      docRetrieval: DocRetrievalAgent,
      clarify: ClarifyingQuestionAgent,
      draft: apiKeyOverride ? new DraftingAgentClass(wrappedGenerate) : DraftingAgent,
      critic: apiKeyOverride ? new CriticAgentClass(wrappedGenerate) : CriticAgent,
      alternatives: apiKeyOverride ? new AlternativesAgentClass(wrappedGenerate) : AlternativesAgent,
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

    // Persist metadata + meter tokens regardless of outcome (best-effort, no
    // content). Run them concurrently (§23.4, T3.7 tuning): each is already
    // fail-soft internally, so allSettled never rejects — this replaces two
    // serial DB round-trips with one, while still completing before the Lambda
    // execution environment can freeze (so writes aren't lost).
    await Promise.allSettled([
      persistSessionMetadata(result.context, result.finalState),
      meterUsage(result.context, result.trace),
    ]);

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

    // T7.3: fire-and-forget memory extraction at session end (non-fatal).
    let memoryProposals: MemoryEntry[] = [];
    try {
      const extractionResult = await MemoryExtractionAgent.execute({ context: result.context, params: {} });
      memoryProposals = (extractionResult.data?.proposals as MemoryEntry[]) ?? [];
    } catch {
      // Memory extraction is a background enhancement — never blocks the response.
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
      memory_proposals: memoryProposals,
    });
  }

  /**
   * Main drafting endpoint (§31.3 Step 20). Returns either clarifying
   * questions or a finished draft, depending on whether the task needs
   * clarification and whether the user asked to "just generate now".
   */
  authed.post('/draft', async (c) => {
    const parsed = draftBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'platform_id and idea are required', issues: parsed.error.issues }, 400);
    }
    const body = parsed.data;
    const platform = getPlatform(body.platform_id);
    if (!platform) {
      return c.json({ error: `unknown platform '${body.platform_id}' — see GET /platforms` }, 404);
    }

    // T7.7 plan gating: check platform entitlement before running the pipeline.
    const ent = await getEntitlements(c.get('userId'));
    if (!ent.platformAllowed(body.platform_id)) {
      return c.json({
        status: 'upgrade_required',
        feature: 'platform',
        plan: ent.planId,
        message: `Platform '${body.platform_id}' requires a paid plan. Upgrade at /account.`,
      }, 402);
    }

    const context: PipelineContext = {
      userId: c.get('userId'),
      sessionId: crypto.randomUUID(),
      platform,
      userIdea: body.idea,
      justGenerate: body.just_generate ?? false,
      connectionId: body.connection_id,
      projectId: body.project_id,
      memories: body.memories,
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
    const parsed = clarifyBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'platform_id and idea are required (client-supplied while server is content-stateless, pre-E2EE)', issues: parsed.error.issues }, 400);
    }
    const body = parsed.data;
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
      connectionId: body.connection_id,
      projectId: body.project_id,
      memories: body.memories,
    };
    return runPipeline(c, context);
  });
  authed.post('/appeal', (c) => c.json({ status: 'not_implemented_yet', task: 'T2.2/T7.5 (appeals queue)' }, 501));

  /**
   * Community library routes (§14.2, T7.6).
   * Public listing available without auth; submission requires auth.
   */
  app.get('/library', async (c) => {
    try {
      const pool = getPool();
      const res = await pool.query(
        `select l.id, l.title, l.description, l.modality, l.platform_tags, l.template,
                l.popularity, l.remix_count, l.version, l.created_at,
                au.email as attributed_email
         from library_entries l
         left join app_users au on au.id = l.attributed_user_id
         where l.moderation_status = 'approved'
         order by l.popularity desc, l.created_at desc`
      );
      return c.json({ status: 'ok', entries: res.rows });
    } catch (error) {
      logger.warn({ type: 'library:list_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'library unavailable' }, 503);
    }
  });

  /**
   * Admin moderation queue (§14.2, T7.6 / T7.5). Physically separate admin
   * deployable authenticates with ADMIN_API_KEY via the x-admin-key header.
   * By construction this service holds NO decryption path for user content or
   * BYOK keys — it only flips moderation_status and records the reviewer.
   */
  const requireAdmin = (c: Context): { ok: true } | { ok: false; res: Response } => {
    if (!config.ADMIN_API_KEY) {
      return { ok: false, res: c.json({ error: 'admin disabled' }, 503) };
    }
    const provided = c.req.header('x-admin-key');
    if (!provided || provided !== config.ADMIN_API_KEY) {
      return { ok: false, res: c.json({ error: 'unauthorized' }, 401) };
    }
    return { ok: true };
  };

  app.get('/library/pending', async (c) => {
    const auth = requireAdmin(c);
    if (!auth.ok) return auth.res;
    try {
      const pool = getPool();
      const res = await pool.query(
        `select l.id, l.user_id, l.title, l.description, l.modality, l.platform_tags,
                l.template, l.popularity, l.remix_count, l.version, l.created_at,
                au.email as submitted_email
         from library_entries l
         left join app_users au on au.id = l.user_id
         where l.moderation_status = 'pending'
         order by l.created_at asc`
      );
      return c.json({ status: 'ok', entries: res.rows });
    } catch (error) {
      logger.warn({ type: 'library:pending_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'queue unavailable' }, 503);
    }
  });

  app.patch('/library/:id/moderate', async (c) => {
    const auth = requireAdmin(c);
    if (!auth.ok) return auth.res;
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { decision, note } = body as { decision?: string; note?: string };
    if (decision !== 'approve' && decision !== 'reject') {
      return c.json({ error: "decision must be 'approve' or 'reject'" }, 400);
    }
    try {
      const pool = getPool();
      const status = decision === 'approve' ? 'approved' : 'rejected';
      const res = await pool.query(
        `update library_entries
         set moderation_status = $1, reviewed_at = now(), review_note = $2
         where id = $3 and moderation_status = 'pending'
         returning id, moderation_status`,
        [status, note ?? null, id]
      );
      if (res.rows.length === 0) return c.json({ error: 'entry not found or not pending' }, 404);
      logger.info({ type: 'library:moderated', entryId: id, decision });
      return c.json({ status: 'ok', id, moderation_status: status });
    } catch (error) {
      logger.warn({ type: 'library:moderate_error', entryId: id, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'moderation failed' }, 500);
    }
  });

  app.get('/library/:id', async (c) => {
    const id = c.req.param('id');
    try {
      const pool = getPool();
      const res = await pool.query(
        `select l.*, au.email as attributed_email
         from library_entries l
         left join app_users au on au.id = l.attributed_user_id
         where l.id = $1 and l.moderation_status = 'approved'`,
        [id]
      );
      if (res.rows.length === 0) return c.json({ error: 'entry not found' }, 404);
      return c.json({ status: 'ok', entry: res.rows[0] });
    } catch (error) {
      logger.warn({ type: 'library:get_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'entry unavailable' }, 503);
    }
  });

  authed.post('/library/submit', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({}));
    const { title, description, modality, platform_tags, template, credit } = body as Record<string, unknown>;
    if (!title || typeof title !== 'string' || !description || typeof description !== 'string') {
      return c.json({ error: 'title and description are required (strings)' }, 400);
    }
    if (!modality || typeof modality !== 'string') {
      return c.json({ error: 'modality is required (string)' }, 400);
    }
    if (!template || typeof template !== 'object') {
      return c.json({ error: 'template is required (object)' }, 400);
    }
    try {
      const { screenSubmission } = await import('../services/LibraryScreening');
      const assembledTemplate = JSON.stringify(template);
      const screening = await screenSubmission(title, description, assembledTemplate);
      const pool = getPool();
      const res = await pool.query(
        `insert into library_entries (user_id, attributed_user_id, source, title, description, modality, platform_tags, template, moderation_status)
         values ($1, $2, 'human_submitted', $3, $4, $5, $6, $7, $8)
         returning id, created_at, moderation_status`,
        [
          userId,
          credit ? userId : null,
          title,
          description,
          modality,
          platform_tags ?? [],
          template,
          screening.moderationStatus,
        ]
      );
      logger.info({ type: 'library:submitted', userId, entryId: res.rows[0].id, status: screening.moderationStatus });
      return c.json({
        status: 'ok',
        id: res.rows[0].id,
        moderation_status: screening.moderationStatus,
        reason: screening.reason,
      });
    } catch (error) {
      logger.warn({ type: 'library:submit_error', userId, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'submission failed' }, 500);
    }
  });


  /**
   * Session-level memory application (§17.4, T6.4) — "draft another with
   * the same style" within the same session. Seeds the new pipeline context
   * with carried_preferences as clarifications so the clarify agent skips
   * those questions and the drafting prompt receives them.
   */
  authed.post('/draft/:sessionId/again', async (c) => {
    const sessionId = c.req.param('sessionId');
    const parsed = againBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'platform_id and idea are required', issues: parsed.error.issues }, 400);
    }
    const body = parsed.data;
    const platform = getPlatform(body.platform_id);
    if (!platform) {
      return c.json({ error: `unknown platform '${body.platform_id}' — see GET /platforms` }, 404);
    }

    const context: PipelineContext = {
      userId: c.get('userId'),
      sessionId, // reuse the same session id so metadata updates in place
      platform,
      userIdea: body.idea,
      clarifications: body.carried_preferences, // seed clarifications = carried preferences
      // Build a justGenerate context hint for the clarify agent to skip answered questions.
      // The carried preferences are treated as already-answered — the clarify agent checks
      // context.clarifications for answered questions via its built-in skip logic.
      connectionId: body.connection_id,
    };
    return runPipeline(c, context);
  });

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

  // ---- Demo (public) — T4.3 ----
  // In-memory IP rate limit map for demo (per-day, simple counter).
  const demoRateMap = new Map<string, { count: number; date: string }>();
  const DEMO_DAILY_LIMIT = config.DEMO_REQUESTS_PER_DAY;

  const demo = new Hono<AppEnv>();
  /** GET /demo/examples — list available demo examples (from config, §32.3). */
  demo.get('/demo/examples', (c) => {
    return c.json({ examples: listDemoExamples() });
  });
  /** POST /demo/draft — run a demo example (public, IP rate-limited). */
  demo.post('/demo/draft', async (c) => {
    if (!config.DEMO_ENABLED) {
      return c.json({ error: 'demo is disabled' }, 404);
    }
    const parsed = demoDraftBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'example_id is required' }, 400);
    }
    const { example_id } = parsed.data;
    const example = getDemoExample(example_id);
    if (!example) {
      return c.json({ error: `unknown example '${example_id}'` }, 400);
    }
    const platform = getPlatform(example.platform_id);
    if (!platform) {
      return c.json({ error: `platform '${example.platform_id}' not found` }, 503);
    }
    // IP rate limit (simple in-memory per IP/day)
    const ip = c.req.header('x-forwarded-for') ?? 'local';
    const today = new Date().toISOString().slice(0, 10);
    const entry = demoRateMap.get(ip);
    if (entry && entry.date === today && entry.count >= DEMO_DAILY_LIMIT) {
      return c.json({
        status: 'rate_limited',
        message: 'You have used all your demo tries today. Create a free account for unlimited drafting.',
      }, 429);
    }
    if (!entry || entry.date !== today) {
      demoRateMap.set(ip, { count: 1, date: today });
    } else {
      entry.count++;
    }
    // Periodic cleanup to avoid unbounded growth (>50 entries, only on write)
    if (demoRateMap.size > 50) {
      const todayKey = today;
      for (const [k, v] of demoRateMap) {
        if (v.date !== todayKey) demoRateMap.delete(k);
      }
    }
    const context: PipelineContext = {
      userId: 'demo-user',
      sessionId: crypto.randomUUID(),
      platform,
      userIdea: example.idea,
      justGenerate: true,
    };
    return runPipeline(c, context);
  });

  /**
   * Platform request submission (§5.4, T5.5). Public, IP rate-limited
   * (same pattern as demo: in-memory map, 5/day per IP).
   */
  const platformRequestRateMap = new Map<string, { count: number; date: string }>();
  app.post('/platform-requests', async (c) => {
    const parsed = platformRequestBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'origin is required', issues: parsed.error.issues }, 400);
    }
    const { origin, note } = parsed.data;
    const ip = c.req.header('x-forwarded-for') ?? 'local';
    const today = new Date().toISOString().slice(0, 10);
    const entry = platformRequestRateMap.get(ip);
    if (entry && entry.date === today && entry.count >= 5) {
      return c.json({
        status: 'rate_limited',
        message: 'You have used all your platform request tries today. Try again tomorrow.',
      }, 429);
    }
    if (!entry || entry.date !== today) {
      platformRequestRateMap.set(ip, { count: 1, date: today });
    } else {
      entry.count++;
    }
    if (platformRequestRateMap.size > 50) {
      for (const [k, v] of platformRequestRateMap) {
        if (v.date !== today) platformRequestRateMap.delete(k);
      }
    }
    try {
      const pool = getPool();
      await pool.query(
        `insert into platform_requests (origin, note) values ($1, $2)`,
        [origin, note ?? null]
      );
      return c.json({ status: 'ok' });
    } catch (error) {
      logger.warn({ type: 'platform_request:save_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'failed to submit request' }, 503);
    }
  });

  // ---- Web app helper routes ----

  /** Serialize nodes to a platform string (§13.3, T4.5). Pure/deterministic — no LLM. */
  authed.post('/serialize', async (c) => {
    const parsed = serializeBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'platform_id and nodes are required', issues: parsed.error.issues }, 400);
    }
    const { platform_id, nodes } = parsed.data;
    const platform = getPlatform(platform_id);
    if (!platform) return c.json({ error: `unknown platform '${platform_id}'` }, 404);
    try {
      const { serializeNodes } = await import('../services/PromptSerializer');
      const assembled = serializeNodes(nodes as any, platform);
      return c.json({ assembled });
    } catch (error) {
      logger.warn({ type: 'serialize:error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'serialization error' }, 500);
    }
  });

  /** Redraft a single node (§10.6, T4.5) — small-tier regenerate for one node type. */
  authed.post('/redraft-node', async (c) => {
    const parsed = redraftNodeBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'invalid request', issues: parsed.error.issues }, 400);
    }
    const { platform_id, task_type, nodes, target_node_type, instruction } = parsed.data;
    const platform = getPlatform(platform_id);
    if (!platform) return c.json({ error: `unknown platform '${platform_id}'` }, 404);
    try {
      const result = await redraftNode({
        platform,
        taskType: task_type,
        nodes: nodes as Array<{ type: string; value: string; locked?: boolean }>,
        targetNodeType: target_node_type,
        instruction,
      });
      return c.json({ status: 'ok', ...result });
    } catch (error) {
      if (error instanceof NodeLocked) return c.json({ error: 'that node is locked — unlock it to regenerate' }, 400);
      if (error instanceof NodeNotFound) return c.json({ error: error.message }, 400);
      logger.warn({ type: 'redraft:error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'regeneration unavailable — please try again' }, 502);
    }
  });

  /** Bootstrap the caller's app_users row (idempotent). */
  authed.post('/me/bootstrap', async (c) => {
    const userId = c.get('userId');
    // Real email/name come from the JWT claims (name/email are the only plaintext
    // PII we store, §19.1); null when absent (e.g. dev-bypass) → columns stay null.
    const email = c.get('email') ?? null;
    try {
      const pool = getPool();
      await pool.query(
        `insert into app_users (id, email, display_name) values ($1, $2, $3) on conflict (id) do nothing`,
        [userId, email, null]
      );
      return c.json({ status: 'ok' });
    } catch (error) {
      logger.warn({ type: 'bootstrap:error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ status: 'ok' }); // idempotent — no error to the client
    }
  });

  /**
   * E2EE key routes (§19.2, T7.1). Server stores WRAPPED keys only — never
   * accepts or returns a raw DEK/KEK. The client performs all crypto.
   */
  authed.put('/keys', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({}));
    const { wrapped_dek_pass, wrapped_dek_recovery, kdf_salt, kdf_iterations } = body as Record<string, unknown>;
    if (!wrapped_dek_pass || !wrapped_dek_recovery || !kdf_salt || !kdf_iterations) {
      return c.json({ error: 'wrapped_dek_pass, wrapped_dek_recovery, kdf_salt, and kdf_iterations are required' }, 400);
    }
    if (typeof wrapped_dek_pass !== 'string' || typeof wrapped_dek_recovery !== 'string' || typeof kdf_salt !== 'string') {
      return c.json({ error: 'wrapped keys and salt must be strings' }, 400);
    }
    try {
      const pool = getPool();
      await pool.query(
        `insert into user_keys (user_id, wrapped_dek_pass, wrapped_dek_recovery, kdf_salt, kdf_iterations)
         values ($1, $2, $3, $4, $5)
         on conflict (user_id) do update set
           wrapped_dek_pass = excluded.wrapped_dek_pass,
           wrapped_dek_recovery = excluded.wrapped_dek_recovery,
           kdf_salt = excluded.kdf_salt,
           kdf_iterations = excluded.kdf_iterations,
           updated_at = now()`,
        [userId, wrapped_dek_pass, wrapped_dek_recovery, kdf_salt, kdf_iterations]
      );
      logger.info({ type: 'keys:stored', userId });
      return c.json({ status: 'ok' });
    } catch (error) {
      logger.warn({ type: 'keys:store_error', userId, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'failed to store keys' }, 500);
    }
  });

  authed.get('/keys', async (c) => {
    const userId = c.get('userId');
    try {
      const pool = getPool();
      const res = await pool.query(
        `select wrapped_dek_pass, wrapped_dek_recovery, kdf_salt, kdf_iterations from user_keys where user_id = $1`,
        [userId]
      );
      if (res.rows.length === 0) return c.json({ status: 'not_found' }, 404);
      return c.json({ status: 'ok', ...res.rows[0] });
    } catch (error) {
      logger.warn({ type: 'keys:read_error', userId, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'failed to read keys' }, 500);
    }
  });

  /**
   * Cross-session memory routes (§17.1–17.5, T7.3).
   * The client manages encryption/decryption — the server sees only ciphertext.
   * Task_type is plaintext metadata [P] for client-side relevance filtering.
   */
  authed.get('/memory', async (c) => {
    const userId = c.get('userId');
    try {
      const pool = getPool();
      const res = await pool.query(
        `select id, scope, source, status, statement_ciphertext, task_type, created_at
         from memory_entries where user_id = $1 order by created_at desc`,
        [userId]
      );
      return c.json({ status: 'ok', entries: res.rows });
    } catch (error) {
      logger.warn({ type: 'memory:list_error', userId, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'memory unavailable' }, 503);
    }
  });

  authed.post('/memory', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({}));
    const { scope, statement_ciphertext, source, status, task_type } = body as Record<string, unknown>;
    if (!statement_ciphertext || typeof statement_ciphertext !== 'string') {
      return c.json({ error: 'statement_ciphertext is required (string)' }, 400);
    }
    if (source && !['user_added', 'agent_proposed'].includes(source as string)) {
      return c.json({ error: 'source must be user_added or agent_proposed' }, 400);
    }
    if (status && !['pending_confirmation', 'active'].includes(status as string)) {
      return c.json({ error: 'status must be pending_confirmation or active' }, 400);
    }
    try {
      const pool = getPool();
      const res = await pool.query(
        `insert into memory_entries (user_id, scope, statement_ciphertext, source, status, task_type)
         values ($1, $2, $3, $4, $5, $6)
         returning id, created_at`,
        [
          userId,
          scope ?? 'global',
          statement_ciphertext,
          source ?? 'user_added',
          status ?? 'active',
          task_type ?? null,
        ]
      );
      return c.json({ status: 'ok', id: res.rows[0].id, created_at: res.rows[0].created_at });
    } catch (error) {
      logger.warn({ type: 'memory:create_error', userId, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'failed to create memory entry' }, 500);
    }
  });

  authed.patch('/memory/:id', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { statement_ciphertext, status, task_type } = body as Record<string, unknown>;
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (typeof statement_ciphertext === 'string') {
      updates.push(`statement_ciphertext = $${idx++}`);
      params.push(statement_ciphertext);
    }
    if (typeof status === 'string') {
      updates.push(`status = $${idx++}`);
      params.push(status);
    }
    if (typeof task_type === 'string') {
      updates.push(`task_type = $${idx++}`);
      params.push(task_type);
    }
    if (updates.length === 0) return c.json({ error: 'no fields to update' }, 400);
    params.push(id, userId);
    try {
      const pool = getPool();
      const res = await pool.query(
        `update memory_entries set ${updates.join(', ')} where id = $${idx++} and user_id = $${idx}
         returning id`,
        params
      );
      if (res.rows.length === 0) return c.json({ error: 'memory entry not found' }, 404);
      return c.json({ status: 'ok' });
    } catch (error) {
      logger.warn({ type: 'memory:update_error', userId, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'failed to update memory entry' }, 500);
    }
  });

  authed.delete('/memory/:id', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    try {
      const pool = getPool();
      const res = await pool.query(
        `delete from memory_entries where id = $1 and user_id = $2 returning id`,
        [id, userId]
      );
      if (res.rows.length === 0) return c.json({ error: 'memory entry not found' }, 404);
      return c.json({ status: 'ok' });
    } catch (error) {
      logger.warn({ type: 'memory:delete_error', userId, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'failed to delete memory entry' }, 500);
    }
  });

  authed.delete('/memory', async (c) => {
    const userId = c.get('userId');
    const confirmReset = c.req.header('x-confirm-reset');
    if (confirmReset !== 'true') {
      return c.json({ error: 'header x-confirm-reset: true required for global reset' }, 400);
    }
    try {
      const pool = getPool();
      const res = await pool.query(
        `delete from memory_entries where user_id = $1`,
        [userId]
      );
      return c.json({ status: 'ok', deleted: res.rowCount ?? 0 });
    } catch (error) {
      logger.warn({ type: 'memory:reset_error', userId, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'failed to reset memory' }, 500);
    }
  });

  /**
   * BYOK provider connection routes (§9.4, T7.2).
   * The API key is written directly to SSM and never stored in the DB;
   * the DB record holds only the SSM path reference (`secret_ref`).
   */
  authed.post('/connections', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({}));
    const { provider, api_key } = body as Record<string, string>;
    if (!provider || !api_key || typeof provider !== 'string' || typeof api_key !== 'string') {
      return c.json({ error: 'provider and api_key are required (strings)' }, 400);
    }
    const supported = ['openai', 'google'];
    if (!supported.includes(provider)) {
      return c.json({ error: `unsupported provider; supported: ${supported.join(', ')}` }, 400);
    }
    try {
      const pool = getPool();
      const connId = crypto.randomUUID();
      const secretRef = await storeKey(userId, provider, connId, api_key);
      await pool.query(
        `insert into provider_connections (id, user_id, provider, secret_ref)
         values ($1, $2, $3, $4)`,
        [connId, userId, provider, secretRef]
      );
      logger.info({ type: 'byok:connection_created', userId, provider });
      return c.json({ status: 'ok', id: connId, provider });
    } catch (error) {
      logger.warn({ type: 'byok:connection_error', userId, provider, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'failed to create connection' }, 500);
    }
  });

  authed.get('/connections', async (c) => {
    const userId = c.get('userId');
    try {
      const pool = getPool();
      const res = await pool.query(
        `select id, provider, status, created_at from provider_connections
         where user_id = $1 order by created_at desc`,
        [userId]
      );
      return c.json({ status: 'ok', connections: res.rows });
    } catch (error) {
      logger.warn({ type: 'byok:list_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'connections unavailable' }, 503);
    }
  });

  authed.delete('/connections/:id', async (c) => {
    const userId = c.get('userId');
    const connId = c.req.param('id');
    try {
      const pool = getPool();
      const res = await pool.query(
        `select secret_ref from provider_connections where id = $1 and user_id = $2 and status = 'active'`,
        [connId, userId]
      );
      if (res.rows.length === 0) return c.json({ error: 'connection not found' }, 404);
      const secretRef = res.rows[0].secret_ref;
      await revokeKey(secretRef);
      await pool.query(
        `update provider_connections set status = 'revoked' where id = $1`,
        [connId]
      );
      logger.info({ type: 'byok:connection_revoked', userId, connId });
      return c.json({ status: 'ok' });
    } catch (error) {
      logger.warn({ type: 'byok:revoke_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'failed to revoke connection' }, 500);
    }
  });

  /**
   * Store encrypted session content (§19.2, T7.1). Client-initiated after
   * a draft completes: the client encrypts idea + clarification history and
   * patches the session row. Purely best-effort — no content, no draft-block.
   */
  authed.patch('/sessions/:sessionId/content', async (c) => {
    const userId = c.get('userId');
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json().catch(() => ({}));
    const { content_ciphertext } = body as Record<string, unknown>;
    if (!content_ciphertext || typeof content_ciphertext !== 'string') {
      return c.json({ error: 'content_ciphertext is required (string)' }, 400);
    }
    try {
      const pool = getPool();
      await pool.query(
        `update sessions set content_ciphertext = $1 where id = $2 and user_id = $3`,
        [content_ciphertext, sessionId, userId]
      );
      return c.json({ status: 'ok' });
    } catch (error) {
      logger.warn({ type: 'session:content_store_error', sessionId, userId, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'failed to store content' }, 500);
    }
  });

  /**
   * Delete the caller's account and all associated data (§19.6, T7.1).
   * Deletes user_keys, sessions, prompts (+ versions via FK cascade),
   * memory_entries, and projects. Anonymized outcome_signals are kept
   * (no user linkage exists). Ciphertext without keys is dead data —
   * deleting keys satisfies erasure.
   */
  authed.delete('/me', async (c) => {
    const userId = c.get('userId');
    try {
      const pool = getPool();
      // Delete in dependency order to respect FK constraints.
      // prompt_versions cascade from prompts; prompts cascade from sessions.
      await pool.query(`delete from user_keys where user_id = $1`, [userId]);
      await pool.query(`delete from memory_entries where user_id = $1`, [userId]);
      await pool.query(`delete from projects where user_id = $1`, [userId]);
      await pool.query(`delete from prompts where user_id = $1`, [userId]);
      await pool.query(`delete from sessions where user_id = $1`, [userId]);
      // Delete the app_users row last — this cascades to fewer tables.
      await pool.query(`delete from provider_connections where user_id = $1`, [userId]);
      await pool.query(`delete from app_users where id = $1`, [userId]);
      logger.info({ type: 'account:deleted', userId });
      return c.json({ status: 'ok' });
    } catch (error) {
      logger.warn({ type: 'account:delete_error', userId, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'account deletion failed' }, 500);
    }
  });

  /** List the caller's sessions (metadata only). */
  authed.get('/sessions', async (c) => {
    const userId = c.get('userId');
    try {
      const pool = getPool();
      const res = await pool.query(
        `select id, platform_id, final_state, strength_score, created_at
         from sessions where user_id = $1 order by created_at desc limit 50`,
        [userId]
      );
      return c.json({ status: 'ok', sessions: res.rows });
    } catch (error) {
      logger.warn({ type: 'sessions:list_error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'sessions unavailable' }, 503);
    }
  });

  /** Export all user data (§29.8, T4.7). */
  authed.get('/export', async (c) => {
    const userId = c.get('userId');
    try {
      const pool = getPool();
      const sessionsRes = await pool.query(
        `select id, platform_id, final_state, strength_score, rubric_scores, refinement_count, created_at
         from sessions where user_id = $1 order by created_at`,
        [userId]
      );
      const prompts = await pool.query(
        `select id, version, task_type, platform_id, strength_score, created_at
         from prompts where user_id = $1 order by created_at`,
        [userId]
      );
      return c.json({
        status: 'ok',
        export: {
          exported_at: new Date().toISOString(),
          note: 'Content is stored client-side pre-E2EE (T7.1). Server-side metadata only.',
          sessions: sessionsRes.rows,
          prompts: prompts.rows,
        },
      });
    } catch (error) {
      logger.warn({ type: 'export:error', reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'export unavailable' }, 503);
    }
  });

  /** Multi-platform fan-out (§13.3, TA.4). */
  authed.post('/fanout', async (c) => {
    const parsed = fanoutBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'nodes and platform_ids are required', issues: parsed.error.issues }, 400);
    }
    const { nodes, platform_ids } = parsed.data;
    const { serializeNodes } = await import('../services/PromptSerializer');
    const { govern } = await import('../guardrails/TokenGovernor');
    const results: Array<{ platform_id: string; display_name: string; assembled: string; governor: any }> = [];
    const skipped: string[] = [];
    for (const pid of platform_ids) {
      const platform = getPlatform(pid);
      if (!platform) { skipped.push(pid); continue; }
      const assembled = serializeNodes(nodes as any, platform);
      const governor = govern(assembled, platform);
      results.push({ platform_id: pid, display_name: platform.display_name, assembled, governor });
    }
    return c.json({
      status: 'ok',
      results,
      skipped,
      note: 'serialized from shared nodes; for platform-optimized re-drafting, draft per platform',
    });
  });

  /**
   * Teams routes (§14.4, T8.4).
   */
  authed.post('/teams', async (c) => {
    const userId = c.get('userId');
    const parsed = createTeamBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'name is required (string, max 200)', issues: parsed.error.issues }, 400);
    }
    const { name } = parsed.data;
    try {
      const pool = getPool();
      const res = await pool.query(
        `insert into teams (name, owner_id) values ($1, $2) returning id, created_at`,
        [name, userId]
      );
      // Add owner as team member with owner role
      await pool.query(
        `insert into team_members (team_id, user_id, role) values ($1, $2, 'owner')`,
        [res.rows[0].id, userId]
      );
      return c.json({ status: 'ok', id: res.rows[0].id, created_at: res.rows[0].created_at });
    } catch (error) {
      logger.warn({ type: 'teams:create_error', userId, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'failed to create team' }, 500);
    }
  });

  authed.get('/teams', async (c) => {
    const userId = c.get('userId');
    try {
      const pool = getPool();
      const res = await pool.query(
        `select id, name, owner_id, created_at from teams
         where owner_id = $1
         or id in (select team_id from team_members where user_id = $1)
         order by created_at desc`,
        [userId]
      );
      return c.json({ status: 'ok', teams: res.rows });
    } catch (error) {
      logger.warn({ type: 'teams:list_error', userId, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'teams unavailable' }, 503);
    }
  });

  authed.post('/teams/:id/members', async (c) => {
    const userId = c.get('userId');
    const teamId = c.req.param('id');
    const parsed = addTeamMemberBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'user_id is required', issues: parsed.error.issues }, 400);
    }
    const { user_id, role } = parsed.data;
    try {
      const pool = getPool();
      // Verify caller is owner
      const teamRes = await pool.query(
        `select owner_id from teams where id = $1`,
        [teamId]
      );
      if (teamRes.rows.length === 0) return c.json({ error: 'team not found' }, 404);
      if (teamRes.rows[0].owner_id !== userId) {
        return c.json({ error: 'only the team owner can add members' }, 403);
      }
      await pool.query(
        `insert into team_members (team_id, user_id, role) values ($1, $2, $3)
         on conflict (team_id, user_id) do update set role = excluded.role`,
        [teamId, user_id, role]
      );
      return c.json({ status: 'ok' });
    } catch (error) {
      logger.warn({ type: 'teams:add_member_error', teamId, userId, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'failed to add member' }, 500);
    }
  });

  authed.delete('/teams/:id/members/:userId', async (c) => {
    const userId = c.get('userId');
    const teamId = c.req.param('id');
    const targetUserId = c.req.param('userId');
    try {
      const pool = getPool();
      // Verify caller is owner
      const teamRes = await pool.query(
        `select owner_id from teams where id = $1`,
        [teamId]
      );
      if (teamRes.rows.length === 0) return c.json({ error: 'team not found' }, 404);
      if (teamRes.rows[0].owner_id !== userId) {
        return c.json({ error: 'only the team owner can remove members' }, 403);
      }
      // Cannot remove the owner
      if (targetUserId === teamRes.rows[0].owner_id) {
        return c.json({ error: 'cannot remove the team owner' }, 400);
      }
      const res = await pool.query(
        `delete from team_members where team_id = $1 and user_id = $2 returning user_id`,
        [teamId, targetUserId]
      );
      if (res.rows.length === 0) return c.json({ error: 'member not found' }, 404);
      return c.json({ status: 'ok' });
    } catch (error) {
      logger.warn({ type: 'teams:remove_member_error', teamId, userId, reason: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'failed to remove member' }, 500);
    }
  });

  /**
   * Usage & billing routes (§28.2, T7.7).
   * GET /me/usage — current plan + usage vs budget.
   * POST /billing/checkout — create Stripe Checkout Session.
   * POST /billing/webhook — Stripe webhook (PUBLIC, no auth — signature-verified).
   */
  authed.get('/me/usage', async (c) => {
    const userId = c.get('userId');
    const ent = await getEntitlements(userId);
    const pool = getPool();
    const month = new Date().toISOString().slice(0, 7); // "2026-07"
    const res = await pool.query(
      `select coalesce(sum(input_tokens + output_tokens), 0) as used
       from usage_events where user_id = $1 and created_at >= $2`,
      [userId, `${month}-01T00:00:00Z`]
    );
    const used = Number(res.rows[0]?.used ?? 0);
    return c.json({
      status: 'ok',
      plan: ent.planId,
      used,
      budget: ent.monthlyTokenBudget,
      byok: ent.byok,
      projectsAllowed: ent.projectsAllowed,
      visualPreview: ent.visualPreview,
    });
  });

  /**
   * User-visible progress (§28.5, T7.9).
   * Computes avg strength this month vs last, draft count, best dimension improvement.
   */
  authed.get('/me/progress', async (c) => {
    const userId = c.get('userId');
    const pool = getPool();
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    const [thisRes, lastRes, countRes] = await Promise.all([
      pool.query(
        `select avg(strength_score) as avg_strength, count(*) as cnt
         from sessions where user_id = $1 and created_at >= $2`,
        [userId, thisMonth]
      ),
      pool.query(
        `select avg(strength_score) as avg_strength
         from sessions where user_id = $1 and created_at >= $2 and created_at < $3`,
        [userId, lastMonth, thisMonth]
      ),
      pool.query(
        `select count(*) as total from sessions where user_id = $1`,
        [userId]
      ),
    ]);

    const thisAvg = Number(thisRes.rows[0]?.avg_strength ?? 0);
    const lastAvg = Number(lastRes.rows[0]?.avg_strength ?? 0);
    const thisCount = Number(thisRes.rows[0]?.cnt ?? 0);
    const totalDrafts = Number(countRes.rows[0]?.total ?? 0);

    const delta = thisCount >= 5 && lastAvg > 0 ? thisAvg - lastAvg : null;

    return c.json({
      status: 'ok',
      this_month: { avg_strength: thisAvg, drafts: thisCount },
      last_month: { avg_strength: lastAvg },
      total_drafts: totalDrafts,
      delta_points: delta,
    });
  });

  authed.post('/billing/checkout', async (c) => {
    const userId = c.get('userId');
    if (!config.STRIPE_SECRET_KEY) return c.json({ error: 'Stripe not configured' }, 501);
    // Lazy import so the Stripe dependency is optional at the type level.
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(config.STRIPE_SECRET_KEY);
    const priceId = config.STRIPE_PRICE_PRO;
    if (!priceId) return c.json({ error: 'No Stripe price configured' }, 500);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: config.STRIPE_SUCCESS_URL ?? 'http://localhost:3000/account?upgraded=true',
      cancel_url: config.STRIPE_CANCEL_URL ?? 'http://localhost:3000/account?cancelled=true',
      client_reference_id: userId,
      metadata: { user_id: userId },
    });
    return c.json({ status: 'ok', checkout_url: session.url });
  });

  // Stripe webhook (PUBLIC — no auth middleware; Stripe signature verification is the auth).
  app.post('/billing/webhook', async (c) => {
    if (!config.STRIPE_WEBHOOK_SECRET) return c.json({ error: 'Stripe webhook not configured' }, 501);
    const body = await c.req.text();
    const sig = c.req.header('stripe-signature');
    if (!sig) return c.json({ error: 'Missing stripe-signature header' }, 400);
    const StripeMod = (await import('stripe')).default;
    const stripe = new StripeMod(config.STRIPE_SECRET_KEY!);
    let event: { id: string; type: string; data: { object: Record<string, unknown> } };
    try {
      event = stripe.webhooks.constructEvent(body, sig, config.STRIPE_WEBHOOK_SECRET) as unknown as typeof event;
    } catch {
      return c.json({ error: 'Invalid signature' }, 400);
    }
    // Idempotent: check if already processed.
    const pool = getPool();
    const existing = await pool.query('select event_id from billing_events where event_id = $1', [event.id]);
    if (existing.rows.length > 0) return c.json({ status: 'ok' });
    // Process event.
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as { client_reference_id?: string };
      const userId = session.client_reference_id;
      if (userId) {
        await pool.query(`update app_users set plan = 'pro' where id = $1`, [userId]);
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as { customer: string };
      const customer = sub.customer;
      await pool.query(`update app_users set plan = 'free' where stripe_customer_id = $1`, [customer]);
    }
    // Record event for idempotency.
    await pool.query(
      `insert into billing_events (event_id, type, payload) values ($1, $2, $3) on conflict do nothing`,
      [event.id, event.type, JSON.stringify(event.data.object)]
    );
    return c.json({ status: 'ok' });
  });

  // Mount sub-apps LAST — Hono copies a sub-app's routes into the parent at
  // app.route() time, so this must run after every demo.*/authed.* route above
  // is registered (otherwise those routes 404). See T4 review, 2026-07-10.
  app.route('/', demo);
  app.route('/', authed);

  return app;
}
