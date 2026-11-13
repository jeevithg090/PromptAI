import type { ForgeResponse } from '@promptai/contract';

/**
 * The panel's view of the flow. On desktop it is the main process's state
 * (apps/desktop/src/flow.ts, sent over IPC); in a browser the web bridge
 * produces the same shape. Keep the two in step until it moves to
 * @promptai/contract.
 */
export interface AppRef {
  bundleId: string;
  name: string;
  pid?: number;
}
export type Answers = Record<string, string>;
/** The receipt's "Did it work?" answer, sent as `outcome.rated`. */
export type Rating = 'worked' | 'didnt_work';
interface Drafted {
  target: AppRef | null;
  transcript: string;
  draft: ForgeResponse;
  answers: Answers;
}
export type PanelState =
  | { phase: 'idle' }
  | { phase: 'listening'; target: AppRef | null; partial: string }
  | { phase: 'drafting'; target: AppRef | null; transcript: string; answers: Answers }
  | ({ phase: 'ready'; confirmApp?: AppRef } & Drafted)
  | ({ phase: 'inserting' } & Drafted)
  | ({ phase: 'done'; outcome: 'pasted' | 'copied'; app: AppRef | null; rated?: Rating } & Drafted)
  | { phase: 'error'; target: AppRef | null; message: string; transcript: string; answers: Answers; canRetry: boolean; copied?: boolean };

/** What the platform can do (blueprint §5 PlatformPort `caps`). Screens read these, never the platform. */
export interface Caps {
  /** Paste into the app the user was in. Off on the web and in the Mac App Store Lite channel. */
  insertAtCursor: boolean;
  /** Hold-to-talk dictation. */
  dictation: boolean;
}

/** A /v1 request the desktop panel sends through main (no CORS, one origin). */
export interface ApiRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
}
export interface ApiReply {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** `window.promptai` on desktop (apps/desktop/src/preload.ts), or the web fallback. */
export interface PromptAIBridge {
  readonly platform: 'desktop' | 'web';
  readonly caps: Caps;
  onState(listener: (state: PanelState) => void): () => void;
  insert(): Promise<void>;
  copy(): Promise<void>;
  answerChip(slotId: string, value: string): Promise<void>;
  retry(): Promise<void>;
  dismiss(): Promise<void>;
  rate(rating: Rating): Promise<void>;
  /** Web only: draft from typed text instead of dictation. */
  submit?(text: string): Promise<void>;
  /** Desktop only: main sends /v1/forge and /v1/events itself, so it needs the token, and holds dictation until first run is done. */
  setSession?(session: { token: string | null; ready: boolean }): Promise<void>;
  /** Desktop only: the other /v1 routes, through main. */
  api?(req: ApiRequest): Promise<ApiReply>;
}

declare global {
  interface Window {
    promptai?: PromptAIBridge;
  }
}
