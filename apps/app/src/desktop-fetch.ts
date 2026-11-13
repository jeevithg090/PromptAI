import type { PromptAIBridge } from './bridge.ts';

/** A placeholder origin: on desktop main owns the server URL and only the path crosses IPC. */
export const DESKTOP_API_BASE = 'http://promptai.desktop.invalid';

/** A fetch for the typed client that goes through main (no CORS from file://, one place that knows the server). */
export function desktopFetch(bridge: Required<Pick<PromptAIBridge, 'api'>>): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const headers: Record<string, string> = {};
    for (const [k, v] of new Headers(init?.headers)) headers[k] = v;
    const reply = await bridge.api({
      method: init?.method ?? 'GET',
      path: url.pathname + url.search,
      headers,
      ...(typeof init?.body === 'string' ? { body: init.body } : {}),
    });
    const empty = reply.status === 204 || reply.status === 205 || reply.status === 304;
    return new Response(empty ? null : reply.body, { status: reply.status, headers: reply.headers });
  };
}
