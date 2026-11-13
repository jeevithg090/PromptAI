/**
 * The typed client for the PromptAI server (packages/contract v2). Screens use
 * `ApiClient` only; tests use the fake in ./fake.ts. Responses are parsed with
 * the contract's schemas, so a server that drifts from the contract fails here,
 * loudly, instead of somewhere in a screen.
 */
import type { Challenge } from 'altcha-lib';
import {
  ageGateResponseSchema,
  artifactSchema,
  eventBatchResponseSchema,
  exportSchema,
  forgeResponseSchema,
  guestTokenResponseSchema,
  memoryItemSchema,
  profileSchema,
  type AppEvent,
  type Artifact,
  type ConsentPurpose,
  type ForgeRequest,
  type MemoryItem,
  type Profile,
  type artifactCreateSchema,
  type reportRequestSchema,
} from '@promptai/contract';

export type ForgeResult = ReturnType<typeof forgeResponseSchema.parse>;
export type GuestToken = ReturnType<typeof guestTokenResponseSchema.parse>;
export type ExportData = ReturnType<typeof exportSchema.parse>;
export type ArtifactCreate = ReturnType<typeof artifactCreateSchema.parse>;
export type ReportRequest = ReturnType<typeof reportRequestSchema.parse>;
export interface ConsentChoice {
  purpose: ConsentPurpose;
  granted: boolean;
  /** Version of the consent text the user saw. */
  version: string;
}

/** An ALTCHA v2 challenge as altcha-lib's createChallenge returns it. */
export type AltchaChallenge = Challenge;

/**
 * The events acknowledgement rule (blueprint §12): a 2xx lists what was stored
 * and what was rejected for good; anything else says whether to try again.
 */
export type EventsResult =
  | { ok: true; accepted: string[]; rejected: { id: string | null; reason: string }[] }
  | { ok: false; retry: boolean; retryAfterMs?: number; status: number | null };

export interface ApiClient {
  /** GET /v1/guest/challenge */
  guestChallenge(): Promise<AltchaChallenge>;
  /** POST /v1/guest with the solved ALTCHA payload. */
  guest(altcha: string): Promise<GuestToken>;
  /** GET /v1/me */
  me(): Promise<Profile>;
  /** POST /v1/me/age: true when the user is 18 or over. The server keeps only that answer. */
  confirmAge(dob: string): Promise<boolean>;
  /** PUT /v1/me/consent: appends to the ledger. */
  setConsent(entries: ConsentChoice[]): Promise<void>;
  /** GET /v1/me/memory */
  memory(): Promise<MemoryItem[]>;
  /** DELETE /v1/me/memory/:id */
  forgetMemory(id: string): Promise<void>;
  /** GET /v1/me/library */
  library(): Promise<Artifact[]>;
  /** POST /v1/me/library */
  saveBrief(item: ArtifactCreate): Promise<Artifact>;
  /** DELETE /v1/me/library/:id */
  deleteBrief(id: string): Promise<void>;
  /** GET /v1/me/export */
  exportData(): Promise<ExportData>;
  /** DELETE /v1/me: transactional delete, the auth user included. */
  deleteAccount(): Promise<void>;
  /** POST /v1/report */
  report(req: ReportRequest): Promise<void>;
  /** POST /v1/forge */
  forge(req: ForgeRequest): Promise<ForgeResult>;
  /** POST /v1/events. Never throws: the queue decides what to do from the result. */
  sendEvents(events: AppEvent[]): Promise<EventsResult>;
}

export class ApiError extends Error {
  /** null when the server could not be reached. */
  readonly status: number | null;
  readonly code: string | undefined;
  constructor(status: number | null, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface HttpApiOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  /** The bearer token for the next call: the account session, else the guest token. */
  token?: () => string | null;
  timeoutMs?: number;
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** List routes may answer with a bare array or `{ items }`; the contract doesn't fix the envelope. */
function listOf<T>(raw: unknown, parse: (v: unknown) => T): T[] {
  const items = Array.isArray(raw) ? raw : (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) throw new ApiError(200, 'the server sent a list this app cannot read');
  return items.map(parse);
}

function parsed<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }, raw: unknown, what: string): T {
  const r = schema.safeParse(raw);
  if (!r.success) throw new ApiError(200, `the server sent ${what} this app cannot read`);
  return r.data;
}

export function createHttpApi(opts: HttpApiOptions): ApiClient {
  const fetchImpl = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = opts.timeoutMs ?? 30_000;

  async function send(method: Method, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    const token = opts.token?.();
    if (token) headers.authorization = `Bearer ${token}`;
    try {
      return await fetchImpl(new URL(path, opts.baseUrl).toString(), {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ApiError(null, `couldn't reach the PromptAI server at ${opts.baseUrl}`);
    }
  }

  async function call(method: Method, path: string, body?: unknown): Promise<unknown> {
    const res = await send(method, path, body);
    if (!res.ok) {
      const code = await res
        .json()
        .then((b: unknown) => {
          const error = (b as { error?: unknown } | null)?.error;
          return typeof error === 'string' ? error : undefined;
        })
        .catch(() => undefined);
      throw new ApiError(res.status, `the server answered ${res.status}`, code);
    }
    if (res.status === 204) return null;
    return res.json().catch(() => null);
  }

  return {
    async guestChallenge() {
      const raw = (await call('GET', '/v1/guest/challenge')) as AltchaChallenge | null;
      const p = raw?.parameters;
      if (!p || typeof p.algorithm !== 'string' || typeof p.nonce !== 'string' || typeof p.salt !== 'string' || typeof p.cost !== 'number') {
        throw new ApiError(200, 'the server sent a challenge this app cannot read');
      }
      return raw;
    },
    async guest(altcha) {
      return parsed(guestTokenResponseSchema, await call('POST', '/v1/guest', { altcha }), 'a guest session');
    },
    async me() {
      return parsed(profileSchema, await call('GET', '/v1/me'), 'a profile');
    },
    async confirmAge(dob) {
      return parsed(ageGateResponseSchema, await call('POST', '/v1/me/age', { dob }), 'an answer').ageConfirmed;
    },
    async setConsent(entries) {
      await call('PUT', '/v1/me/consent', { entries });
    },
    async memory() {
      return listOf(await call('GET', '/v1/me/memory'), (v) => parsed(memoryItemSchema, v, 'a memory'));
    },
    async forgetMemory(id) {
      await call('DELETE', `/v1/me/memory/${encodeURIComponent(id)}`);
    },
    async library() {
      return listOf(await call('GET', '/v1/me/library'), (v) => parsed(artifactSchema, v, 'a saved brief'));
    },
    async saveBrief(item) {
      return parsed(artifactSchema, await call('POST', '/v1/me/library', item), 'a saved brief');
    },
    async deleteBrief(id) {
      await call('DELETE', `/v1/me/library/${encodeURIComponent(id)}`);
    },
    async exportData() {
      return parsed(exportSchema, await call('GET', '/v1/me/export'), 'an export');
    },
    async deleteAccount() {
      await call('DELETE', '/v1/me');
    },
    async report(req) {
      await call('POST', '/v1/report', req);
    },
    async forge(req) {
      return parsed(forgeResponseSchema, await call('POST', '/v1/forge', req), 'a draft');
    },
    async sendEvents(events) {
      let res: Response;
      try {
        res = await send('POST', '/v1/events', { events });
      } catch {
        return { ok: false, retry: true, status: null };
      }
      if (res.ok) {
        const body = eventBatchResponseSchema.safeParse(await res.json().catch(() => null));
        // A 2xx we can't read: keep the events; ids make the retry safe.
        return body.success ? { ok: true, ...body.data } : { ok: false, retry: true, status: res.status };
      }
      const after = Number(res.headers.get('retry-after'));
      // 503 is the server's "transient, send it again"; 5xx, 429 and 401 (a token
      // about to be refreshed) also retry. Any other 4xx is a batch the server
      // will never take, so retrying would stall the queue.
      const retry = res.status >= 500 || res.status === 429 || res.status === 401;
      return { ok: false, retry, status: res.status, ...(Number.isFinite(after) && after > 0 ? { retryAfterMs: after * 1000 } : {}) };
    },
  };
}
