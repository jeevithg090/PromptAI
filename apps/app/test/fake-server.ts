/**
 * The fake API (src/api/fake.ts) over HTTP, for the PWA's web test and the
 * Electron smoke test: the contract's routes, bearer tokens ('guest-…' from
 * /v1/guest, 'dev-…' from the dev AuthPort), CORS for a page on another port,
 * and the events acknowledgement rule including a transient 503.
 */
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApiError } from '../src/api/client.ts';
import { createFakeApi, type FakeApiOptions } from '../src/api/fake.ts';

export interface Recorded {
  method: string;
  path: string;
  auth: string | null;
  body: unknown;
}

export interface FakeServerOptions extends FakeApiOptions {
  /** Answer this many POST /v1/events with 503 before accepting. */
  failEvents?: number;
}

const send = (res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};

export async function startFakeServer(opts: FakeServerOptions = {}) {
  const api = createFakeApi(opts);
  const requests: Recorded[] = [];
  let failEvents = opts.failEvents ?? 0;

  const signedIn = (auth: string | null) => {
    if (!auth || !(auth.startsWith('guest-') || auth.startsWith('dev-'))) throw new ApiError(401, 'unauthorized', 'unauthorized');
    if (auth.startsWith('dev-')) api.signIn('dev');
  };

  async function route(method: string, path: string, body: any, auth: string | null, res: ServerResponse): Promise<void> {
    if (method === 'GET' && path === '/v1/guest/challenge') return send(res, 200, await api.guestChallenge());
    if (method === 'POST' && path === '/v1/guest') return send(res, 200, await api.guest(String(body?.altcha ?? '')));
    signedIn(auth);
    const item = /^\/v1\/me\/(memory|library)\/([\w-]+)$/.exec(path);
    switch (`${method} ${path}`) {
      case 'GET /v1/me':
        return send(res, 200, await api.me());
      case 'POST /v1/me/age':
        return send(res, 200, { ageConfirmed: await api.confirmAge(String(body?.dob)) });
      case 'PUT /v1/me/consent':
        await api.setConsent(body.entries);
        return send(res, 200, await api.me());
      case 'GET /v1/me/memory':
        return send(res, 200, { items: await api.memory() });
      case 'GET /v1/me/library':
        return send(res, 200, { items: await api.library() });
      case 'POST /v1/me/library':
        return send(res, 201, await api.saveBrief(body));
      case 'GET /v1/me/export':
        return send(res, 200, await api.exportData());
      case 'DELETE /v1/me':
        await api.deleteAccount();
        return send(res, 204);
      case 'POST /v1/report':
        await api.report(body);
        return send(res, 202, { ok: true });
      case 'POST /v1/forge':
        return send(res, 200, await api.forge(body));
      case 'POST /v1/events': {
        if (failEvents > 0) {
          failEvents--;
          return send(res, 503, { error: 'transient', retry: true }, { 'retry-after': '1' });
        }
        const result = await api.sendEvents(body.events);
        return result.ok ? send(res, 200, { accepted: result.accepted, rejected: result.rejected }) : send(res, result.status ?? 500, { error: 'failed' });
      }
    }
    if (method === 'DELETE' && item?.[1] === 'memory') return (await api.forgetMemory(item[2]!), send(res, 204));
    if (method === 'DELETE' && item?.[1] === 'library') return (await api.deleteBrief(item[2]!), send(res, 204));
    throw new ApiError(404, 'not found', 'not_found');
  }

  const server = createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE');
    res.setHeader('access-control-expose-headers', 'retry-after');
    if (req.method === 'OPTIONS') return send(res, 204);
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const path = new URL(req.url ?? '/', 'http://fake').pathname;
    const auth = req.headers.authorization?.replace(/^Bearer /, '') ?? null;
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      return send(res, 400, { error: 'invalid_json' });
    }
    requests.push({ method: req.method ?? 'GET', path, auth, body });
    try {
      await route(req.method ?? 'GET', path, body, auth, res);
    } catch (err) {
      if (err instanceof ApiError) send(res, err.status ?? 500, { error: err.code ?? 'error' });
      else send(res, 400, { error: 'invalid_request', message: String(err) });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    api,
    requests,
    /** Requests to one route, oldest first. */
    to: (method: string, path: string) => requests.filter((r) => r.method === method && r.path === path),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export type FakeServer = Awaited<ReturnType<typeof startFakeServer>>;
