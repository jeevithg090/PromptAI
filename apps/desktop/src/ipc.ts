import type { ApiReply, ApiRequest } from './api-proxy.ts';
import type { FlowState, Rating } from './flow.ts';

/** IPC channels between the panel's preload and main. */
export const IPC = {
  state: 'promptai:state',
  getState: 'promptai:get-state',
  insert: 'promptai:insert',
  copy: 'promptai:copy',
  answerChip: 'promptai:answer-chip',
  retry: 'promptai:retry',
  dismiss: 'promptai:dismiss',
  rate: 'promptai:rate',
  setSession: 'promptai:set-session',
  api: 'promptai:api',
} as const;

/** What the preload exposes as `window.promptai` (apps/app/src/bridge.ts PromptAIBridge; keep the two in step). */
export interface PromptAIApi {
  readonly platform: 'desktop';
  readonly caps: { insertAtCursor: boolean; dictation: boolean };
  /** Calls back with the current state now and on every change; returns an unsubscribe. */
  onState(listener: (state: FlowState) => void): () => void;
  insert(): Promise<void>;
  copy(): Promise<void>;
  answerChip(slotId: string, value: string): Promise<void>;
  retry(): Promise<void>;
  dismiss(): Promise<void>;
  rate(rating: Rating): Promise<void>;
  /** The bearer token main sends with /v1/forge and /v1/events, and whether first run is done (dictation waits for it). */
  setSession(session: { token: string | null; ready: boolean }): Promise<void>;
  /** The panel's other /v1 calls (src/api-proxy.ts). */
  api(req: ApiRequest): Promise<ApiReply>;
}
