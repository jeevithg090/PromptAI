// ── Generic API proxy (simplest approach) ──
export interface ApiRequest {
  type: 'API_REQUEST';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string; // e.g. '/draft' or '/draft/session-xxx/clarify'
  body?: unknown;
}

export interface ApiResponse {
  type: 'API_RESPONSE';
  status: number;
  data: unknown;
  error?: string;
}

// ── DICTATION (F1.3) ──
// The content script records audio (MediaRecorder) and hands the raw bytes to
// the background worker as an ArrayBuffer (structured-clone transferable); the
// worker does the multipart POST so the content script stays fetch/credential-free.
export interface TranscribeRequest {
  type: 'TRANSCRIBE';
  audio: ArrayBuffer;
  mimeType: string;
}

export interface TranscribeResponse {
  type: 'TRANSCRIBE_RESPONSE';
  status: number;
  text?: string;
  error?: string;
}

// ── OVERLAY ──
export interface ShowOverlay {
  type: 'SHOW_OVERLAY';
  sourceText: string;
  platformId: string;
}

export interface HideOverlay {
  type: 'HIDE_OVERLAY';
}

export type ExtensionMessage =
  | ApiRequest
  | ApiResponse
  | TranscribeRequest
  | TranscribeResponse
  | ShowOverlay
  | HideOverlay;
