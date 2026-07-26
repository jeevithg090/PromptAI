/**
 * Firefox background script — ports extension/src/background/index.ts
 * using the browser.* namespace (Firefox MV3).
 */

const API_ORIGIN = 'http://localhost:3001';

interface ExtensionMessage {
  type: string;
  path?: string;
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  type: 'API_RESPONSE';
  status: number;
  data: unknown;
  error?: string;
}

browser.runtime.onMessage.addListener(
  (msg: ExtensionMessage, _sender: browser.runtime.MessageSender) => {
    if (msg.type === 'API_REQUEST') {
      return handleApiRequest(msg).catch((err: Error) => ({
        type: 'API_RESPONSE',
        status: 0,
        data: null,
        error: err.message,
      } satisfies ApiResponse));
    }
    return undefined;
  },
);

async function handleApiRequest(
  msg: ExtensionMessage,
): Promise<ApiResponse> {
  // Backend routes are mounted at the root, NOT under /api.
  const url = `${API_ORIGIN}${msg.path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const res = await fetch(url, {
    method: msg.method,
    headers,
    body: msg.body ? JSON.stringify(msg.body) : undefined,
  });

  const data = await res.json().catch(() => null);
  return {
    type: 'API_RESPONSE',
    status: res.status,
    data,
  };
}
