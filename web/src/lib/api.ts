/**
 * Typed API client — mirrors the backend HTTP contract.
 * Single `baseUrl` from env, settable bearer token, typed methods for every route.
 * No retries, 30s timeout via AbortController.
 */
import type {
  DraftResponse, DesignedResponse, Recommendation, Platform,
  ClarifyingQuestion, PreviewResponse, PreviewBody, AgainBody,
  VisualPreviewResponse, VisualPreviewBody,
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
    const timer = setTimeout(() => controller.abort(), 30_000);
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
        throw { status: res.status, message: payload.error ?? payload.message ?? res.statusText } as ApiError;
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  health(): Promise<{ ok: boolean }> {
    return this.request('GET', '/health');
  }

  platforms(): Promise<{ platforms: Platform[] }> {
    return this.request('GET', '/platforms');
  }

  draft(body: {
    platform_id: string;
    idea: string;
    just_generate?: boolean;
    connection_id?: string;
    project_id?: string;
    memories?: string[];
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
    }
  ): Promise<DraftResponse> {
    return this.request('POST', `/draft/${sessionId}/clarify`, body);
  }

  draftAgain(sessionId: string, body: AgainBody): Promise<DraftResponse> {
    return this.request('POST', `/draft/${sessionId}/again`, body);
  }

  demoDraft(body: { example_id: string }): Promise<DraftResponse> {
    return this.request('POST', '/demo/draft', body);
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
  }): Promise<{ assembled: string }> {
    return this.request('POST', '/serialize', body);
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

  visualPreview(sessionId: string, body: VisualPreviewBody): Promise<VisualPreviewResponse> {
    return this.request('POST', '/preview/visual', body, { 'x-session-id': sessionId });
  }
}

export const api = new ApiClient();