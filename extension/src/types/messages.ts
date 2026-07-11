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
  | ShowOverlay
  | HideOverlay;
