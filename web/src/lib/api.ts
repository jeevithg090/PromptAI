/**
 * Typed API client — mirrors the backend HTTP contract.
 * Single `baseUrl` from env, settable bearer token, typed methods for every route.
 * No retries, 120s timeout via AbortController (drafts run a multi-step LLM pipeline).
 */
import type {
  DraftResponse, DesignedResponse, DesignedNode, Recommendation, Platform,
  ClarifyingQuestion, PreviewResponse, PreviewBody, AgainBody,
  VisualPreviewResponse, VisualPreviewBody, EnhanceResponse,
  ChatRefineMessage, ChatRefineResponse, ChatDraftResponse, ModeRecommendation,
} from './api-types';

export type ApiError = { status: number; message: string };

export class ApiClient {
  baseUrl: string;
  private _token: string | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  }

  setToken(token: string | null) {
    this._token = token;
  }

  get token(): string | null {
    return this._token;
  }

  private async request<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders };
    if (this._token) {
      headers['Authorization'] = `Bearer ${this._token}`;
    }
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: res.statusText }));
        throw { status: res.status, message: payload.error ?? payload.message ?? payload.reason ?? res.statusText } as ApiError;
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  health(): Promise<{ ok: boolean }> {
    return this.request('GET', '/health');
  }

  /** Public client feature flags (F1.3). */
  features(): Promise<{ stt: boolean; visual_preview: boolean; demo: boolean }> {
    return this.request('GET', '/features');
  }

  /** Voice dictation (F1.3) — multipart audio → transcript. Not JSON, so it bypasses request(). */
  async transcribe(blob: Blob, filename = 'clip.webm'): Promise<{ text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const headers: Record<string, string> = {};
    if (this._token) headers['Authorization'] = `Bearer ${this._token}`;
    const form = new FormData();
    form.append('audio', blob, filename);
    try {
      const res = await fetch(`${this.baseUrl}/transcribe`, { method: 'POST', headers, body: form, signal: controller.signal });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: res.statusText }));
        throw { status: res.status, message: payload.error ?? payload.message ?? res.statusText } as ApiError;
      }
      return (await res.json()) as { text: string };
    } finally {
      clearTimeout(timer);
    }
  }

  platforms(): Promise<{ platforms: Platform[] }> {
    return this.request('GET', '/platforms');
  }

  /** Public prompt library (V1.3) — community entries from the DB, or curated seeds when degraded. */
  library(): Promise<{ status: string; source: 'db' | 'seed'; entries: unknown[] }> {
    return this.request('GET', '/library');
  }

  /** Analyze a docs URL into a custom platform profile (V1.1). Slow (fetch + LLM) — UI shows progress. */
  createCustomPlatform(body: { docs_url: string; name?: string }): Promise<{ status: string; platform: unknown; chunks: unknown[]; pages_fetched: number }> {
    return this.request('POST', '/platforms/custom', body);
  }

  /** Platform guide (V1.8) — registry entry + doc lessons + starter prompts. */
  platformGuide(platformId: string): Promise<{
    status: string;
    platform: Platform & { docs_url: string; quirks: string[]; syntax_rules: string[]; max_prompt_tokens: number };
    lessons: Array<{ content: string; source_url: string; trust_score: number }>;
    starter_prompts: Array<{ id: string; title: string; description: string; niche: string; modality: string; idea: string; template: string }>;
  }> {
    return this.request('GET', `/platforms/${platformId}/guide`);
  }

  draft(body: {
    platform_id: string;
    idea: string;
    just_generate?: boolean;
    connection_id?: string;
    project_id?: string;
    memories?: string[];
    custom_platform?: unknown;
  }): Promise<DraftResponse> {
    return this.request('POST', '/draft', body);
  }

  clarify(
    sessionId: string,
    body: {
      platform_id: string;
      idea: string;
      clarifications: Record<string, string>;
      just_generate?: boolean;
      connection_id?: string;
      custom_platform?: unknown;
    }
  ): Promise<DraftResponse> {
    return this.request('POST', `/draft/${sessionId}/clarify`, body);
  }

  /** Enhance a finished prompt the user already has (F1.1). platform_id optional. */
  enhance(body: { text: string; platform_id?: string; connection_id?: string }): Promise<EnhanceResponse> {
    return this.request('POST', '/enhance', body);
  }

  /** Live pipeline progress (F2.1). 404 → not yet/expired; caller falls back to a spinner. */
  draftStatus(sessionId: string): Promise<{ status: string; state: string; updated_at: number }> {
    return this.request('GET', `/draft/${sessionId}/status`);
  }

  draftAgain(sessionId: string, body: AgainBody): Promise<DraftResponse> {
    return this.request('POST', `/draft/${sessionId}/again`, body);
  }

  demoDraft(body: { example_id: string }): Promise<DraftResponse> {
    return this.request('POST', '/demo/draft', body);
  }

  /** Ranked platform modes for a task (V1.2). */
  recommendMode(body: { platform_id: string; task_type: string; idea: string }): Promise<{ status: string; platform_id: string; recommendations: ModeRecommendation[] }> {
    return this.request('POST', '/recommend/mode', body);
  }

  recommend(body: {
    modality: string;
    prioritizeQuality?: number;
    prioritizeCost?: number;
    prioritizeLatency?: number;
    minContextWindow?: number;
    desiredStrengths?: string[];
  }): Promise<{ status: string; recommendations: Recommendation[] }> {
    return this.request('POST', '/recommend', body);
  }

  optimize(body: {
    text: string;
    platform_id?: string;
    has_pdf_attachment?: boolean;
  }): Promise<{ status: string; report: unknown }> {
    return this.request('POST', '/optimize', body);
  }

  serialize(body: {
    platform_id: string;
    nodes: unknown[];
    custom_platform?: unknown;
  }): Promise<{ assembled: string; governor?: { tokenCount: number; maxPromptTokens: number; withinLimit: boolean; nearLimit: boolean; suggestions: string[] } }> {
    return this.request('POST', '/serialize', body);
  }

  chatRefine(body: {
    platform_id: string;
    task_type: string;
    nodes: unknown[];
    messages: ChatRefineMessage[];
    custom_platform?: unknown;
  }): Promise<ChatRefineResponse> {
    return this.request('POST', '/chat-refine', body);
  }

  /** Chat-first drafting with optional file attachments (V1.4). */
  chatDraft(body: {
    platform_id: string;
    messages: ChatRefineMessage[];
    attachments?: Array<{ name: string; mime: string; text: string }>;
    nodes?: unknown[];
    custom_platform?: unknown;
  }): Promise<ChatDraftResponse> {
    return this.request('POST', '/chat-draft', body);
  }

  /** Workflow Composer (V2.5) — run an inline workflow. */
  runWorkflow(body: { name: string; steps: Array<{ name: string; prompt: string; output_var: string }>; inputs: Record<string, string> }): Promise<{
    status: string;
    results: Array<{ name: string; output_var: string; resolved_prompt: string; output: string; tokens_used: number }>;
    total_tokens: number;
    variables: Record<string, string>;
  }> {
    return this.request('POST', '/workflows/run', body);
  }

  /** Prompt Regression Suite (V2.3) — run test cases against a prompt. */
  runPromptTests(body: { prompt: string; cases: Array<{ name: string; var_values: Record<string, string>; assertions: Array<{ kind: string; value: string }> }> }): Promise<{
    status: string;
    results: Array<{ name: string; pass: boolean; output: string; assertions: Array<{ kind: string; value: string; pass: boolean; detail: string }> }>;
    pass_rate: number;
  }> {
    return this.request('POST', '/prompt-tests/run', body);
  }

  /** Prompt Debugger (V2.1). */
  debug(body: { prompt: string; actual_output: string; expected: string; platform_id?: string }): Promise<{
    status: string;
    diagnosis: Array<{ node_type: string; fault: string; evidence: string; severity: 'high' | 'medium' | 'low' }>;
    patched_nodes: DesignedNode[];
    patch_summary: string;
  }> {
    return this.request('POST', '/debug', body);
  }

  /** Reverse Prompt (V2.2). */
  reverse(body: { output: string; platform_id: string }): Promise<{ status: string; response: DesignedResponse }> {
    return this.request('POST', '/reverse', body);
  }

  /** Model Migration (V2.4). */
  migrate(body: { nodes: unknown[]; source_platform_id: string; target_platform_id: string }): Promise<{
    status: string;
    target_nodes: DesignedNode[];
    target_assembled: string;
    source_assembled: string;
    change_report: Array<{ node_type: string; action: 'kept' | 'translated' | 'dropped' | 'added'; from: string; to: string; reason: string }>;
    risk_flags: string[];
  }> {
    return this.request('POST', '/migrate', body);
  }

  /** Cost & Token Simulator (V2.6). */
  simulate(body: { assembled: string; expected_output_tokens?: number }): Promise<{
    status: string;
    input_tokens: number;
    disclaimer: string;
    rows: Array<{ model_id: string; display_name: string; provider: string; input_tokens: number; est_output_tokens: number; est_cost_usd: number | null; latency_bucket: string; context_fit_pct: number; truncation_risk: boolean; notes: string }>;
    cheapest_safe_pick: string | null;
  }> {
    return this.request('POST', '/simulate', body);
  }

  /** Ambiguity Heatmap (V2.7). */
  analyzeAmbiguity(body: { assembled: string; platform_id: string }): Promise<{
    status: string;
    findings: Array<{ start: number; end: number; text: string; risk: string; reason: string; fix: string }>;
    counts: Record<string, number>;
  }> {
    return this.request('POST', '/analyze/ambiguity', body);
  }

  /** Style Guide Linter (V2.8). */
  lint(body: { assembled?: string; nodes?: unknown[]; rules: Array<{ kind: string; value: string }> }): Promise<{
    status: string;
    violations: Array<{ rule: { kind: string; value: string }; severity: string; where: string; fix_hint: string }>;
    pass: boolean;
  }> {
    return this.request('POST', '/lint', body);
  }

  redraftNode(body: {
    platform_id: string;
    task_type: string;
    nodes: unknown[];
    target_node_type: string;
    instruction?: string;
  }): Promise<{ value: string; rationale: string; alternatives: unknown[] }> {
    return this.request('POST', '/redraft-node', body);
  }

  feedback(body: {
    task_type: string;
    platform_id: string;
    outcome: 'worked' | 'didnt_work' | 'mixed';
    rubric_scores?: Record<string, number>;
    edit_count?: number;
    reused?: boolean;
  }): Promise<{ status: string }> {
    return this.request('POST', '/feedback', body);
  }

  promptSave(body: {
    platformId: string;
    taskType: string;
    nodes: unknown[];
    assembled: string;
    strengthScore?: number;
    rubricScores?: Record<string, number>;
    contentCiphertext?: string;
  }): Promise<{ status: string; prompt_id: string; version: number }> {
    return this.request('POST', '/prompts', body);
  }

  updateSessionContent(sessionId: string, contentCiphertext: string): Promise<{ status: string }> {
    return this.request('PATCH', `/sessions/${sessionId}/content`, { content_ciphertext: contentCiphertext });
  }

  getKeys(): Promise<{
    status: string;
    wrapped_dek_pass?: string;
    wrapped_dek_recovery?: string;
    kdf_salt?: string;
    kdf_iterations?: number;
  }> {
    return this.request('GET', '/keys');
  }

  putKeys(body: {
    wrapped_dek_pass: string;
    wrapped_dek_recovery: string;
    kdf_salt: string;
    kdf_iterations: number;
  }): Promise<{ status: string }> {
    return this.request('PUT', '/keys', body);
  }

  getConnections(): Promise<{ status: string; connections: Array<{ id: string; provider: string; status: string; created_at: string }> }> {
    return this.request('GET', '/connections');
  }

  meUsage(): Promise<{ status: string; plan: string; used: number; budget: number; byok: boolean; projectsAllowed: boolean; visualPreview: boolean }> {
    return this.request('GET', '/me/usage');
  }

  // A/B compare (F2.5).
  compare(body: { platform_id: string; prompt_a: string; prompt_b: string; connection_id?: string }): Promise<{ status: string; a: { output: string; latency_ms: number; tokens?: number }; b: { output: string; latency_ms: number; tokens?: number } }> {
    return this.request('POST', '/compare', body);
  }

  createConnection(body: { provider: string; api_key: string }): Promise<{ status: string; id: string; provider: string }> {
    return this.request('POST', '/connections', body);
  }

  deleteConnection(id: string): Promise<{ status: string }> {
    return this.request('DELETE', `/connections/${id}`);
  }

  getMemory(): Promise<{ status: string; entries: Array<{ id: string; scope: string; source: string; status: string; statement_ciphertext: string; task_type: string | null; created_at: string }> }> {
    return this.request('GET', '/memory');
  }

  createMemory(body: { scope?: string; statement_ciphertext: string; source?: string; status?: string; task_type?: string }): Promise<{ status: string; id: string; created_at: string }> {
    return this.request('POST', '/memory', body);
  }

  updateMemory(id: string, body: { statement_ciphertext?: string; status?: string; task_type?: string }): Promise<{ status: string }> {
    return this.request('PATCH', `/memory/${id}`, body);
  }

  deleteMemory(id: string): Promise<{ status: string }> {
    return this.request('DELETE', `/memory/${id}`);
  }

  resetMemory(): Promise<{ status: string; deleted: number }> {
    return this.request('DELETE', '/memory', undefined, { 'x-confirm-reset': 'true' });
  }

  promptsList(): Promise<{ status: string; prompts: unknown[] }> {
    return this.request('GET', '/prompts');
  }

  promptVersions(promptId: string): Promise<{ status: string; versions: unknown[] }> {
    return this.request('GET', `/prompts/${promptId}/versions`);
  }

  promptVersion(promptId: string, version: number): Promise<{ status: string; version: unknown }> {
    return this.request('GET', `/prompts/${promptId}/versions/${version}`);
  }

  promptRestore(promptId: string, version: number): Promise<{ status: string; prompt_id: string; version: number }> {
    return this.request('POST', `/prompts/${promptId}/restore`, { version });
  }

  promptDiff(promptId: string, from: number, to: number): Promise<{ status: string; diff: { added: string[]; removed: string[]; changed: Array<{ type: string; before: string; after: string }> } }> {
    return this.request('GET', `/prompts/${promptId}/diff?from=${from}&to=${to}`);
  }

  // Share links (F2.4).
  createShare(promptId: string): Promise<{ status: string; slug: string; url: string }> {
    return this.request('POST', `/prompts/${promptId}/share`);
  }
  revokeShare(promptId: string): Promise<{ status: string; revoked: number }> {
    return this.request('DELETE', `/prompts/${promptId}/share`);
  }
  getShare(slug: string): Promise<{ status: string; assembled: string; nodes: Array<{ type: string; value: string }>; strength_score: number | null; variables: Array<{ name: string; default?: string }> }> {
    return this.request('GET', `/share/${slug}`);
  }

  sessionsList(): Promise<{ status: string; sessions: unknown[] }> {
    return this.request('GET', '/sessions');
  }

  sessionTrace(sessionId: string): Promise<{ session: unknown; events: unknown[]; usage: unknown[] }> {
    return this.request('GET', `/sessions/${sessionId}/trace`);
  }

  exportData(): Promise<Record<string, unknown>> {
    return this.request('GET', '/export');
  }

  bootstrap(): Promise<{ status: string }> {
    return this.request('POST', '/me/bootstrap');
  }

  deleteAccount(): Promise<{ status: string }> {
    return this.request('DELETE', '/me');
  }

  fanout(body: {
    nodes: unknown[];
    platform_ids: string[];
  }): Promise<{ status: string; results: Array<{ platform_id: string; assembled: string; governor: unknown }>; skipped: string[] }> {
    return this.request('POST', '/fanout', body);
  }

  preview(body: PreviewBody): Promise<PreviewResponse> {
    return this.request('POST', '/preview', body);
  }

  // ── Projects (workspace organization) ──
  projectsList(): Promise<{ status: string; projects: Array<{ id: string; name: string; description: string | null; default_platform: string | null; created_at: string }> }> {
    return this.request('GET', '/projects');
  }
  createProject(body: { name: string; description?: string; default_platform?: string }): Promise<{ status: string; id: string; created_at: string }> {
    return this.request('POST', '/projects', body);
  }
  updateProject(id: string, body: { name?: string; description?: string; default_platform?: string }): Promise<{ status: string }> {
    return this.request('PATCH', `/projects/${id}`, body);
  }
  deleteProject(id: string): Promise<{ status: string }> {
    return this.request('DELETE', `/projects/${id}`);
  }

  // ── Teams (collaboration) ──
  teamsList(): Promise<{ status: string; teams: Array<{ id: string; name: string; owner_id: string; created_at: string }> }> {
    return this.request('GET', '/teams');
  }
  createTeam(body: { name: string }): Promise<{ status: string; id: string; created_at: string }> {
    return this.request('POST', '/teams', body);
  }
  addTeamMember(teamId: string, body: { user_id: string; role?: string }): Promise<{ status: string }> {
    return this.request('POST', `/teams/${teamId}/members`, body);
  }
  removeTeamMember(teamId: string, userId: string): Promise<{ status: string }> {
    return this.request('DELETE', `/teams/${teamId}/members/${userId}`);
  }

  // ── Library contribution (F: community submissions) ──
  submitToLibrary(body: { title: string; description: string; modality: string; platform_tags?: string[]; template: unknown; credit?: boolean }): Promise<{ status: string; id: string; moderation_status: string; reason?: string }> {
    return this.request('POST', '/library/submit', body);
  }

  // ── Billing (plan upgrade via Stripe) ──
  billingCheckout(): Promise<{ status: string; url: string }> {
    return this.request('POST', '/billing/checkout');
  }

  visualPreview(sessionId: string, body: VisualPreviewBody): Promise<VisualPreviewResponse> {
    return this.request('POST', '/preview/visual', body, { 'x-session-id': sessionId });
  }
}

export const api = new ApiClient();