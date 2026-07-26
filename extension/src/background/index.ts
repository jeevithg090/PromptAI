import type { ExtensionMessage, ApiResponse, TranscribeResponse } from '../types/messages';

const DEFAULT_API_ORIGIN = 'http://localhost:3001';

/**
 * Resolve the backend origin from extension storage (set via the options page),
 * falling back to localhost for dev builds. Stored under `apiOrigin`.
 */
async function getApiOrigin(): Promise<string> {
  try {
    const { apiOrigin } = await chrome.storage.sync.get('apiOrigin');
    return typeof apiOrigin === 'string' && apiOrigin ? apiOrigin : DEFAULT_API_ORIGIN;
  } catch {
    return DEFAULT_API_ORIGIN;
  }
}

/** The Supabase session token (set by the options page), attached as a Bearer header. */
async function getAuthToken(): Promise<string | null> {
  try {
    const { authToken } = await chrome.storage.local.get('authToken');
    return typeof authToken === 'string' && authToken ? authToken : null;
  } catch {
    return null;
  }
}

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
    if (msg.type === 'TRANSCRIBE') {
      // F1.3: the background worker owns the network + credentials; the content
      // script only records audio and passes the bytes here.
      handleTranscribe(msg.audio, msg.mimeType)
        .then(sendResponse)
        .catch((err: Error) =>
          sendResponse({ type: 'TRANSCRIBE_RESPONSE', status: 0, error: err.message } satisfies TranscribeResponse),
        );
      return true;
    }
    return false;
  },
);

// F2.3: right-click "Enhance with PromptForge" on selected text → open the
// overlay in enhance mode with the selection prefilled.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'pf-enhance-selection',
    title: 'Enhance with PromptForge',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'pf-enhance-selection' && info.selectionText && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'ENHANCE_SELECTION', text: info.selectionText }).catch(() => {});
  }
});

// Hotkeys (finalplan B3): manifest `commands` route here → tell the active tab
// to open (or enhance in) the overlay. Falls back silently if no content script.
chrome.commands?.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;
    if (command === 'toggle-overlay') {
      chrome.tabs.sendMessage(tabId, { type: 'SHOW_OVERLAY' }).catch(() => {});
    } else if (command === 'enhance-selection') {
      chrome.tabs.sendMessage(tabId, { type: 'ENHANCE_HOTKEY' }).catch(() => {});
    }
  });
});

async function handleTranscribe(audio: ArrayBuffer, mimeType: string): Promise<TranscribeResponse> {
  const origin = await getApiOrigin();
  const token = await getAuthToken();
  const form = new FormData();
  form.append('audio', new Blob([audio], { type: mimeType }), 'clip.webm');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${origin}/transcribe`, { method: 'POST', headers, body: form });
  const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
  return { type: 'TRANSCRIBE_RESPONSE', status: res.status, text: data?.text, error: data?.error };
}

async function handleApiRequest(
  msg: ExtensionMessage & { type: 'API_REQUEST' },
): Promise<ApiResponse> {
  // Backend routes are mounted at the root, NOT under /api.
  const origin = await getApiOrigin();
  const token = await getAuthToken();
  const url = `${origin}${msg.path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

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
