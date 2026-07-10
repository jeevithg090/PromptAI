/**
 * Typed API client — mirrors the backend HTTP contract.
 * Single `baseUrl` from env, settable bearer token, typed methods for every route.
 * No retries, 30s timeout via AbortController.
 */
import type {
  DraftResponse, DesignedResponse, Recommendation, Platform,
  ClarifyingQuestion,
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

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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
    }
  ): Promise<DraftResponse> {
    return this.request('POST', `/draft/${sessionId}/clarify`, body);
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
  }): Promise<{ status: string; prompt_id: string; version: number }> {
    return this.request('POST', '/prompts', body);
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

  fanout(body: {
    nodes: unknown[];
    platform_ids: string[];
  }): Promise<{ status: string; results: Array<{ platform_id: string; assembled: string; governor: unknown }>; skipped: string[] }> {
    return this.request('POST', '/fanout', body);
  }
}

export const api = new ApiClient();