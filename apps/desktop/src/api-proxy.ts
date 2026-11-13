/**
 * The panel's /v1 calls (guest, me, report) go through main: the renderer is
 * a file:// page with no CORS story, and main is the one place that knows the
 * server URL. Only these routes, methods and headers pass; /v1/forge and
 * /v1/events are main's own (the flow and the events queue).
 */
export interface ApiRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  headers: Record<string, string>;
  body?: string;
}
export interface ApiReply {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const ROUTES = /^\/v1\/(?:guest(?:\/challenge)?|me(?:\/[\w-]+){0,2}|report)$/;
const METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);
const HEADERS = ['content-type', 'authorization', 'x-device-id'];
const MAX_BODY = 64 * 1024;

export function parseApiRequest(raw: unknown): ApiRequest {
  const r = raw as Partial<ApiRequest> | null;
  if (!r || typeof r.method !== 'string' || !METHODS.has(r.method)) throw new Error('method not allowed');
  if (typeof r.path !== 'string' || !ROUTES.test(r.path)) throw new Error('route not allowed');
  if (r.body !== undefined && (typeof r.body !== 'string' || r.body.length > MAX_BODY)) throw new Error('body not allowed');
  const headers: Record<string, string> = {};
  for (const h of HEADERS) {
    const v = (r.headers as Record<string, unknown> | undefined)?.[h];
    if (typeof v === 'string') headers[h] = v;
  }
  return { method: r.method as ApiRequest['method'], path: r.path, headers, ...(r.body !== undefined ? { body: r.body } : {}) };
}

export function createApiProxy(serverUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 30_000) {
  return async (raw: unknown): Promise<ApiReply> => {
    const req = parseApiRequest(raw);
    const res = await fetchImpl(new URL(req.path, serverUrl), {
      method: req.method,
      headers: req.headers,
      ...(req.body !== undefined ? { body: req.body } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const headers: Record<string, string> = {};
    for (const h of ['content-type', 'retry-after']) {
      const v = res.headers.get(h);
      if (v) headers[h] = v;
    }
    return { status: res.status, headers, body: await res.text() };
  };
}
