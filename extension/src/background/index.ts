import type { ExtensionMessage, ApiResponse } from '../types/messages';

const API_ORIGIN = 'http://localhost:3001';

/**
 * Generic API proxy — relays typed requests from the content script
 * to the PromptForge backend. MV3 background service worker.
 */
chrome.runtime.onMessage.addListener(
  (
    msg: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => {
    if (msg.type === 'API_REQUEST') {
      handleApiRequest(msg)
        .then(sendResponse)
        .catch((err: Error) =>
          sendResponse({ type: 'API_RESPONSE', status: 0, data: null, error: err.message } satisfies ApiResponse),
        );
      return true; // Keep channel open for async response
    }
    return false;
  },
);

async function handleApiRequest(
  msg: ExtensionMessage & { type: 'API_REQUEST' },
): Promise<ApiResponse> {
  const url = `${API_ORIGIN}/api${msg.path}`;
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
