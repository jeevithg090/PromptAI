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
  | ({ phase: 'done'; outcome: 'pasted' | 'copied'; app: AppRef | null } & Drafted)
  | { phase: 'error'; target: AppRef | null; message: string; transcript: string; answers: Answers; canRetry: boolean; copied?: boolean };

/** `window.promptai` on desktop (apps/desktop/src/preload.ts), or the web fallback. */
export interface PromptAIBridge {
  readonly platform: 'desktop' | 'web';
  onState(listener: (state: PanelState) => void): () => void;
  insert(): Promise<void>;
  copy(): Promise<void>;
  answerChip(slotId: string, value: string): Promise<void>;
  retry(): Promise<void>;
  dismiss(): Promise<void>;
  /** Web only: draft from typed text instead of dictation. */
  submit?(text: string): Promise<void>;
}

declare global {
  interface Window {
    promptai?: PromptAIBridge;
  }
}
