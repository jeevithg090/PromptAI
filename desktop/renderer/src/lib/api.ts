// Mirrors web/src/lib/api.ts — update together. Desktop always uses the backend
// (no Web Speech), and reads PF_API_URL from the Vite define.
import type { DraftResponse, EnhanceResponse, Platform } from './api-types';

export type ApiError = { status: number; message: string };

const BASE = (import.meta.env.PF_API_URL as string) ?? 'http://localhost:3001';

class DesktopApi {
  private token: string | null = null;
  setToken(t: string | null) { this.token = t; }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      const p = await res.json().catch(() => ({ error: res.statusText }));
      throw { status: res.status, message: p.error ?? p.message ?? p.reason ?? res.statusText } as ApiError;
    }
    return (await res.json()) as T;
  }

  platforms(): Promise<{ platforms: Platform[] }> { return this.req('GET', '/platforms'); }
  draft(body: { platform_id: string; idea: string; just_generate?: boolean }): Promise<DraftResponse> { return this.req('POST', '/draft', body); }
  clarify(sessionId: string, body: { platform_id: string; idea: string; clarifications: Record<string, string>; just_generate?: boolean }): Promise<DraftResponse> {
    return this.req('POST', `/draft/${sessionId}/clarify`, body);
  }
  enhance(body: { text: string; platform_id?: string }): Promise<EnhanceResponse> { return this.req('POST', '/enhance', body); }

  async transcribe(blob: Blob): Promise<{ text: string }> {
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const form = new FormData();
    form.append('audio', blob, 'clip.webm');
    const res = await fetch(`${BASE}/transcribe`, { method: 'POST', headers, body: form });
    if (!res.ok) throw { status: res.status, message: 'transcription failed' } as ApiError;
    return (await res.json()) as { text: string };
  }
}

export const api = new DesktopApi();
